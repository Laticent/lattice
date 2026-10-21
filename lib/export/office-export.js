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
 * Capture every slide for Calco. In editable mode each slide is READ (its text becomes
 * frames) and photographed twice: its own paint alone (the BACKGROUND, which slides that draw
 * the same thing share) and its content over transparency (the FOREGROUND), with what cannot
 * be a shape cropped out as pictures. In picture mode a slide is photographed as is. The
 * deciding is Calco's `captureOfficeSlides`, which the Studio runs too; this module is the
 * puppeteer host that gives it two verbs. Runs against the page the raster path already rendered.
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
  const { captureOfficeSlides } = require('@laticent/calco');
  if (!editable) {
    const slides = [];
    for (const [i, h] of handles.entries()) {
      slides.push(await guard(async () => ({ image: await shootPicture(h, shot), frames: [], shapes: [] }), `capture slide ${i + 1} for office export`));
    }
    return { slides, backgrounds: [] };
  }
  const host = {
    run: (i, fn, arg) => handles[i].evaluate(fn, arg),
    shoot: async (i, kind) => {
      const h = handles[i];
      // The foreground is re-encoded per picture, so its own compression is wasted time (optimizeForSpeed).
      if (kind === 'foreground') return Buffer.from(await h.screenshot({ ...shot, omitBackground: true, optimizeForSpeed: true }));
      if (kind === 'full') return Buffer.from(await h.screenshot(shot));
      return Buffer.from(await shootPicture(h, { ...shot, omitBackground: false }));
    },
    guard: (i, fn) => guard(fn, `capture slide ${i + 1} for office export`),
  };
  return captureOfficeSlides(host, handles.length, {
    sprites: options.sprites,
    onWarn: (message) => {
      if (process.env.DEBUG) console.warn(`calco: ${message}`);
    },
  });
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
