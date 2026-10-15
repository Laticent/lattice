// THE OUTLINE — what Fuoco needs to know about a document, and nothing about what kind it is.
//
// A document is text cut into UNITS (a slide, a chapter, a function, a cue in a transcript), and
// each unit into one or more PARTS (a slide's heading sections, a chapter's paragraphs). Units
// carry stable ids that survive edits; parts are addressed by their ordinal inside a unit. A
// FLAT number counts parts across the whole document, which is what a reader counts: page 7 of
// the PDF, paragraph 12, cue 31.
//
// An OUTLINER turns text into an outline and keeps it current as the text changes. Fuoco ships
// one for plain text (./text-outline.ts: split by a pattern, a function or Markdown headings);
// a host with its own parser writes its own (Lattice's slide outliner re-parses only the region
// an edit touched — docs/src/lib/deck-outline). The hub (./hub.ts) speaks only this interface.
//
// Every lookup here is pure, allocation-free where it can be, and O(log n) or better.

export type UnitId = number;

/** One unit of the document. Offsets are absolute in `Outline.source`. */
export interface Unit {
	readonly id: UnitId;
	/** Where the unit begins: everything from here to `end` belongs to it. */
	readonly from: number;
	/** Where its content begins (past leading blank space): what a reveal frames. */
	readonly start: number;
	readonly end: number;
	/** Where each part begins, RELATIVE to `from`. One entry, `start - from`, when unsplit. */
	readonly parts: readonly number[];
}

/** Part `part` of unit `unit` (an index into `Outline.units`). */
export interface PartRef {
	readonly unit: number;
	readonly part: number;
}

export interface Outline {
	/** Bumped on every change of text; the same text keeps its revision. */
	readonly rev: number;
	readonly source: string;
	readonly units: readonly Unit[];
	/** `partBase[i]` = parts before unit `i`; the last entry is the total. */
	readonly partBase: readonly number[];
}

/** The editor's own account of a change: one span, in both texts. */
export interface EditSpan {
	/** Where the change starts (the same offset in both texts). */
	from: number;
	/** Where it ends in the old text. */
	toA: number;
	/** Where it ends in the new text. */
	toB: number;
}

/** Turns text into an outline, and keeps it current. `update` returns `prev` itself when the
 *  text is unchanged, so `===` on outlines means "same text". */
export interface Outliner<O extends Outline = Outline> {
	update(prev: O | null, text: string, opts?: { span?: EditSpan }): O;
}

// ── Identity ──────────────────────────────────────────────────────────────────

let revCounter = 1;
let idCounter = 1;
/** A fresh revision number, unique across every outliner in the page. */
export function nextRevision(): number {
	return revCounter++;
}
/** A fresh unit id, unique across every outliner in the page. */
export function nextUnitId(): UnitId {
	return idCounter++;
}

/** `partBase` for a list of units. */
export function partBaseOf(units: readonly Unit[]): number[] {
	const base = new Array<number>(units.length + 1);
	let n = 0;
	for (let i = 0; i < units.length; i++) {
		base[i] = n;
		n += units[i].parts.length;
	}
	base[units.length] = n;
	return base;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

/** The unit containing `offset`: the last unit whose `from` is at or before it, clamped to 0 (an
 *  offset before the first unit names unit 0). -1 only for an outline with no units. */
export function unitAt(o: Outline, offset: number): number {
	const { units } = o;
	if (!units.length) return -1;
	let lo = 0;
	let hi = units.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (units[mid].from <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** The part containing `offset`. */
export function partAt(o: Outline, offset: number): PartRef | null {
	const u = unitAt(o, offset);
	if (u < 0) return null;
	const unit = o.units[u];
	const rel = offset - unit.from;
	let k = 0;
	for (let i = 1; i < unit.parts.length; i++) if (unit.parts[i] <= rel) k = i;
	return { unit: u, part: k };
}

/** Where a reveal of part `k` of unit `u` should frame (absolute offset). */
export function partStart(o: Outline, u: number, k = 0): number {
	const unit = o.units[u];
	if (!unit) return 0;
	if (k <= 0) return unit.start;
	return unit.from + unit.parts[Math.min(k, unit.parts.length - 1)];
}

/** Where part `k` of unit `u` ends (absolute offset). */
export function partEnd(o: Outline, u: number, k = 0): number {
	const unit = o.units[u];
	if (!unit) return 0;
	return k + 1 < unit.parts.length ? unit.from + unit.parts[k + 1] : unit.end;
}

/** The trimmed text of unit `u`. */
export function unitText(o: Outline, u: number): string {
	const unit = o.units[u];
	return unit ? o.source.slice(unit.from, unit.end).trim() : '';
}

/** The trimmed text of part `k` of unit `u`. */
export function partText(o: Outline, u: number, k = 0): string {
	const unit = o.units[u];
	if (!unit) return '';
	const a = k <= 0 ? unit.from : unit.from + unit.parts[k];
	return o.source.slice(a, partEnd(o, u, k)).trim();
}

/** The unit index holding `id`, or -1. */
export function unitIndexOf(o: Outline, id: UnitId): number {
	for (let i = 0; i < o.units.length; i++) if (o.units[i].id === id) return i;
	return -1;
}

/** The flat part number (0-based) of part `k` of unit `u`. */
export function flatPart(o: Outline, u: number, k = 0): number {
	return (o.partBase[u] ?? 0) + Math.max(0, Math.min(k, (o.units[u]?.parts.length ?? 1) - 1));
}

/** The inverse of `flatPart`. */
export function partOfFlat(o: Outline, n: number): PartRef | null {
	const { partBase, units } = o;
	if (!units.length) return null;
	const total = partBase[units.length];
	const at = Math.max(0, Math.min(n, total - 1));
	let lo = 0;
	let hi = units.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (partBase[mid] <= at) lo = mid;
		else hi = mid - 1;
	}
	return { unit: lo, part: at - partBase[lo] };
}

/** How many parts the whole outline holds. */
export function partCount(o: Outline): number {
	return o.partBase[o.units.length] ?? 0;
}

// ── Change spans ──────────────────────────────────────────────────────────────

/** The one changed span between two strings: common prefix, then common suffix. Compares in
 *  blocks with native substring equality and finishes character by character inside the first
 *  block that differs, so a keystroke in a 500 KB document costs a few block compares. */
export function diffSpan(a: string, b: string): EditSpan {
	const BLOCK = 512;
	const max = Math.min(a.length, b.length);
	let p = 0;
	while (p + BLOCK <= max && a.slice(p, p + BLOCK) === b.slice(p, p + BLOCK)) p += BLOCK;
	while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
	const maxS = max - p;
	let s = 0;
	while (s + BLOCK <= maxS && a.slice(a.length - s - BLOCK, a.length - s) === b.slice(b.length - s - BLOCK, b.length - s)) s += BLOCK;
	while (s < maxS && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
	return { from: p, toA: a.length - s, toB: b.length - s };
}

/** `span` if it describes the change from `a` to `b` (everything outside it equal), else null.
 *  A span is the caller's claim; it is checked, never trusted. Substring equality is native,
 *  measured about 30x faster than a character loop on a 60 KB document. */
export function spanHolds(a: string, b: string, span: EditSpan): EditSpan | null {
	const { from, toA, toB } = span;
	if (from < 0 || toA < from || toB < from || toA > a.length || toB > b.length) return null;
	if (a.length - toA !== b.length - toB) return null;
	if (a.slice(0, from) !== b.slice(0, from) || a.slice(toA) !== b.slice(toB)) return null;
	return span;
}

/** Map an offset in the old text through `span` to the new one. Inside a deleted range it lands
 *  at the edit's end. */
export function mapOffset(o: number, span: EditSpan): number {
	if (o <= span.from) return o;
	if (o >= span.toA) return o + (span.toB - span.toA);
	return span.toB;
}

/** Ids for the units of a new outline, carried from `prev` through `span`: a unit outside the
 *  edit keeps its id; inside it, units are matched from both ends by position, and a region
 *  that kept its unit count keeps every id in order. Duplicating a unit gives the copy a new id;
 *  splitting one keeps the first half's id. Shared by every outliner so ids mean the same thing
 *  whatever produced them. */
export function carryIds(prev: Outline | null, next: readonly { from: number }[], nextLength: number, span: EditSpan | null): UnitId[] {
	const ids = new Array<UnitId>(next.length);
	if (!prev || !span) {
		for (let i = 0; i < next.length; i++) ids[i] = nextUnitId();
		return ids;
	}
	const used = new Set<UnitId>();
	const take = (i: number, id: UnitId) => {
		if (used.has(id)) return;
		ids[i] = id;
		used.add(id);
	};
	// Outside the edit: an unchanged start offset, shifted.
	const before = new Map<number, UnitId>();
	for (const u of prev.units) if (u.from < span.from || u.from > span.toA || (u.from === span.from && span.toA === span.from)) before.set(mapOffset(u.from, span), u.id);
	for (let i = 0; i < next.length; i++) {
		const id = before.get(next[i].from);
		if (id !== undefined) take(i, id);
	}
	// Inside: by position from both ends, among the units that are still unassigned.
	const oldInside = prev.units.filter((u) => !used.has(u.id));
	const newInside: number[] = [];
	for (let i = 0; i < next.length; i++) if (ids[i] === undefined) newInside.push(i);
	if (oldInside.length === newInside.length) {
		for (let k = 0; k < newInside.length; k++) take(newInside[k], oldInside[k].id);
	} else {
		let f = 0;
		while (f < newInside.length && f < oldInside.length && next[newInside[f]].from === oldInside[f].from) take(newInside[f], oldInside[f++].id);
		let k = 1;
		while (newInside.length - k >= f && oldInside.length - k >= f && nextLength - next[newInside[newInside.length - k]].from === prev.source.length - oldInside[oldInside.length - k].from) {
			take(newInside[newInside.length - k], oldInside[oldInside.length - k].id);
			k++;
		}
	}
	for (let i = 0; i < next.length; i++) if (ids[i] === undefined) ids[i] = nextUnitId();
	return ids;
}
