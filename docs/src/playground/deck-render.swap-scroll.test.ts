/**
 * A window move must leave the frame where the reader scrolled it.
 *
 * A placeholder is sized exactly like its slide, so swapping one for the other should never move the scroll. Under
 * load Chromium did anyway: a wheel took the Playground's frame from 15 to 2094, Veduta mounted the slides around
 * 2094 on the next frame, and the first `replaceChild` put the frame back on 15, the offset the last programmatic
 * `scrollTo` wrote. That mechanism is inferred from hooks, not traced inside Chromium: no script asked for the move,
 * and `overflow-anchor: none` did not stop it. The bar then read
 * "1 / 14" with the reader's slide gone (`docs/e2e/playground-map.spec.ts`, "scrolling the preview moves the rail",
 * red in 21 runs of 40 under `--workers=4`). `applyWindow` now puts back the offset it read before the swaps.
 *
 * jsdom has no layout, so the frame's own `replaceChild` below plays the browser's move: it writes the old offset
 * back as Chromium did. So this file pins the guard's logic. Only the e2e arm proves that the guard fixes the browser.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncVirtual } from './deck-render.js';
import { placeholderOf, withIndex } from './virtual-window.js';

const N = 40;
const PITCH = 700;
const TOP = 15;
const sections = Array.from({ length: N }, (_, i) => `<section data-lattice-slide="${i + 1}"><h1>Slide ${i + 1}</h1></section>`);

afterEach(() => {
	vi.restoreAllMocks();
});

/** A frame with slides 0..3 mounted and every element already fitted, as the Playground's is after its first fit. */
function makeFrame({ fitted, drop = TOP }: { fitted: boolean; drop?: number }) {
	const doc = document.implementation.createHTMLDocument('preview');
	doc.body.innerHTML = `<article class="lattice" data-lv="">${sections.map((s, i) => (i <= 3 ? withIndex(s, i) : placeholderOf(s))).join('')}</article>`;
	const lattice = doc.querySelector('.lattice') as HTMLElement;
	if (fitted) for (const el of Array.from(lattice.children)) Object.assign(el, { __lfT: 1, __lfM: 0 });
	const win = {
		scrollY: TOP,
		innerWidth: 1292,
		innerHeight: 693,
		__latticeFit: vi.fn(),
		scrollTo: vi.fn(({ top }: { top: number }) => {
			win.scrollY = top;
		}),
	} as Record<string, unknown> & { scrollY: number; scrollTo: ReturnType<typeof vi.fn> };
	// The browser's move: the first swap after the wheel drops it and lands back on the last programmatic offset.
	const replaceChild = lattice.replaceChild.bind(lattice);
	let dropped = false;
	lattice.replaceChild = (<T extends Node>(fresh: Node, old: T): T => {
		const out = replaceChild(fresh, old);
		if (!dropped) {
			dropped = true;
			win.scrollY = drop;
		}
		return out;
	}) as typeof lattice.replaceChild;
	const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const i = Array.prototype.indexOf.call(lattice.children, this);
		const top = TOP + i * PITCH - win.scrollY;
		return { top, bottom: top + 680, height: 680, left: 0, right: 1200, width: 1200, x: 0, y: top } as DOMRect;
	});
	return { frame: { contentDocument: doc, contentWindow: win } as unknown as HTMLIFrameElement, win, lattice, restore: () => spy.mockRestore() };
}

describe('a window move does not move the reader', () => {
	it('a wheel to slide 4, then the mount around it: the frame stays at the wheel', () => {
		const { frame, win, lattice, restore } = makeFrame({ fitted: true });
		const wheel = TOP + 3 * PITCH; // the reader's wheel, three slides down
		win.scrollY = wheel;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		// The mount really happened: slides past the old run are real now.
		expect(lattice.children[6].tagName).toBe('SECTION');
		expect(win.scrollTo).toHaveBeenCalledTimes(1);
		expect(win.scrollTo).toHaveBeenCalledWith({ top: wheel, behavior: 'instant' });
		expect(win.scrollY).toBe(wheel);
		restore();
	});

	it('a swap that did not move the scroll writes nothing', () => {
		const { frame, win, lattice, restore } = makeFrame({ fitted: true });
		// The browser behaves: undo the simulated drop before the move.
		lattice.replaceChild = Element.prototype.replaceChild.bind(lattice) as typeof lattice.replaceChild;
		win.scrollY = TOP + 3 * PITCH;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		expect(win.scrollTo).not.toHaveBeenCalled();
		restore();
	});

	it('a move under one pixel writes nothing: a fractional offset is not a dropped scroll', () => {
		const wheel = TOP + 3 * PITCH;
		const { frame, win } = makeFrame({ fitted: true, drop: wheel + 0.5 });
		win.scrollY = wheel;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		expect(win.scrollTo).not.toHaveBeenCalled();
	});

	it('an UNFITTED swap is left to the browser: that slide really is taller than its placeholder until the fit runs', () => {
		const { frame, win, restore } = makeFrame({ fitted: false });
		win.scrollY = TOP + 3 * PITCH;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		expect(win.scrollTo).not.toHaveBeenCalled();
		expect(win.__latticeFit).toHaveBeenCalled();
		restore();
	});
});
