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

export type FindField = 'heading' | 'eyebrow' | 'body' | 'quote' | 'alt text' | 'spoken line' | 'note' | 'description' | 'code' | 'math' | 'html' | 'record' | 'inline syntax';

export interface FindOptions {
	/** Match case exactly. Default false. */
	caseSensitive?: boolean;
	/** Match whole words only: a letter, mark, digit or underscore may not touch either end. Default false. */
	wholeWord?: boolean;
	/** Does a backtick span's text render as Lattice syntax (a pill `{BETA}`, an icon `^{bucket}`, a spark…)?
	 *  The Studio passes the engine's own reader (lib/core/inline-code-directives.js). Without it, a span
	 *  that opens with one of `{ ^ ~ ! @` counts as syntax: never written into, the safe side. */
	inlineDirective?: (text: string) => boolean;
}

const directiveSpan = (opts: FindOptions) => opts.inlineDirective ?? ((t: string) => /^[{^~!@]/.test(t.trim()));

export interface SlideMatch {
	readonly field: FindField;
	readonly start: number;
	readonly end: number;
	/** False inside code, math, HTML, a `{…}` record: places a literal replace could corrupt. */
	readonly replaceable: boolean;
	/** Why a match in replaceable text is left alone anyway, e.g. it crosses formatting. */
	readonly reason?: string;
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

/** How a replacement is written into a segment: `md` escapes what Markdown would read as markup, `raw`
 *  writes it as typed (code spans, spoken lines, notes: a backslash would show or be read aloud). */
type WriteMode = 'md' | 'raw';

interface ModedSegment extends Segment {
	readonly mode: WriteMode | null;
	/** A code span: a backtick in the replacement would end it. */
	readonly span?: boolean;
}

const seg = (field: FindField, start: number, end: number, mode: WriteMode | null, span = false): ModedSegment => ({ field, start, end, replaceable: mode !== null, mode, span });

/** Inline code spans in one line (CommonMark: a backtick run closed by the next run of the same length). */
function codeSpans(line: string): Array<[number, number, number]> {
	const out: Array<[number, number, number]> = [];
	const runs = [...line.matchAll(/(?<!\\)`+/g)].map((m) => ({ at: m.index, n: m[0].length }));
	for (let i = 0; i < runs.length; i++) {
		const j = runs.findIndex((r, k) => k > i && r.n === runs[i].n);
		if (j < 0) continue;
		out.push([runs[i].at, runs[j].at + runs[j].n, runs[i].n]); // [start, end, fence length]
		i = j;
	}
	return out;
}

/** Cut a slide into labeled segments, in source order. */
function modedSegments(slide: string, opts: FindOptions = {}): ModedSegment[] {
	const isDirective = directiveSpan(opts);
	const text = String(slide ?? '');
	const blocked: Array<{ start: number; end: number; seg?: ModedSegment }> = [];
	for (const [start, end] of fenceRanges(text)) blocked.push({ start, end, seg: seg('code', start, end, null) });
	for (const c of liveComments(text)) {
		const kind = commentKind(c.body);
		let sg: ModedSegment | undefined;
		if (kind === 'record') sg = seg('record', c.bodyStart, c.bodyStart + c.body.length, null);
		else if (kind === 'say' || kind === 'describe' || kind === 'note') {
			const b = labeledBody(c.body, c.bodyStart);
			sg = seg(kind === 'say' ? 'spoken line' : kind === 'describe' ? 'description' : 'note', b.start, b.end, 'raw');
		}
		blocked.push({ start: c.start, end: c.end, seg: sg }); // a directive or pane marker: blocked, never searched
	}
	blocked.sort((a, b) => a.start - b.start);
	const out: ModedSegment[] = [];
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
			for (const [a, z] of pieces) if (line.slice(a - ls, z - ls).trim()) out.push(seg(block as FindField, a, z, null));
			return;
		}
		const field = lineField(line); // from the WHOLE line, so `## H <!-- note --> Oct` is still a heading
		// Holes: never searched (targets, tags, URLs, footnote labels); math, found but kept; a code span's
		// fences dropped and its inside written raw.
		const holes: Array<{ a: number; z: number; as?: ModedSegment }> = protectedRanges(line).map(([a, z]) => ({ a: ls + a, z: ls + z }));
		for (const [a, z] of inlineMath(line)) holes.push({ a: ls + a, z: ls + z, as: seg('math', ls + a, ls + z, null) });
		// A span Lattice reads as syntax (a pill, an icon…) is found but never written into: its words are
		// arguments, and a change can turn it into code or into another kind (the checker on #3318).
		for (const [a, z, n] of codeSpans(line)) holes.push({ a: ls + a, z: ls + z, as: isDirective(line.slice(a + n, z - n)) ? seg('inline syntax', ls + a + n, ls + z - n, null) : seg(field, ls + a + n, ls + z - n, 'raw', true) });
		holes.sort((x, y) => x.a - y.a);
		for (const [a, z] of pieces) {
			let cursor = a;
			for (const h of holes) {
				if (h.z <= cursor || h.a >= z) continue;
				if (h.a > cursor) out.push(seg(field, cursor, h.a, 'md'));
				if (h.as && h.as.end > h.as.start && h.as.start >= a && h.as.end <= z) out.push(h.as);
				cursor = Math.max(cursor, h.z);
			}
			if (z > cursor) out.push(seg(field, cursor, z, 'md'));
		}
	});

	// `![alt](…)`: the alt is its own field. Split the segment that holds it.
	const alts = [...text.matchAll(/!\[([^\]\n]*)\]\(/g)].map((m) => ({ start: m.index + 2, end: m.index + 2 + m[1].length }));
	const split: ModedSegment[] = [];
	for (const s of out) {
		let parts: ModedSegment[] = [s];
		for (const a of alts) {
			parts = parts.flatMap((p) => {
				if (p.mode !== 'md' || a.end <= p.start || a.start >= p.end) return [p];
				const lo = Math.max(a.start, p.start);
				const hi = Math.min(a.end, p.end);
				return [{ ...p, end: lo }, { ...p, field: 'alt text' as FindField, start: lo, end: hi }, { ...p, start: hi }].filter((x) => x.end > x.start);
			});
		}
		split.push(...parts);
	}
	return split.sort((a, b) => a.start - b.start);
}

/** The slide's segments, labeled by field, in source order. */
export function slideSegments(slide: string, opts: FindOptions = {}): Segment[] {
	return modedSegments(slide, opts).map(({ field, start, end, replaceable }) => ({ field, start, end, replaceable }));
}

// ── What a reader sees: escapes resolved, formatting markers skipped ────────

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Line starts (offsets) of the slide's tables: a block of `|` lines with a delimiter row in it. Only there is
 *  `|` a cell separator; elsewhere it is text. */
function tableLines(text: string): Set<number> {
	const out = new Set<number>();
	const lines = text.split('\n');
	const starts: number[] = [];
	let at = 0;
	for (const l of lines) {
		starts.push(at);
		at += l.length + 1;
	}
	const DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].includes('|')) continue;
		let j = i;
		while (j < lines.length && lines[j].includes('|')) j++;
		if (lines.slice(i, j).some((l) => DELIM.test(l))) for (let k = i; k < j; k++) out.add(starts[k]);
		i = j;
	}
	return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isPunct = (c: string | undefined) => !!c && /[\p{P}\p{S}]/u.test(c);

/** Emphasis runs that can actually open or close (CommonMark's flanking rules), and have a partner of the
 *  same character in the segment; a lone or space-wrapped `*` or `_` (`2 * 3`, `5*3`, `*nix`) is text. */
function emphasisMarkers(src: string): Set<number> {
	const runs: Array<{ at: number; len: number; ch: string }> = [];
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if ((ch !== '*' && ch !== '_' && ch !== '~') || src[i - 1] === '\\') continue;
		let n = 1;
		while (src[i + n] === ch) n++;
		const prev = src[i - 1];
		const next = src[i + n];
		const left = !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
		const right = !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));
		// `_` inside a word is text (`file_name`); `~` counts only as a `~~` strikethrough run.
		const usable = ch === '_' ? (left && (!right || isPunct(prev))) || (right && (!left || isPunct(next))) : ch === '~' ? n >= 2 && (left || right) : left || right;
		if (usable) runs.push({ at: i, len: n, ch });
		i += n - 1;
	}
	const out = new Set<number>();
	for (const ch of ['*', '_', '~']) {
		const mine = runs.filter((r) => r.ch === ch);
		if (mine.length < 2) continue;
		for (const r of mine) for (let k = 0; k < r.len; k++) out.add(r.at + k);
	}
	return out;
}

/**
 * A Markdown segment as a reader sees it. `\$` reads `$` and `&amp;` reads `&`; an emphasis or strikethrough
 * marker, a link's `[`, a table's `|` are formatting, not text, so they are left out, and `gap[k]`
 * records that one stood just before visible character k. A search runs on `text` and maps back through
 * `src`/`end`: so `$5` finds `\$5`, `Oct` is found inside `**Oct**`, and a match never quietly swallows a
 * marker.
 */
function readerView(src: string, after = '', table = false): { text: string; src: number[]; end: number[]; escaped: boolean[]; gap: boolean[] } {
	const text: string[] = [];
	const at: number[] = [];
	const end: number[] = [];
	const escaped: boolean[] = [];
	const gap: boolean[] = [];
	let pending = false;
	const linkOpen = new Set<number>();
	// A link's `]( … )` target is cut out of the segment, so look for it in the rest of the line too.
	for (const m of (src + after).matchAll(/(?<!\\)\[(?=[^\]\n]*\]\()/g)) if (m.index < src.length) linkOpen.add(m.index);
	const emphasis = emphasisMarkers(src);
	const push = (ch: string, from: number, to: number, esc: boolean) => {
		text.push(ch);
		at.push(from);
		end.push(to);
		escaped.push(esc);
		gap.push(pending);
		pending = false;
	};
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (ch === '\\' && ASCII_PUNCT.test(src[i + 1] ?? '')) {
			push(src[i + 1], i + 1, i + 2, true);
			i++;
			continue;
		}
		if (ch === '&') {
			const m = /^&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/.exec(src.slice(i));
			if (m) {
				const cp = m[2] ? Number(m[2]) : m[3] ? Number.parseInt(m[3], 16) : -1;
				push(m[1] ? ENTITIES[m[1]] : String.fromCodePoint(cp > 0 && cp <= 0x10ffff ? cp : 0xfffd), i, i + m[0].length, false);
				i += m[0].length - 1;
				continue;
			}
		}
		const marker = emphasis.has(i) || (table && ch === '|') || (ch === '[' && linkOpen.has(i)) || (ch === '!' && linkOpen.has(i + 1));
		if (marker) {
			pending = true;
			continue;
		}
		push(ch, i, i + 1, false);
	}
	return { text: text.join(''), src: at, end, escaped, gap };
}

// ── Writing a replacement ───────────────────────────────────────────────────

/**
 * A replacement as Markdown that reads as the same words: a backslash before each character Markdown
 * would take as markup where it lands. Always: `\ ` * [ ] < $ | ~`. In context: `_` unless it sits inside
 * a word (`file_name` is text), `!` before a `[`, `&` that starts an entity, and a line-opening `#`, `>`,
 * `-`, `+`, `=` or `1.` (a heading, quote, list or underline). Checked against the engine itself
 * (deck-find.engine.test.ts): `\$5` renders `$5`, `\[draft\]` renders `[draft]`.
 */
export function escapeMarkdown(rep: string, before = '', after = '', atLineStart = false): string {
	let out = '';
	for (let i = 0; i < rep.length; i++) {
		const ch = rep[i];
		const prev = i === 0 ? before.slice(-1) : rep[i - 1];
		const next = i === rep.length - 1 ? after[0] : rep[i + 1];
		const rest = rep.slice(i) + after;
		if ('\\`*[]<$|~'.includes(ch) || (ch === '_' && !(isWordChar(prev) && isWordChar(next))) || (ch === '!' && next === '[') || (ch === '&' && /^&#?\w+;/.test(rest))) out += `\\${ch}`;
		else out += ch;
	}
	if (atLineStart) {
		const m = /^(\d{1,9})([.)])(?=\s|$)/.exec(out);
		if (m) out = `${m[1]}\\${m[2]}${out.slice(m[0].length)}`;
		else if (/^(?:#{1,6}(?=\s|$)|>|[-+](?=\s|$)|=+\s*$|-+\s*$)/.test(out)) out = `\\${out}`;
	}
	return out;
}

// ── The structure check (the backstop) ──────────────────────────────────────

const LEADING = /^\s{0,3}(#{1,6}(?=\s|$)|>+|[-*+](?=\s)|\d{1,9}[.)](?=\s)|`{3,}|~{3,}|\[[^\]]*\]:|=+\s*$|-+\s*$|\|)/;

/** How much ACTIVE markup a line holds, read by the same rules as `readerView`: emphasis runs that can open
 *  or close, `|` only in a table, a `[` that opens a link, real code spans and math, tag-like `<`, and
 *  comment markers. An escaped character is text, so the escaper and this check agree on what is markup;
 *  a `*` in `2 * 3` is text, and changing it to `\*` changes nothing. */
function activeCounts(line: string, table: boolean): string {
	const bare = line.replace(/\\[!-/:-@[-`{-~]/g, 'x');
	const n = (re: RegExp) => (bare.match(re) ?? []).length;
	const emph = [...emphasisMarkers(bare)];
	const count = (ch: string) => emph.filter((i) => bare[i] === ch).length;
	return [table ? n(/\|/g) : 0, count('*'), count('_'), count('~'), codeSpans(bare).length, inlineMath(bare).length, n(/<[A-Za-z/!]/g), n(/\[(?=[^\]\n]*\]\()/g), n(/!\[/g), n(/-->|--!>|<!--/g)].join(',');
}

/** A slide's structure, as a string to compare: every comment's kind and its body's dash runs, the fence
 *  count, and per line (comments cut out) the leading markers, indent, hard break and active markup. */
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
	const tables = tableLines(outside);
	let lineAt = 0;
	for (const line of outside.split('\n')) {
		const table = tables.has(lineAt);
		lineAt += line.length + 1;
		// Every leading marker (`- 1. x` is two), the indent before the text, and a hard break at the end.
		const markers: string[] = [];
		let rest = line;
		for (let m = LEADING.exec(rest); m && markers.length < 8; m = LEADING.exec(rest)) {
			markers.push(m[1]);
			rest = rest.slice(m[0].length);
		}
		const indent = /^[ \t]*/.exec(line)?.[0].replace(/\t/g, '    ').length ?? 0;
		const hardBreak = / {2,}$|(?<!\\)\\$/.test(line) ? 'br' : '';
		// A code span's inside is literal text, so only its fences count.
		let literal = line;
		for (const [a, z, n] of codeSpans(line).reverse()) literal = literal.slice(0, a + n) + 'x'.repeat(z - a - 2 * n) + literal.slice(z - n);
		parts.push(`${indent}:${markers.join(' ')}:${hardBreak}|${activeCounts(literal, table)}`);
	}
	return parts.join('\n');
}

// ── Find and replace ────────────────────────────────────────────────────────

interface Hit extends SlideMatch {
	/** What the replacement is written as here; empty when the match is not replaceable. */
	readonly mode: WriteMode | null;
	readonly span: boolean;
}

function hits(slide: string, query: string, opts: FindOptions): Hit[] {
	const re = literalMatcher(query, opts);
	if (!re) return [];
	const text = String(slide ?? '');
	const out: Hit[] = [];
	for (const s of modedSegments(text, opts)) {
		const part = text.slice(s.start, s.end);
		if (s.mode !== 'md') {
			for (const m of part.matchAll(re)) out.push({ field: s.field, start: s.start + m.index, end: s.start + m.index + m[0].length, replaceable: s.replaceable, mode: s.mode, span: !!s.span });
			continue;
		}
		const nl = text.indexOf('\n', s.end);
		const ls = text.lastIndexOf('\n', s.start - 1) + 1;
		const v = readerView(part, text.slice(s.end, nl < 0 ? text.length : nl), tableLines(text).has(ls));
		for (const m of v.text.matchAll(re)) {
			const ps = m.index;
			const pe = ps + m[0].length;
			if (pe === ps) continue;
			// A match that spans a formatting marker (`**Oct.** Tenth`) is found but left alone: replacing it
			// would drop or move the marker.
			const crosses = v.gap.slice(ps + 1, pe).some(Boolean);
			const start = s.start + v.src[ps] - (v.escaped[ps] ? 1 : 0);
			const end = s.start + v.end[pe - 1];
			out.push({ field: s.field, start, end, replaceable: !crosses, mode: crosses ? null : 'md', span: false, ...(crosses ? { reason: 'crosses formatting' } : {}) });
		}
	}
	return out;
}

/** Every match of a literal query in one slide, labeled by field. The query is what a reader sees: an
 *  escaped `\$` matches `$`, and formatting markers are skipped. */
export function findInSlide(slide: string, query: string, opts: FindOptions = {}): SlideMatch[] {
	return hits(slide, query, opts).map(({ field, start, end, replaceable, reason }) => ({ field, start, end, replaceable, ...(reason ? { reason } : {}) }));
}

/**
 * Replace every REPLACEABLE match in one slide, the traditional way: the reader's words change and the
 * formatting around them stays. In Markdown text the replacement is escaped (`escapeMarkdown`), so
 * `five` → `$5` writes `\$5`; in a code span, a spoken line or a note it is written as typed. Matches
 * that are not replaceable come back in `skipped`. What escaping cannot express is refused, and so is
 * any slide whose structure still moved (the backstop): `text` is then the slide unchanged and `blocked`
 * says why.
 */
export function replaceInSlide(slide: string, query: string, replacement: string, opts: FindOptions = {}): { text: string; replaced: SlideMatch[]; skipped: SlideMatch[]; blocked?: string } {
	const text = String(slide ?? '');
	const all = hits(text, query, opts);
	const strip = ({ field, start, end, replaceable, reason }: Hit): SlideMatch => ({ field, start, end, replaceable, ...(reason ? { reason } : {}) });
	const replaced = all.filter((m) => m.replaceable);
	const skipped = all.filter((m) => !m.replaceable).map(strip);
	if (!replaced.length) return { text, replaced: [], skipped };
	const refuse = (why: string) => ({ text, replaced: [], skipped: all.map(strip), blocked: why });
	if (replaced.some((m) => m.span && replacement.includes('`'))) return refuse('a backtick would end the code span the words are in');
	if (replaced.some((m) => m.mode === 'raw' && !m.span && /--/.test(replacement))) return refuse('`--` would end the comment that holds the spoken line or note');
	let out = text;
	for (const m of [...replaced].reverse()) {
		const lineStart = out.lastIndexOf('\n', m.start - 1) + 1;
		// A line start, or right after a list or quote marker: a `5.` or `#` there would open a new block.
		const atLineStart = /^\s*(?:(?:[-*+]|\d{1,9}[.)]|>)\s+)*$/.test(out.slice(lineStart, m.start));
		const written = m.mode === 'md' ? escapeMarkdown(replacement, out.slice(lineStart, m.start), out.slice(m.end), atLineStart) : replacement;
		out = out.slice(0, m.start) + written + out.slice(m.end);
	}
	// A code span the replacement turns into Lattice syntax (`npm x` → `^{bucket}` would draw an icon).
	const syntaxSpans = (t: string) => {
		const isDirective = directiveSpan(opts);
		return t.split('\n').flatMap((line) => codeSpans(line).filter(([a, z, n]) => isDirective(line.slice(a + n, z - n)))).length;
	};
	if (syntaxSpans(out) !== syntaxSpans(text)) return refuse('the new words would turn a code span into Lattice syntax (a pill, an icon…)');
	if (slideStructure(out) !== slideStructure(text)) {
		const ws = /^\s|\s$/.test(replacement) ? ' (leading or trailing spaces can start a code block or a line break)' : '';
		return refuse(`the new words would still change the slide’s structure${ws}`);
	}
	return { text: out, replaced: replaced.map(strip), skipped };
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
