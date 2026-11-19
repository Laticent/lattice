// FIELD-AWARE FIND AND REPLACE over one slide's Markdown — the kernel under the Studio chat's
// `find_text` and `replace_text` tools (#3208 items 6 and 25).
//
// The Studio's find bar (find-replace.ts, compose/find-target.ts) searches the editor's raw text: it
// cannot say WHICH part of a slide a match is in, and replace-all rewrites whatever matched, including
// a link target or a directive. The chat needs both answers. Asked to change "Oct. Tenth" across a deck,
// it has to know that a hit sits in a heading, a spoken line or a speaker note, and it must never
// rewrite an image URL, a `_class:` directive or a code sample on the way.
//
// TWO LAYERS keep a replace to words:
//
// 1. SEGMENTS. A slide is cut into pieces, each labeled with the field a reader would name and marked
//    replaceable or not. Code (fenced, indented, or fenced inside a quote), math, HTML blocks and `{…}`
//    records are found but never replaced; directives, pane markers, link and image targets, bare URLs,
//    reference definitions and footnote labels are never searched at all. A match never crosses a
//    segment. Comments are classified by the shared helpers the note and say editors use
//    (slide-directives.ts), so "a comment that is not a directive is a speaker note" holds here too.
//
// 2. THE STRUCTURE CHECK. Layer 1 decides where a match may be; it cannot decide what the replacement
//    builds around it. A note's words can become `hide` (a directive that hides the slide), `-->` can
//    close a comment early, `# ` at a line start makes a heading, `|` adds a table cell. So every
//    replaced slide's STRUCTURE (each comment's kind, the code fences, each line's leading marker and its
//    count of structural characters outside comments) is compared before and after, and a slide whose
//    structure moved is refused whole. The checker on this change found each of those by hand; the
//    check catches the shape, not the list, so the next case is caught too.
//
// Pure and synchronous; it never splits or rejoins the deck.

import { comments, fenceRanges, isDescriptionBody, isDirectiveBody, isPaneMarkerBody, isRecordBody, isSayBody } from './slide-directives';

export type FindField = 'heading' | 'eyebrow' | 'body' | 'quote' | 'alt text' | 'spoken line' | 'note' | 'description' | 'code' | 'math' | 'html' | 'record';

export interface FindOptions {
	/** Match case exactly. Default false. */
	caseSensitive?: boolean;
	/** Match whole words only: a letter, mark, digit or underscore may not touch either end. Default false. */
	wholeWord?: boolean;
}

export interface SlideMatch {
	readonly field: FindField;
	readonly start: number;
	readonly end: number;
	/** False inside code, math, HTML, a `{…}` record: places a literal replace could corrupt. */
	readonly replaceable: boolean;
}

interface Segment {
	readonly field: FindField;
	readonly start: number;
	readonly end: number;
	readonly replaceable: boolean;
}

/** The longest query the tools accept. A find string is a phrase, not a paragraph. */
export const FIND_MAX_CHARS = 200;

const escapeLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A global matcher for a literal query, or null for an empty one. Literal on purpose: a model-written
 *  regular expression run over untrusted deck text on the page's main thread is a ReDoS waiting to happen. */
export function literalMatcher(query: string, opts: FindOptions = {}): RegExp | null {
	if (!query) return null;
	const core = escapeLiteral(query);
	// \p{M}: a combining accent belongs to its word, so whole-word `cafe` does not match the `cafe` of `café`.
	const src = opts.wholeWord ? `(?<![\\p{L}\\p{M}\\p{N}_])${core}(?![\\p{L}\\p{M}\\p{N}_])` : core;
	return new RegExp(src, opts.caseSensitive ? 'gu' : 'giu');
}

// ── Comments ────────────────────────────────────────────────────────────────

type CommentKind = 'record' | 'say' | 'describe' | 'directive' | 'pane' | 'note';

function commentKind(body: string): CommentKind {
	const t = body.trim();
	if (isRecordBody(t)) return 'record';
	if (isSayBody(t)) return 'say';
	if (isDescriptionBody(t)) return 'describe';
	if (isDirectiveBody(t)) return 'directive';
	if (isPaneMarkerBody(t)) return 'pane';
	return 'note';
}

/** The comments the engine reads, outside fenced code. */
function liveComments(text: string) {
	const fences = fenceRanges(text);
	return comments(text).filter((c) => !fences.some(([a, b]) => c.start >= a && c.start < b));
}

/** The text a comment's body carries for a reader, past a `say:` / `note:` / `describe:` label. */
function labeledBody(body: string, bodyStart: number): { start: number; end: number } {
	const m = /^(\s*)(?:say|note|describe)\s*:\s*/i.exec(body);
	const lead = m ? m[0].length : (/^\s*/.exec(body)?.[0].length ?? 0);
	const trimmedEnd = body.replace(/\s+$/, '').length;
	return { start: bodyStart + lead, end: bodyStart + Math.max(lead, trimmedEnd) };
}

// ── Lines ───────────────────────────────────────────────────────────────────

/** Ranges inside one text line that are structure, never searched: link and image targets, HTML tags,
 *  bare URLs and footnote labels. */
function protectedRanges(line: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (const re of [/\]\([^)\n]*\)/g, /<[A-Za-z/!][^<>\n]*>/g, /\b(?:https?:\/\/|www\.)[^\s<>()]+/g, /\[\^[^\]\s]+\]/g]) for (const m of line.matchAll(re)) out.push([m.index, m.index + m[0].length]);
	return out.sort((a, b) => a[0] - b[0]);
}

/** Inline math `$…$`, found but never replaced. The delimiters follow the engine's own rule
 *  (lib/plugins/math/math.syntax.mjs `mathInlineRule`), so a price like `$5M-$6M` stays text: an opening
 *  `$` is not followed by a space or another `$`; a closing one is unescaped, not after a space, and
 *  not before a digit. */
function inlineMath(line: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== '$' || line[i - 1] === '\\') continue;
		const next = line[i + 1];
		if (next === undefined || next === '$' || next === ' ' || next === '\t') {
			if (next === '$') i++;
			continue;
		}
		let end = i + 1;
		while (end < line.length) {
			if (line[end] === '$' && line[end - 1] !== '\\' && !/[ \t]/.test(line[end - 1]) && !/[0-9]/.test(line[end + 1] ?? '')) break;
			end++;
		}
		if (end >= line.length) continue;
		out.push([i, end + 1]);
		i = end;
	}
	return out;
}

function lineField(line: string): FindField {
	if (/^\s{0,3}#{1,6}(?:\s|$)/.test(line)) return 'heading';
	if (/^\s{0,3}>/.test(line)) return 'quote';
	if (/^\s{0,3}`[^`]+`\s*$/.test(line)) return 'eyebrow'; // a paragraph that is one code span (base.docs.md §Eyebrow labels)
	return 'body';
}

const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])\s/;
const ATX = /^\s{0,3}#{1,6}(?:\s|$)/;
// CommonMark HTML block starts: types 1 and 6 by tag name (plus the media tags a slide uses), and type 7, a
// complete open or close tag alone on its line. An inline tag inside a sentence (`<b>Oct</b> grew`) is text.
const HTML_BLOCK_START =
	/^\s{0,3}<\/?(?:script|pre|style|textarea|address|article|aside|blockquote|details|dialog|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|iframe|li|main|nav|ol|p|section|summary|table|tbody|td|tfoot|th|thead|tr|ul|svg|img|video|audio|picture|source)(?:[\s/>]|$)/i;
const HTML_TAG_ALONE = /^\s{0,3}<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>\s*$/;
// A link reference definition: a label, a destination, and an optional quoted or parenthesized title.
const REF_DEF = /^\s{0,3}\[[^\]\n]+\]:\s*(?:<[^>\n]*>|\S+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*$/;

/** Per line: is it a block a replace must not touch (code, math, HTML), or never searched (a reference
 *  definition)? Tracks the blocks that span lines. Lines inside a fence or a comment are handled by
 *  the caller and only passed here for state. */
function lineKinds(lines: readonly string[]): Array<FindField | 'skip' | null> {
	const out: Array<FindField | 'skip' | null> = [];
	let math = false;
	let html = false;
	let quoteFence: string | null = null;
	let indented = false;
	let prev = '';
	let prevNonBlank = '';
	for (const line of lines) {
		const blank = !line.trim();
		let kind: FindField | 'skip' | null = null;
		if (quoteFence) {
			kind = 'code';
			if (new RegExp(`^\\s{0,3}>\\s?${quoteFence}`).test(line) || !/^\s{0,3}>/.test(line)) quoteFence = null;
		} else if (/^\s{0,3}>\s?(`{3,}|~{3,})/.test(line)) {
			quoteFence = /^\s{0,3}>\s?(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
			kind = 'code';
		} else if (math) {
			kind = 'math';
			if (/^\s*\$\$\s*$/.test(line)) math = false;
		} else if (/^\s*\$\$/.test(line)) {
			kind = 'math';
			math = !/\$\$\s*$/.test(line.trim().slice(2)); // `$$ x $$` on one line closes itself
		} else if (html) {
			kind = blank ? null : 'html';
			if (blank) html = false;
		} else if (HTML_BLOCK_START.test(line) || HTML_TAG_ALONE.test(line)) {
			kind = 'html';
			html = true;
		} else if (REF_DEF.test(line)) {
			kind = 'skip';
		} else if (/^(?: {4,}|\t)\S/.test(line) && (indented || ATX.test(prev) || (!prev.trim() && !LIST_ITEM.test(prevNonBlank) && !/^(?: {2,}|\t)/.test(prevNonBlank)))) {
			kind = 'code';
		}
		indented = kind === 'code' && !quoteFence && /^(?: {4,}|\t)/.test(line) ? true : blank ? indented : false;
		out.push(kind);
		prev = line;
		if (!blank) prevNonBlank = line;
	}
	return out;
}

// ── Segments ────────────────────────────────────────────────────────────────

/** Cut a slide into labeled segments, in source order. */
export function slideSegments(slide: string): Segment[] {
	const text = String(slide ?? '');
	const blocked: Array<{ start: number; end: number; seg?: Segment }> = [];
	for (const [start, end] of fenceRanges(text)) blocked.push({ start, end, seg: { field: 'code', start, end, replaceable: false } });
	for (const c of liveComments(text)) {
		const kind = commentKind(c.body);
		let seg: Segment | undefined;
		if (kind === 'record') seg = { field: 'record', start: c.bodyStart, end: c.bodyStart + c.body.length, replaceable: false };
		else if (kind === 'say') seg = { field: 'spoken line', ...labeledBody(c.body, c.bodyStart), replaceable: true };
		else if (kind === 'describe') seg = { field: 'description', ...labeledBody(c.body, c.bodyStart), replaceable: true };
		else if (kind === 'note') seg = { field: 'note', ...labeledBody(c.body, c.bodyStart), replaceable: true };
		blocked.push({ start: c.start, end: c.end, seg }); // a directive or pane marker: blocked, never searched
	}
	blocked.sort((a, b) => a.start - b.start);
	const out: Segment[] = [];
	for (const b of blocked) if (b.seg && b.seg.end > b.seg.start) out.push(b.seg);

	const lines = text.split('\n');
	const kinds = lineKinds(lines);
	let lineStart = 0;
	lines.forEach((line, li) => {
		const ls = lineStart;
		lineStart += line.length + 1;
		if (!line.trim() || kinds[li] === 'skip') return;
		// The parts of this line outside every blocked range (fences, comments).
		let pieces: Array<[number, number]> = [[ls, ls + line.length]];
		for (const b of blocked) {
			if (b.end <= ls || b.start >= ls + line.length) continue;
			pieces = pieces.flatMap(([a, z]): Array<[number, number]> => (b.end <= a || b.start >= z ? [[a, z]] : ([[a, Math.max(a, b.start)], [Math.min(z, b.end), z]] as Array<[number, number]>).filter(([p, q]) => q > p)));
		}
		const block = kinds[li];
		if (block) {
			for (const [a, z] of pieces) if (line.slice(a - ls, z - ls).trim()) out.push({ field: block as FindField, start: a, end: z, replaceable: false });
			return;
		}
		const field = lineField(line); // from the WHOLE line, so `## H <!-- note --> Oct` is still a heading
		const holes = protectedRanges(line).map(([a, z]) => ({ a: ls + a, z: ls + z, keep: false }));
		for (const [a, z] of inlineMath(line)) holes.push({ a: ls + a, z: ls + z, keep: true });
		holes.sort((x, y) => x.a - y.a);
		for (const [a, z] of pieces) {
			let cursor = a;
			for (const h of holes) {
				if (h.z <= cursor || h.a >= z) continue;
				if (h.a > cursor) out.push({ field, start: cursor, end: h.a, replaceable: true });
				if (h.keep) out.push({ field: 'math', start: Math.max(h.a, a), end: Math.min(h.z, z), replaceable: false });
				cursor = Math.max(cursor, h.z);
			}
			if (z > cursor) out.push({ field, start: cursor, end: z, replaceable: true });
		}
	});

	// `![alt](…)`: the alt is its own field. Split the segment that holds it.
	const alts = [...text.matchAll(/!\[([^\]\n]*)\]\(/g)].map((m) => ({ start: m.index + 2, end: m.index + 2 + m[1].length }));
	const split: Segment[] = [];
	for (const s of out) {
		let parts: Segment[] = [s];
		for (const a of alts) {
			parts = parts.flatMap((p) => {
				if (!p.replaceable || a.end <= p.start || a.start >= p.end) return [p];
				const lo = Math.max(a.start, p.start);
				const hi = Math.min(a.end, p.end);
				return [{ ...p, end: lo }, { ...p, field: 'alt text' as FindField, start: lo, end: hi }, { ...p, start: hi }].filter((x) => x.end > x.start);
			});
		}
		split.push(...parts);
	}
	return split.sort((a, b) => a.start - b.start);
}

// ── The structure check ─────────────────────────────────────────────────────

// Characters that build Markdown or HTML structure inside a line. A replace that changes how many of
// them a line holds (outside comments) has changed more than words.
const STRUCTURAL = ['|', '*', '`', '$', '<', '>', '[', ']', '~', '_', '!', '\\', '#'];
const LEADING = /^\s{0,3}(#{1,6}(?=\s|$)|>+|[-*+](?=\s)|\d{1,9}[.)](?=\s)|`{3,}|~{3,}|\[[^\]]*\]:|=+\s*$|-+\s*$|\|)/;

/** A slide's structure, as a string to compare: every comment's kind and its body's dash runs, the fence
 *  count, and per line (comments cut out) the leading marker and the count of each structural character. */
export function slideStructure(slide: string): string {
	const text = String(slide ?? '');
	const cs = liveComments(text);
	const parts = cs.map((c) => `${commentKind(c.body)}:${(c.body.match(/--/g) ?? []).length}`);
	parts.push(`fences:${fenceRanges(text).length}`);
	let outside = '';
	let at = 0;
	for (const c of cs) {
		outside += `${text.slice(at, c.start)}\u0000`;
		at = c.end;
	}
	outside += text.slice(at);
	for (const line of outside.split('\n')) {
		// Every leading marker (`- 1. x` is two), the indent before the text, and a hard break at the end.
		const markers: string[] = [];
		let rest = line;
		for (let m = LEADING.exec(rest); m && markers.length < 8; m = LEADING.exec(rest)) {
			markers.push(m[1]);
			rest = rest.slice(m[0].length);
		}
		const indent = /^[ \t]*/.exec(line)?.[0].replace(/\t/g, '    ').length ?? 0;
		const hardBreak = / {2,}$|\\$/.test(line) ? 'br' : '';
		parts.push(`${indent}:${markers.join(' ')}:${hardBreak}|${STRUCTURAL.map((ch) => line.split(ch).length - 1).join(',')}`);
	}
	return parts.join('\n');
}

/** The find text and the replacement reduced to their structural characters, with each run of anything
 *  else as one `x`: `*b*` → `*x*`, `b**` → `x**`, `[Oct` → `[x`. */
function skeleton(s: string): string {
	let out = '';
	for (const ch of s) out += STRUCTURAL.includes(ch) ? ch : out.endsWith('x') ? '' : 'x';
	return out;
}

/**
 * Why a find → replace pair would change markup rather than words, or null. When either side holds a
 * structural character, both must have the same skeleton: `*b*` → `*c*` is a word change inside the
 * emphasis, `*b*` → `b**` moves it and `five` → `$5` adds a `$` Markdown may read as math. Counting
 * characters on the slide cannot see a marker MOVE; this can. It refuses some harmless prose (`$5`,
 * `file_name`), and the model then uses edit_slides, which shows the whole slide on the card.
 */
export function markupChange(find: string, replacement: string): string | null {
	const has = (s: string) => [...s].some((ch) => STRUCTURAL.includes(ch));
	if (!has(find) && !has(replacement)) return null;
	if (skeleton(find) === skeleton(replacement)) return null;
	const added = [...new Set([...replacement].filter((ch) => STRUCTURAL.includes(ch)))];
	const which = added.length ? added.map((c) => `\`${c}\``).join(' ') : 'the markup around the words';
	return `the replacement changes ${which}, which Markdown reads as structure, not words`;
}

/** Every match of a literal query in one slide, labeled by field. */
export function findInSlide(slide: string, query: string, opts: FindOptions = {}): SlideMatch[] {
	const re = literalMatcher(query, opts);
	if (!re) return [];
	const text = String(slide ?? '');
	const out: SlideMatch[] = [];
	for (const s of slideSegments(text)) {
		const part = text.slice(s.start, s.end);
		for (const m of part.matchAll(re)) out.push({ field: s.field, start: s.start + m.index, end: s.start + m.index + m[0].length, replaceable: s.replaceable });
	}
	return out;
}

/**
 * Replace every REPLACEABLE match in one slide. Matches that are not replaceable come back in `skipped`.
 * When the result's structure differs from the slide's (the structure check above), nothing is replaced:
 * `text` is the slide unchanged and `blocked` says why.
 */
export function replaceInSlide(slide: string, query: string, replacement: string, opts: FindOptions = {}): { text: string; replaced: SlideMatch[]; skipped: SlideMatch[]; blocked?: string } {
	const text = String(slide ?? '');
	const all = findInSlide(text, query, opts);
	const replaced = all.filter((m) => m.replaceable);
	const skipped = all.filter((m) => !m.replaceable);
	if (!replaced.length) return { text, replaced, skipped };
	const markup = markupChange(query, replacement);
	if (markup) return { text, replaced: [], skipped: all, blocked: markup };
	let out = text;
	for (const m of [...replaced].reverse()) out = out.slice(0, m.start) + replacement + out.slice(m.end);
	if (slideStructure(out) !== slideStructure(text)) {
		return { text, replaced: [], skipped: all, blocked: 'the replacement would change the slide’s structure (a comment, a heading, a list, a table cell, emphasis or code), not just its words' };
	}
	return { text: out, replaced, skipped };
}

/** A view of a match with some context either side, kept to the match's own line, the match marked «like this». */
export function matchSnippet(text: string, start: number, end: number, radius = 32): string {
	const lineStart = text.lastIndexOf('\n', start - 1) + 1;
	const nl = text.indexOf('\n', end);
	const lineEnd = nl < 0 ? text.length : nl;
	const a = Math.max(lineStart, start - radius);
	const b = Math.min(lineEnd, end + radius);
	const flat = (s: string) => s.replace(/\s+/g, ' ');
	return `${a > lineStart ? '…' : ''}${flat(text.slice(a, start))}«${flat(text.slice(start, end))}»${flat(text.slice(end, b))}${b < lineEnd ? '…' : ''}`;
}
