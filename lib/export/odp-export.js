// Image-per-slide ODP writer — the LibreOffice Impress sibling of pptx-export.js.
//
// An .odp is an OpenDocument Presentation (ODF 1.3): a zip whose FIRST entry is an
// uncompressed `mimetype` file, plus `META-INF/manifest.xml`, `content.xml`,
// `styles.xml`, `meta.xml` and the slide pictures. This module writes that package
// itself, with jszip (already a dependency), so the export needs no `soffice` on the
// machine — the same reason pptx-export.js does not shell out to LibreOffice.
//
// Same slide model as the PPTX: one full-bleed PNG per page, the page sized to the
// deck's aspect with the longest edge at 13.333in (33.867cm), the author's
// `describe:` text as each picture's alt text, and speaker notes on the notes page.
//
// `buildOdp` is pure (bytes in, a JSZip out) and takes the JSZip class as an
// argument, so the browser sibling can call it with its own bundled copy; `writeOdp`
// is the Node wrapper the CLI calls.

const MIMETYPE = 'application/vnd.oasis.opendocument.presentation';
// PowerPoint's 16:9 width — the same normalization pptxLayout applies.
const LONGEST_EDGE_CM = 33.867;
// No directory entries: an ODF package holds files, and the manifest lists only those.
const NO_DIRS = Object.freeze({ createFolders: false });

/** Escape text for an XML text node or a double-quoted attribute. */
function xmlEscape(s) {
  return String(s)
    // Characters XML 1.0 forbids outright; a stray one makes LibreOffice refuse the file.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Page size in cm for a deck geometry in px. The longest edge is 33.867cm and the
 * other keeps the deck's aspect; no geometry means 16:9 (33.867 × 19.05).
 */
function odpPageSize(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return { w: LONGEST_EDGE_CM, h: 19.05 };
  const longest = Math.max(w, h);
  const round = (n) => Math.round(n * 1000) / 1000;
  return { w: round((w / longest) * LONGEST_EDGE_CM), h: round((h / longest) * LONGEST_EDGE_CM) };
}

/** A note becomes one `<text:p>` per line, so line breaks survive in Impress. */
function noteParagraphs(note) {
  return String(note)
    .split(/\r?\n/)
    .map((line) => `<text:p>${xmlEscape(line)}</text:p>`)
    .join('');
}

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
].join(' ');

function stylesXml(page) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">
<office:styles>
<style:default-style style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:default-style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${page.w}cm" fo:page-height="${page.h}cm" style:print-orientation="${page.w >= page.h ? 'landscape' : 'portrait'}"/></style:page-layout>
<style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="none" presentation:background-visible="true" presentation:background-objects-visible="true"/></style:style>
</office:automatic-styles>
<office:master-styles>
<style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1"/>
</office:master-styles>
</office:document-styles>`;
}

function contentXml(count, page, notes, descriptions) {
  // The notes page is portrait A4-ish: thumbnail on top, note text below. Impress
  // lays out its own notes view; these frames only need sane positions.
  const pages = [];
  for (let i = 0; i < count; i++) {
    const n = String(i + 1).padStart(3, '0');
    const alt = (descriptions[i] || '').trim();
    const note = notes[i];
    const notesXml = note
      ? `<presentation:notes><draw:page-thumbnail presentation:class="page" draw:page-number="${i + 1}" svg:x="2.1cm" svg:y="2.3cm" svg:width="16.8cm" svg:height="9.45cm"/>` +
        `<draw:frame presentation:class="notes" svg:x="2.1cm" svg:y="12.8cm" svg:width="16.8cm" svg:height="13cm"><draw:text-box>${noteParagraphs(note)}</draw:text-box></draw:frame></presentation:notes>`
      : '';
    pages.push(
      `<draw:page draw:name="Slide ${i + 1}" draw:master-page-name="Default">` +
        `<draw:frame draw:name="Slide ${i + 1}" svg:x="0cm" svg:y="0cm" svg:width="${page.w}cm" svg:height="${page.h}cm">` +
        `<draw:image xlink:href="Pictures/slide${n}.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
        // Alt text: LibreOffice reads svg:title as the picture's title and svg:desc as
        // its description. Fall back to a neutral "Slide N" — never an empty alt.
        `<svg:title>${xmlEscape(`Slide ${i + 1}`)}</svg:title><svg:desc>${xmlEscape(alt || `Slide ${i + 1}`)}</svg:desc>` +
        `</draw:frame>${notesXml}</draw:page>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">
<office:body><office:presentation>${pages.join('')}</office:presentation></office:body>
</office:document-content>`;
}

function metaXml(meta) {
  const title = (meta.title || 'deck').trim();
  const fields = [
    `<meta:generator>Lattice</meta:generator>`,
    `<dc:title>${xmlEscape(title)}</dc:title>`,
    meta.subject ? `<dc:subject>${xmlEscape(meta.subject)}</dc:subject>` : '',
    `<meta:initial-creator>${xmlEscape(meta.author || 'Lattice')}</meta:initial-creator>`,
    // ODF has no "company" field; a user-defined property keeps the PPTX's provenance.
    `<meta:user-defined meta:name="Company">${xmlEscape(meta.company || 'Lattice')}</meta:user-defined>`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.3"><office:meta>${fields.join('')}</office:meta></office:document-meta>`;
}

function manifestXml(count) {
  const pics = [];
  for (let i = 0; i < count; i++) {
    pics.push(`<manifest:file-entry manifest:full-path="Pictures/slide${String(i + 1).padStart(3, '0')}.png" manifest:media-type="image/png"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIMETYPE}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
${pics.join('\n')}
</manifest:manifest>`;
}

/**
 * Assemble an image-per-slide ODP package.
 *
 * @param {Function} JSZip        the JSZip class (Node's `require('jszip')`, or the
 *                                browser's bundled import).
 * @param {Uint8Array[]} pngs     one full-bleed PNG per slide, in deck order.
 * @param {object} [meta]         title/subject/author/company, plus the deck
 *                                geometry `width`/`height` in px.
 * @param {Array<string|null>} [notes]         per-slide speaker note, index-aligned.
 * @param {Array<string|null>} [descriptions]  per-slide alt text, index-aligned.
 * @returns {JSZip} the package; call `generateAsync` with `odpZipOptions`.
 */
function buildOdp(JSZip, pngs, meta = {}, notes = [], descriptions = []) {
  if (!Array.isArray(pngs) || pngs.length === 0) {
    throw new Error('buildOdp: no slide images to export');
  }
  const page = odpPageSize(meta.width, meta.height);
  const zip = new JSZip();
  // ODF requires `mimetype` to be the first entry and stored uncompressed — that is
  // how a reader identifies the file type without unzipping. JSZip keeps insertion order.
  zip.file('mimetype', MIMETYPE, { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', manifestXml(pngs.length), NO_DIRS);
  zip.file('content.xml', contentXml(pngs.length, page, notes, descriptions));
  zip.file('styles.xml', stylesXml(page));
  zip.file('meta.xml', metaXml(meta));
  pngs.forEach((png, i) => {
    // PNG is compressed already; deflating it again costs time and saves nothing.
    zip.file(`Pictures/slide${String(i + 1).padStart(3, '0')}.png`, png, { ...NO_DIRS, compression: 'STORE' });
  });
  return zip;
}

/** Options for `zip.generateAsync`: DEFLATE the XML, no folder entries. */
const odpZipOptions = Object.freeze({ compression: 'DEFLATE', mimeType: MIMETYPE });

/**
 * Write an image-per-slide .odp (Node). Same arguments as `writePptx`.
 * @returns {Promise<number>} the slide count written.
 */
async function writeOdp(outPath, pngBuffers, meta = {}, notes = [], descriptions = []) {
  const JSZip = require('jszip');
  // `Buffer.from` normalizes puppeteer's Uint8Array screenshots, as in writePptx.
  const zip = buildOdp(JSZip, (pngBuffers || []).map((b) => Buffer.from(b)), meta, notes, descriptions);
  const bytes = await zip.generateAsync({ ...odpZipOptions, type: 'nodebuffer' });
  require('fs').writeFileSync(outPath, bytes);
  return pngBuffers.length;
}

module.exports = { buildOdp, writeOdp, odpPageSize, odpZipOptions, ODP_MIMETYPE: MIMETYPE };
