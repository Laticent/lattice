import { describe, expect, it } from 'vitest';
import { computePreviewRect } from './preview-rect';

// Parity fixtures — the preview box rect MEASURED from the live hydrated app (docs build,
// 2026-07-21) across the breakpoint × stop matrix. computePreviewRect must reproduce each to
// within 1px; a drift here means the app's chrome constants moved and preview-rect.ts (the
// shared source of truth used by the pre-hydration shell) is now stale. Update both together.
const FIXTURES = [
	{ name: 'desktop read', i: { vw: 1440, vh: 900, breakpoint: 'desktop', chromeless: true, ratio: [16, 9] }, box: { x: 47.1, y: 74, w: 1345.8, h: 757 } },
	{ name: 'desktop write', i: { vw: 1440, vh: 900, breakpoint: 'desktop', chromeless: false, previewFrac: 777.1 / 1440, ratio: [16, 9] }, box: { x: 682.9, y: 252.4, w: 737.1, h: 414.6 } },
	{ name: 'tablet read', i: { vw: 900, vh: 1200, breakpoint: 'tablet', chromeless: true, ratio: [16, 9] }, box: { x: 20, y: 360.6, w: 860, h: 483.8 } },
	{ name: 'tablet write', i: { vw: 900, vh: 1200, breakpoint: 'tablet', chromeless: false, previewFrac: 485.5 / 900, ratio: [16, 9] }, box: { x: 434.5, y: 484.4, w: 445.5, h: 250.6 } },
	{ name: 'mobile read', i: { vw: 390, vh: 844, breakpoint: 'mobile', chromeless: true, ratio: [16, 9] }, box: { x: 16, y: 350.3, w: 358, h: 201.4 } },
	{ name: 'mobile write', i: { vw: 390, vh: 844, breakpoint: 'mobile', chromeless: false, ratio: [16, 9] }, box: { x: 16, y: 357.5, w: 358, h: 201.4 } },
] as const;

describe('computePreviewRect — parity with the measured app layout', () => {
	for (const f of FIXTURES) {
		it(`${f.name} matches within 1px`, () => {
			const r = computePreviewRect({ ...f.i, ratio: [f.i.ratio[0], f.i.ratio[1]] });
			expect(Math.abs(r.x - f.box.x)).toBeLessThanOrEqual(1);
			expect(Math.abs(r.y - f.box.y)).toBeLessThanOrEqual(1);
			expect(Math.abs(r.w - f.box.w)).toBeLessThanOrEqual(1);
			expect(Math.abs(r.h - f.box.h)).toBeLessThanOrEqual(1);
		});
	}

	it('honors the deck aspect (square binds on height in a wide viewport)', () => {
		const r = computePreviewRect({ vw: 1024, vh: 900, breakpoint: 'desktop', chromeless: true, ratio: [1, 1] });
		expect(Math.abs(r.w - r.h)).toBeLessThan(0.01); // square
		expect(r.w).toBeLessThan(1024); // bound by height, letterboxed horizontally
	});

	it('lifts the 760 cap at the chromeless (read) stop but applies it in the split', () => {
		const read = computePreviewRect({ vw: 3000, vh: 1200, breakpoint: 'desktop', chromeless: true, ratio: [16, 9] });
		const write = computePreviewRect({ vw: 3000, vh: 1200, breakpoint: 'desktop', chromeless: false, previewFrac: 0.9, ratio: [16, 9] });
		expect(read.w).toBeGreaterThan(760);
		expect(write.w).toBeLessThanOrEqual(760);
	});

	it('never returns a negative or NaN size', () => {
		const r = computePreviewRect({ vw: 200, vh: 120, breakpoint: 'mobile', chromeless: false, ratio: [16, 9] });
		expect(r.w).toBeGreaterThanOrEqual(0);
		expect(Number.isFinite(r.w)).toBe(true);
		expect(Number.isFinite(r.h)).toBe(true);
	});
});
