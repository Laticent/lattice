// A DECK IN THE LIBRARY — kept as reference material, opened as a deck on request.
//
// The Library's one Import used to turn a deck down: a `.lattice` or a `.pptx` was "not a
// file the Library takes", and a deck saved as `.zip` went to the package importer, which
// refused it for not being a package. Now every deck lands on the Files tab as a reference
// file: its slide text and speaker notes become the reference text the chat and the
// generators read (within reference-doc.ts's text cap), and the card keeps the original file
// so "Open as deck" can hand it to the SAME reader "Import deck…" uses (deck-import.ts).
//
// SNIFF THE BYTES, NOT THE NAME — deck-import.ts's rule, and its own `deckZipKind` decides
// which archive is a deck, so this file and the deck importer cannot disagree. A `.zip`
// that holds a `.lattice` or a PowerPoint is a deck; any other `.zip` goes on to the
// package importer as before.
//
// Loaded on demand, the first time a file is imported or dropped: the Library itself is
// already a lazy panel, and this keeps JSZip and the deck reader off its first paint too.

import { stripFrontMatter } from '@/lib/front-matter';
import { comments } from '@/lib/slide-directives';
import { loadAuthoring } from '@/playground/authoring-door.js';
import { type ReferenceDoc, readReferenceDoc, sanitizeDocText } from './reference-doc';
import { MAX_DECK_REF_BYTES } from './reference-doc-store';

/** What the Library keeps for one imported file: the reference doc, and the deck file when the
 *  deck importer can open it. `note` is a line for the toast when something was left out. `sourceExact`: the stored
 *  text is byte for byte the Markdown file, so "Open as deck" can rebuild it from the text. */
export type LibraryReference = { doc: ReferenceDoc; deck: Blob | null; note?: string; sourceExact?: boolean };

const extOf = (name: string) => (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? '').toLowerCase();

async function head(file: File, n = 4): Promise<Uint8Array> {
	return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

const isZipHead = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Settle the files the extension alone cannot place. Size first, then bytes:
 * - A `.zip` up to the Library's deck cap is opened and asked `deckZipKind`: a deck goes to the decks, anything else
 *   (a package, or a damaged zip) to the package import as before. A bigger `.zip` goes straight to the package
 *   import, which refuses it on size before it reads a byte (asset-bundle.ts), as it always has.
 * - A file with an extension nothing takes is read ONLY to find a deck that lost its name (a mail app, a share sheet).
 *   A `.docx`, `.xlsx`, `.key` or `.epub` is a zip too, and is never handed to the package import: when it holds no
 *   deck it stays rejected, and the toast names it.
 */
export async function routeByBytes(files: { zips: File[]; rejected: File[] }): Promise<{ zips: File[]; decks: File[]; rejected: File[] }> {
	const zips: File[] = [];
	const decks: File[] = [];
	const rejected: File[] = [];
	const holdsDeck = async (f: File): Promise<boolean> => {
		if (f.size > MAX_DECK_REF_BYTES || !isZipHead(await head(f))) return false;
		const [{ default: JSZip }, { deckZipKind }] = await Promise.all([import('jszip'), import('./deck-import')]);
		try {
			return deckZipKind(await JSZip.loadAsync(await f.arrayBuffer())) !== null;
		} catch {
			return false; // a damaged zip is no deck; where it goes is the caller's rule
		}
	};
	for (const f of files.zips) ((await holdsDeck(f)) ? decks : zips).push(f);
	for (const f of files.rejected) ((await holdsDeck(f)) ? decks : rejected).push(f);
	return { zips, decks, rejected };
}

/**
 * A deck's reference text: each slide's words, then its speaker note, in slide order. The
 * note is the one the Studio's notes field shows (slide-notes.ts `getNote`), so a directive,
 * a `describe:` line or a `say:` line is never mistaken for one. Capped and cleaned by
 * `sanitizeDocText`, like every reference text.
 */
export async function deckReferenceText(source: string, title = ''): Promise<string> {
	// slide-notes.ts reads the lint core synchronously; its loaders await it first, and so does this one.
	await loadAuthoring();
	const [{ getNote }, { splitSlides }] = await Promise.all([import('./slide-notes'), import('@/lib/deck-lint')]);
	const out: string[] = [];
	if (title.trim()) out.push(`Deck: ${title.trim()}`);
	splitSlides(stripFrontMatter(source)).forEach((chunk, i) => {
		const words = withoutComments(chunk);
		const note = getNote(chunk);
		const lines = [`Slide ${i + 1}`];
		if (words) lines.push(words);
		if (note) lines.push(`Speaker notes: ${note}`);
		out.push(lines.join('\n'));
	});
	return sanitizeDocText(out.join('\n\n'));
}

/** A slide's source with every comment taken out: the words on the slide, not its directives or notes. */
function withoutComments(chunk: string): string {
	let out = chunk;
	const found = comments(chunk);
	for (let i = found.length - 1; i >= 0; i--) out = out.slice(0, found[i].start) + out.slice(found[i].end);
	return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A PowerPoint's own words, for one that carries no Lattice deck: each slide's text runs
 * and the body of its notes page. Reference text only — the deck importer still refuses
 * such a file (deck-import.ts never scrapes a render into a deck), so its card has no
 * "Open as deck".
 */
export async function pptxReferenceText(file: File): Promise<string> {
	const [{ default: JSZip }, { assertZipWithinLimits, readBudget }] = await Promise.all([import('jszip'), import('./zip-limits')]);
	const zip = await JSZip.loadAsync(await file.arrayBuffer());
	// An untrusted archive, read like every other: entry count and declared size checked before anything inflates,
	// then one running budget across every part read, so a crafted slide cannot inflate past it.
	const tooBig = 'That PowerPoint is too large to read as reference text.';
	const slideNo = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
	const slides = Object.keys(zip.files)
		.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
		.sort((a, b) => slideNo(a) - slideNo(b));
	// Only the parts this reads count toward the declared size: the slides, their relationships and the notes pages. A deck's
	// pictures, fonts and audio are never inflated here, so a PowerPoint with heavy media is still read, not refused.
	const reads = [
		...slides,
		...slides.map((p) => p.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')),
		...Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)),
	];
	assertZipWithinLimits(zip, tooBig, reads);
	const read = readBudget(tooBig);
	const out: string[] = [];
	for (const [i, path] of slides.entries()) {
		const words = runs((await read(zip.file(path))) ?? '');
		const notePath = notesPathFor((await read(zip.file(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')))) ?? '');
		const note = notePath ? bodyRuns((await read(zip.file(notePath))) ?? '') : '';
		const lines = [`Slide ${i + 1}`];
		if (words) lines.push(words);
		if (note) lines.push(`Speaker notes: ${note}`);
		out.push(lines.join('\n'));
	}
	return sanitizeDocText(out.join('\n\n'));
}

/** A slide's notes page, from the slide's own relationships (notes pages are not numbered like slides). */
function notesPathFor(rels: string): string | null {
	const target = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1];
	return target ? `ppt/notesSlides/${target}` : null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
		if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? _m;
		const n = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
		return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
	});

/** The text of every paragraph (`a:p`) in a DrawingML part, one paragraph a line. */
function runs(xml: string): string {
	const paras: string[] = [];
	for (const p of xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[\s\S]*?<\/a:p>/g) ?? []) {
		// The run's text is the capture group, never the match with its tags stripped by a regex: stripping, then decoding
		// `&lt;`, could hand back markup (CodeQL js/incomplete-multi-character-sanitization). The text is plain reference text.
		const text = [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decode(m[1] ?? '')).join('');
		if (text.trim()) paras.push(text.trim());
	}
	return paras.join('\n');
}

/** A notes page's body placeholder only: the page also holds the slide image and its number. */
function bodyRuns(xml: string): string {
	const bodies = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).filter((sp) => /<p:ph[^>]*type="body"/.test(sp));
	return bodies.map(runs).filter(Boolean).join('\n');
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** The refusal for a deck too large to keep a copy of: named, with the way to open it anyway. */
const tooLargeToKeep = (name: string) => `${name} is over the ${Math.floor(MAX_DECK_REF_BYTES / 1_048_576)} MB the Library keeps for one deck. Open it with Import deck… instead.`;

/**
 * Read a file the Library already knows is a deck (`.lattice`, `.pptx`, `.html`, `.mdx`, or a zip `routeByBytes` found a
 * deck in). Its size is checked first, so a file over the Library's deck cap is refused before it is read. The deck
 * importer reads it; its slide text and notes become the reference text, and a copy of its bytes is kept for "Open as
 * deck". A PowerPoint with no Lattice deck inside still lands, as its own words, without the action. Throws the
 * importer's own message for a file that is broken or is no deck (a webpage Lattice did not export), the way
 * "Import deck…" would.
 */
export async function readDeckReference(file: File): Promise<LibraryReference> {
	if (file.size > MAX_DECK_REF_BYTES) throw new Error(tooLargeToKeep(file.name));
	const { NO_SOURCE_PPTX, readDeckFile } = await import('./deck-import');
	try {
		const deck = await readDeckFile(file);
		return deckRef(file, await deckReferenceText(deck.source, deck.title));
	} catch (err) {
		if ((err as Error)?.message !== NO_SOURCE_PPTX) throw err;
	}
	const text = await pptxReferenceText(file);
	return { doc: textDoc(file.name, text), deck: null, note: `${file.name} has no editable deck inside, so it was added as reference text only.` };
}

/**
 * Read a reference file (`.md`, `.pdf`, `.txt`): what it always was, plus "Open as deck" where the deck importer reads
 * it.
 * - A PDF exported "Re-openable in Lattice" carries its deck, so it lands as that deck's slide text and notes, with a
 *   copy of the PDF for "Open as deck". Any other PDF stays a PDF reference. Size decides first: over the deck cap is
 *   refused unread; between reference-doc.ts's 5 MB and the deck cap, only a Lattice PDF is kept (a PDF can hide its
 *   attachment in a compressed object stream, so there is no cheap marker: it is parsed, within the deck cap).
 * - A Markdown file stays plain reference, as before: no second copy, no DECK badge, when its stored text is byte for
 *   byte the file (`sourceExact`): its card offers "Open as deck", rebuilding the file from that text. When the text is
 *   not the file (cut at the reference cap, CRLF, a BOM), a copy of the file is kept instead, so it still opens. A `.txt` stays plain reference: it is notes far more often than a deck.
 */
export async function readLibraryReference(file: File): Promise<LibraryReference> {
	const ext = extOf(file.name);
	if (ext === '.pdf' || isPdfHead(await head(file, 5))) {
		// Over the deck cap a PDF is neither kept as a deck nor as a reference (5 MB), whichever it is; say both.
		if (file.size > MAX_DECK_REF_BYTES)
			throw new Error(`${file.name} is ${(file.size / 1_048_576).toFixed(1)} MB. The Library keeps a reference PDF up to 5 MB and a Lattice deck up to ${Math.floor(MAX_DECK_REF_BYTES / 1_048_576)} MB; a PDF exported from Lattice opens with Import deck….`);
		// The deck importer decides, as it does for "Import deck…". A PDF it cannot open (no deck inside, or a
		// damaged one) is still the reference PDF it always was, within the reference size.
		const { readDeckFile } = await import('./deck-import');
		const deck = await readDeckFile(file).catch(() => null);
		if (deck) return deckRef(file, await deckReferenceText(deck.source, deck.title));
	}
	const doc = await readReferenceDoc(file);
	const md = ext === '.md' || ext === '.markdown';
	const exact = md && doc.kind === 'text' && sameBytes(new TextEncoder().encode(doc.text ?? ''), new Uint8Array(await file.arrayBuffer()));
	// A Markdown file whose stored text is not the file (cut at the reference text cap, CRLF, a BOM) keeps a copy of the
	// file instead, within the deck cap, so a long Markdown deck still opens as a deck. Never turn down a deck.
	if (md && !exact && doc.kind === 'text' && file.size <= MAX_DECK_REF_BYTES) return { doc, deck: new Blob([await file.arrayBuffer()], { type: file.type || 'text/markdown' }) };
	return { doc, deck: null, ...(exact ? { sourceExact: true } : {}) };
}

const isPdfHead = (b: Uint8Array) => String.fromCharCode(...b) === '%PDF-';

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

const textDoc = (name: string, text: string): ReferenceDoc => ({ name: name || 'deck', kind: 'text', text, bytes: utf8Bytes(text) });

/** A deck's reference: its text, and a COPY of its bytes. The picker's own File is a handle on the device's file, which
 *  can change or vanish after the pick; the PDF path stores decoded bytes for the same reason. */
async function deckRef(file: File, text: string): Promise<LibraryReference> {
	return { doc: textDoc(file.name, text), deck: new Blob([await file.arrayBuffer()], { type: file.type }) };
}
