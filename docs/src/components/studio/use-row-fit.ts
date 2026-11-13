// USE ROW FIT — drop a toolbar row's words in a fixed order, only when the row cannot hold them.
//
// The editor pane's header holds `Compose · Source` on the left and up to eight controls on the right,
// and which controls are present depends on state (an issue pill, Refine while text is selected, the
// tablet's Slide settings). A container-width breakpoint cannot say "keep the words while they fit",
// because the width they need moves with that state: measured, the base row holds both words down to a
// 340 px pane, and an issue pill alone moves that past 400 px (2026-11-10-compose-first.md §4).
//
// So the row is MEASURED. `data-fit` steps from 0 (every word shown) up to `levels - 1`, and the row
// takes the lowest step whose content fits its box. Each step's CSS (`group-data-[fit=N]/…`) hides one
// more set of words, least important first. It runs in a layout effect and in a ResizeObserver callback,
// both of which land before paint, so a row is never drawn overflowing and then corrected.

import * as React from 'react';

/**
 * Re-fit the row when its box resizes, when fonts arrive, and when `content` changes. `content` is a string the
 * caller builds from whatever decides which controls the row holds (an issue count, a selection), since a control
 * appearing changes what the row needs without changing the row's own box.
 *
 * Returns a CALLBACK REF, not a ref object: the row is unmounted whenever the editor pane is (Fabricate, the article
 * view), and a ref object would leave the effect watching the old, detached row while the new one never got
 * `data-fit` and overflowed. Holding the element in state re-runs the effect for every new node.
 */
export function useRowFit(levels: number, content: string): (el: HTMLElement | null) => void {
	const [el, setEl] = React.useState<HTMLElement | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `content` is the trigger; the row itself is read live.
	React.useLayoutEffect(() => {
		if (!el) return;
		const refit = () => {
			for (let level = 0; level < levels; level++) {
				el.dataset.fit = String(level);
				// +1: a sub-pixel width rounds scrollWidth up past clientWidth on a row that fits.
				if (el.scrollWidth <= el.clientWidth + 1) return;
			}
		};
		refit();
		const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
		ro?.observe(el);
		let live = true;
		void document.fonts?.ready.then(() => live && refit());
		return () => {
			live = false;
			ro?.disconnect();
		};
	}, [el, levels, content]);
	return setEl;
}
