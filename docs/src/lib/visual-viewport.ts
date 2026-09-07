// The VISUAL viewport — the part of the page a soft keyboard has not covered.
//
// WHY THIS EXISTS. On iOS Safari (and Android Chrome) the on-screen keyboard does NOT
// resize the layout viewport. `window.innerHeight`, `100vh`, `position: fixed` and every
// collision-detection library that reads them — Radix's included — go on believing the
// full screen is available while a third of it is under a keyboard. Only
// `window.visualViewport` shrinks.
//
// Measured on a real WebKit iPhone 15 Pro (393x659): the Playground's component picker
// opens a 381px popover whose list is a fixed 300px. With the keyboard up (~336px) that
// puts 217px of the list — and the row a searching author is reaching for — behind the
// keyboard, with an iOS form-accessory bar floating over what is left. Reported from an
// actual phone, invisible to every headless run, because a headless browser has no
// keyboard to raise (#2124).
//
// It is a MODULE and not a one-off because the next surface that opens a panel over a
// focused field owes the same arithmetic, and because the same reading answers a second
// question: whether a keyboard is up at all, which is what decides that Return should
// reveal the list rather than commit a selection.

import * as React from 'react';

export type ViewportBox = {
	/** Height of the visible area, CSS px. Equals the layout height when nothing covers it. */
	height: number;
	/** Where that area starts inside the layout viewport — iOS shifts it to keep a focused
	 *  field in view, so it is NOT always 0 and the bottom edge below depends on it. */
	offsetTop: number;
	/** `window.innerHeight`: what everything else on the page believes is available. */
	layoutHeight: number;
};

/** A conservative SSR / no-API answer: nothing is covered. */
export const FULL_VIEWPORT: ViewportBox = { height: 0, offsetTop: 0, layoutHeight: 0 };

export function readViewport(): ViewportBox {
	if (typeof window === 'undefined') return FULL_VIEWPORT;
	const vv = window.visualViewport;
	const layoutHeight = window.innerHeight;
	if (!vv) return { height: layoutHeight, offsetTop: 0, layoutHeight };
	return { height: vv.height, offsetTop: vv.offsetTop, layoutHeight };
}

/** The bottom edge of the visible area, in LAYOUT-viewport coordinates — the same frame
 *  `getBoundingClientRect()` reports in, so a caller can subtract one from the other. */
export function visibleBottom(v: ViewportBox): number {
	return v.offsetTop + v.height;
}

/**
 * How many px of the layout viewport are hidden at the bottom. A soft keyboard is the
 * only thing that produces a large value here.
 *
 * The 80px floor is deliberate slack, not a keyboard measurement: browser UI that shrinks
 * the visual viewport by a few px (Safari's collapsing address bar) must not read as a
 * keyboard, and no keyboard on any phone is under 80px.
 */
export function keyboardIsUp(v: ViewportBox): boolean {
	return v.layoutHeight - visibleBottom(v) > 80;
}

/**
 * Track the visual viewport while `active`. Subscribes only when something is actually
 * using the answer (a popover is open), because the `resize`/`scroll` pair fires on every
 * keyboard animation frame and there is no reason to re-render a whole island for it the
 * rest of the time.
 */
export function useVisualViewport(active: boolean): ViewportBox {
	const [box, setBox] = React.useState<ViewportBox>(readViewport);
	React.useEffect(() => {
		if (!active || typeof window === 'undefined') return;
		const sync = () => setBox(readViewport());
		sync(); // the keyboard may already be up when this mounts
		const vv = window.visualViewport;
		vv?.addEventListener('resize', sync);
		vv?.addEventListener('scroll', sync);
		window.addEventListener('resize', sync);
		return () => {
			vv?.removeEventListener('resize', sync);
			vv?.removeEventListener('scroll', sync);
			window.removeEventListener('resize', sync);
		};
	}, [active]);
	return box;
}
