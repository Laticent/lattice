// The placement kernel: worked examples, then seeded properties over random anchors, cards and
// bounds. Floating UI parity is measured in a real browser (docs/e2e/cenno-parity.spec.ts); these
// hold the rules that parity rests on. CENNO_SEED and CENNO_RUNS replay or widen a run.
import { describe, expect, it } from 'vitest';
import { type Align, intersects, type PlaceOptions, place, type Rect, type Side } from './place.js';

const RUNS = Number(process.env.CENNO_RUNS || 2000);
const SEED = Number(process.env.CENNO_SEED || 20261116);

function mulberry32(a: number) {
	let s = a >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const VIEW: Rect = { x: 0, y: 0, width: 1280, height: 720 };
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS: Align[] = ['start', 'center', 'end'];

function randomCase(rnd: () => number) {
	const point = rnd() < 0.5;
	const w = point ? 0 : 4 + rnd() * 200;
	const h = point ? 0 : 4 + rnd() * 100;
	return {
		anchor: { x: rnd() * (VIEW.width - w), y: rnd() * (VIEW.height - h), width: w, height: h },
		card: { width: 40 + Math.round(rnd() * 400), height: 20 + Math.round(rnd() * 300) },
		opts: { side: SIDES[Math.floor(rnd() * 4)], align: ALIGNS[Math.floor(rnd() * 3)], gap: Math.round(rnd() * 16), pad: Math.round(rnd() * 12) } as PlaceOptions,
	};
}

describe('place — worked examples', () => {
	it('puts the card below a centered anchor by default, centered on it', () => {
		const p = place({ x: 600, y: 300, width: 80, height: 20 }, { width: 200, height: 100 }, VIEW);
		expect(p).toMatchObject({ x: 540, y: 320, side: 'bottom', hidden: false });
	});

	it('flips to the top when the bottom has no room', () => {
		const p = place({ x: 600, y: 680, width: 80, height: 20 }, { width: 200, height: 100 }, VIEW, { gap: 8 });
		expect(p.side).toBe('top');
		expect(p.y).toBe(680 - 100 - 8);
	});

	it('keeps the preferred side when neither fits but it spills less', () => {
		// 400 tall in a 720 view with the anchor near the middle: bottom spills 30, top spills 90.
		const p = place({ x: 600, y: 350, width: 10, height: 0 }, { width: 100, height: 400 }, VIEW, { side: 'bottom' });
		expect(p.side).toBe('bottom');
		expect(p.maxHeight).toBe(370);
	});

	it('shifts along the edge to stay inside the bounds and its padding', () => {
		const p = place({ x: 5, y: 100, width: 10, height: 10 }, { width: 200, height: 50 }, VIEW, { pad: 8 });
		expect(p.x).toBe(8);
	});

	it('keeps the start edge visible when the card is wider than the bounds', () => {
		const p = place({ x: 600, y: 100, width: 10, height: 10 }, { width: 2000, height: 50 }, VIEW, { pad: 8 });
		expect(p.x).toBe(8);
		expect(p.maxWidth).toBe(1264);
	});

	it('aligns start and end to the anchor edges, swapped under rtl', () => {
		const a = { x: 400, y: 100, width: 100, height: 20 };
		expect(place(a, { width: 50, height: 20 }, VIEW, { align: 'start' }).x).toBe(400);
		expect(place(a, { width: 50, height: 20 }, VIEW, { align: 'end' }).x).toBe(450);
		expect(place(a, { width: 50, height: 20 }, VIEW, { align: 'start', rtl: true }).x).toBe(450);
	});

	it('points the arrow at the anchor center and clamps it to the card edge', () => {
		const p = place({ x: 600, y: 100, width: 40, height: 10 }, { width: 200, height: 50 }, VIEW, { align: 'start', arrow: 10 });
		expect(p.arrow).toBe(15);
		const edge = place({ x: 5, y: 100, width: 0, height: 0 }, { width: 200, height: 50 }, VIEW, { arrow: 10, arrowPad: 6 });
		expect(edge.arrow).toBe(6);
	});

	it('reports hidden when the anchor is outside the bounds, and not for a point on the edge', () => {
		expect(place({ x: -50, y: 10, width: 20, height: 20 }, { width: 10, height: 10 }, VIEW).hidden).toBe(true);
		expect(place({ x: 0, y: 0, width: 0, height: 0 }, { width: 10, height: 10 }, VIEW).hidden).toBe(false);
	});

	it('places in any coordinate space, such as a scrolled visual viewport', () => {
		const pinched = { x: 300, y: 200, width: 640, height: 360 };
		const p = place({ x: 620, y: 550, width: 10, height: 10 }, { width: 100, height: 60 }, pinched);
		expect(p.side).toBe('top');
		expect(p.hidden).toBe(false);
	});
});

describe(`place — properties (seed ${SEED}, ${RUNS} runs)`, () => {
	it('a card that fits stays inside the padded bounds on the cross axis and its far edge', () => {
		// The near edge touches the anchor (gap away), so it may sit in the padding when the anchor does.
		const rnd = mulberry32(SEED);
		for (let i = 0; i < RUNS; i++) {
			const c = randomCase(rnd);
			const pad = c.opts.pad ?? 0;
			const p = place(c.anchor, c.card, VIEW, c.opts);
			const vertical = p.side === 'top' || p.side === 'bottom';
			const fitsMain = vertical ? c.card.height <= p.maxHeight : c.card.width <= p.maxWidth;
			const fitsCross = vertical ? c.card.width <= VIEW.width - 2 * pad : c.card.height <= VIEW.height - 2 * pad;
			if (!fitsMain || !fitsCross) continue;
			const e = 1e-9;
			if (vertical) {
				expect(p.x, `case ${i}`).toBeGreaterThanOrEqual(pad - e);
				expect(p.x + c.card.width, `case ${i}`).toBeLessThanOrEqual(VIEW.width - pad + e);
			} else {
				expect(p.y, `case ${i}`).toBeGreaterThanOrEqual(pad - e);
				expect(p.y + c.card.height, `case ${i}`).toBeLessThanOrEqual(VIEW.height - pad + e);
			}
			if (p.side === 'top') expect(p.y, `case ${i}`).toBeGreaterThanOrEqual(pad - e);
			if (p.side === 'bottom') expect(p.y + c.card.height, `case ${i}`).toBeLessThanOrEqual(VIEW.height - pad + e);
			if (p.side === 'left') expect(p.x, `case ${i}`).toBeGreaterThanOrEqual(pad - e);
			if (p.side === 'right') expect(p.x + c.card.width, `case ${i}`).toBeLessThanOrEqual(VIEW.width - pad + e);
		}
	});

	it('never flips away from a side the card fits on', () => {
		const rnd = mulberry32(SEED + 1);
		for (let i = 0; i < RUNS; i++) {
			const c = randomCase(rnd);
			const fixed = place(c.anchor, c.card, VIEW, c.opts);
			const pad = c.opts.pad ?? 0;
			const gap = c.opts.gap ?? 0;
			const a = c.anchor;
			const room = { top: a.y - gap - pad, bottom: VIEW.height - pad - (a.y + a.height + gap), left: a.x - gap - pad, right: VIEW.width - pad - (a.x + a.width + gap) }[c.opts.side as Side];
			const need = c.opts.side === 'top' || c.opts.side === 'bottom' ? c.card.height : c.card.width;
			if (need <= room) expect(fixed.side, `case ${i}`).toBe(c.opts.side);
		}
	});

	it('the card never overlaps its anchor on the main axis when it fits', () => {
		const rnd = mulberry32(SEED + 2);
		for (let i = 0; i < RUNS; i++) {
			const c = randomCase(rnd);
			const p = place(c.anchor, c.card, VIEW, c.opts);
			const gap = c.opts.gap ?? 0;
			const vertical = p.side === 'top' || p.side === 'bottom';
			if ((vertical ? c.card.height : c.card.width) > (vertical ? p.maxHeight : p.maxWidth)) continue;
			if (p.side === 'bottom') expect(p.y).toBeCloseTo(c.anchor.y + c.anchor.height + gap, 9);
			if (p.side === 'top') expect(p.y + c.card.height).toBeCloseTo(c.anchor.y - gap, 9);
			if (p.side === 'right') expect(p.x).toBeCloseTo(c.anchor.x + c.anchor.width + gap, 9);
			if (p.side === 'left') expect(p.x + c.card.width).toBeCloseTo(c.anchor.x - gap, 9);
		}
	});

	it('the arrow always sits on the card edge, clear of the corners', () => {
		const rnd = mulberry32(SEED + 3);
		for (let i = 0; i < RUNS; i++) {
			const c = randomCase(rnd);
			const p = place(c.anchor, c.card, VIEW, { ...c.opts, arrow: 10, arrowPad: 4 });
			const len = p.side === 'top' || p.side === 'bottom' ? c.card.width : c.card.height;
			expect(p.arrow, `case ${i}`).toBeGreaterThanOrEqual(4);
			expect(p.arrow as number, `case ${i}`).toBeLessThanOrEqual(Math.max(4, len - 14) + 1e-9);
		}
	});

	it('rtl mirrors ltr across the vertical axis', () => {
		const rnd = mulberry32(SEED + 4);
		const mirror = (r: Rect): Rect => ({ ...r, x: VIEW.width - r.x - r.width });
		for (let i = 0; i < RUNS; i++) {
			const c = randomCase(rnd);
			if (c.opts.side === 'left' || c.opts.side === 'right') continue;
			const ltr = place(c.anchor, c.card, VIEW, c.opts);
			const rtl = place(mirror(c.anchor), c.card, VIEW, { ...c.opts, rtl: true });
			expect(rtl.side, `case ${i}`).toBe(ltr.side);
			expect(rtl.x, `case ${i}`).toBeCloseTo(VIEW.width - ltr.x - c.card.width, 9);
			expect(rtl.y, `case ${i}`).toBeCloseTo(ltr.y, 9);
		}
	});

	it('hidden is exactly "the anchor misses the bounds"', () => {
		const rnd = mulberry32(SEED + 5);
		for (let i = 0; i < RUNS; i++) {
			const a = { x: rnd() * 2000 - 400, y: rnd() * 1400 - 400, width: rnd() * 100, height: rnd() * 100 };
			expect(place(a, { width: 50, height: 50 }, VIEW).hidden).toBe(!intersects(a, VIEW));
		}
	});
});
