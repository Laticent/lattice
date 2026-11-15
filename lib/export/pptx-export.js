// Image-per-slide PPTX writer (the owned, marp-free PPTX export).
//
// One full-bleed picture per slide, with its speaker note and its alt text, written by
// Calco's PPTX writer (`@laticent/calco` `writePptx`): the same writer the editable export
// and the Studio use (HARD RULE #1), here given a deck of pictures and no text frames.
// Calco writes the OOXML package itself with JSZip; no third-party writer is in the path
// (engineering/decisions/2026-11-13-native-pptx-writer.md).
//
// `--pptx-editable` (marp's LibreOffice-backed editable variant) is intentionally
// NOT implemented here — image-per-slide matches marp's *default* PPTX and needs
// no external `soffice`. See engineering/decisions/2026-06-12-…-retire-marp.md.

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
 *                               Absent → the file is what Calco wrote.
 * @returns {Promise<number>}    the slide count written.
 */
async function writePptx(outPath, pngBuffers, meta = {}, notes = [], descriptions = [], embed = {}) {
  if (!Array.isArray(pngBuffers) || pngBuffers.length === 0) {
    throw new Error('writePptx: no slide images to export');
  }
  const calco = require('@laticent/calco');
  // The slide aspect comes from the deck's @size geometry: 16:9 is PowerPoint's wide slide,
  // and a portrait or square deck keeps its aspect with the longest edge at 13.333in
  // (`pptxPageSize`), so the picture full-bleeds instead of letterboxing.
  const deck = {
    width: Number(meta.width) > 0 ? Number(meta.width) : 1280,
    height: Number(meta.height) > 0 ? Number(meta.height) : 720,
    title: meta.title,
    subject: meta.subject,
    author: meta.author,
    lang: meta.lang,
    company: meta.company || 'Lattice',
    slides: pngBuffers.map((buf, i) => ({
      // `Buffer.from` normalizes puppeteer's screenshot return (a Uint8Array in v23+). PNG, or
      // JPEG for a photographic slide (lib/export/slide-picture.js): Calco names the part by its bytes.
      image: new Uint8Array(Buffer.from(buf)),
      frames: [],
      // Accessibility description → the slide picture's alt text, the WCAG SC 1.1.1 text
      // alternative a picture-per-slide deck otherwise lacks. Calco falls back to "Slide N".
      description: descriptions[i] || null,
      // Speaker note → the slide's notes page, the one channel PowerPoint and Keynote show as
      // presenter notes. A slide with no note gets no notes page.
      notes: notes[i] || null,
    })),
  };
  // Our own file write, after the optional payload: a re-openable export never leaves a plain
  // .pptx on disk half-way.
  let bytes = await calco.writePptx(require('jszip'), deck, 'nodebuffer');
  if (embed.lattice) {
    const { embedInPptxBytes } = require('../core/reopenable');
    bytes = await embedInPptxBytes(require('jszip'), bytes, embed.lattice, { date: embed.date });
  }
  require('node:fs').writeFileSync(outPath, bytes);
  return pngBuffers.length;
}

module.exports = { writePptx };
