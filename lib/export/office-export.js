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

// Per channel, the most two backgrounds may differ and still be one: a gradient dithers by a
// level between slides that draw the same thing.
const BACKGROUND_TOLERANCE = 3;
// A slide that reads the paint behind it, and whose foreground over its background misses the
// opaque picture by more than this share of its pixels, keeps its own opaque picture instead
// of sharing a background.
const SPLIT_BAD_SHARE = 0.001;

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
 * @returns {Promise<{slides: Array<{image: Uint8Array, frames: Array, shapes: Array, background?: number}>, backgrounds: Array<{color?: string, image?: Uint8Array}>}>}
 */
async function captureSlides(handles, shot, editable, guard = (fn) => fn()) {
  const { readSlide, restoreSlide, splitSlide, restoreSplit, splitKey } = require('@laticent/calco');
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
      const read = await h.evaluate(readSlide, { hide: true, shapes: true });
      try {
        await h.evaluate(splitSlide, 'foreground');
        let fg;
        try {
          fg = Buffer.from(await h.screenshot({ ...shot, omitBackground: true }));
        } finally {
          await h.evaluate(restoreSplit);
        }
        if (reads) {
          // Something here reads what is behind it: prove the layers add back up, or keep the old picture.
          const full = Buffer.from(await h.screenshot(shot));
          const bad = await h.evaluate(splitError, { bg: known.bg.toString('base64'), fg: fg.toString('base64'), full: full.toString('base64'), tol: 16 });
          if (bad > SPLIT_BAD_SHARE) return { image: new Uint8Array(full), frames: read.frames, shapes: read.shapes };
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
        return { image: new Uint8Array(fg), frames: read.frames, shapes: read.shapes, background: index };
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
 * @returns {Promise<{slides: number, frames: number, shapes: number, backgrounds: number, unshared: number, fonts: number}>}
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
    shapes: deck.slides.reduce((n, s) => n + s.shapes.length, 0),
    backgrounds: deck.backgrounds.length,
    // Slides that could not take a shared background and keep their own opaque picture.
    unshared: deck.slides.filter((s) => s.background === undefined).length,
    // The .pptx embeds only the faces it can wrap as EOT; the count says what the file carries.
    fonts: format === 'pptx' ? calco.planEmbedding(deck).faces.length : deck.fonts.length,
  };
}

module.exports = { captureSlides, writeOffice, createFontHost };
