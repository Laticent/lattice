// The edit kernel (design §7.6): plan a set of atomic edit groups, apply them in one pass, map an
// old offset to its new position, and print a unified diff. It knows nothing about rules, so it can
// move to an entry point of its own if a use outside linting appears.

import type { Edit, EditGroup, Plan } from './types.js';

export class EditError extends Error {
	readonly code: 'out-of-range' | 'inverted' | 'overlap-in-group';
	constructor(code: EditError['code'], message: string) {
		super(message);
		this.name = 'EditError';
		this.code = code;
	}
}

/** Two edits conflict when their ranges overlap, or when both insert at the same offset. An
 *  insertion at X and a replacement of [X, Y) do not: the insertion goes first. */
export function editsConflict(a: Edit, b: Edit): boolean {
	if (a.from === a.to && b.from === b.to) return a.from === b.from;
	return a.from < b.to && b.from < a.to;
}

/** Throws unless every edit lies inside `[0, length]` with `from <= to`, and no two edits in the
 *  group overlap. Two edits in one group may share an offset: insertions there apply in array
 *  order, and before a replacement that starts there, whatever the array order. */
export function checkGroup(group: EditGroup, length: number): void {
	for (const e of group.edits) {
		if (!(Number.isInteger(e.from) && Number.isInteger(e.to))) throw new EditError('out-of-range', `squadra: edit in ${group.id} has a non-integer offset`);
		if (e.from > e.to) throw new EditError('inverted', `squadra: edit ${e.from}-${e.to} in ${group.id} ends before it starts`);
		if (e.from < 0 || e.to > length) throw new EditError('out-of-range', `squadra: edit ${e.from}-${e.to} in ${group.id} is outside the text (length ${length})`);
	}
	const sorted = [...group.edits].sort((a, b) => a.from - b.from || a.to - b.to);
	for (let i = 1; i < sorted.length; i++) {
		const p = sorted[i - 1];
		const c = sorted[i];
		if (p.from < c.to && c.from < p.to) throw new EditError('overlap-in-group', `squadra: two edits in ${group.id} overlap (${p.from}-${p.to}, ${c.from}-${c.to})`);
	}
}

/** Accept groups in order (or in `opts.order`), each only if none of its edits conflicts with an
 *  edit already accepted. A rejected group is named with reason `conflict`. */
export function plan(groups: readonly EditGroup[], opts: { order?: (a: EditGroup, b: EditGroup) => number; length?: number } = {}): Plan {
	const queue = opts.order ? [...groups].sort(opts.order) : groups;
	const accepted: EditGroup[] = [];
	const rejected: { id: string; reason: string }[] = [];
	const taken: Edit[] = [];
	for (const g of queue) {
		if (opts.length !== undefined) checkGroup(g, opts.length);
		if (g.edits.some((e) => taken.some((t) => editsConflict(e, t)))) {
			rejected.push({ id: g.id, reason: 'conflict' });
			continue;
		}
		accepted.push(g);
		taken.push(...g.edits);
	}
	return { accepted, rejected };
}

interface Placed extends Edit {
	readonly g: number;
	readonly i: number;
}

/** Every accepted edit in application order: by offset, an insertion before a replacement that
 *  starts at the same offset, then by group order, then by position in the group. */
function placed(p: Plan): Placed[] {
	const out: Placed[] = [];
	p.accepted.forEach((g, gi) => {
		g.edits.forEach((e, i) => {
			out.push({ from: e.from, to: e.to, text: e.text, g: gi, i });
		});
	});
	return out.sort((a, b) => a.from - b.from || Number(a.to !== a.from) - Number(b.to !== b.from) || a.g - b.g || a.i - b.i);
}

/** Build the new text in one left-to-right pass: O(text length + edits). */
export function apply(text: string, p: Plan): string {
	const edits = placed(p);
	if (edits.length === 0) return text;
	let out = '';
	let pos = 0;
	for (const e of edits) {
		if (e.from < pos) throw new EditError('overlap-in-group', `squadra: edit ${e.from}-${e.to} overlaps an earlier edit; plan() would have rejected it`);
		out += text.slice(pos, e.from) + e.text;
		pos = e.to;
	}
	return out + text.slice(pos);
}

/** Where `offset` in the old text lands in the new one. An offset strictly inside a replaced
 *  range maps to the start of its replacement (`before`) or the end (`after`). At an insertion
 *  point, `before` stays in front of the inserted text and `after` moves past it. */
export function mapOffset(p: Plan, offset: number, bias: 'before' | 'after' = 'after'): number {
	let shift = 0;
	for (const e of placed(p)) {
		if (e.to < offset || (e.to === offset && e.from < e.to)) {
			shift += e.text.length - (e.to - e.from);
			continue;
		}
		if (e.from === offset && e.from === e.to) {
			if (bias === 'after') shift += e.text.length;
			continue;
		}
		if (e.from < offset && offset < e.to) return e.from + shift + (bias === 'after' ? e.text.length : 0);
		break;
	}
	return offset + shift;
}

/** A unified diff of two texts, by line, as `diff -u` prints it: a last line with no newline is
 *  marked `\ No newline at end of file`. Common head and tail are trimmed first, so a fix that
 *  touches a few lines of a long deck costs a few lines of work. */
export function diff(before: string, after: string, opts: { context?: number; from?: string; to?: string } = {}): string {
	if (before === after) return '';
	const ctx = opts.context ?? 3;
	// Each line keeps its terminator, so "a" and "a\n" are different lines, as they are to patch.
	const a = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const b = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	const ops = lineOps(a.slice(head, a.length - tail), b.slice(head, b.length - tail));
	const all: { op: ' ' | '-' | '+'; line: string }[] = [
		...a.slice(0, head).map((line) => ({ op: ' ' as const, line })),
		...ops,
		...a.slice(a.length - tail).map((line) => ({ op: ' ' as const, line })),
	];
	// Number every line, then cut hunks around the changed ones: two changes closer than
	// `2 * ctx` unchanged lines share a hunk.
	let an = 1;
	let bn = 1;
	const rows = all.map((o) => {
		const r = { ...o, an, bn };
		if (o.op !== '+') an++;
		if (o.op !== '-') bn++;
		return r;
	});
	const changed = rows.flatMap((r, i) => (r.op === ' ' ? [] : [i]));
	const out: string[] = [`--- ${opts.from ?? 'before'}`, `+++ ${opts.to ?? 'after'}`];
	const count = (n: number) => (n === 1 ? '' : `,${n}`);
	let k = 0;
	while (k < changed.length) {
		const first = changed[k];
		let last = first;
		while (k + 1 < changed.length && changed[k + 1] - last <= 2 * ctx + 1) last = changed[++k];
		const s = Math.max(0, first - ctx);
		const e = Math.min(rows.length - 1, last + ctx);
		const hunk = rows.slice(s, e + 1);
		const aCount = hunk.filter((r) => r.op !== '+').length;
		const bCount = hunk.filter((r) => r.op !== '-').length;
		const aStart = aCount === 0 ? hunk[0].an - 1 : hunk[0].an;
		const bStart = bCount === 0 ? hunk[0].bn - 1 : hunk[0].bn;
		out.push(`@@ -${aStart}${count(aCount)} +${bStart}${count(bCount)} @@`);
		for (const r of hunk) out.push(r.line.endsWith('\n') ? `${r.op}${r.line.slice(0, -1)}` : `${r.op}${r.line}\n\\ No newline at end of file`);
		k++;
	}
	return `${out.join('\n')}\n`;
}

// The longest common subsequence of two line lists, as ops. The middle a fix leaves after the
// common head and tail is small; past a size cap the whole middle is one replacement, which is
// still a correct diff, only not a minimal one.
const LCS_CAP = 4_000_000;
function lineOps(a: readonly string[], b: readonly string[]): { op: ' ' | '-' | '+'; line: string }[] {
	if (a.length * b.length > LCS_CAP) return [...a.map((line) => ({ op: '-' as const, line })), ...b.map((line) => ({ op: '+' as const, line }))];
	const w = b.length + 1;
	const t = new Uint32Array((a.length + 1) * w);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
		}
	}
	const out: { op: ' ' | '-' | '+'; line: string }[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ op: ' ', line: a[i] });
			i++;
			j++;
		} else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) out.push({ op: '-', line: a[i++] });
		else out.push({ op: '+', line: b[j++] });
	}
	while (i < a.length) out.push({ op: '-', line: a[i++] });
	while (j < b.length) out.push({ op: '+', line: b[j++] });
	return out;
}
