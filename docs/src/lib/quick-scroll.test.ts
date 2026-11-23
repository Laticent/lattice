import { describe, expect, it } from 'vitest';
import { type Box, boxChanged, EDGE_SLOP, edgeState, fits, GAP, INSET, layoutFor, place, SIZE } from './quick-scroll';

const pane: Box = { left: 0, top: 100, right: 600, bottom: 800 };

describe('edgeState', () => {
	it('earns the control only past two screens of content', () => {
		expect(edgeState(0, 1400, 700).long).toBe(false); // exactly two screens
		expect(edgeState(0, 1401, 700).long).toBe(true);
		expect(edgeState(0, 900, 0).long).toBe(false); // a hidden pane measures 0
	});
	it('hides the arrow for the end you are already at, within the slop', () => {
		expect(edgeState(EDGE_SLOP, 3000, 700)).toMatchObject({ atTop: true, atBottom: false });
		expect(edgeState(EDGE_SLOP + 1, 3000, 700)).toMatchObject({ atTop: false, atBottom: false });
		expect(edgeState(2300 - EDGE_SLOP, 3000, 700)).toMatchObject({ atTop: false, atBottom: true });
	});
});

describe('layoutFor', () => {
	it('gives a mouse the rail and a touch screen the stack', () => {
		expect(layoutFor(false)).toBe('rail');
		expect(layoutFor(true)).toBe('stack');
	});
});

describe('place', () => {
	it('rail: up at the top, down at the bottom, both in one column clear of the scrollbar', () => {
		const p = place(pane, 10, 'rail');
		const x = pane.right - 10 - INSET - SIZE.rail;
		expect(p).toEqual({ up: { x, y: pane.top + INSET }, down: { x, y: pane.bottom - INSET - SIZE.rail }, size: SIZE.rail, layout: 'rail' });
		expect(fits(p, pane)).toBe(true);
	});

	it('stack: both bottom-right at the 44px touch size, up above down', () => {
		const p = place(pane, 0, 'stack');
		expect(p.size).toBe(44);
		expect(p.down.y).toBe(pane.bottom - INSET - 44);
		expect(p.up.y).toBe(p.down.y - GAP - 44);
		expect(p.up.x).toBe(p.down.x);
	});

	it('lifts the bottom button(s) above a floating control in their column', () => {
		const fab: Box = { left: 450, top: 740, right: 590, bottom: 784 };
		for (const layout of ['rail', 'stack'] as const) {
			const p = place(pane, 0, layout, [fab]);
			expect(p.down.y + p.size).toBe(fab.top - GAP);
			expect(fits(p, pane)).toBe(true);
		}
	});

	it('drops the rail top button below a control pinned at the top of its column', () => {
		const chip: Box = { left: 540, top: 104, right: 600, bottom: 140 };
		const p = place(pane, 0, 'rail', [chip]);
		expect(p.up.y).toBe(chip.bottom + GAP);
	});

	it('ignores a control outside the column', () => {
		const left: Box = { left: 0, top: 740, right: 200, bottom: 790 };
		expect(place(pane, 0, 'rail', [left])).toEqual(place(pane, 0, 'rail'));
	});

	it('falls back to the stack in a pane too short for a rail', () => {
		const short: Box = { left: 0, top: 0, right: 400, bottom: SIZE.rail * 4 };
		expect(place(short, 0, 'rail').layout).toBe('stack');
	});

	it('reports a placement that would spill out of a crowded pane as not fitting', () => {
		const tall: Box = { left: 450, top: 150, right: 600, bottom: 790 };
		expect(fits(place(pane, 0, 'stack', [tall]), pane)).toBe(false);
	});
});

describe('boxChanged', () => {
	const box: Box = { left: 0, top: 103, right: 393, bottom: 659 };
	it('reads the same box as no change: the observer\'s first callback after observe()', () => {
		expect(boxChanged(box, { ...box })).toBe(false);
	});
	it('ignores subpixel noise', () => {
		expect(boxChanged(box, { left: 0.2, top: 103.3, right: 392.8, bottom: 659.4 })).toBe(false);
	});
	it('reads a resize or a move as a change', () => {
		expect(boxChanged(box, { ...box, bottom: 600 })).toBe(true);
		expect(boxChanged(box, { ...box, left: 40, right: 433 })).toBe(true);
	});
});
