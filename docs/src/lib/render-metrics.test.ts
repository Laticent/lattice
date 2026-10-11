// Per-regime EMA smoothing — the metrics-honesty fix (perf-diagnosis §C1). A rare
// full-rebuild sample (~485ms) must NOT poison the warm typing number (~2ms): the two
// regimes smooth in separate buckets, so after a rebuild the next patch reads the true
// patch value, not a blend.

import { beforeEach, describe, expect, it } from 'vitest';
import { onRenderSample, type RenderSample, recordRenderSample } from './render-metrics';

const base = (over: Partial<RenderSample>): RenderSample => ({
	engineMs: 10, sanitizeMs: 3, frameMs: 2, fitMs: 1, totalMs: 15, slides: 1, srcBytes: 100, ...over,
});

describe('recordRenderSample per-regime smoothing', () => {
	let off: () => void;
	// Smoothing only runs when a consumer is subscribed (else it stores the raw sample).
	beforeEach(() => {
		off?.();
		off = onRenderSample(() => {});
	});

	it('a rebuild sample does not poison the following patch frameMs', () => {
		// Seed the patch regime low, then a single expensive rebuild, then patches again.
		recordRenderSample(base({ frameMs: 2, writePath: 'patch' }));
		recordRenderSample(base({ frameMs: 485, writePath: 'write' }));
		recordRenderSample(base({ frameMs: 2, writePath: 'patch' }));
		const last = recordRenderSample(base({ frameMs: 2, writePath: 'patch' }));
		// The patch bucket never saw the 485ms write, so it stays near 2 — not a blend
		// pulled up toward the hundreds. (With one shared EMA it would be ~100+.)
		expect(last.frameMs).toBeLessThan(10);
	});

	it('exposes the tooling hook on window (frame-bench reads raw samples through it)', () => {
		const hook = (window as unknown as { __latticeRenderMetrics?: { latest: unknown; on: unknown } }).__latticeRenderMetrics;
		expect(typeof hook?.latest).toBe('function');
		expect(typeof hook?.on).toBe('function');
	});

	it('the two regimes hold independent smoothed values at the same time', () => {
		// Converge each bucket (the module EMA persists across tests by design), then
		// read one sample of each: the patch stays small, the write stays large — one
		// metric, two truthful numbers, never a blend of the two.
		let p!: RenderSample;
		let w!: RenderSample;
		for (let i = 0; i < 12; i++) p = recordRenderSample(base({ frameMs: 2, totalMs: 15, writePath: 'patch' }));
		for (let i = 0; i < 12; i++) w = recordRenderSample(base({ frameMs: 485, totalMs: 500, writePath: 'write' }));
		expect(p.frameMs).toBeLessThan(10);
		expect(w.frameMs).toBeGreaterThan(400);
		expect(w.totalMs).toBeGreaterThan(400);
	});
});
