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
 * frames), its text HIDDEN, photographed, and restored; in picture mode it is photographed
 * as is. Runs against the page the raster path already rendered.
 *
 * @param {Array} handles   puppeteer handles to each `section[data-lattice-slide]`.
 * @param {object} shot     the screenshot options the raster path uses.
 * @param {boolean} editable
 * @param {(fn: Function, label: string) => Promise<any>} [guard]  the render watchdog,
 *   applied PER SLIDE as the raster loop applies it per screenshot. One guard around the
 *   whole loop failed every deck past ~60 slides (a 123-slide gallery died at 90s).
 * @returns {Promise<Array<{image: Uint8Array, frames: Array}>>}
 */
async function captureSlides(handles, shot, editable, guard = (fn) => fn()) {
  const { readSlide, restoreSlide } = require('@laticent/calco');
  const out = [];
  for (const [i, h] of handles.entries()) {
    out.push(await guard(async () => {
      if (!editable) return { image: new Uint8Array(await h.screenshot(shot)), frames: [] };
      const read = await h.evaluate(readSlide, { hide: true });
      try {
        return { image: new Uint8Array(await h.screenshot(shot)), frames: read.frames };
      } finally {
        await h.evaluate(restoreSlide);
      }
    }, `capture slide ${i + 1} for office export`));
  }
  return out;
}

/**
 * Write the office file.
 *
 * @param {string} outPath
 * @param {'odp'|'pptx'} format
 * @param {Array<{image: Uint8Array, frames: Array}>} captured  from `captureSlides`.
 * @param {object} meta   title/subject/author/company + `width`/`height` (the slide box, px).
 * @param {Array<string|null>} notes         per-slide speaker notes (already stripped if asked).
 * @param {Array<string|null>} descriptions  per-slide alt text.
 * @param {string} pkgRoot
 * @returns {Promise<{slides: number, frames: number, fonts: number}>}
 */
async function writeOffice(outPath, format, captured, meta, notes = [], descriptions = [], pkgRoot) {
  const calco = require('@laticent/calco');
  const deck = {
    width: meta.width,
    height: meta.height,
    title: meta.title,
    subject: meta.subject,
    author: meta.author || 'Lattice',
    company: meta.company || 'Lattice',
    slides: captured.map((c, i) => ({ image: c.image, frames: c.frames, notes: notes[i] || null, description: descriptions[i] || null })),
  };
  const hasText = deck.slides.some((s) => s.frames.length);
  // Fonts embed in the ODP only; the PPTX still needs their metrics to place baselines.
  deck.fonts = hasText ? await calco.prepareFonts(deck, createFontHost(pkgRoot)) : [];
  let bytes;
  if (format === 'odp') {
    bytes = await calco.writeOdp(require('jszip'), deck, 'nodebuffer');
  } else {
    const mod = require('pptxgenjs');
    bytes = await calco.writePptx(mod.default || mod, deck, 'nodebuffer');
  }
  fs.writeFileSync(outPath, bytes);
  return {
    slides: deck.slides.length,
    frames: deck.slides.reduce((n, s) => n + s.frames.length, 0),
    fonts: format === 'odp' ? deck.fonts.length : 0,
  };
}

module.exports = { captureSlides, writeOffice, createFontHost };
