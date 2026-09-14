import { afterEach, describe, expect, it } from 'vitest';
import { tourChromeBottom, tourChromeMargin, tourChromeOverlap } from './tour-chrome';

// The HOST half of "a tour's caption is an occluder". Vetrina publishes the band it is painting
// over; this is what a host does with the number. The arithmetic is the whole module, and getting
// it wrong is silent — an overlap that reads 0 restores exactly the defect, and one that reads too
// large scrolls a short editor to the end of its extent trying to satisfy an impossible reveal.
//
// jsdom gives every element a 0x0 box, so each arm supplies the scroller's rect itself. That is
// not a stand-in: the input to this function IS a rect, and where real rects come from is
// verified on a browser in docs/e2e/demo-mobile.spec.ts (HARD RULE #23).

const setInset = (px: string | null) => {
	if (px === null) document.documentElement.style.removeProperty('--vt-chrome-bottom');
	else document.documentElement.style.setProperty('--vt-chrome-bottom', px);
};

/** A scroller `h` px tall whose bottom edge sits `fromBottom` px above the window's. */
function scroller(h: number, fromBottom = 0): Element {
	const el = document.createElement('div');
	const bottom = window.innerHeight - fromBottom;
	el.getBoundingClientRect = () => ({ left: 0, top: bottom - h, width: 400, height: h, right: 400, bottom, x: 0, y: bottom - h, toJSON: () => ({}) }) as DOMRect;
	return el;
}

afterEach(() => setInset(null));

describe('tourChromeBottom — what a running tour is covering', () => {
	it('is 0 when no tour is running, which is every ordinary keystroke on every surface', () => {
		expect(tourChromeBottom()).toBe(0);
	});

	it('reads the published band', () => {
		setInset('230px');
		expect(tourChromeBottom()).toBe(230);
	});

	it('treats an unparseable or zero value as no tour, rather than as NaN', () => {
		// NaN would propagate into a CodeMirror `yMargin` and take the reveal with it.
		setInset('none');
		expect(tourChromeBottom()).toBe(0);
		setInset('0px');
		expect(tourChromeBottom()).toBe(0);
	});
});

describe('tourChromeOverlap — how much room a reveal inside a scroller has to leave', () => {
	it('is 0 with no tour running — the reveal is byte-identical to what it was before this existed', () => {
		expect(tourChromeOverlap(scroller(600))).toBe(0);
	});

	it('is the full band for a scroller that runs to the bottom of the window', () => {
		// The Studio's phone editor: the pane ends at the viewport's bottom edge, which is exactly
		// where the `scrim` is painted, so all 230px of it are over the editor. 600px of scroller
		// leaves the half-clamp at 276, above the band, so the band is cleared completely — as it
		// is on both surfaces this was measured on (741px and 556px panes).
		setInset('230px');
		expect(tourChromeOverlap(scroller(600))).toBe(230);
	});

	it('is only the part that actually overlaps, for a scroller that stops short of the caption', () => {
		// A desktop pane with a status bar under it: 180px of the scroller's bottom is clear, so a
		// 230px band covers just 50px of it. Reserving the whole band here would scroll the view
		// 180px further than anything required.
		setInset('230px');
		expect(tourChromeOverlap(scroller(600, 180))).toBe(50);
	});

	it('is 0 for a scroller entirely above the caption', () => {
		setInset('230px');
		expect(tourChromeOverlap(scroller(300, 400))).toBe(0);
	});

	it('never asks for more than the scroller can give, leaving `keep` px usable', () => {
		setInset('230px');
		expect(tourChromeOverlap(scroller(120))).toBe(72); // 120 - 48
		expect(tourChromeOverlap(scroller(120), 100)).toBe(20);
	});
});

describe('tourChromeMargin — the same, made safe for a SYMMETRIC consumer', () => {
	it('never exceeds HALF the usable scroller — the oscillation clamp', () => {
		// CodeMirror's `yMargin` is applied at BOTH edges and tests the TOP one first, so a margin
		// past half the scroller makes the reveal alternate between scrolling forward and backward,
		// one keystroke each. Half is the largest value that cannot do that.
		setInset('230px');
		expect(tourChromeMargin(scroller(120))).toBe(36); // (120 - 48) / 2, vs 72 unhalved
		expect(tourChromeMargin(scroller(120), 100)).toBe(10);
	});

	it('is the FULL band wherever the scroller has room for it — including both measured phones', () => {
		// The clamp only bites when it has to. 741px is the Studio's editor on Chromium at 390x844
		// and 556px is real WebKit at an iPhone box; half their usable height is 346 and 254, both
		// above the 230px band, so neither measured surface is changed by the halving.
		setInset('230px');
		expect(tourChromeMargin(scroller(741))).toBe(230);
		expect(tourChromeMargin(scroller(556))).toBe(230);
	});

	it('is 0 with no tour running, so the reveal keeps CodeMirror\'s own default margin', () => {
		// The caller passes `|| undefined` for exactly this: CodeMirror's default `yMargin` is 5,
		// and it KEEPS a literal 0 — so a plain 0 here would quietly drop 5px of breathing room
		// from every author keystroke on every surface.
		expect(tourChromeMargin(scroller(600))).toBe(0);
	});

	it('is 0 for a scroller that is missing or has collapsed to nothing', () => {
		setInset('230px');
		expect(tourChromeOverlap(null)).toBe(0);
		expect(tourChromeOverlap(scroller(0))).toBe(0);
	});
});
