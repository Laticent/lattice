// Text patches: the record Filo keeps for every change.
//
// A patch is a list of changes, sorted and non-overlapping, each in offsets of the text
// BEFORE the patch. Every change stores the text it deleted, so a patch can be inverted with
// no copy of the document. One change is the common case; several come from an editor with
// more than one selection.

/** One change: replace `[from, to)` with `insert`. `deleted` is the text that was there. */
export interface Change {
	readonly from: number;
	readonly to: number;
	readonly insert: string;
	readonly deleted: string;
}

export type Patch = readonly Change[];

/** The plain shape an editor hands over: a range and its replacement, no deleted text. */
export interface Edit {
	readonly from: number;
	readonly to: number;
	readonly insert: string;
}

/** Build a patch from edits against `text`, recording what each one deletes. Throws on edits
 *  that are out of range, unsorted or overlapping: a malformed patch must not reach history. */
export function patchOf(text: string, edits: readonly Edit[]): Patch {
	const out: Change[] = [];
	let last = 0;
	for (const e of edits) {
		if (!(e.from >= last && e.to >= e.from && e.to <= text.length)) throw new RangeError(`filo: edit ${e.from}-${e.to} is out of order or out of range (text length ${text.length})`);
		if (e.from === e.to && e.insert === '') continue;
		out.push({ from: e.from, to: e.to, insert: e.insert, deleted: text.slice(e.from, e.to) });
		last = e.to;
	}
	return out;
}

/** Apply a patch to the text it was made against. */
export function applyPatch(text: string, patch: Patch): string {
	if (patch.length === 0) return text;
	let out = '';
	let pos = 0;
	for (const c of patch) {
		out += text.slice(pos, c.from) + c.insert;
		pos = c.to;
	}
	return out + text.slice(pos);
}

/** The patch that undoes `patch`, in offsets of the text `patch` produces. */
export function invertPatch(patch: Patch): Patch {
	const out: Change[] = [];
	let shift = 0;
	for (const c of patch) {
		const from = c.from + shift;
		out.push({ from, to: from + c.insert.length, insert: c.deleted, deleted: c.insert });
		shift += c.insert.length - (c.to - c.from);
	}
	return out;
}

/** The narrowest single change turning `a` into `b`: one linear scan from each end. */
export function trimPatch(a: string, b: string): Patch {
	if (a === b) return [];
	const min = Math.min(a.length, b.length);
	let p = 0;
	while (p < min && a.charCodeAt(p) === b.charCodeAt(p)) p++;
	let q = 0;
	while (q < min - p && a.charCodeAt(a.length - 1 - q) === b.charCodeAt(b.length - 1 - q)) q++;
	return [{ from: p, to: a.length - q, insert: b.slice(p, b.length - q), deleted: a.slice(p, a.length - q) }];
}

/**
 * Compose two patches into one: `first` turns text B into M, `second` turns M into A, and the
 * result turns B into A. For the common case (each one change) the result is computed from
 * offsets alone, with no copy of the text; otherwise it falls back to rebuilding B and trimming.
 * `mid` is M and `after` is A.
 */
export function composePatch(first: Patch, second: Patch, mid: string, after: string): Patch {
	if (first.length === 0) return second;
	if (second.length === 0) return first;
	if (first.length === 1 && second.length === 1) {
		const p = first[0];
		const e = second[0];
		const pEnd = p.from + p.insert.length; // p's insert, in M
		const m1 = Math.min(p.from, e.from);
		const m2 = Math.max(pEnd, e.to);
		const dp = p.insert.length - (p.to - p.from);
		const de = e.insert.length - (e.to - e.from);
		// The region [m1, m2) of M holds all of p's insert, so it maps back to B exactly.
		const deleted = mid.slice(m1, p.from) + p.deleted + mid.slice(pEnd, m2);
		const insert = after.slice(m1, m2 + de);
		return insert === deleted ? [] : [{ from: m1, to: m2 - dp, insert, deleted }];
	}
	return trimPatch(applyPatch(mid, invertPatch(first)), after);
}

/** Map an offset in the text before `patch` to the text after it. `assoc` < 0 keeps a position
 *  at an insertion point before the inserted text; > 0 puts it after. */
export function mapPos(patch: Patch, pos: number, assoc: -1 | 1 = -1): number {
	let shift = 0;
	for (const c of patch) {
		if (pos < c.from) break;
		const replaced = c.to > c.from;
		if (!replaced && pos === c.from) return assoc < 0 ? pos + shift : pos + shift + c.insert.length;
		// Inside the replaced range: the position lands at the start (or end) of the insert.
		if (replaced && pos < c.to) return c.from + shift + (assoc < 0 ? 0 : c.insert.length);
		shift += c.insert.length - (c.to - c.from);
	}
	return pos + shift;
}

/** Characters a patch holds (its inserted and deleted text): what the byte caps count. */
export function patchSize(patch: Patch): number {
	let n = 0;
	for (const c of patch) n += c.insert.length + c.deleted.length + 16;
	return n;
}

/** A fast 53-bit string hash (cyrb53), synchronous, for checking that a stored history still
 *  matches its text. Not cryptographic: it detects that a text changed, not a forgery. */
export function hashText(s: string, seed = 0): number {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 2654435761);
		h2 = Math.imul(h2 ^ c, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
