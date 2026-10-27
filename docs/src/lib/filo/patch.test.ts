import { describe, expect, it } from 'vitest';
import { applyPatch, type Edit, hashText, invertPatch, mapPos, patchOf, patchSize, trimPatch } from './patch';

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
function randEdits(r: () => number, text: string): Edit[] {
	const edits: Edit[] = [];
	let pos = 0;
	const count = 1 + Math.floor(r() * 3);
	for (let i = 0; i < count && pos <= text.length; i++) {
		const from = pos + Math.floor(r() * (text.length - pos + 1));
		const to = from + Math.floor(r() * (text.length - from + 1) * 0.5);
		edits.push({ from, to, insert: randText(r, 6) });
		pos = to + 1;
	}
	return edits;
}

describe('patch algebra (property tests, seeded)', () => {
	it('apply then invert is the identity', () => {
		const r = rng(1);
		for (let i = 0; i < 5000; i++) {
			const text = randText(r);
			const p = patchOf(text, randEdits(r, text));
			const after = applyPatch(text, p);
			expect(applyPatch(after, invertPatch(p))).toBe(text);
			expect(invertPatch(invertPatch(p))).toEqual(p);
		}
	});

	it('trimPatch turns a into b, and is the narrowest single change', () => {
		const r = rng(2);
		for (let i = 0; i < 5000; i++) {
			const a = randText(r);
			const b = r() < 0.3 ? a : applyPatch(a, patchOf(a, randEdits(r, a)));
			const p = trimPatch(a, b);
			expect(applyPatch(a, p)).toBe(b);
			if (a === b) expect(p).toEqual([]);
			else {
				expect(p).toHaveLength(1);
				const [c] = p;
				expect(a[c.from] === undefined || b[c.from] === undefined || a[c.from] !== b[c.from] || c.to === c.from || c.insert === '').toBe(true);
			}
		}
	});

	it('mapPos keeps order and lands inside the result', () => {
		const r = rng(3);
		for (let i = 0; i < 3000; i++) {
			const text = randText(r);
			const p = patchOf(text, randEdits(r, text));
			const len = applyPatch(text, p).length;
			let prev = -1;
			for (let pos = 0; pos <= text.length; pos++) {
				const m = mapPos(p, pos, -1);
				expect(m).toBeGreaterThanOrEqual(prev);
				expect(m).toBeLessThanOrEqual(len);
				prev = m;
			}
		}
	});

	it('mapPos maps text outside a change to the same text', () => {
		const text = 'hello world';
		const p = patchOf(text, [{ from: 0, to: 5, insert: 'goodbye' }]);
		expect(mapPos(p, 6)).toBe(8); // the "w"
		expect(applyPatch(text, p)[mapPos(p, 6)]).toBe('w');
		const ins = patchOf(text, [{ from: 5, to: 5, insert: '!!' }]);
		expect(mapPos(ins, 5, -1)).toBe(5);
		expect(mapPos(ins, 5, 1)).toBe(7);
	});

	it('patchOf refuses malformed edits and drops empty ones', () => {
		expect(() => patchOf('abc', [{ from: 2, to: 1, insert: '' }])).toThrow(RangeError);
		expect(() => patchOf('abc', [{ from: 0, to: 9, insert: '' }])).toThrow(RangeError);
		expect(() => patchOf('abc', [{ from: 2, to: 3, insert: 'x' }, { from: 0, to: 1, insert: 'y' }])).toThrow(RangeError);
		expect(patchOf('abc', [{ from: 1, to: 1, insert: '' }])).toEqual([]);
	});

	it('patchSize counts inserted and deleted text', () => {
		const p = patchOf('abcdef', [{ from: 1, to: 3, insert: 'XYZ' }]);
		expect(patchSize(p)).toBe(2 + 3 + 16);
	});

	it('hashText separates near texts and is stable', () => {
		expect(hashText('abc')).toBe(hashText('abc'));
		expect(hashText('abc')).not.toBe(hashText('abd'));
		expect(Number.isSafeInteger(hashText('x'.repeat(10_000)))).toBe(true);
	});
});

describe('composePatch', () => {
	it('equals applying both, for random pairs of patches (seeded)', async () => {
		const { composePatch } = await import('./patch');
		const r = rng(4);
		for (let i = 0; i < 8000; i++) {
			const b = randText(r);
			const p1 = patchOf(b, r() < 0.8 ? randEdits(r, b).slice(0, 1) : randEdits(r, b));
			const m = applyPatch(b, p1);
			const p2 = patchOf(m, r() < 0.8 ? randEdits(r, m).slice(0, 1) : randEdits(r, m));
			const a = applyPatch(m, p2);
			const c = composePatch(p1, p2, m, a);
			expect(applyPatch(b, c)).toBe(a);
			expect(applyPatch(a, invertPatch(c))).toBe(b);
		}
	});
});
