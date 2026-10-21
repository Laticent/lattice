// PLACES — where an offset sits, in the words a reader and an editor both use.
//
// An outline speaks in absolute character offsets. An editor also speaks in LINES and columns, and
// a reader in "slide 7, page 2". `placeAt` answers all three for one offset, and `rangeOf` gives a
// unit's or part's extent as offsets AND lines, so a view that highlights or frames a section
// does not re-derive the line table itself.
//
// Lines are split on `\n` only: an outline's source is already LF-normalized at the boundary
// (engineering/decisions/2026-08-04-line-endings-lf-boundaries.md). Line numbers are 1-based and
// columns 0-based, the way CodeMirror and most editors count.
//
// The line table is built lazily, once per outline (an outline is an immutable snapshot, so the
// table never goes stale), and a lookup is a binary search. An outline nobody asks about a line in
// never pays for one.

import type { Focus, FocusHub } from './hub.js';
import { flatPart, type Kinds, type Outline, partAt, partEnd, partStart } from './outline.js';

const tables = new WeakMap<Outline, readonly number[]>();

/** Offsets where each line begins, ascending; `[0]` is always 0. */
function lineStarts(o: Outline): readonly number[] {
	let t = tables.get(o);
	if (t) return t;
	const out = [0];
	const src = o.source;
	for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) out.push(i + 1);
	t = out;
	tables.set(o, t);
	return t;
}

/** How many lines the source has (an empty source has one). */
export function lineCount(o: Outline): number {
	return lineStarts(o).length;
}

/** The line (1-based) and column (0-based) of `offset`, clamped into the source. */
export function lineAt(o: Outline, offset: number): { line: number; col: number } {
	const starts = lineStarts(o);
	const at = Math.max(0, Math.min(offset, o.source.length));
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= at) lo = mid;
		else hi = mid - 1;
	}
	return { line: lo + 1, col: at - starts[lo] };
}

/** The offset of (`line`, `col`): the line clamped into the source, the column into the line. */
export function offsetAt(o: Outline, line: number, col = 0): number {
	const starts = lineStarts(o);
	const i = Math.max(0, Math.min(line - 1, starts.length - 1));
	const end = i + 1 < starts.length ? starts[i + 1] - 1 : o.source.length;
	return Math.min(starts[i] + Math.max(0, col), end);
}

/** Where a line ends (the offset of its `\n`, or the end of the source). */
export function lineEnd(o: Outline, line: number): number {
	const starts = lineStarts(o);
	const i = Math.max(0, Math.min(line - 1, starts.length - 1));
	return i + 1 < starts.length ? starts[i + 1] - 1 : o.source.length;
}

/** An offset in every unit a view might want. */
export interface Place {
	readonly offset: number;
	readonly line: number;
	readonly col: number;
	/** Index into `Outline.units`, and the part inside it. */
	readonly unit: number;
	readonly part: number;
	/** The part's position across the whole document, 0-based. */
	readonly flat: number;
	/** The host's words for the two levels. */
	readonly kinds: Kinds;
}

const DEFAULT_KINDS: Kinds = { unit: 'unit', part: 'part' };

/** The place `offset` is: line, column, unit, part and flat number. Null for an outline with no units. */
export function placeAt(o: Outline, offset: number): Place | null {
	const p = partAt(o, offset);
	if (!p) return null;
	const at = Math.max(0, Math.min(offset, o.source.length));
	const { line, col } = lineAt(o, at);
	return { offset: at, line, col, unit: p.unit, part: p.part, flat: flatPart(o, p.unit, p.part), kinds: o.kinds ?? DEFAULT_KINDS };
}

/** A section's extent, in offsets and in lines (both ends inclusive for lines). */
export interface Extent {
	readonly from: number;
	readonly to: number;
	readonly fromLine: number;
	/** The last line the section has text on: a section that ends where the next line begins ends on the line before. */
	readonly toLine: number;
}

/** Offsets `[from, to)` to an extent. `toLine` is the line holding the last character, never the next line's start. */
export function extentOf(o: Outline, from: number, to: number): Extent {
	const a = Math.max(0, Math.min(from, o.source.length));
	const b = Math.max(a, Math.min(to, o.source.length));
	return { from: a, to: b, fromLine: lineAt(o, a).line, toLine: lineAt(o, Math.max(a, b - 1)).line };
}

/** The extent of part `k` of unit `u`: from where the part begins to where the next begins. Null when `u` is not a unit. */
export function rangeOf(o: Outline, u: number, k = 0): Extent | null {
	const unit = o.units[u];
	if (!unit) return null;
	const from = k <= 0 ? unit.from : partStart(o, u, k);
	return extentOf(o, from, partEnd(o, u, k));
}

/** Where the hub's focus is, as line, column, unit, part and the host's section words: the caret when a view
 *  with offsets reported one, else the start of the focused part. Null for an empty document. A function and
 *  not a hub method, so a host that never asks for lines (the Studio) does not carry the line table. */
export function focusPlace(hub: Pick<FocusHub, 'get' | 'outline'>): Place | null {
	const ol = hub.outline();
	const f: Focus = hub.get();
	return ol && f.unitIndex >= 0 ? placeAt(ol, f.head ?? partStart(ol, f.unitIndex, f.part)) : null;
}
