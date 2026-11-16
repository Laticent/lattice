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

import { COL_SHIFT, KIND, type RefRecord, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL } from './block.js';
import { type DeckModel, isCell, slideDetail, tokenAt } from './deck.js';
import { type InlineParser, type InlineTape, normalizeReference } from './inline.js';

/**
 * A leaf's text and where each part of it came from. `runs` holds RSTRIDE integers per run, in text order: the
 * run's first text offset, the body offset it maps to, and whether it is pinned (1: padding a partly consumed tab
 * expanded to, every character of which maps to the tab itself). A run extends to the next run's start.
 */
export interface LeafText {
	readonly text: string;
	readonly runs: Int32Array;
}

export const RSTRIDE = 3;

/** The body offset of a leaf-text offset (`text.length` maps to the end of the last run). */
export function leafToBody(leaf: LeafText, offset: number): number {
	const r = leaf.runs;
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
		return { text, runs: Int32Array.from(out) };
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

/** Where a line's content starts: the detail parse's column, or at the top level its first non-space character. */
function colAt(m: DeckModel, tape: Int32Array, tok: number, line: number, detail: boolean): number {
	const start = m.lineStart(line);
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
	if (cell) return cellText(m, new Builder(body), tape, at, dl, detail !== null);
	const l0 = tape[at + T_L0] + dl;
	const l1 = tape[at + T_L1] + dl;
	const open = at - STRIDE;
	if (parentKind === KIND.heading_open && tape[open + T_AUX] < 8) {
		// ATX: markdown-it's `asciiTrim(src.slice(pos, max))`, `pos` past the `#` run, `max` before a closing run.
		const pos = colAt(m, tape, open, l0, detail !== null) + tape[open + T_AUX];
		let max = m.lineEnd(l0);
		while (max > pos && isSpace(body.charCodeAt(max - 1))) max--;
		let tmp = max;
		while (tmp > pos && body.charCodeAt(tmp - 1) === 0x23) tmp--;
		if (tmp > pos && isSpace(body.charCodeAt(tmp - 1))) max = tmp;
		return slice(body, pos, Math.max(pos, max));
	}
	// A paragraph or setext heading: `asciiTrim(getLines(l0, l1, blkIndent, false))`.
	if (!detail) return slice(body, m.lineStart(l0), m.lineEnd(l1 - 1));
	const aux = tape[at + T_AUX];
	const meta = detail.leafLines.subarray(aux - 1, aux - 1 + (l1 - l0) * 2);
	// One line with no tab padding (most list items): a slice.
	if (l1 - l0 === 1 && meta[1] === 0) {
		const end = m.lineEnd(l0);
		return slice(body, Math.min(m.lineStart(l0) + meta[0], end), end);
	}
	const b = new Builder(body);
	for (let line = l0, k = 0; line < l1; line++, k += 2) {
		const start = m.lineStart(line);
		const end = m.lineEnd(line);
		const from = Math.min(start + meta[k], end);
		b.pad(meta[k + 1], from);
		b.piece(from, end);
		if (line + 1 < l1) b.piece(end, end + 1);
	}
	return asciiTrim(b);
}

/** `asciiTrim(body.slice(from, to))`, one run. */
function slice(body: string, from: number, to: number): LeafText {
	while (from < to && isAsciiTrimmable(body.charCodeAt(from))) from++;
	while (to > from && isAsciiTrimmable(body.charCodeAt(to - 1))) to--;
	return { text: body.slice(from, to), runs: Int32Array.of(0, from, 0) };
}

/** A table cell's text: markdown-it's `escapedSplit(getLine(row).trim())[column].trim()`. */
function cellText(m: DeckModel, b: Builder, tape: Int32Array, at: number, dl: number, detail: boolean): LeafText {
	const column = tape[at + T_AUX];
	// Each cell is open, inline, close; the row's `tr_open` is just before its first cell.
	const tr = at - STRIDE - column * 3 * STRIDE - STRIDE;
	const line = tape[tr + T_L0] + dl;
	const body = m.body;
	const lineFrom = colAt(m, tape, tr, line, detail);
	const lineTo = m.lineEnd(line);
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
	if (!cell) return { text: '', runs: Int32Array.of(0, lineTo, 0) };
	for (let k = 0; k < cell.length; k += 2) b.piece(base + cell[k], base + cell[k + 1]);
	if (b.runs.length === 0) return { text: '', runs: Int32Array.of(0, base + cell[0], 0) };
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
	for (let i = 0; i < m.segs.length; i++) {
		const g = m.segs[i];
		if (!g.refs) continue;
		const dl = m.segLine[i] - g.line0;
		for (const r of g.refs) list.push(readRef(m, r, dl));
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

/** Kept tapes, per parser and per segment, valid while the deck's reference keys are `keys`. */
type Kept = { keys: string; tapes: Map<number, { tape: InlineTape; leaf: LeafText; off: number }> };
const inlineMemo = new WeakMap<InlineParser, WeakMap<object, Kept>>();

/**
 * S2 over the leaf at `token` (a global tape index of an `inline` token): its text and its inline tape. Parsed on
 * first read, with the model's inline parser (`DeckModelOptions.inline`) unless one is passed.
 */
export function inlineOf(m: DeckModel, token: number, parser?: InlineParser): { tape: InlineTape; leaf: LeafText } {
	const p = parser ?? m.options.inline;
	if (!p) throw new Error('segno-markdown: the model has no inline parser (DeckModelOptions.inline)');
	const refs = referencesOf(m);
	const t = tokenAt(m, token);
	const seg = m.segs[t.seg];
	let byParser = inlineMemo.get(p);
	if (!byParser) inlineMemo.set(p, (byParser = new WeakMap()));
	let kept = byParser.get(seg);
	if (!kept || kept.keys !== refs.keys) byParser.set(seg, (kept = { keys: refs.keys, tapes: new Map() }));
	const hit = kept.tapes.get(t.local);
	const off = m.segOff[t.seg];
	// A kept tape is for the segment's text, which an update reuses only while it is unchanged; only its place in
	// the body can have moved, so the runs are shifted when it has.
	if (hit) {
		if (hit.off === off) return hit;
		const runs = hit.leaf.runs.slice();
		for (let k = 1; k < runs.length; k += RSTRIDE) runs[k] += off - hit.off;
		const moved = { tape: hit.tape, leaf: { text: hit.leaf.text, runs }, off };
		kept.tapes.set(t.local, moved);
		return moved;
	}
	const leaf = leafAt(m, token, t);
	const out = { tape: p.parse(leaf.text, refs.table), leaf, off };
	kept.tapes.set(t.local, out);
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
