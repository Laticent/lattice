/**
 * S2 on the deck model: each leaf's text as markdown-it builds its `inline` token's `content`, the deck's link
 * reference definitions, and the inline tape of any leaf, parsed on first read and kept with the slide it sits in.
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md §The design (S2) and §P4 landed.
 *
 * ONE COORDINATE SYSTEM. A leaf's text is not always a slice of the body: inside a quote or a list item markdown-it
 * drops each line's prefix, a table cell drops the `\` of an escaped pipe, and a tab partly inside an indent becomes
 * spaces. `LeafText.runs` maps every offset of the text back to the body, so an inline token's range names the
 * characters an author typed, wherever its leaf sits.
 *
 * INCREMENTAL. A leaf's tape is kept on its slide's segment, which an update reuses by reference when the edit is
 * elsewhere; the kept tapes are dropped when the deck's reference labels change, since a reference link anywhere
 * reads every definition.
 */

import { type BlockTape, COL_SHIFT, KIND, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL } from './block.js';
import { type DeckModel, type DeckModelOptions, deckModel, isCell, tokenAt } from './deck.js';
import { type Detail, detailRecorder, type RefRecord } from './detail.js';
import { type InlineParser, type InlineTape, normalizeReference } from './inline.js';

/**
 * One slide's share of a DETAIL parse (detail.ts): its tokens exactly as the model holds them, with what an inline
 * reader needs recorded as well. Token `j` of the slide is the parse's token `t0 + j`, and the parse's line `L` is the
 * slide's current line `L - line0 + segLine`.
 */
export interface SlideDetail {
	readonly parse: BlockTape;
	readonly t0: number;
	readonly line0: number;
}

const details = new WeakMap<object, SlideDetail>();

/**
 * A slide's detail, kept with its segment, so an update re-reads only the slides it re-parsed. A slide starts just after
 * a top-level break, where every container is closed, so its text parsed alone has the same tokens. When most of the
 * deck has no detail yet (a first whole-deck read), the whole body is parsed once and shared out instead: one parse of
 * the deck costs about a third of one parse per slide, whose fixed cost (the plugin rules' facades, the copies out) is
 * paid per call.
 */
export function slideDetail(m: DeckModel, seg: number): SlideDetail {
	const g = m.segs[seg];
	const hit = details.get(g);
	if (hit) return hit;
	let missing = 0;
	for (const s of m.segs) if (!details.has(s)) missing++;
	if (missing * 2 > m.segs.length) {
		const whole = m.options.parser.parse(m.body, 0, detailRecorder);
		if (whole.length !== m.segTok[m.segs.length]) throw new Error(`segno-markdown: the detail parse has ${whole.length} tokens, the model ${m.segTok[m.segs.length]}`);
		share(m, whole);
		return details.get(g) as SlideDetail;
	}
	const from = m.segOff[seg];
	const to = seg + 1 < m.segs.length ? m.segOff[seg + 1] : m.body.length;
	const parse = m.options.parser.parse(m.body.slice(from, to), 0, detailRecorder);
	if (parse.length !== g.length) throw new Error(`segno-markdown: slide ${seg}'s detail parse has ${parse.length} tokens, the model ${g.length}`);
	const out = { parse, t0: 0, line0: 0 };
	details.set(g, out);
	return out;
}

/** Give each slide that has none its share of a whole-body detail parse. */
function share(m: DeckModel, whole: BlockTape): void {
	for (let i = 0; i < m.segs.length; i++) if (!details.has(m.segs[i])) details.set(m.segs[i], { parse: whole, t0: m.segTok[i], line0: m.segLine[i] });
}

/**
 * A deck model whose first parse is already a detail parse, for a reader that will read every leaf (the token adapter):
 * the same model `deckModel` builds, with no second parse to come.
 */
export function detailedModel(source: string, options: DeckModelOptions): DeckModel {
	const m = deckModel(source, { ...options, detail: detailRecorder });
	share(m, m.blocks);
	return m;
}

/**
 * A leaf's text and where each part of it came from. Most leaves are one slice of the body: `runs` is null and text
 * offset `i` is body offset `start + i`. Otherwise `runs` holds RSTRIDE integers per run, in text order: the run's
 * first text offset, the body offset it maps to, and whether it is pinned (1: padding a partly consumed tab expanded
 * to, every character of which maps to the tab itself). A run extends to the next run's start.
 */
export interface LeafText {
	readonly text: string;
	/** Where the text starts in the body. */
	readonly start: number;
	readonly runs: Int32Array | null;
}

export const RSTRIDE = 3;

/** The body offset of a leaf-text offset (`text.length` maps to the end of the last run). */
export function leafToBody(leaf: LeafText, offset: number): number {
	const r = leaf.runs;
	if (r === null) return leaf.start + offset;
	let lo = 0;
	let hi = r.length / RSTRIDE - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (r[mid * RSTRIDE] <= offset) lo = mid;
		else hi = mid - 1;
	}
	const at = lo * RSTRIDE;
	return r[at + 2] ? r[at + 1] : r[at + 1] + offset - r[at];
}

/** Text built from body pieces, then trimmed, with its runs kept in step. */
class Builder {
	text = '';
	runs: number[] = [];
	constructor(readonly body: string) {}
	piece(from: number, to: number): void {
		if (to <= from) return;
		this.runs.push(this.text.length, from, 0);
		this.text += this.body.slice(from, to);
	}
	pad(n: number, at: number): void {
		if (n <= 0) return;
		this.runs.push(this.text.length, at, 1);
		this.text += ' '.repeat(n);
	}
	/** Keep `[from, to)` of the text. */
	keep(from: number, to: number): LeafText {
		const text = this.text.slice(from, to);
		const out: number[] = [];
		const r = this.runs;
		for (let k = 0; k < r.length; k += RSTRIDE) {
			const start = r[k];
			const end = k + RSTRIDE < r.length ? r[k + RSTRIDE] : this.text.length;
			if (end <= from || start >= to) continue;
			const s = Math.max(start, from);
			out.push(s - from, r[k + 2] ? r[k + 1] : r[k + 1] + s - start, r[k + 2]);
		}
		if (out.length === 0) out.push(0, this.runs.length ? this.runs[1] : 0, 0);
		// One unpinned run that starts the text is a plain slice.
		if (out.length === RSTRIDE && out[0] === 0 && out[2] === 0) return { text, start: out[1], runs: null };
		return { text, start: out[1], runs: Int32Array.from(out) };
	}
}

const isAsciiTrimmable = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

/** markdown-it's `asciiTrim`, as the kept range. */
function asciiTrim(b: Builder): LeafText {
	const s = b.text;
	let start = 0;
	while (start < s.length && isAsciiTrimmable(s.charCodeAt(start))) start++;
	let end = s.length - 1;
	while (end >= start && isAsciiTrimmable(s.charCodeAt(end))) end--;
	return b.keep(start, end + 1);
}

/** JavaScript's `String.prototype.trim`, as the kept range. */
function jsTrim(b: Builder, from: number, to: number): LeafText {
	const s = b.text.slice(from, to);
	const lead = s.length - s.trimStart().length;
	const trail = s.length - s.trimEnd().length;
	return lead === s.length ? b.keep(from, from) : b.keep(from + lead, to - trail);
}

const isSpace = (c: number) => c === 0x09 || c === 0x20;

/**
 * The text of the `inline` token at `token` (a global tape index): markdown-it's `token.content`, and where each
 * part of it sits in the body.
 */
export function leafText(m: DeckModel, token: number): LeafText {
	return leafAt(m, token, tokenAt(m, token));
}

/**
 * `m.lineStart(line)` and `m.lineEnd(line)` for a line of slide `seg`, read straight off its segment (no search for the
 * segment, which a leaf already knows).
 */
function ls(m: DeckModel, seg: number, line: number): number {
	const g = m.segs[seg];
	return g.bm[g.b0 + line - m.segLine[seg]] - g.off0 + m.segOff[seg];
}
function le(m: DeckModel, seg: number, line: number): number {
	const g = m.segs[seg];
	return g.em[g.b0 + line - m.segLine[seg]] - g.off0 + m.segOff[seg];
}

/** Where a line's content starts: the detail parse's column, or at the top level its first non-space character. */
function colAt(m: DeckModel, seg: number, tape: Int32Array, tok: number, line: number, detail: boolean): number {
	const start = ls(m, seg, line);
	if (detail) return start + (tape[tok + T_FLAGS] >> COL_SHIFT);
	let pos = start;
	while (isSpace(m.body.charCodeAt(pos))) pos++;
	return pos;
}

function leafAt(m: DeckModel, token: number, t: ReturnType<typeof tokenAt>): LeafText {
	if (t.tape[t.at + T_KIND] !== KIND.inline) throw new Error(`segno-markdown: token ${token} is not an inline token`);
	const parentKind = t.tape[t.at - STRIDE + T_KIND];
	const cell = isCell(parentKind);
	// A leaf inside a quote or list item needs what only the slide's detail parse records (where each line's text starts
	// past the container's prefix). Any other leaf is read off the lean tape: at the top level a line's content starts at
	// its first character that is not a space or a tab, which is all a column would say.
	const nested = t.tape[t.at + T_LEVEL] > (cell ? 4 : 1);
	const sd = nested ? slideDetail(m, t.seg) : null;
	const detail = sd ? sd.parse : null;
	const tape = detail ? detail.tape : t.tape;
	const at = sd ? (sd.t0 + t.local) * STRIDE : t.at;
	const dl = sd ? m.segLine[t.seg] - sd.line0 : t.dl;
	const body = m.body;
	if (cell) return cellText(m, t.seg, new Builder(body), tape, at, dl, detail !== null);
	const l0 = tape[at + T_L0] + dl;
	const l1 = tape[at + T_L1] + dl;
	const open = at - STRIDE;
	if (parentKind === KIND.heading_open && tape[open + T_AUX] < 8) {
		// ATX: markdown-it's `asciiTrim(src.slice(pos, max))`, `pos` past the `#` run, `max` before a closing run.
		const pos = colAt(m, t.seg, tape, open, l0, detail !== null) + tape[open + T_AUX];
		let max = le(m, t.seg, l0);
		while (max > pos && isSpace(body.charCodeAt(max - 1))) max--;
		let tmp = max;
		while (tmp > pos && body.charCodeAt(tmp - 1) === 0x23) tmp--;
		if (tmp > pos && isSpace(body.charCodeAt(tmp - 1))) max = tmp;
		return slice(body, pos, Math.max(pos, max));
	}
	// A paragraph or setext heading: `asciiTrim(getLines(l0, l1, blkIndent, false))`.
	if (!detail) return slice(body, ls(m, t.seg, l0), le(m, t.seg, l1 - 1));
	const aux = tape[at + T_AUX];
	const meta = (detail.detail as Detail).leafLines;
	const mo = aux - 1;
	// One line with no tab padding (most list items): a slice.
	if (l1 - l0 === 1 && meta[mo + 1] === 0) {
		const end = le(m, t.seg, l0);
		return slice(body, Math.min(ls(m, t.seg, l0) + meta[mo], end), end);
	}
	const b = new Builder(body);
	for (let line = l0, k = 0; line < l1; line++, k += 2) {
		const start = ls(m, t.seg, line);
		const end = le(m, t.seg, line);
		const from = Math.min(start + meta[mo + k], end);
		b.pad(meta[mo + k + 1], from);
		b.piece(from, end);
		if (line + 1 < l1) b.piece(end, end + 1);
	}
	return asciiTrim(b);
}

/** `asciiTrim(body.slice(from, to))`, one run. */
function slice(body: string, from: number, to: number): LeafText {
	while (from < to && isAsciiTrimmable(body.charCodeAt(from))) from++;
	while (to > from && isAsciiTrimmable(body.charCodeAt(to - 1))) to--;
	return { text: body.slice(from, to), start: from, runs: null };
}

/** A table cell's text: markdown-it's `escapedSplit(getLine(row).trim())[column].trim()`. */
function cellText(m: DeckModel, seg: number, b: Builder, tape: Int32Array, at: number, dl: number, detail: boolean): LeafText {
	const column = tape[at + T_AUX];
	// Each cell is open, inline, close; the row's `tr_open` is just before its first cell.
	const tr = at - STRIDE - column * 3 * STRIDE - STRIDE;
	const line = tape[tr + T_L0] + dl;
	const body = m.body;
	const lineFrom = colAt(m, seg, tape, tr, line, detail);
	const lineTo = le(m, seg, line);
	const raw = body.slice(lineFrom, lineTo);
	const lead = raw.length - raw.trimStart().length;
	const str = raw.trim();
	const base = lineFrom + lead;
	// escapedSplit, keeping each column's pieces: an escaped pipe drops its backslash.
	const columns: number[][] = [];
	let current: number[] = [];
	let isEscaped = false;
	let lastPos = 0;
	for (let pos = 0; pos < str.length; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 0x7c) {
			if (!isEscaped) {
				current.push(lastPos, pos);
				columns.push(current);
				current = [];
				lastPos = pos + 1;
			} else {
				current.push(lastPos, pos - 1);
				lastPos = pos;
			}
		}
		isEscaped = ch === 0x5c;
	}
	current.push(lastPos, str.length);
	columns.push(current);
	const empty = (c: number[]) => {
		for (let k = 0; k < c.length; k += 2) if (c[k + 1] > c[k]) return false;
		return true;
	};
	if (columns.length && empty(columns[0])) columns.shift();
	if (columns.length && empty(columns[columns.length - 1])) columns.pop();
	const cell = columns[column];
	if (!cell) return { text: '', start: lineTo, runs: null };
	for (let k = 0; k < cell.length; k += 2) b.piece(base + cell[k], base + cell[k + 1]);
	if (b.runs.length === 0) return { text: '', start: base + cell[0], runs: null };
	return jsTrim(b, 0, b.text.length);
}

/** A link reference definition, read. */
export interface Reference {
	/** The label as markdown-it keys it (`normalizeReference`). */
	readonly key: string;
	/** The destination as written (inside `<>` when bracketed), before markdown-it unescapes and normalizes it. */
	readonly dest: string;
	/** The title's text as written (inside its quotes), or null for none. */
	readonly title: string | null;
	/** The body line the definition starts on. */
	readonly line: number;
}

/** The deck's link reference definitions, and the table a reference link looks its label up in. */
export interface References {
	/** Every definition, in source order. */
	readonly list: readonly Reference[];
	/** Each label's FIRST definition, by key (markdown-it keeps the first): its index in `list`. Null when none. */
	readonly table: ReadonlyMap<string, number> | null;
	/** Every definition's key in order: two models whose keys agree resolve every reference link the same way. */
	readonly keys: string;
}

const referenceMemo = new WeakMap<DeckModel, References>();

function piecesText(m: DeckModel, a: Int32Array): string {
	let out = '';
	for (let k = 0; k < a.length; k += 3) {
		const start = m.lineStart(a[k]);
		out += m.body.slice(start + a[k + 1], start + a[k + 2]);
	}
	return out;
}

/** The deck's link reference definitions (markdown-it's `env.references`, with the source spelling kept). */
export function referencesOf(m: DeckModel): References {
	const hit = referenceMemo.get(m);
	if (hit) return hit;
	const list: Reference[] = [];
	const table = new Map<string, number>();
	// The definitions are a detail parse's record (detail.ts): each slide's, from its detail.
	for (let i = 0; i < m.segs.length; i++) {
		const sd = slideDetail(m, i);
		const refs = (sd.parse.detail as Detail).refs;
		if (!refs.length) continue;
		const g = m.segs[i];
		const last = i === m.segs.length - 1;
		for (const r of refs) if (r.line >= sd.line0 && (last || r.line < sd.line0 + g.lines)) list.push(readRef(m, r, m.segLine[i] - sd.line0));
	}
	for (let i = 0; i < list.length; i++) if (!table.has(list[i].key)) table.set(list[i].key, i);
	const out: References = { list, table: list.length ? table : null, keys: list.map((r) => r.key).join('\u0000') };
	referenceMemo.set(m, out);
	return out;
}

function readRef(m: DeckModel, r: RefRecord, dl: number): Reference {
	const shift = (a: Int32Array) => {
		if (dl === 0) return a;
		const out = a.slice();
		for (let k = 0; k < out.length; k += 3) out[k] += dl;
		return out;
	};
	return {
		key: normalizeReference(piecesText(m, shift(r.label))),
		dest: piecesText(m, shift(r.dest)),
		title: r.title.length ? piecesText(m, shift(r.title)) : null,
		line: r.line + dl,
	};
}

/** Kept tapes, per parser and per segment (by the leaf's index in it), valid while the deck's reference keys are `keys`. */
type Kept = { keys: string; tapes: ({ tape: InlineTape; leaf: LeafText; off: number } | undefined)[] };
const inlineMemo = new WeakMap<InlineParser, WeakMap<object, Kept>>();

/**
 * S2 over the leaf at `token` (a global tape index of an `inline` token): its text and its inline tape. Parsed on
 * first read, with the model's inline parser (`DeckModelOptions.inline`) unless one is passed.
 */
export function inlineOf(m: DeckModel, token: number, parser?: InlineParser): InlineLeaf {
	const p = parser ?? m.options.inline;
	if (!p) throw new Error('segno-markdown: the model has no inline parser (DeckModelOptions.inline)');
	const t = tokenAt(m, token);
	const refs = referencesOf(m);
	return leafOf(m, p, refs, keptFor(m, p, t.seg, refs.keys), t);
}

/** A leaf's inline parse: its tape and its text. */
export interface InlineLeaf {
	readonly tape: InlineTape;
	readonly leaf: LeafText;
}

type KeptLeaf = InlineLeaf & { readonly off: number };

function keptFor(m: DeckModel, p: InlineParser, seg: number, keys: string): Kept {
	const g = m.segs[seg];
	let byParser = inlineMemo.get(p);
	if (!byParser) inlineMemo.set(p, (byParser = new WeakMap()));
	let kept = byParser.get(g);
	if (!kept || kept.keys !== keys) byParser.set(g, (kept = { keys, tapes: [] }));
	return kept;
}

function leafOf(m: DeckModel, p: InlineParser, refs: References, kept: Kept, t: ReturnType<typeof tokenAt>): KeptLeaf {
	const hit = kept.tapes[t.local];
	const off = m.segOff[t.seg];
	// A kept tape is for the segment's text, which an update reuses only while it is unchanged; only its place in
	// the body can have moved, so the leaf's map is shifted when it has.
	if (hit) {
		if (hit.off === off) return hit;
		const d = off - hit.off;
		let runs: Int32Array | null = null;
		if (hit.leaf.runs) {
			runs = hit.leaf.runs.slice();
			for (let k = 1; k < runs.length; k += RSTRIDE) runs[k] += d;
		}
		const moved = { tape: hit.tape, leaf: { text: hit.leaf.text, start: hit.leaf.start + d, runs }, off };
		kept.tapes[t.local] = moved;
		return moved;
	}
	const leaf = leafAt(m, m.segTok[t.seg] + t.local, t);
	const out = { tape: p.parse(leaf.text, refs.table), leaf, off };
	kept.tapes[t.local] = out;
	return out;
}

/**
 * S2 over every leaf of one slide, in tape order: what a reader of a whole slide (the token adapter, an editor after a
 * keystroke in it) asks for. The same parses `inlineOf` gives, looked up once per slide instead of once per leaf.
 */
export function inlineSlide(m: DeckModel, slide: number, parser?: InlineParser): InlineLeaf[] {
	const p = parser ?? m.options.inline;
	if (!p) throw new Error('segno-markdown: the model has no inline parser (DeckModelOptions.inline)');
	const refs = referencesOf(m);
	const kept = keptFor(m, p, slide, refs.keys);
	const g = m.segs[slide];
	const out: InlineLeaf[] = [];
	const t = { seg: slide, tape: g.tape, at: 0, dl: m.segLine[slide] - g.line0, local: 0 };
	for (let j = 0; j < g.length; j++) {
		const at = (g.t0 + j) * STRIDE;
		if (g.tape[at + T_KIND] !== KIND.inline) continue;
		t.at = at;
		t.local = j;
		out.push(leafOf(m, p, refs, kept, t));
	}
	return out;
}

/**
 * The `inline` tokens (global tape indices) of one slide, read off its segment: what an editor re-reads after a
 * keystroke in that slide, without joining the deck's tape (`model.blocks`) that an incremental model builds on demand.
 */
export function slideLeaves(m: DeckModel, slide: number): number[] {
	const g = m.segs[slide];
	const out: number[] = [];
	for (let j = 0; j < g.length; j++) if (g.tape[(g.t0 + j) * STRIDE + T_KIND] === KIND.inline) out.push(m.segTok[slide] + j);
	return out;
}
