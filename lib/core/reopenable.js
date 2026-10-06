/**
 * A RE-OPENABLE export: the deck's `.lattice` project rides INSIDE an exported PDF or
 * PowerPoint, so the person it was sent to can open it in the Studio and edit it.
 *
 * ONE KERNEL, TWO CALLERS (HARD RULE #1). The Studio's "Re-openable in Lattice" switch
 * (docs/src/components/studio/embedded-source.ts) and the CLI's `--reopenable` flag
 * (lattice-emulator.js) both build the payload and place it with the functions below, so
 * a deck exported by either tool imports through the Studio's one reader
 * (deck-import.ts → readLatticeFile). Before this module the payload shape and the part
 * names lived in the Studio alone, and the same deck was re-openable or not depending on
 * which tool exported it (engineering/decisions/2026-10-05-reopenable-exports.md §6).
 *
 * THE ONE RULE (2026-06-16-lattice-export-format.md §3a): carry the source, never scrape the
 * render. The payload is a whole `.lattice` zip, the same bytes "Lattice project" downloads.
 *
 * WHERE IT GOES:
 *   · PDF  — an embedded file named `deck.lattice`, tagged `/AFRelationship /Source`. Every
 *     desktop viewer lists it in its attachments pane, so a reader can see what they got.
 *   · PPTX — a package part at `lattice/deck.lattice`, reached by a package relationship of
 *     our own type. OPC consumers ignore relationship types they do not know.
 *
 * THE LIBRARIES ARE PASSED IN, not required here. The Studio bundles its own pdf-lib and
 * JSZip (docs/node_modules) and the CLI uses the root install. A `require` in this file would
 * resolve the root copy from inside the Studio bundle and ship a second one beside it.
 *
 * This module does not decide WHAT goes in the payload. Comments never ride in a PDF or
 * PPTX (the callers pass an empty list), and the CLI scrubs speaker notes and `say:` lines
 * under `--strip-notes` / `--strip-say` before it calls here.
 *
 * Pure and fs-free. The untrusted READ half (extract + caps) stays in the Studio, which is
 * the only reader.
 */

/** The attachment's file name in a PDF, and the payload format either way. */
const EMBED_FILENAME = 'deck.lattice';
const EMBED_MIME = 'application/vnd.lattice+zip';
/** Where the payload lives inside a `.pptx` package. */
const PPTX_EMBED_PART = 'lattice/deck.lattice';
/** Our package-relationship type. A URI is all OPC asks for; nothing fetches it. */
const PPTX_EMBED_REL = 'https://github.com/Laticent/lattice/relationships/deck-source';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// ── The `.lattice` project zip ────────────────────────────────────────────────

/** The manifest envelope version. Bump on a breaking shape change; the reader refuses newer. */
const LATTICE_VERSION = 1;
const LATTICE_DECK_FILE = 'deck.md';
const LATTICE_MANIFEST_FILE = 'manifest.json';
const LATTICE_PACKAGES_DIR = 'packages/';

/**
 * The manifest object for a deck. Pure: `now` (ms epoch) is injected, never read here.
 * @returns {{format: 'lattice', version: number, title: string, engine: 'lattice', generatedAt: number, comments: unknown[]}}
 */
function buildLatticeManifest(title, comments, now = 0) {
  return {
    format: 'lattice',
    version: LATTICE_VERSION,
    title: String(title || 'Untitled deck'),
    engine: 'lattice',
    generatedAt: now,
    comments: Array.isArray(comments) ? comments : [],
  };
}

/**
 * Assemble a `.lattice` zip: `deck.md` (the source, byte for byte) + `manifest.json` + the user
 * packages the deck uses as `packages/<type>/<name>/<file>` folders
 * (2026-09-23-portable-packages.md §4).
 *
 * `date` stamps every entry. JSZip otherwise stamps the wall clock, so two CLI runs of one deck
 * would differ in the payload's bytes. A zip date cannot be earlier than 1980, so an earlier
 * instant (the CLI's pinned 1970 epoch) is clamped to 1980-01-01.
 *
 * @param {typeof import('jszip')} JSZip
 * @param {{source: string, title: string, comments?: unknown[], now?: number,
 *          packages?: ReadonlyArray<{type: string, name: string, files: Record<string, string|Uint8Array>}>,
 *          date?: Date}} deck
 * @returns {Promise<Uint8Array>}
 */
async function buildLatticeZip(JSZip, { source, title, comments = [], now = 0, packages = [], date }) {
  const zip = new JSZip();
  const opts = date ? { date: new Date(Math.max(date.getTime(), DOS_EPOCH_MS)) } : {};
  zip.file(LATTICE_DECK_FILE, source, opts);
  zip.file(LATTICE_MANIFEST_FILE, `${JSON.stringify(buildLatticeManifest(title, comments, now), null, 2)}\n`, opts);
  for (const p of packages) {
    // Sorted: a package read from disk lists its files in directory order, which differs between
    // filesystems, and the payload's bytes must not.
    for (const [f, data] of Object.entries(p.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) zip.file(`${LATTICE_PACKAGES_DIR}${p.type}/${p.name}/${f}`, data, { ...opts, createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** 1980-01-01T00:00:00Z, the earliest instant a zip's DOS date field can hold. */
const DOS_EPOCH_MS = Date.UTC(1980, 0, 1);

// ── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Attach the `.lattice` payload to a finished PDF. Metadata the export already wrote (title,
 * producer, keywords) is left as it was. `beforeSave(doc)` runs on the loaded document just
 * before it is written: the CLI pins its dates there (lib/core/pdf-timestamps.js), because a
 * date inside an object stream is invisible to the byte pin.
 *
 * @param {typeof import('pdf-lib')} pdfLib
 * @param {Uint8Array} pdf
 * @param {Uint8Array} lattice
 * @param {{beforeSave?: (doc: import('pdf-lib').PDFDocument) => void}} [opts]
 * @returns {Promise<Uint8Array>}
 */
async function embedInPdfBytes(pdfLib, pdf, lattice, { beforeSave } = {}) {
  const doc = await pdfLib.PDFDocument.load(pdf, { updateMetadata: false });
  await doc.attach(lattice, EMBED_FILENAME, {
    mimeType: EMBED_MIME,
    description: 'Lattice deck source — open this PDF in Lattice Studio to edit the deck',
    afRelationship: pdfLib.AFRelationship.Source,
  });
  if (beforeSave) beforeSave(doc);
  return doc.save({ useObjectStreams: true });
}

// ── PPTX ──────────────────────────────────────────────────────────────────────

/**
 * Add the payload part, its content type and the package relationship to a `.pptx`. Every
 * other part keeps its bytes: the repack STOREs, as pptxgenjs writes every part, so only
 * `[Content_Types].xml` and `_rels/.rels` change and one part is added. Idempotent: a second
 * call adds no second content type or relationship.
 *
 * @param {typeof import('jszip')} JSZip
 * @param {Uint8Array} pptx
 * @param {Uint8Array} lattice
 * @param {{date?: Date}} [opts]  stamps the added part (see `buildLatticeZip`).
 * @returns {Promise<Uint8Array>}
 */
async function embedInPptxBytes(JSZip, pptx, lattice, { date } = {}) {
  const zip = await JSZip.loadAsync(pptx);
  // STORE: the payload is a zip already, so deflating it again buys nothing. No folder entry:
  // OPC packages hold parts, not directories, and a strict reader flags a `lattice/` entry
  // (JSZip adds one by default).
  const stamp = date ? { date: new Date(Math.max(date.getTime(), DOS_EPOCH_MS)) } : {};
  zip.file(PPTX_EMBED_PART, lattice, { compression: 'STORE', createFolders: false, ...stamp });
  const typesEntry = zip.file('[Content_Types].xml');
  const relsEntry = zip.file('_rels/.rels');
  const types = typesEntry && (await typesEntry.async('string'));
  const rels = relsEntry && (await relsEntry.async('string'));
  if (!types || !rels) throw new Error('The PowerPoint file is missing its package parts.');
  // Each edit must LAND: a writer that closes the root differently (a prefix, a space) would
  // leave the part with no content type, and PowerPoint offers to "repair" that. Failing the
  // export loudly beats shipping a file that opens with a warning.
  const edit = (xml, close, add) => {
    const at = xml.lastIndexOf(close);
    if (at < 0) throw new Error('The PowerPoint file has a package layout this version cannot extend.');
    return xml.slice(0, at) + add + xml.slice(at);
  };
  // An edited part keeps the date the exporter gave it, so `date` is the only clock here.
  const keep = (entry) => ({ date: entry.date });
  if (!/Extension="lattice"/i.test(types)) {
    zip.file('[Content_Types].xml', edit(types, '</Types>', `<Default Extension="lattice" ContentType="${EMBED_MIME}"/>`), keep(typesEntry));
  }
  // Compare each relationship's Type EXACTLY, as a Set of whole values. A substring test would
  // also match the URI inside some other attribute or a longer type, and skip the one we need.
  const attrs = (name) => new Set([...rels.matchAll(new RegExp(`\\b${name}="([^"]*)"`, 'g'))].map((m) => m[1]));
  if (!attrs('Type').has(PPTX_EMBED_REL)) {
    const ids = attrs('Id');
    let n = 1;
    while (ids.has(`rIdLattice${n}`)) n++;
    zip.file('_rels/.rels', edit(rels, '</Relationships>', `<Relationship Id="rIdLattice${n}" Type="${PPTX_EMBED_REL}" Target="${PPTX_EMBED_PART}"/>`), keep(relsEntry));
  }
  // STORE, as pptxgenjs writes every part (DEFLATE here recompressed all ~66 parts of a
  // 10-slide deck, measured in #2532).
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE', mimeType: PPTX_MIME });
}

module.exports = {
  EMBED_FILENAME,
  EMBED_MIME,
  PPTX_EMBED_PART,
  PPTX_EMBED_REL,
  PPTX_MIME,
  LATTICE_VERSION,
  LATTICE_DECK_FILE,
  LATTICE_MANIFEST_FILE,
  LATTICE_PACKAGES_DIR,
  buildLatticeManifest,
  buildLatticeZip,
  embedInPdfBytes,
  embedInPptxBytes,
};
