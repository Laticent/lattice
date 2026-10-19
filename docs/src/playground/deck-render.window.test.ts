// The Playground's filmstrip window must decide exactly as it did before it took its range
// arithmetic from Veduta: the same mount run (visible slides ±3), the same keep run (±5) and the
// same "no move needed" answer. This pins `mountPlan` against that old arithmetic, restated here
// from `virtual-window.js`, on seeded random inputs. A reviewer found four divergences by hand
// (a held-run rule applied to the slow path, a skipped top-up on a cache miss, an edge keep,
// and `mountAround`'s clamping), so the test keeps the equivalence from drifting back.
import { describe, expect, it } from 'vitest';
import { mountPlan } from './deck-render.js';
import { visibleRange, windowRange } from './virtual-window.js';

const RUNS = Number(process.env.WINDOW_RUNS || 20000);
const SEED = Number(process.env.WINDOW_SEED || 7);

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

const NEED = 1;
const MOUNT = 3;
const KEEP = 5;

function oldDecision(count: number, vp: { y: number; h: number; top: number; pitch: number }, held: { lo: number; hi: number } | null) {
	const vis = visibleRange(vp.y, vp.h, vp.top, vp.pitch, count);
	if (!vis) return null;
	const mount = windowRange(vis.first, vis.last, count, MOUNT);
	const keep = windowRange(vis.first, vis.last, count, KEEP);
	let settled: boolean | null = null;
	if (held) {
		const need = windowRange(vis.first, vis.last, count, NEED);
		const slack = windowRange(vis.first, vis.last, count, KEEP + MOUNT);
		settled = !!need && !!slack && need.lo >= held.lo && need.hi <= held.hi && held.lo >= slack.lo && held.hi <= slack.hi;
	}
	return { vis, mount, keep, settled };
}

function* inputs(runs: number, seed: number) {
	const r = rng(seed);
	for (let i = 0; i < runs; i++) {
		const count = 1 + Math.floor(r() * 300);
		const pitch = 20 + r() * 400;
		const top = Math.floor(r() * 120);
		const h = 100 + r() * 1400;
		const y = r() < 0.1 ? -r() * 200 : r() * (count * pitch + 300);
		const lo = Math.floor(r() * count);
		const hi = Math.min(count - 1, lo + Math.floor(r() * 30));
		yield { count, vp: { y, h, top, pitch }, held: r() < 0.7 ? { lo, hi } : null };
	}
}

describe('mountPlan matches the filmstrip arithmetic it replaced', () => {
	it('mount, keep and settled agree on random inputs', () => {
		let checked = 0;
		for (const { count, vp, held } of inputs(RUNS, SEED)) {
			const old = oldDecision(count, vp, held);
			if (!old) continue;
			const first = old.vis.first;
			const next = mountPlan(count, vp, first, held);
			expect(next.mount, JSON.stringify({ count, vp, held })).toEqual(old.mount);
			expect(next.keep, JSON.stringify({ count, vp, held })).toEqual(old.keep);
			expect(next.settled, JSON.stringify({ count, vp, held })).toBe(old.settled);
			checked++;
		}
		expect(checked).toBeGreaterThan(RUNS * 0.9);
	});

	it('failing arm: a different overscan is caught by the same comparison', () => {
		let differs = 0;
		for (const { count, vp, held } of inputs(2000, SEED + 1)) {
			const old = oldDecision(count, vp, held);
			if (!old) continue;
			const wrong = windowRange(old.vis.first, old.vis.last, count, MOUNT + 1);
			if (JSON.stringify(wrong) !== JSON.stringify(mountPlan(count, vp, old.vis.first, held).mount)) differs++;
		}
		expect(differs).toBeGreaterThan(0);
	});
});
