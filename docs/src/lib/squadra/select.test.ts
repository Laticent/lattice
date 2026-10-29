import { describe, expect, it } from 'vitest';
import { matches, parents, parseSelector, SelectorError, select } from './select';
import type { Node } from './types';

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
const KINDS = ['a', 'b', 'c'];
function randTree(r: () => number, depth: number): Node {
	const kids: Node[] = [];
	if (depth > 0) for (let i = Math.floor(r() * 4); i > 0; i--) kids.push(randTree(r, depth - 1));
	return { kind: KINDS[Math.floor(r() * KINDS.length)], from: 0, to: 0, kids };
}
function randSelector(r: () => number): string {
	const n = 1 + Math.floor(r() * 3);
	let s = r() < 0.3 ? '> ' : '';
	for (let i = 0; i < n; i++) {
		if (i) s += r() < 0.5 ? ' > ' : ' ';
		s += r() < 0.15 ? '*' : KINDS[Math.floor(r() * KINDS.length)];
	}
	return s;
}

/** A reference matcher with no cleverness: enumerate every ancestor chain. */
function naiveMatches(path: readonly Node[], sel: string): boolean {
	// path: scope ... node (inclusive), node is last.
	const anchored = sel.trim().startsWith('>');
	const tokens = sel.replace(/^\s*>\s*/, '').trim().split(/\s+/);
	const steps: { kind: string; child: boolean }[] = [];
	let child = false;
	for (const t of tokens) {
		if (t === '>') {
			child = true;
			continue;
		}
		steps.push({ kind: t, child });
		child = false;
	}
	const fit = (n: Node, k: string) => k === '*' || n.kind === k;
	const rec = (pi: number, si: number): boolean => {
		if (!fit(path[pi], steps[si].kind)) return false;
		if (si === 0) return !anchored || pi === 1;
		if (steps[si].child) return pi - 1 >= 1 && rec(pi - 1, si - 1);
		for (let q = pi - 1; q >= 1; q--) if (rec(q, si - 1)) return true;
		return false;
	};
	return path.length >= 2 && rec(path.length - 1, steps.length - 1);
}

describe('selectors', () => {
	it('agrees with a naive reference matcher on random trees and selectors (300 seeds)', () => {
		for (let seed = 1; seed <= 300; seed++) {
			const r = rng(seed);
			const root = randTree(r, 4);
			const up = parents(root);
			const sel = randSelector(r);
			const list = parseSelector(sel);
			const walk = (n: Node, path: Node[]) => {
				for (const k of n.kids) {
					const p = [...path, k];
					expect(matches(k, list[0], root, up), `${sel} at depth ${p.length - 1} (seed ${seed})`).toBe(naiveMatches(p, sel));
					walk(k, p);
				}
			};
			walk(root, [root]);
		}
	});

	it('returns comma-list matches once each, in document order', () => {
		const tree: Node = { kind: 'doc', from: 0, to: 9, kids: [{ kind: 'list', from: 0, to: 4, kids: [{ kind: 'item', from: 1, to: 2, kids: [] }] }, { kind: 'item', from: 5, to: 6, kids: [] }] };
		const hits = select(tree, parseSelector('> item, > list > item, item'), parents(tree));
		expect(hits.map((n) => n.from)).toEqual([1, 5]);
	});

	it('reports a syntax error with its position', () => {
		for (const bad of ['a[x]', 'a >', '', 'a,,b', 'a:b']) {
			expect(() => parseSelector(bad), bad).toThrow(SelectorError);
		}
		expect(() => parseSelector('item > [x]')).toThrow(expect.objectContaining({ position: 7 }));
	});

	it('stays fast on a deep tree under a descendant chain (memoized)', () => {
		let node: Node = { kind: 'a', from: 0, to: 0, kids: [] };
		for (let i = 0; i < 1000; i++) node = { kind: i % 2 ? 'a' : 'b', from: 0, to: 0, kids: [node] };
		const root: Node = { kind: 'root', from: 0, to: 0, kids: [node] };
		let ticks = 0;
		const t0 = Date.now();
		select(root, parseSelector('a b a b a c'), parents(root), () => ticks++);
		expect(Date.now() - t0).toBeLessThan(2000);
		// Memoized across candidates: each (node, step) pair is decided once, so the work is linear
		// in nodes × steps. Before the shared memo this selector cost 42 million ops at this depth.
		expect(ticks).toBeLessThan(1002 * (6 + 1) * 2);
	});
});
