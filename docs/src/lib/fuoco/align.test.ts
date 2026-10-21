import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anchorsOf, centeredAt, createScrollMap, maxScroll, sectionAt, type ViewLayout } from './align';

/** A view of `n` sections of the given heights, laid end to end after `lead` and followed by `tail`. */
function view(heights: number[], viewport: number, lead = 0, tail = 0): ViewLayout {
	const tops: number[] = [];
	const bottoms: number[] = [];
	let y = lead;
	for (const h of heights) {
		tops.push(y);
		y += h;
		bottoms.push(y);
	}
	return { tops, bottoms, viewport, content: y + tail };
}

// An editor (small sections) and a preview (large ones), the real shape of the Playground.
const editor = view([260, 220, 300, 240, 260, 280, 220, 250], 700, 90, 600);
const preview = view([400, 400, 400, 400, 400, 400, 400, 400], 760, 18, 18);

describe('the three rules are one rule', () => {
	const map = createScrollMap(editor, preview);
	it('the first section is aligned at the top, the last at the bottom', () => {
		expect(map.toB(0)).toBe(0);
		expect(map.toB(maxScroll(editor))).toBe(maxScroll(preview));
		expect(map.toA(0)).toBe(0);
		expect(map.toA(maxScroll(preview))).toBe(maxScroll(editor));
	});
	it('the section a pane is on is the one centered in it, in both panes', () => {
		for (let i = 1; i < 7; i++) {
			const a = centeredAt(editor, i);
			if (a <= 0 || a >= maxScroll(editor)) continue;
			expect(sectionAt(editor, a)).toBe(i);
			expect(sectionAt(preview, map.toB(a))).toBe(i);
		}
	});
	it('a middle section centered in one is centered in the other', () => {
		for (const i of [2, 3]) {
			const a = centeredAt(editor, i);
			const b = centeredAt(preview, i);
			expect(a).toBeGreaterThan(0);
			expect(a).toBeLessThan(maxScroll(editor));
			expect(map.toB(a)).toBeCloseTo(b, 6);
			expect(map.toA(b)).toBeCloseTo(a, 6);
		}
	});
});

describe('properties', () => {
	const layouts = fc
		.tuple(fc.integer({ min: 1, max: 14 }), fc.integer({ min: 300, max: 1200 }), fc.integer({ min: 300, max: 1200 }))
		.chain(([n, va, vb]) =>
			fc.tuple(
				fc.array(fc.integer({ min: 40, max: 700 }), { minLength: n, maxLength: n }),
				fc.array(fc.integer({ min: 40, max: 700 }), { minLength: n, maxLength: n }),
				fc.constant(va),
				fc.constant(vb),
				fc.integer({ min: 0, max: 300 }),
				fc.integer({ min: 0, max: 900 }),
			),
		)
		.map(([ha, hb, va, vb, lead, tail]) => ({ a: view(ha, va, lead, tail), b: view(hb, vb, 18, 18) }));

	it('is monotone and exact at both ends, in both directions', () => {
		fc.assert(
			fc.property(layouts, ({ a, b }) => {
				const map = createScrollMap(a, b);
				const maxA = maxScroll(a);
				expect(map.toB(0)).toBe(0);
				if (maxA > 0 && maxScroll(b) > 0) {
					expect(map.toB(maxA)).toBeCloseTo(maxScroll(b), 6);
					expect(map.toA(maxScroll(b))).toBeCloseTo(maxA, 6);
				}
				let prev = -1;
				for (let k = 0; k <= 40; k++) {
					const to = map.toB((k / 40) * maxA);
					expect(to).toBeGreaterThanOrEqual(prev - 1e-9);
					expect(to).toBeGreaterThanOrEqual(0);
					expect(to).toBeLessThanOrEqual(maxScroll(b) + 1e-9);
					prev = to;
				}
			}),
			{ numRuns: 400 },
		);
	});

	it('the anchors rise in A and never fall in B', () => {
		fc.assert(
			fc.property(layouts, ({ a, b }) => {
				const pts = anchorsOf(a, b);
				for (let k = 1; k < pts.length; k++) {
					expect(pts[k][0]).toBeGreaterThan(pts[k - 1][0] - 1e-9);
					expect(pts[k][1]).toBeGreaterThanOrEqual(pts[k - 1][1] - 1e-9);
				}
			}),
			{ numRuns: 400 },
		);
	});

	it('a round trip lands where it started, wherever the map is not flat', () => {
		fc.assert(
			fc.property(layouts, fc.double({ min: 0, max: 1, noNaN: true }), ({ a, b }, t) => {
				const map = createScrollMap(a, b);
				const x = t * maxScroll(a);
				const back = map.toA(map.toB(x));
				const pts = anchorsOf(a, b);
				const flat = pts.some((p, k) => k > 0 && p[1] === pts[k - 1][1] && x > pts[k - 1][0] && x <= p[0]);
				if (!flat) expect(back).toBeCloseTo(x, 4);
			}),
			{ numRuns: 400 },
		);
	});

	it('the section a view is on is the first at the top, the last at the end, never out of range', () => {
		fc.assert(
			fc.property(layouts, ({ a }) => {
				const n = a.tops.length;
				expect(sectionAt(a, 0)).toBe(0);
				if (maxScroll(a) > 0) expect(sectionAt(a, maxScroll(a))).toBe(n - 1);
				let prev = 0;
				for (let k = 0; k <= 30; k++) {
					const s = sectionAt(a, (k / 30) * maxScroll(a));
					expect(s).toBeGreaterThanOrEqual(prev);
					expect(s).toBeLessThan(n);
					prev = s;
				}
			}),
			{ numRuns: 300 },
		);
	});
});

describe('edges', () => {
	it('a view that does not scroll maps everything to the top', () => {
		const still = view([200], 900);
		const map = createScrollMap(still, preview);
		expect(map.toB(0)).toBe(0);
		expect(map.toB(50)).toBe(0);
		expect(createScrollMap(preview, still).toB(500)).toBe(0);
	});
	it('no sections is no section', () => {
		expect(sectionAt({ tops: [], bottoms: [], viewport: 500, content: 500 }, 0)).toBe(-1);
	});
	it('sections that all clamp to the top leave the first its place', () => {
		const a = view([100, 100, 100, 100, 100, 100], 900, 0, 600);
		const b = view([400, 400, 400, 400, 400, 400], 900, 0, 0);
		const pts = anchorsOf(a, b);
		expect(pts[0]).toEqual([0, 0]);
		expect(pts.filter((p) => p[0] === 0).length).toBe(1);
	});
});
