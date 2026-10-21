// Office export through Calco (@laticent/calco): `.odp` in both modes, and the EDITABLE
// `.pptx`. The picture-per-slide `.pptx` stays on pptx-export.js (unchanged bytes).
//
// Calco is a workspace library with no dependencies of its own; this module is the Lattice
// HOST that hands it what it needs:
//   - JSZip and PptxGenJS (already Lattice dependencies);
//   - the deck's fonts, from the one font manifest (lib/fonts/text-faces.js) and the woff2
//     beside the package (lib/fonts/face-css.js `fontDir`);
//   - a pinner that turns a variable web font into one static weight with every character
//     kept, through the same HarfBuzz subsetter the composed PDF uses
//     (lib/core/pdf-compose/font-subset.mjs, `text` null = keep all).
//
// Design and measurements: engineering/decisions/2026-10-06-calco-office-export-library.md.

const fs = require('fs');
const { shootPicture } = require('./slide-picture');
const path = require('path');

/**
 * Calco's FontHost for this package: load from the shipped woff2, pin with HarfBuzz.
 * @param {string} pkgRoot the package root the woff2 resolve against.
 */
function createFontHost(pkgRoot) {
  const { TEXT_FACES } = require('../fonts/text-faces');
  const { fontDir } = require('../fonts/face-css');
  const { nearestFace, pinFeatures } = require('@laticent/calco');
  const dir = fontDir(pkgRoot);
  let subsetter = null;
  return {
    load(face) {
      const hit = dir && nearestFace(TEXT_FACES, face);
      if (!hit) return null;
      const file = path.join(dir, `${hit.file}.woff2`);
      return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
    },
    async pin(bytes, { weight, ligatures }) {
      if (!subsetter) {
        const { createFontSubsetter } = await import('../core/pdf-compose/font-subset.mjs');
        subsetter = await createFontSubsetter(fs.readFileSync(require.resolve('harfbuzzjs/hb-subset.wasm')));
      }
      return subsetter(bytes, null, { wght: weight }, pinFeatures(ligatures));
    },
  };
}

/**
 * In the page: say what a slide's background photograph is. Runs through
 * `elementHandle.evaluate` on the slide, so it closes over nothing.
 *
 * The background is compared at the slide's CSS size (half the photograph), and every image
 * background seen so far stays decoded in the page (`__calcoBackgrounds`), so a deck of 100
 * slides decodes each background once. Returns whether `bg` is one flat color (`flat`,
 * `#rrggbb`) and which earlier image background it matches within `tol` per channel (`match`,
 * -1 for none). A new one is remembered (`stored`) until 32 are held; past that a new background
 * is never matched against, which costs a shared background, not correctness.
 */
async function describeBackground(section, { bg, tol, reset }) {
  const win = section.ownerDocument.defaultView;
  if (reset || !win.__calcoBackgrounds) win.__calcoBackgrounds = [];
  const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + bg)).blob());
  const w = Math.round(bmp.width / 2);
  const h = Math.round(bmp.height / 2);
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  let isFlat = true;
  for (let k = 4; k < a.length && isFlat; k += 4) {
    if (Math.abs(a[k] - a[0]) > tol || Math.abs(a[k + 1] - a[1]) > tol || Math.abs(a[k + 2] - a[2]) > tol) isFlat = false;
  }
  const flat = isFlat ? '#' + [a[0], a[1], a[2]].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
  let match = -1;
  let stored = false;
  if (!flat) {
    match = win.__calcoBackgrounds.findIndex((rep) => rep.length === a.length && rep.every((v, k) => Math.abs(v - a[k]) <= tol));
    // Bounded: a deck with a different picture on every slide would otherwise hold one decoded copy per slide.
    if (match < 0 && win.__calcoBackgrounds.length < 32) {
      win.__calcoBackgrounds.push(a);
      stored = true;
    }
  }
  return { flat, match, stored };
}

/**
 * In the page: whether anything in the slide reads the paint behind it (`mix-blend-mode`,
 * `backdrop-filter`), the one thing a transparent foreground cannot reproduce. Layers
 * composite exactly in every other case.
 */
function readsBackdrop(section) {
  const win = section.ownerDocument.defaultView;
  return [section, ...section.querySelectorAll('*')].some((el) =>
    [undefined, '::before', '::after'].some((p) => {
      const cs = win.getComputedStyle(el, p);
      return (cs.mixBlendMode && cs.mixBlendMode !== 'normal') || (cs.backdropFilter && cs.backdropFilter !== 'none');
    }),
  );
}

/**
 * In the page: the share of pixels where the foreground `fg` over the background `bg`
 * differs from the opaque picture `full` by more than `tol` per channel. Only asked of a slide
 * that `readsBackdrop`.
 */
async function splitError(_section, { bg, fg, full, tol }) {
  const load = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const [f, o, b] = [await load(fg), await load(full), await load(bg)];
  let off = 0;
  for (let k = 0; k < o.length; k += 4) {
    const al = f[k + 3] / 255;
    for (let c = 0; c < 3; c++) if (Math.abs(f[k + c] * al + b[k + c] * (1 - al) - o[k + c]) > tol) { off++; break; }
  }
  return off / (o.length / 4);
}

/**
 * In the page: how much of the foreground picture `fg` is drawn outside the `boxes` (slide px) that its
 * pictures will cover (sprites are only safe when nothing is left outside them), and, when that is
 * little enough, each box cropped from `fg` as a picture of its own. A fully opaque crop of continuous
 * tone is a JPEG when that is much smaller, by the same sizes rule as a slide picture (`picture.ts`);
 * a crop with any transparency is a PNG, since a JPEG would paint it black. Cropping the capture
 * already taken costs a few milliseconds a picture; shooting each one again cost a render each.
 */
async function cropPictures(section, { fg, boxes, rules }) {
  const rect = section.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + fg)).blob());
  // Inspect at slide-px resolution: the question is whether anything is uncovered, and the full capture is
  // four times the pixels for the same answer.
  const small = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  small.drawImage(bmp, 0, 0, w, h);
  const d = small.getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h);
  const solid = (x, y) => d[(y * w + x) * 4 + 3] >= 250;
  // The ink in a rectangle, as the smallest rectangle that holds it (null when there is none).
  const inkOf = (x0, y0, x1, y1) => {
    let ix0 = x1;
    let iy0 = y1;
    let ix1 = x0;
    let iy1 = y0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < ix0) ix0 = x;
          if (x >= ix1) ix1 = x + 1;
          if (y < iy0) iy0 = y;
          if (y >= iy1) iy1 = y + 1;
        }
      }
    }
    if (ix1 <= ix0 || iy1 <= iy0) return null;
    const x = Math.max(x0, ix0 - 1);
    const y = Math.max(y0, iy0 - 1);
    return { x, y, w: Math.min(x1, ix1 + 1) - x, h: Math.min(y1, iy1 + 1) - y };
  };
  const opaqueShare = (r) => {
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (solid(x, y)) n++;
    return n / (r.w * r.h);
  };
  // The largest fully opaque rectangle inside r that keeps at least `keep` of its area, by trimming whichever
  // edge has the most clear pixels until none of the four has any. A photo beside a thin rule or a soft corner
  // is a JPEG of the photo and a PNG of the rest, not a PNG of both.
  const opaqueCore = (r, keep) => {
    let [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
    // The share of clear pixels along a column (`x` fixed) or a row (`y` fixed), between `from` and `to`.
    const column = (x, from, to) => {
      let n = 0;
      for (let y = from; y < to; y++) if (!solid(x, y)) n++;
      return n / Math.max(1, to - from);
    };
    const row = (y, from, to) => {
      let n = 0;
      for (let x = from; x < to; x++) if (!solid(x, y)) n++;
      return n / Math.max(1, to - from);
    };
    while (x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) >= keep * r.w * r.h) {
      const edges = [column(x0, y0, y1), column(x1 - 1, y0, y1), row(y0, x0, x1), row(y1 - 1, x0, x1)];
      const worst = Math.max(...edges);
      if (worst <= 0.0005) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const i = edges.indexOf(worst);
      if (i === 0) x0++;
      else if (i === 1) x1--;
      else if (i === 2) y0++;
      else y1--;
    }
    return null;
  };
  const k = bmp.width / w;
  const b64 = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { size: bytes.length, data: btoa(bin) };
  };
  const encode = async (r, opaque) => {
    const sx = Math.round(r.x * k);
    const sy = Math.round(r.y * k);
    const sw = Math.max(1, Math.round(r.w * k));
    const sh = Math.max(1, Math.round(r.h * k));
    const canvas = new OffscreenCanvas(sw, sh);
    canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    let pick;
    if (opaque) {
      const jpg = await b64(await canvas.convertToBlob({ type: 'image/jpeg', quality: rules.quality }));
      if (jpg.size >= rules.toneBytes) pick = jpg;
      else {
        const png = await b64(await canvas.convertToBlob({ type: 'image/png' }));
        pick = png.size > rules.flatBytes && jpg.size < png.size * rules.share ? jpg : png;
      }
    } else pick = await b64(await canvas.convertToBlob({ type: 'image/png' }));
    return { x: r.x, y: r.y, w: r.w, h: r.h, data: pick.data };
  };
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x));
    const x1 = Math.min(w, Math.ceil(b.x + b.w));
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(h, Math.ceil(b.y + b.h)); y++) inside.fill(1, y * w + x0, y * w + x1);
  }
  let out = 0;
  for (let i = 0; i < inside.length; i++) if (!inside[i] && d[i * 4 + 3] > 16) out++;
  const outside = out / inside.length;
  if (outside > rules.maxOutside) return { outside, images: [] };
  const images = [];
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x));
    const y0 = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(w, Math.ceil(b.x + b.w));
    const y1 = Math.min(h, Math.ceil(b.y + b.h));
    // Each box shrinks to the ink in it: a photo that fills half the slide is half the slide, however wide the
    // transparent items around it made the cluster. A box with no ink is no picture.
    const t = inkOf(x0, y0, x1, y1);
    const parts = [];
    if (t) {
      const share = opaqueShare(t);
      const core = share < 0.999 && t.w * t.h >= 40000 ? opaqueCore(t, 0.4) : null;
      if (share >= 0.999) parts.push(await encode(t, true));
      else if (core) {
        parts.push(await encode(core, true));
        // What surrounds the core: four strips, each cut to its own ink.
        const around = [
          [t.x, t.y, t.x + t.w, core.y],
          [t.x, core.y + core.h, t.x + t.w, t.y + t.h],
          [t.x, core.y, core.x, core.y + core.h],
          [core.x + core.w, core.y, t.x + t.w, core.y + core.h],
        ];
        for (const [ax0, ay0, ax1, ay1] of around) {
          const r = ax1 > ax0 && ay1 > ay0 ? inkOf(ax0, ay0, ax1, ay1) : null;
          if (r) parts.push(await encode(r, false));
        }
      } else parts.push(await encode(t, false));
    }
    images.push(parts);
  }
  return { outside, images };
}

// Per channel, the most two backgrounds may differ and still be one: a gradient dithers by a
// level between slides that draw the same thing.
const BACKGROUND_TOLERANCE = 3;
// A slide that reads the paint behind it, and whose foreground over its background misses the
// opaque picture by more than this share of its pixels, keeps its own opaque picture instead
// of sharing a background.
const SPLIT_BAD_SHARE = 0.001;
// Pictures cropped from the foreground may leave this share of the slide's pixels uncovered (the soft edge
// of a shadow past a picture's margin); more than that and the slide keeps one foreground picture.
const SPRITE_OUTSIDE_SHARE = 0.0005;

/**
 * Capture every slide for Calco. In editable mode each slide is READ (its text becomes
 * frames) and photographed twice: its own paint alone (the BACKGROUND, which slides that draw
 * the same thing share) and its content over transparency (the FOREGROUND). A slide that
 * reads the paint behind it (a blend, a backdrop blur) is checked against a third, opaque
 * photograph with its text hidden, and keeps that picture when the two do not add back up to
 * it. In picture mode a slide is photographed as is. Runs against the page the raster path
 * already rendered.
 *
 * @param {Array} handles   puppeteer handles to each `section[data-lattice-slide]`.
 * @param {object} shot     the screenshot options the raster path uses.
 * @param {boolean} editable
 * @param {(fn: Function, label: string) => Promise<any>} [guard]  the render watchdog,
 *   applied PER SLIDE as the raster loop applies it per screenshot. One guard around the
 *   whole loop failed every deck past ~60 slides (a 123-slide gallery died at 90s).

 * @param {{sprites?: boolean}} [options]  `sprites: false` keeps the one slide-sized foreground picture.
 * @returns {Promise<{slides: Array<{image: Uint8Array, frames: Array, shapes: Array, background?: number}>, backgrounds: Array<{color?: string, image?: Uint8Array}>}>}
 */
async function captureSlides(handles, shot, editable, guard = (fn) => fn(), options = {}) {
  const calco = require('@laticent/calco');
  const { readSlide, restoreSlide, splitSlide, restoreSplit, splitKey } = calco;
  const slides = [];
  const backgrounds = [];
  // Each image background the page remembers: its index in `backgrounds`, or null until a slide uses it.
  const imageIndexes = [];
  // Slides that paint the same background (same `splitKey`) share one photograph and one answer.
  const seen = new Map();
  for (const [i, h] of handles.entries()) {
    slides.push(await guard(async () => {
      if (!editable) return { image: await shootPicture(h, shot), frames: [], shapes: [] };
      const key = await h.evaluate(splitKey);
      let known = seen.get(key);
      if (!known) {
        // The slide's own paint, with everything inside it hidden.
        await h.evaluate(splitSlide, 'background');
        let bg;
        try {
          bg = Buffer.from(await shootPicture(h, { ...shot, omitBackground: false }));
        } finally {
          await h.evaluate(restoreSplit);
        }
        const m = await h.evaluate(describeBackground, { bg: bg.toString('base64'), tol: BACKGROUND_TOLERANCE, reset: i === 0 });
        // The page remembers a new image background as soon as it sees it, so Node keeps a slot for it too.
        if (m.stored) imageIndexes.push(null);
        known = { bg, flat: m.flat, slot: m.stored ? imageIndexes.length - 1 : m.match };
        seen.set(key, known);
      }
      // `shapes`: plain boxes and rules come out of the picture as native shapes too.
      const reads = await h.evaluate(readsBackdrop);
      // Pictures: what cannot be a shape is cropped out of the foreground as pictures of its own, each in paint
      // order (`sprites`). A slide that reads its backdrop, or whose foreground has ink outside every crop, keeps
      // the one foreground picture instead.
      let read;
      let fg;
      let withSprites = false;
      try {
      for (const trySprites of options.sprites !== false && !reads ? [true, false] : [false]) {
        read = await h.evaluate(readSlide, { hide: true, shapes: true, sprites: trySprites });
        await h.evaluate(splitSlide, 'foreground');
        try {
          fg = Buffer.from(await h.screenshot({ ...shot, omitBackground: true }));
          if (trySprites) {
            const pics = read.shapes.filter((sh) => sh.kind === 'picture');
            const got = await h.evaluate(cropPictures, {
              fg: fg.toString('base64'),
              boxes: pics.map((sh) => ({ x: sh.x, y: sh.y, w: sh.w, h: sh.h })),
              rules: { maxOutside: SPRITE_OUTSIDE_SHARE, quality: calco.PICTURE_JPEG_QUALITY, toneBytes: calco.PICTURE_TONE_JPEG_BYTES, flatBytes: calco.PICTURE_FLAT_BYTES, share: calco.PICTURE_JPEG_SHARE },
            });
            if (got.outside > SPRITE_OUTSIDE_SHARE) {
              // Not all of it is covered: undo this read; the `finally` below ends the split before the next one.
              await h.evaluate(restoreSlide);
              continue;
            }
            // Each picture takes the box of its ink, and becomes one picture per piece (a photo, and the thin rule
            // beside it); a box with no ink is no picture.
            const pieces = new Map();
            for (const [k, sh] of pics.entries()) pieces.set(sh, got.images[k]);
            read.shapes = read.shapes.flatMap((sh) => {
              if (sh.kind !== 'picture') return [sh];
              return (pieces.get(sh) || []).map((img) => ({ ...sh, x: img.x, y: img.y, w: img.w, h: img.h, image: new Uint8Array(Buffer.from(img.data, 'base64')) }));
            });
            withSprites = true;
          }
        } finally {
          await h.evaluate(restoreSplit);
        }
        break;
      }
        if (reads) {
          // Something here reads what is behind it: prove the layers add back up, or keep the old picture.
          const full = Buffer.from(await h.screenshot(shot));
          const bad = await h.evaluate(splitError, { bg: known.bg.toString('base64'), fg: fg.toString('base64'), full: full.toString('base64'), tol: 16 });
          if (bad > SPLIT_BAD_SHARE) return { image: new Uint8Array(full), frames: read.frames, shapes: read.shapes, approximated: read.approximated };
        }
        let index;
        if (known.flat) {
          index = backgrounds.findIndex((b) => b.color === known.flat);
          if (index < 0) index = backgrounds.push({ color: known.flat }) - 1;
        } else {
          // A remembered background, or the one this slide added; its slot is empty until a slide uses it.
          // slot -1: the page was full and did not remember it; it stands alone.
          if (known.slot < 0) {
            if (known.own === undefined) known.own = backgrounds.push({ image: new Uint8Array(known.bg) }) - 1;
            index = known.own;
          } else {
            if (imageIndexes[known.slot] == null) imageIndexes[known.slot] = backgrounds.push({ image: new Uint8Array(known.bg) }) - 1;
            index = imageIndexes[known.slot];
          }
        }
        return { image: withSprites ? undefined : new Uint8Array(fg), frames: read.frames, shapes: read.shapes, background: index, approximated: read.approximated };
      } finally {
        await h.evaluate(restoreSlide);
      }
    }, `capture slide ${i + 1} for office export`));
  }
  return { slides, backgrounds };
}

/**
 * Write the office file.
 *
 * @param {string} outPath
 * @param {'odp'|'pptx'} format
 * @param {{slides: Array<{image: Uint8Array, frames: Array, shapes?: Array, background?: number}>, backgrounds: Array}} captured  from `captureSlides`.
 * @param {object} meta   title/subject/author/company + `width`/`height` (the slide box, px).
 * @param {Array<string|null>} notes         per-slide speaker notes (already stripped if asked).
 * @param {Array<string|null>} descriptions  per-slide alt text.
 * @param {string} pkgRoot
 * @param {{lattice?: Uint8Array, date?: Date}} [embed]  `--reopenable`, .pptx only: the deck's
 *   `.lattice`, carried as the picture .pptx carries it (lib/core/reopenable.js).
 * @returns {Promise<{slides: number, frames: number, shapes: number, backgrounds: number, unshared: number, pictures: number, wholePictures: number, approximated: Record<string, number>, fonts: number}>}
 */
async function writeOffice(outPath, format, captured, meta, notes = [], descriptions = [], pkgRoot, embed = {}) {
  const calco = require('@laticent/calco');
  const deck = {
    width: meta.width,
    height: meta.height,
    title: meta.title,
    subject: meta.subject,
    author: meta.author || 'Lattice',
    company: meta.company || 'Lattice',
    backgrounds: captured.backgrounds,
    slides: captured.slides.map((c, i) => ({ image: c.image, frames: c.frames, shapes: c.shapes || [], background: c.background, notes: notes[i] || null, description: descriptions[i] || null })),
  };
  const hasText = deck.slides.some((s) => s.frames.length);
  // Both formats embed the faces: the ODP as TrueType, the PPTX as Embedded OpenType.
  deck.fonts = hasText ? await calco.prepareFonts(deck, createFontHost(pkgRoot)) : [];
  let bytes;
  if (format === 'odp') {
    bytes = await calco.writeOdp(require('jszip'), deck, 'nodebuffer');
  } else {
    const mod = require('pptxgenjs');
    bytes = await calco.writePptx(mod.default || mod, deck, 'nodebuffer', require('jszip'));
    if (embed.lattice) {
      const { embedInPptxBytes } = require('../core/reopenable');
      bytes = Buffer.from(await embedInPptxBytes(require('jszip'), bytes, embed.lattice, { date: embed.date }));
    }
  }
  fs.writeFileSync(outPath, bytes);
  return {
    slides: deck.slides.length,
    frames: deck.slides.reduce((n, s) => n + s.frames.length, 0),
    shapes: deck.slides.reduce((n, s) => n + s.shapes.filter((sh) => sh.kind !== 'picture').length, 0),
    // Pictures of what could not be a shape (a photo, an icon, a chart), and the slides that keep one slide-sized picture instead.
    pictures: deck.slides.reduce((n, s) => n + s.shapes.filter((sh) => sh.kind === 'picture').length, 0),
    wholePictures: deck.slides.filter((s) => s.image).length,
    backgrounds: deck.backgrounds.length,
    // Slides that could not take a shared background and keep their own opaque picture.
    unshared: deck.slides.filter((s) => s.background === undefined).length,
    // What the lifted shapes only approximate, by kind: `{ 'stacked-shadow': 3, 'backdrop-blur': 1 }`.
    approximated: captured.slides.reduce((tally, c) => {
      for (const kind of c.approximated || []) tally[kind] = (tally[kind] || 0) + 1;
      return tally;
    }, {}),
    // The .pptx embeds only the faces it can wrap as EOT; the count says what the file carries.
    fonts: format === 'pptx' ? calco.planEmbedding(deck).faces.length : deck.fonts.length,
  };
}

module.exports = { captureSlides, writeOffice, createFontHost };
