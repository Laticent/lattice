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
 * @returns {Promise<number>}    the slide count written.
 */
async function writePptx(outPath, pngBuffers, meta = {}, notes = []) {
  if (!Array.isArray(pngBuffers) || pngBuffers.length === 0) {
    throw new Error('writePptx: no slide images to export');
  }
  const PptxGenJS = loadPptxGenJS();
  const pptx = new PptxGenJS();

  pptx.title = (meta.title || 'deck').trim();
  if (meta.subject) pptx.subject = meta.subject;
  pptx.author = meta.author || 'Lattice';
  pptx.company = meta.company || 'Lattice';
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
    slide.addImage({ data, x: 0, y: 0, w: '100%', h: '100%' });
    // Speaker note → the slide's notes placeholder. Image-per-slide otherwise
    // drops the note entirely (the PNG carries no text); this is the one channel
    // PowerPoint/Keynote surface as presenter notes. Only emit for a real note so
    // empty slides carry no notesSlide part.
    const note = notes[i];
    if (note) slide.addNotes(note);
  });

  await pptx.writeFile({ fileName: outPath });
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
