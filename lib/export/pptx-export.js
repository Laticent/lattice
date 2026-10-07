// Image-per-slide PPTX writer (the owned, marp-free PPTX export).
//
// Sibling implementations (keep in lockstep — same library, same image-slide
// model, so the CLI and the web playground emit byte-comparable .pptx files):
//   - This module                                  — the Node CLI path
//     (lattice-emulator.js, rasterizing via headless Chromium screenshots).
//   - docs/src/playground/drawing-board-export.js  — the browser path
//     (rasterizing via html-to-image).
// Both build a `LAYOUT_WIDE` (13.333 × 7.5in, 16:9) deck and full-bleed one PNG
// per slide. PowerPoint's .pptx is an OOXML zip; pptxgenjs owns that packaging
// (it ships its own jszip) and runs in both Node and the browser, so there is no
// hand-rolled OOXML and no marp-cli in the export path.
//
// `--pptx-editable` (marp's LibreOffice-backed editable variant) is intentionally
// NOT implemented here — image-per-slide matches marp's *default* PPTX and needs
// no external `soffice`. See engineering/decisions/2026-06-12-…-retire-marp.md.

// pptxgenjs is a runtime dependency (esbuild keeps it external — see
// tools/build-emulator.js `packages: 'external'`), required lazily so a
// PDF/PNG-only invocation never loads it.
function loadPptxGenJS() {
  const mod = require('pptxgenjs');
  // v3 ships as both a CJS export and an ESM default; normalize to the class.
  return mod.default || mod;
}

/**
 * Write an image-per-slide .pptx.
 *
 * @param {string}   outPath     destination `.pptx` path.
 * @param {Buffer[]} pngBuffers  one full-bleed PNG per slide, in deck order.
 * @param {object}   [meta]      document properties (title/author/subject/company)
 *                               plus the deck geometry `width`/`height` in px
 *                               (the resolved `@size`) so the slide aspect matches
 *                               — portrait/square decks export portrait/square.
 * @param {Array<string|null>} [notes]  per-slide speaker note, index-aligned to
 *                               `pngBuffers` (same deck order). A null/empty entry
 *                               adds no notes slide. The note/non-note boundary is
 *                               owned by notes-core (HARD RULE #1); the caller
 *                               passes the already-extracted strings.
 * @param {Array<string|null>} [descriptions]  per-slide accessibility description,
 *                               index-aligned to `pngBuffers`. Each becomes the
 *                               slide image's alt text (`addImage({ altText })`) —
 *                               the WCAG SC 1.1.1 text alternative that an
 *                               image-per-slide deck otherwise lacks entirely. A
 *                               null/empty entry leaves the image with no alt.
 * @param {{lattice?: Uint8Array, date?: Date}} [embed]  `--reopenable`: the deck's `.lattice`
 *                               to carry as the package part `lattice/deck.lattice`, through
 *                               the kernel the Studio's "Re-openable in Lattice" uses
 *                               (lib/core/reopenable.js). `date` stamps the added part.
 *                               Absent → the file is what pptxgenjs wrote, schema-tidied.
 * @returns {Promise<number>}    the slide count written.
 */
async function writePptx(outPath, pngBuffers, meta = {}, notes = [], descriptions = [], embed = {}) {
  if (!Array.isArray(pngBuffers) || pngBuffers.length === 0) {
    throw new Error('writePptx: no slide images to export');
  }
  const PptxGenJS = loadPptxGenJS();
  const pptx = new PptxGenJS();
  // PptxGenJS escapes markup but writes control characters as they come, and one in a
  // title, a note or an alt text makes its XML part unreadable. Calco strips them.
  const { xmlSafe } = require('@laticent/calco');

  pptx.title = xmlSafe(meta.title || '').trim() || 'deck';
  if (meta.subject) pptx.subject = xmlSafe(meta.subject);
  pptx.author = xmlSafe(meta.author || 'Lattice');
  pptx.company = xmlSafe(meta.company || 'Lattice');
  // Set the slide aspect from the deck's @size geometry; the PNG full-bleeds the
  // page. A 16:9 deck keeps the built-in LAYOUT_WIDE (byte-identical to before);
  // a portrait/square deck gets a custom layout at the same aspect, NORMALIZED so
  // the longest edge is 13.333in (PowerPoint's 16:9 width) — a 1080×1920 px box
  // would otherwise be a ~20in sheet. Without this, a portrait deck exported a
  // 16:9 PPTX that letterboxed the portrait image.
  pptx.layout = pptxLayout(pptx, meta.width, meta.height);

  pngBuffers.forEach((buf, i) => {
    // `Buffer.from` normalizes puppeteer's screenshot return (a Uint8Array in
    // v23+) — calling `.toString('base64')` straight on a Uint8Array yields
    // comma-joined decimals, not base64, which corrupts the OOXML zip.
    const data = 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
    const slide = pptx.addSlide();
    // Accessibility description → the slide image's alt text. Image-per-slide
    // otherwise leaves a screen reader with "Slide N, Picture" and nothing else
    // (a WCAG SC 1.1.1 Level-A gap); this alt text IS the text alternative.
    // ALWAYS set altText: pptxgenjs otherwise defaults `descr` to the image
    // filename ("preencoded.png") — junk a screen reader would read aloud. When
    // the author hasn't described the slide, fall back to a neutral "Slide N" so
    // the deck never ships the filename as its alt.
    const description = descriptions[i] && xmlSafe(descriptions[i]);
    slide.addImage({ data, x: 0, y: 0, w: '100%', h: '100%', altText: description || `Slide ${i + 1}` });
    // Speaker note → the slide's notes placeholder. Image-per-slide otherwise
    // drops the note entirely (the PNG carries no text); this is the one channel
    // PowerPoint/Keynote surface as presenter notes. Only emit for a real note so
    // empty slides carry no notesSlide part.
    const note = notes[i] && xmlSafe(notes[i]);
    if (note) slide.addNotes(note);
  });

  // `write` + our own file write, not `writeFile`: the same bytes (`writeFile` is `write` to a
  // nodebuffer, then fs), with one place to add the payload before the file exists. A
  // re-openable export never leaves a plain .pptx on disk half-way.
  let bytes = await pptx.write({ outputType: 'nodebuffer' });
  // PptxGenJS 3.12 writes the notes master out of schema order and a slide-master
  // content-type override per slide; Calco's tidy (the one the editable .pptx runs) mends
  // both, so a strict reader has nothing to repair.
  bytes = await require('@laticent/calco').tidyPptxPackage(require('jszip'), bytes, 'nodebuffer');
  if (embed.lattice) {
    const { embedInPptxBytes } = require('../core/reopenable');
    bytes = await embedInPptxBytes(require('jszip'), bytes, embed.lattice, { date: embed.date });
  }
  require('node:fs').writeFileSync(outPath, bytes);
  return pngBuffers.length;
}

/**
 * Resolve the pptxgenjs layout for a deck geometry (px). 16:9 (within 1%) → the
 * built-in `LAYOUT_WIDE` (unchanged for HD/4K/16:9). Otherwise define a custom
 * layout at the deck's aspect, normalized to a 13.333in longest edge. Returns the
 * layout NAME to assign to `pptx.layout`. Defaults to wide when geometry is absent.
 */
function pptxLayout(pptx, width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return 'LAYOUT_WIDE';
  if (Math.abs(w / h - 16 / 9) < 0.01) return 'LAYOUT_WIDE';
  const maxEdge = 13.333;
  const longest = Math.max(w, h);
  const layoutW = Math.round((w / longest) * maxEdge * 1000) / 1000;
  const layoutH = Math.round((h / longest) * maxEdge * 1000) / 1000;
  pptx.defineLayout({ name: 'LATTICE', width: layoutW, height: layoutH });
  return 'LATTICE';
}

module.exports = { writePptx, pptxLayout };
