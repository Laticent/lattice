import { describe, expect, it } from 'vitest';
import { apply, checkGroup, diff, EditError, editsConflict, mapOffset, plan } from './edits';
import type { Edit, EditGroup } from './types';

/** Seeded PRNG (mulberry32) so a failure reproduces. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const ALPHABET = 'ab\n-# é😀';
function randText(r: () => number, max = 40): string {
	let s = '';
	const n = Math.floor(r() * max);
	for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
	return s;
}
/** Random edits that conflict with nothing: disjoint ranges, at most one insertion per offset. */
function disjointGroups(r: () => number, text: string): EditGroup[] {
	const groups: EditGroup[] = [];
	let pos = 0;
	let n = 0;
	while (pos <= text.length && r() < 0.8) {
		const from = pos + Math.floor(r() * Math.min(6, text.length - pos + 1));
		const to = from + Math.floor(r() * Math.min(4, text.length - from + 1));
		groups.push({ id: `g${n++}`, edits: [{ from, to, text: randText(r, 5) }] });
		pos = to + 1;
	}
	return groups;
}
function shuffle<T>(r: () => number, xs: T[]): T[] {
	const out = [...xs];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
function naiveApply(text: string, edits: readonly Edit[]): string {
	// Right to left, so earlier offsets stay valid.
	let out = text;
	for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
	return out;
}

describe('the edit kernel', () => {
	it('gives the same result for non-overlapping edit sets in any order (500 seeds)', () => {
		for (let seed = 1; seed <= 500; seed++) {
			const r = rng(seed);
			const text = randText(r, 60);
			const groups = disjointGroups(r, text);
			const want = naiveApply(text, groups.flatMap((g) => g.edits));
			const p1 = plan(groups);
			const p2 = plan(shuffle(r, groups));
			expect(p1.rejected).toEqual([]);
			expect(apply(text, p1)).toBe(want);
			expect(apply(text, p2)).toBe(want);
		}
	});

	it('applies the edits of one group in array order when they share an offset', () => {
		const g = { id: 'a', edits: [{ from: 1, to: 1, text: 'X' }, { from: 1, to: 1, text: 'Y' }] };
		expect(apply('ab', plan([g]))).toBe('aXYb');
	});

	it('puts an insertion before a replacement that starts at the same offset', () => {
		const ins = { id: 'ins', edits: [{ from: 1, to: 1, text: '[' }] };
		const rep = { id: 'rep', edits: [{ from: 1, to: 2, text: 'B' }] };
		expect(editsConflict(ins.edits[0], rep.edits[0])).toBe(false);
		expect(apply('abc', plan([rep, ins]))).toBe('a[Bc');
	});

	it('never accepts an overlap (500 seeds of random, possibly overlapping groups)', () => {
		for (let seed = 1; seed <= 500; seed++) {
			const r = rng(seed * 7);
			const text = randText(r, 30);
			const groups: EditGroup[] = [];
			for (let i = 0; i < 6; i++) {
				const from = Math.floor(r() * (text.length + 1));
				const to = from + Math.floor(r() * (text.length - from + 1));
				groups.push({ id: `g${i}`, edits: [{ from, to, text: 'z' }] });
			}
			const p = plan(groups);
			const all = p.accepted.flatMap((g) => g.edits);
			for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(editsConflict(all[i], all[j])).toBe(false);
			expect(p.accepted.length + p.rejected.length).toBe(groups.length);
		}
	});

	it('rejects two insertions from different groups at one offset', () => {
		const p = plan([{ id: 'a', edits: [{ from: 0, to: 0, text: 'x' }] }, { id: 'b', edits: [{ from: 0, to: 0, text: 'y' }] }]);
		expect(p.rejected).toEqual([{ id: 'b', reason: 'conflict' }]);
	});

	it('is the identity on an empty plan', () => {
		expect(apply('anything', plan([]))).toBe('anything');
	});

	it('maps an unedited offset to the same character (500 seeds)', () => {
		for (let seed = 1; seed <= 500; seed++) {
			const r = rng(seed * 13);
			const text = randText(r, 60);
			const p = plan(disjointGroups(r, text));
			const out = apply(text, p);
			const edits = p.accepted.flatMap((g) => g.edits);
			for (let o = 0; o < text.length; o++) {
				if (edits.some((e) => e.from <= o && o < e.to)) continue;
				expect(out[mapOffset(p, o, 'after')]).toBe(text[o]);
			}
			expect(mapOffset(p, text.length, 'after')).toBe(out.length);
		}
	});

	it('maps an offset inside a replacement to its start or end by bias, and an insertion point by bias', () => {
		const p = plan([{ id: 'a', edits: [{ from: 2, to: 5, text: 'XY' }] }, { id: 'b', edits: [{ from: 7, to: 7, text: '++' }] }]);
		expect(mapOffset(p, 3, 'before')).toBe(2);
		expect(mapOffset(p, 3, 'after')).toBe(4);
		expect(mapOffset(p, 7, 'before')).toBe(6);
		expect(mapOffset(p, 7, 'after')).toBe(8);
	});

	it('refuses an edit outside the text, inverted, or overlapping inside its own group', () => {
		const code = (g: EditGroup) => {
			try {
				checkGroup(g, 3);
			} catch (e) {
				return (e as EditError).code;
			}
			return null;
		};
		expect(code({ id: 'a', edits: [{ from: 2, to: 9, text: '' }] })).toBe('out-of-range');
		expect(code({ id: 'a', edits: [{ from: 2, to: 1, text: '' }] })).toBe('inverted');
		expect(code({ id: 'a', edits: [{ from: 0, to: 2, text: '' }, { from: 1, to: 3, text: '' }] })).toBe('overlap-in-group');
		expect(code({ id: 'a', edits: [{ from: 0, to: 1, text: '' }, { from: 1, to: 2, text: '' }] })).toBe(null);
		expect(() => plan([{ id: 'a', edits: [{ from: 0, to: 9, text: '' }] }], { length: 3 })).toThrow(EditError);
	});
});

describe('diff', () => {
	it('prints a unified diff with three lines of context', () => {
		const a = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n';
		const b = 'one\ntwo\nthree\nFOUR\nfive\nsix\nseven\neight\n';
		expect(diff(a, b)).toBe('--- before\n+++ after\n@@ -1,7 +1,7 @@\n one\n two\n three\n-four\n+FOUR\n five\n six\n seven\n');
	});
	it('splits distant changes into hunks and numbers them from the right lines', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const b = [...lines];
		b[1] = 'X';
		b[17] = 'Y';
		const out = diff(`${lines.join('\n')}\n`, `${b.join('\n')}\n`, { context: 1 });
		expect(out).toContain('@@ -1,3 +1,3 @@\n l1\n-l2\n+X\n l3\n');
		expect(out).toContain('@@ -17,3 +17,3 @@\n l17\n-l18\n+Y\n l19\n');
	});
	it('numbers a pure insertion and a pure deletion as unified diff does', () => {
		expect(diff('a\nb\n', 'a\nx\nb\n', { context: 0 })).toBe('--- before\n+++ after\n@@ -1,0 +2 @@\n+x\n');
		expect(diff('a\nx\nb\n', 'a\nb\n', { context: 0 })).toBe('--- before\n+++ after\n@@ -2 +1,0 @@\n-x\n');
	});
	it('reads the end of the file as diff -u does: no phantom line, and a missing newline marked', () => {
		expect(diff('a\n', 'b\n')).toBe('--- before\n+++ after\n@@ -1 +1 @@\n-a\n+b\n');
		expect(diff('a', 'a\n')).toBe('--- before\n+++ after\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n');
	});
	it('is empty for equal texts', () => {
		expect(diff('same', 'same')).toBe('');
	});
});
