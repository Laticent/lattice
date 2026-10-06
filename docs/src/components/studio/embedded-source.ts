// A re-openable PDF / PowerPoint: the deck's `.lattice` project rides INSIDE the exported
// file, so the person you sent it to can open it in the Studio and edit it.
//
// THE ONE RULE (2026-06-16-lattice-export-format.md §3a): carry the source, never scrape
// the render. The payload is a whole `.lattice` zip — the same bytes "Lattice project"
// downloads — so import reads it back through `readLatticeFile` and nothing else. There is
// no second reader to drift from the first, and every guard that file already runs (size,
// inflate budget, manifest shape, package gates) runs here too.
//
// WHERE IT GOES:
//   · PDF — an embedded file attachment named `deck.lattice`, tagged `/AFRelationship
//     /Source` (PDF 2.0's "this is the source of the document"). Every desktop viewer
//     lists it in its attachments pane, which is the honest place for it: a reader can
//     see what they were sent.
//   · PPTX — a package part at `lattice/deck.lattice`, reached by a package-level
//     relationship of our own type. OPC consumers ignore relationship types they do not
//     know, so PowerPoint opens the file as before.
//
// OPT-IN, and comment-free (2026-10-05-reopenable-exports.md). The embedded source carries
// speaker notes and hidden slides, which a board PDF must not hand over by accident, and
// review comments never ride in a PDF or PPTX at all. The caller builds the payload with
// an empty comment list; this module does not decide what goes in it.
//
// UNTRUSTED ON THE WAY BACK. An imported PDF or PPTX is a file from anyone. The carrier is
// capped before it is parsed, the payload is capped before AND while it is inflated, and
// the result still goes through `readLatticeFile`'s own caps.

import type JSZipType from 'jszip';
// The WRITE half — part names, payload format, the PDF attach and the PPTX repack — is the
// shared kernel (lib/core/reopenable.js), which the CLI's `--reopenable` export calls too
// (HARD RULE #1). This file adapts it to Blobs and keeps the untrusted READ half, which only
// the Studio needs. A DEFAULT import: it is a CommonJS leaf (vite-cjs-lib-dev.mjs).
import reopenable from '../../../../lib/core/reopenable.js';
import { MAX_ZIP_BYTES, readBytesBudget } from './zip-limits';

/** The attachment's file name in a PDF, and the payload format either way. */
export const EMBED_FILENAME: string = reopenable.EMBED_FILENAME;
export const EMBED_MIME: string = reopenable.EMBED_MIME;
/** Where the payload lives inside a `.pptx` package. */
export const PPTX_EMBED_PART: string = reopenable.PPTX_EMBED_PART;
/** Our package-relationship type. A URI is all OPC asks for; nothing fetches it. */
export const PPTX_EMBED_REL: string = reopenable.PPTX_EMBED_REL;

/** The largest PDF or PPTX the importer will parse to look for a payload. A 60-slide
 *  photo-per-page export measures in the tens of MB; this leaves room above that without
 *  letting a hostile file make the tab parse an unbounded object graph. */
export const MAX_CARRIER_BYTES = 200 * 1024 * 1024;

const TOO_LARGE = 'That file is too large to open.';

// ── PDF ──────────────────────────────────────────────────────────────────────

/** Attach the `.lattice` payload to a finished PDF. Metadata the export already wrote
 *  (title, producer, keywords) is left exactly as it was. */
export async function embedInPdf(pdf: Blob, lattice: Uint8Array): Promise<Blob> {
	const pdfLib = await import('pdf-lib');
	const bytes: Uint8Array = await reopenable.embedInPdfBytes(pdfLib, new Uint8Array(await pdf.arrayBuffer()), lattice);
	return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/**
 * Find the `.lattice` payload in a PDF. Returns null when the PDF has none — every PDF
 * exported before this feature, and every one exported with the switch off.
 */
export async function extractFromPdf(pdf: Blob): Promise<Uint8Array | null> {
	if (pdf.size > MAX_CARRIER_BYTES) throw new Error(TOO_LARGE);
	const lib = await import('pdf-lib');
	const { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } = lib;
	let doc: Awaited<ReturnType<typeof PDFDocument.load>>;
	try {
		doc = await PDFDocument.load(await pdf.arrayBuffer(), { updateMetadata: false, ignoreEncryption: true });
	} catch {
		throw new Error('That PDF could not be read.');
	}
	const text = (o: unknown) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : null);
	const names = doc.catalog.lookup(PDFName.of('Names'));
	const tree = names instanceof PDFDict ? names.lookup(PDFName.of('EmbeddedFiles')) : undefined;
	if (!(tree instanceof PDFDict)) return null;
	// Walk the name tree — flat `/Names` pairs, or `/Kids` for a large tree. A hostile file
	// can make the tree a cycle, so every node is visited once and the depth is bounded.
	const seen = new Set<unknown>();
	const stack: { node: import('pdf-lib').PDFDict; depth: number }[] = [{ node: tree, depth: 0 }];
	for (let item = stack.pop(); item; item = stack.pop()) {
		const { node, depth } = item;
		if (seen.has(node) || depth > 32) continue;
		seen.add(node);
		const pairs = node.lookup(PDFName.of('Names'));
		if (pairs instanceof PDFArray) {
			for (let i = 0; i + 1 < pairs.size(); i += 2) {
				const spec = pairs.lookup(i + 1);
				if (!(spec instanceof PDFDict)) continue;
				const fileName = text(spec.lookup(PDFName.of('UF'))) ?? text(spec.lookup(PDFName.of('F'))) ?? text(pairs.lookup(i));
				if (fileName !== EMBED_FILENAME) continue;
				const ef = spec.lookup(PDFName.of('EF'));
				const stream = ef instanceof PDFDict ? ef.lookup(PDFName.of('F')) : undefined;
				if (!(stream instanceof PDFRawStream)) continue;
				return decodeEmbeddedStream(stream.getContents(), filterOf(stream.dict.lookup(PDFName.of('Filter')), lib));
			}
		}
		const kids = node.lookup(PDFName.of('Kids'));
		if (kids instanceof PDFArray) {
			for (let i = 0; i < kids.size(); i++) {
				const kid = kids.lookup(i);
				if (kid instanceof PDFDict) stack.push({ node: kid, depth: depth + 1 });
			}
		}
	}
	return null;
}

/** The stream's filter: '' for none, 'FlateDecode', or 'unsupported' for anything else. */
function filterOf(filter: unknown, { PDFArray, PDFName }: typeof import('pdf-lib')): string {
	if (filter === undefined) return '';
	const one = filter instanceof PDFArray ? (filter.size() === 1 ? filter.lookup(0) : null) : filter;
	if (one instanceof PDFName) {
		const n = one.decodeText();
		if (n === 'FlateDecode') return n;
	}
	return 'unsupported';
}

async function decodeEmbeddedStream(raw: Uint8Array, filter: string): Promise<Uint8Array> {
	// Capped on BOTH sides of the inflate: a payload that is already larger than a
	// `.lattice` may be is refused unread, and the inflate stops at the chunk that crosses
	// the cap, so a small deflate bomb cannot expand to gigabytes first.
	if (raw.byteLength > MAX_ZIP_BYTES) throw new Error(TOO_LARGE);
	if (filter === '') return raw;
	if (filter !== 'FlateDecode') throw new Error('That PDF’s Lattice deck is stored in a form this version cannot read.');
	return inflateCapped(raw, MAX_ZIP_BYTES);
}

/** zlib inflate with a running byte cap (exported for the bomb test). */
export async function inflateCapped(raw: Uint8Array, max: number): Promise<Uint8Array> {
	const reader = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > max) {
				await reader.cancel().catch(() => {});
				throw new Error(TOO_LARGE);
			}
			chunks.push(value);
		}
	} catch (e) {
		if ((e as Error)?.message === TOO_LARGE) throw e;
		throw new Error('That PDF’s Lattice deck is damaged.');
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.byteLength;
	}
	return out;
}

// ── PPTX ─────────────────────────────────────────────────────────────────────

/** Add the payload part, its content type and the package relationship to a `.pptx`. */
export async function embedInPptx(pptx: Blob, lattice: Uint8Array): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const bytes: Uint8Array = await reopenable.embedInPptxBytes(JSZip, new Uint8Array(await pptx.arrayBuffer()), lattice);
	return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: reopenable.PPTX_MIME });
}

/** Find the payload in an already-opened `.pptx` package; null when it carries none. */
export async function extractFromPptx(zip: JSZipType): Promise<Uint8Array | null> {
	const entry = zip.file(PPTX_EMBED_PART);
	if (!entry) return null;
	return (await readBytesBudget(TOO_LARGE, MAX_ZIP_BYTES)(entry)) ?? null;
}
