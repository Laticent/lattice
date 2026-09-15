import { afterEach, describe, expect, it } from 'vitest';
import { tourChromeBottom, tourChromeMargin, tourChromeOverlap, visibleBottom } from './tour-chrome';

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

/**
 * Put a software keyboard up: `covered` px of the LAYOUT viewport hidden behind it.
 *
 * jsdom has no `visualViewport` at all, which is itself the no-keyboard case every arm written
 * before this one ran under — so installing one is what makes the new branch reachable, and
 * `clearKeyboard` puts the property back to `undefined` rather than to a zero-inset stub, so the
 * old arms keep exercising the absent-API path they were written for.
 */
const setKeyboard = (covered: number, offsetTop = 0) => {
	// FAITHFUL TO WHAT AN ENGINE ACTUALLY DOES: the keyboard fixes the visual viewport's HEIGHT,
	// and `offsetTop` then slides that fixed-height box down inside the layout viewport as the
	// page scrolls under it. An earlier version of this helper shrank `height` as `offsetTop`
	// grew, which held `offsetTop + height` invariant — a viewport no engine produces, and one
	// that made the offsetTop arm below assert the same number with and without the term it
	// claimed to be testing.
	Object.defineProperty(window, 'visualViewport', {
		configurable: true,
		value: { height: window.innerHeight - covered, offsetTop, addEventListener() {}, removeEventListener() {} },
	});
};
const clearKeyboard = () => {
	Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
};

afterEach(() => {
	setInset(null);
	clearKeyboard();
});

describe('visibleBottom — the lowest line a viewer can actually see', () => {
	it('is the window bottom on every engine without a visual viewport, which is where this started', () => {
		expect(visibleBottom()).toBe(window.innerHeight);
	});

	it('is the window bottom with a visual viewport and no keyboard up', () => {
		setKeyboard(0);
		expect(visibleBottom()).toBe(window.innerHeight);
	});

	it('rises by the keyboard height when one is up', () => {
		setKeyboard(336);
		expect(visibleBottom()).toBe(window.innerHeight - 336);
	});

	it('follows the page scrolling UNDER the keyboard, which resize alone never reports', () => {
		// `offsetTop` slides the fixed-height visual viewport DOWN the layout one, so the visible
		// bottom moves down with it — the term makes this clear LESS, not more, and the direction
		// is worth stating because the docblock used to justify it the other way round. 768px
		// window, 300px keyboard, scrolled 40px under it: the visible box is 468px tall starting
		// at y=40, so its bottom is 508, not 468.
		setKeyboard(300, 40);
		expect(visibleBottom()).toBe(508);
	});

	it('clamps to the window once the page has scrolled fully under the keyboard', () => {
		// At the document end `offsetTop` reaches `innerHeight - vvHeight`, so `offsetTop + height`
		// lands exactly on `innerHeight` — the true visible bottom in layout coordinates. This is
		// the case the clamp exists to keep honest rather than to correct.
		setKeyboard(300, 300);
		expect(visibleBottom()).toBe(window.innerHeight);
	});

	it('never reports a line BELOW the window, which a rubber-band overscroll can produce', () => {
		Object.defineProperty(window, 'visualViewport', {
			configurable: true,
			value: { height: window.innerHeight, offsetTop: 60, addEventListener() {}, removeEventListener() {} },
		});
		expect(visibleBottom()).toBe(window.innerHeight);
	});
});

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

describe('tourChromeOverlap — with a software keyboard up', () => {
	// The gap #2209 shipped with, and the reason its numbers could not settle the iPhone report:
	// every one of them is in the LAYOUT viewport, which iOS does not shrink for the keyboard. A
	// caption seated against the window's bottom edge is then itself behind the keyboard, and a
	// reveal that clears only the caption still lands somewhere the viewer cannot see.

	it('clears the KEYBOARD when it reaches higher than the caption', () => {
		// 768px window, 336px keyboard → the lowest visible line is 432. The caption's own band
		// tops out at 538, which is already behind the keyboard, so the keyboard is what a reveal
		// has to clear. Before this, the answer here was 230 — the caption band alone.
		setInset('230px');
		setKeyboard(336);
		expect(tourChromeOverlap(scroller(600))).toBe(336);
	});

	it('still clears the CAPTION when the caption reaches higher than the keyboard', () => {
		// A tall caption on a short keyboard: the band tops out at 268, the visible bottom is 568,
		// so the caption is the binding constraint and the keyboard changes nothing.
		setInset('500px');
		setKeyboard(200);
		expect(tourChromeOverlap(scroller(600))).toBe(500);
	});

	it('is unchanged by a visual viewport with no keyboard up', () => {
		setInset('230px');
		const without = tourChromeOverlap(scroller(600));
		setKeyboard(0);
		expect(tourChromeOverlap(scroller(600))).toBe(without);
	});

	it('is still 0 with a keyboard up and NO tour running', () => {
		// The module's safety property, and it has to survive the keyboard: with no tour there is
		// no published band, and reserving keyboard room here would double-count against the
		// scroll extent `scrollPastEnd()` already gives the markdown editor.
		setKeyboard(336);
		expect(tourChromeOverlap(scroller(600))).toBe(0);
	});

	it('keeps the `keep` clamp, so a short pane is never asked for more than it has', () => {
		setInset('230px');
		setKeyboard(336);
		// 120px pane: the keyboard would ask for 336, the clamp allows 120 - 48 = 72.
		expect(tourChromeOverlap(scroller(120))).toBe(72);
	});
});

describe('tourChromeMargin — with a software keyboard up', () => {
	it('halves the keyboard-aware overlap, not the caption-only one', () => {
		// 336 is the overlap; half the usable 600 - 48 pane is 276, and CodeMirror's symmetric
		// yMargin makes the smaller of the two the only non-oscillating answer.
		setInset('230px');
		setKeyboard(336);
		expect(tourChromeMargin(scroller(600))).toBe(276);
	});
});

describe('tourChromeOverlap — a caption that is not full width', () => {
	// jsdom's window is 1024px. A centered 380px `progress` pill spans x 322..702, so the clear
	// strips are 322px on each side, and a pane off to one side is covered by nothing.
	const setSides = (left: string | null, right: string | null) => {
		const d = document.documentElement.style;
		if (left === null) d.removeProperty('--vt-chrome-left');
		else d.setProperty('--vt-chrome-left', left);
		if (right === null) d.removeProperty('--vt-chrome-right');
		else d.setProperty('--vt-chrome-right', right);
	};
	afterEach(() => setSides(null, null));

	/** A scroller `w` px wide starting at `left`, tall enough to reach into the band. */
	function pane(left: number, w: number, h = 600): Element {
		const el = document.createElement('div');
		const bottom = window.innerHeight;
		el.getBoundingClientRect = () => ({ left, top: bottom - h, width: w, height: h, right: left + w, bottom, x: left, y: bottom - h, toJSON: () => ({}) }) as DOMRect;
		return el;
	}

	it('is 0 for a pane entirely beside the caption', () => {
		setInset('230px');
		setSides('322px', '322px');
		expect(tourChromeOverlap(pane(0, 300))).toBe(0);
	});

	it('is the full band for a pane under the caption', () => {
		setInset('230px');
		setSides('322px', '322px');
		expect(tourChromeOverlap(pane(400, 200))).toBe(230);
	});

	it('is the full band for a full-width caption, which publishes 0 on both sides', () => {
		setInset('230px');
		setSides('0px', '0px');
		expect(tourChromeOverlap(pane(0, 300))).toBe(230);
	});

	it('is unchanged when the extent is ABSENT, so an older Vetrina build behaves as it always did', () => {
		setInset('230px');
		expect(tourChromeOverlap(pane(0, 300))).toBe(230);
	});

	it('reads an unparseable or negative side as 0 rather than as NaN', () => {
		// NaN would make both comparisons false and silently return 0 — the defect, restored by a
		// bad property value. The publisher clamps to >= 0, so a negative cannot arrive from
		// `stage.ts` today; this pins the guard rather than the publisher.
		setInset('230px');
		setSides('none', '-40px');
		expect(tourChromeOverlap(pane(0, 300))).toBe(230);
	});

	it('treats a touching edge as clear', () => {
		setInset('230px');
		setSides('322px', '322px');
		// Right edge exactly on the band's left edge — a zero-width intersection is not an overlap.
		expect(tourChromeOverlap(pane(202, 120))).toBe(0);
	});

	it('STILL clears the keyboard for a pane beside the caption — the keyboard is full width', () => {
		// The composition defect an independent checker found: the horizontal test is about the
		// CAPTION, and an early draft returned 0 from it before the keyboard line was computed, so
		// a pane beside a narrow caption got no keyboard clearing at all. The keyboard spans the
		// screen; nothing is ever "beside" it.
		// 768px window, 336px keyboard → visible bottom 432. A 160px pane at x 0..160 is clear of
		// the caption's 322..702 band but squarely behind the keyboard.
		setInset('123px');
		setSides('322px', '322px');
		setKeyboard(336);
		expect(tourChromeOverlap(pane(0, 160))).toBe(336);
	});

	it('distinguishes LEFT from RIGHT — an asymmetric band, pane on the far side', () => {
		// EVERY OTHER FIXTURE HERE IS SYMMETRIC, which a checker's mutants exposed: swapping the two
		// properties, or dropping either half of the overlap test, passed the whole suite. A `bar`
		// under `bounds:'host'` over an off-center host publishes asymmetric gutters, so this is the
		// ordinary case, not a contrivance. 1024px window, band [100, 480].
		setInset('230px');
		setSides('100px', '544px');
		// A pane at x 600..900 is entirely to the RIGHT of the band — covered by nothing.
		expect(tourChromeOverlap(pane(600, 300))).toBe(0);
	});

	it('reserves the band for a pane the ASYMMETRIC band actually covers', () => {
		// The same band, a pane at x 200..300, squarely inside [100, 480]. Swapping the two
		// properties would read the band as [544, 924] and return 0 here — the original defect.
		setInset('230px');
		setSides('100px', '544px');
		expect(tourChromeOverlap(pane(200, 100))).toBe(230);
	});

	it('is 0 for a pane beside the caption when no keyboard is up', () => {
		// The other half of the same line: with nothing else obstructing, a pane beside the caption
		// still reserves nothing. `Infinity` for the caption term must not leak out as a number.
		setInset('123px');
		setSides('322px', '322px');
		expect(tourChromeOverlap(pane(0, 160))).toBe(0);
	});
});

describe('tourChromeMargin — the clamp against a keyboard is a partial lift, and it is pinned', () => {
	// Finding 2 from an independent checker: the half-clamp was derived against the 230px caption
	// band, which fits inside it on every measured pane. A keyboard does not, so the clamp now
	// binds on the surface this swimlane is about. These two arms record the real numbers so the
	// shortfall is a stated behavior rather than a surprise.
	const setSides2 = (l: string, r: string) => {
		document.documentElement.style.setProperty('--vt-chrome-left', l);
		document.documentElement.style.setProperty('--vt-chrome-right', r);
	};
	afterEach(() => {
		document.documentElement.style.removeProperty('--vt-chrome-left');
		document.documentElement.style.removeProperty('--vt-chrome-right');
	});

	it('clears a 336px keyboard completely on the 741px Chromium phone pane', () => {
		setInset('230px');
		setSides2('0px', '0px');
		setKeyboard(336);
		// (741 - 48) / 2 = 346.5, which is above 336 — so the full ask survives the clamp.
		expect(tourChromeMargin(scroller(741))).toBe(336);
	});

	it('falls 82px short on the 556px real-WebKit pane, and that is the clamp doing its job', () => {
		setInset('230px');
		setSides2('0px', '0px');
		setKeyboard(336);
		// (556 - 48) / 2 = 254. The alternative to this shortfall is a per-keystroke judder, not a
		// complete lift — see the halving derivation in tour-chrome.ts.
		expect(tourChromeMargin(scroller(556))).toBe(254);
	});
});
