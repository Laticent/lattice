// "Import deck…" — ONE door for every file Lattice can open as a deck.
//
//   .lattice  the project zip: source + comments + saved packages      (lossless)
//   .md       the source itself                                         (lossless)
//   .html     a webpage export; its `lattice-doc` envelope holds the source (lossless)
//   .pdf      a PDF exported with "Re-openable in Lattice"               (lossless)
//   .pptx     a PowerPoint exported the same way                         (lossless)
//
// Every route ends in the same `LatticeImport` shape, so the Studio opens all of them
// through one funnel (`StudioShell` `openLatticeImport`) and a `.lattice` riding inside a
// PDF meets exactly the gates a `.lattice` on its own does.
//
// SNIFF THE BYTES, NOT THE NAME. A file renamed `deck.pdf.download`, or a `.pptx` mailed
// as `.zip`, still opens; and a `.pptx` that is really something else is refused for what
// it is. The extension only breaks a tie that the bytes leave open (a zip is a `.lattice`
// or a `.pptx` — the archive's own parts decide).
//
// NEVER SCRAPE THE RENDER (2026-06-16-lattice-export-format.md §3a). A PDF or PPTX without
// an embedded payload is refused with a plain way forward — it is never turned into a
// lossy draft here. That is a different door, with a model behind it
// (2026-06-14-presentation-import.md), and it must never catch our own exports.

import type { LatticeImport } from './lattice-file';

export type DeckFileKind = 'zip' | 'pdf' | 'html' | 'markdown';

/** The largest text file (Markdown / HTML) read into memory. The HTML player inlines
 *  pictures, fonts and narration, so it is the large one; its envelope parser has its own
 *  cap beneath this. */
const MAX_TEXT_BYTES = 200 * 1024 * 1024;

/** What PDF / PPTX say when they carry no source — the whole way forward in one line. */
export const NO_SOURCE_PDF = 'This PDF has no editable deck inside. In Lattice, export it again with “Re-openable in Lattice” switched on — or ask the sender for the .lattice file.';
export const NO_SOURCE_PPTX = 'This PowerPoint has no editable deck inside. In Lattice, export it again with “Re-openable in Lattice” switched on — or ask the sender for the .lattice file.';

/**
 * What the first bytes say a file is. Pure, so it unit-tests without a File.
 * Returns null for a binary format we do not open (an image, a Keynote file, …).
 */
export function sniffDeckFile(head: Uint8Array, name = ''): DeckFileKind | null {
	if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'zip';
	// `%PDF-` may sit after a little junk; the spec lets readers look in the first 1 KB.
	const ascii = String.fromCharCode(...head.subarray(0, 1024));
	if (ascii.includes('%PDF-')) return 'pdf';
	// A NUL in the head is a binary file — never hand it to the Markdown editor.
	if (head.subarray(0, 1024).includes(0)) return null;
	const lead = ascii.replace(/^﻿|^\xEF\xBB\xBF/, '').trimStart().slice(0, 64).toLowerCase();
	if (lead.startsWith('<!doctype html') || lead.startsWith('<html')) return 'html';
	if (/\.html?$/i.test(name)) return 'html';
	return 'markdown';
}

const EMPTY_PACKAGES = (): LatticeImport['packages'] => ({ themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [] });

/**
 * Read any deck file into the `.lattice` import shape. Throws an Error whose message is
 * ready for a toast. `title` is '' when the file names none (Markdown) — the caller takes
 * it from the source's first heading.
 */
export async function readDeckFile(file: File): Promise<LatticeImport> {
	const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
	const kind = sniffDeckFile(head, file.name);
	if (kind === 'zip') return readZipDeck(file);
	if (kind === 'pdf') {
		const { extractFromPdf } = await import('./embedded-source');
		const payload = await extractFromPdf(file);
		if (!payload) throw new Error(NO_SOURCE_PDF);
		return readEmbeddedLattice(payload);
	}
	if (kind === 'html') return readHtmlDeck(file);
	if (kind === 'markdown') {
		if (file.size > MAX_TEXT_BYTES) throw new Error('That file is too large to open.');
		return { source: await file.text(), title: '', comments: [], packages: EMPTY_PACKAGES() };
	}
	throw new Error('Lattice can’t open that kind of file. Import a .lattice, .md, .html, .pdf or .pptx exported from Lattice.');
}

async function readZipDeck(file: File): Promise<LatticeImport> {
	const { MAX_ZIP_BYTES } = await import('./zip-limits');
	const { MAX_CARRIER_BYTES, extractFromPptx } = await import('./embedded-source');
	if (file.size > MAX_CARRIER_BYTES) throw new Error('That file is too large to open.');
	const { default: JSZip } = await import('jszip');
	// Read once, as bytes: JSZip takes them in every environment (a Blob needs FileReader),
	// and the `.lattice` branch hands the same bytes on rather than reading the file again.
	const bytes = new Uint8Array(await file.arrayBuffer());
	const zip = await JSZip.loadAsync(bytes).catch(() => {
		throw new Error('That file is not a valid archive.');
	});
	// A `.lattice` names its two parts at the root. Its own reader re-opens the archive with
	// its own (tighter) size cap, which is the point: one reader, one set of limits.
	if (zip.file('deck.md') && zip.file('manifest.json')) {
		if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('That .lattice file is too large to open.');
		const { readLatticeFile } = await import('./lattice-file');
		return readLatticeFile(bytes);
	}
	if (zip.file('[Content_Types].xml') && zip.file(/^ppt\//).length) {
		const payload = await extractFromPptx(zip);
		if (!payload) throw new Error(NO_SOURCE_PPTX);
		return readEmbeddedLattice(payload);
	}
	throw new Error('That archive is not a Lattice deck. Import a .lattice, .md, .html, .pdf or .pptx exported from Lattice.');
}

async function readEmbeddedLattice(payload: Uint8Array): Promise<LatticeImport> {
	const { readLatticeFile } = await import('./lattice-file');
	return readLatticeFile(payload);
}

async function readHtmlDeck(file: File): Promise<LatticeImport> {
	if (file.size > MAX_TEXT_BYTES) throw new Error('That file is too large to open.');
	const { default: latticeDoc } = await import('../../../../lib/core/lattice-doc.js');
	const html = await file.text();
	const payload = latticeDoc.readEnvelopePayload(html);
	if (payload == null) {
		throw new Error('This webpage has no Lattice deck inside. Export it from Lattice with “Download as webpage”, or ask the sender for the .lattice file.');
	}
	// The PAYLOAD, not the page: a player with inlined pictures and narration can be larger
	// than the envelope cap while its envelope is small. `parseEnvelope` validates shape,
	// enforces that cap on what it decodes, refuses a newer format and clamps the title —
	// the same kernel the player assembler wrote it with.
	const manifest = latticeDoc.parseEnvelope(payload) as { source: string; title?: string };
	return { source: manifest.source, title: String(manifest.title || ''), comments: [], packages: EMPTY_PACKAGES() };
}
