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
 *  deck importer can open it. `note` is a line for the toast when something was left out. */
export type LibraryReference = { doc: ReferenceDoc; deck: File | null; note?: string };

const extOf = (name: string) => (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? '').toLowerCase();

async function head(file: File, n = 4): Promise<Uint8Array> {
	return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

const isZipHead = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Settle the files the extension alone cannot place. A `.zip` is a deck when its archive
 * says so (`deckZipKind`), and a package otherwise. A file with an extension nothing takes
 * is read too: a zip whose name lost its `.lattice` (a mail app, a share sheet) is still a
 * deck. Everything else stays where it was.
 */
export async function routeByBytes(files: { zips: File[]; rejected: File[] }): Promise<{ zips: File[]; decks: File[]; rejected: File[] }> {
	const { default: JSZip } = await import('jszip');
	const { deckZipKind } = await import('./deck-import');
	const zips: File[] = [];
	const decks: File[] = [];
	const rejected: File[] = [];
	const kindOf = async (f: File): Promise<'deck' | 'package' | 'other'> => {
		if (!isZipHead(await head(f))) return 'other';
		try {
			return deckZipKind(await JSZip.loadAsync(await f.arrayBuffer())) ? 'deck' : 'package';
		} catch {
			return 'package'; // a damaged zip: the package importer names the problem, as it always has
		}
	};
	for (const f of files.zips) {
		const k = await kindOf(f);
		(k === 'deck' ? decks : zips).push(f);
	}
	for (const f of files.rejected) {
		const k = await kindOf(f);
		if (k === 'deck') decks.push(f);
		else if (k === 'package') zips.push(f);
		else rejected.push(f);
	}
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
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(await file.arrayBuffer());
	const slideNo = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
	const slides = Object.keys(zip.files)
		.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
		.sort((a, b) => slideNo(a) - slideNo(b));
	const out: string[] = [];
	for (const [i, path] of slides.entries()) {
		const words = runs(await zip.file(path)?.async('string') ?? '');
		const notePath = await notesPathFor(zip, path);
		const note = notePath ? bodyRuns(await zip.file(notePath)?.async('string') ?? '') : '';
		const lines = [`Slide ${i + 1}`];
		if (words) lines.push(words);
		if (note) lines.push(`Speaker notes: ${note}`);
		out.push(lines.join('\n'));
	}
	return sanitizeDocText(out.join('\n\n'));
}

/** A slide's notes page, from the slide's own relationships (notes pages are not numbered like slides). */
async function notesPathFor(zip: { file: (p: string) => { async: (t: 'string') => Promise<string> } | null }, slidePath: string): Promise<string | null> {
	const rels = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
	const xml = (await zip.file(rels)?.async('string')) ?? '';
	const target = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(xml)?.[1];
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
		const text = (p.match(/<a:t>([^<]*)<\/a:t>|<a:t\s[^>]*>([^<]*)<\/a:t>/g) ?? []).map((t) => decode(t.replace(/<[^>]+>/g, ''))).join('');
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

/**
 * Read a file the Library already knows is a deck (`.lattice`, `.pptx`, or a zip
 * `routeByBytes` found one in). The deck importer reads it; its slide text and notes become
 * the reference text, and the file is kept for "Open as deck". A PowerPoint with no Lattice
 * deck inside still lands, as its own words, without the action. Throws the importer's own
 * message for a file that is broken, the way "Import deck…" would.
 */
export async function readDeckReference(file: File): Promise<LibraryReference> {
	const { NO_SOURCE_PPTX, readDeckFile } = await import('./deck-import');
	let text: string;
	let opens = true;
	try {
		const deck = await readDeckFile(file);
		text = await deckReferenceText(deck.source, deck.title);
	} catch (err) {
		if ((err as Error)?.message !== NO_SOURCE_PPTX) throw err;
		text = await pptxReferenceText(file);
		opens = false;
	}
	return withDeck({ name: file.name || 'deck', kind: 'text', text, bytes: utf8Bytes(text) }, opens ? file : null, !opens);
}

/**
 * Read a reference file (`.md`, `.pdf`, `.txt`): what it always was, plus "Open as deck" where
 * the deck importer reads it. A PDF exported "Re-openable in Lattice" carries its deck, so it
 * lands as that deck's slide text and notes; any other PDF stays a PDF reference. A Markdown
 * file IS a deck source to the importer, so it keeps its text as before and gains the action.
 * A `.txt` stays a plain reference: it is notes far more often than a deck.
 */
export async function readLibraryReference(file: File): Promise<LibraryReference> {
	const ext = extOf(file.name);
	if (ext === '.pdf' || isPdfHead(await head(file, 5))) {
		// The deck importer decides, as it does for "Import deck…". A PDF it cannot open (no deck inside, or a
		// damaged one) is still the reference PDF it always was: the Library never turns a PDF down for that.
		const { readDeckFile } = await import('./deck-import');
		const deck = await readDeckFile(file).catch(() => null);
		if (deck) {
			const text = await deckReferenceText(deck.source, deck.title);
			return withDeck({ name: file.name, kind: 'text', text, bytes: utf8Bytes(text) }, file, false);
		}
	}
	const doc = await readReferenceDoc(file);
	return { doc, deck: ext === '.md' || ext === '.markdown' ? file : null };
}

const isPdfHead = (b: Uint8Array) => String.fromCharCode(...b) === '%PDF-';

function withDeck(doc: ReferenceDoc, deck: File | null, noSource: boolean): LibraryReference {
	if (noSource) return { doc, deck: null, note: `${doc.name} has no editable deck inside, so it was added as reference text only.` };
	if (deck && deck.size > MAX_DECK_REF_BYTES) {
		return { doc, deck: null, note: `${doc.name} is too large to keep a copy of here, so it was added as reference text only. Open it with Import deck….` };
	}
	return { doc, deck };
}
