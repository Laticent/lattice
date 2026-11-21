/**
 * Wheel sideways — a vertical mouse wheel over a horizontal-only strip scrolls the strip.
 *
 * The Studio's slide pills and the slide map (horizontal) are strips that scroll only left and right. A mouse
 * wheel sends vertical deltas, which a horizontal-only scroller ignores in every engine; the one native escape
 * is Windows, where wheeling with the pointer ON the horizontal scrollbar scrolls it sideways. The owner hit
 * exactly that after #3345 thinned that bar from 15px to 10px (2026-11-21: "the mouse scrolling doesn't work
 * anymore on the preview pill or map preview"). Measured here: in Chromium and Gecko, a wheel over either
 * strip moved neither, on main as on the branch, so the strip itself must answer the wheel, wherever the
 * pointer is on it.
 *
 * What it leaves alone, so nothing native is taken away:
 *   - a mostly-horizontal wheel (a trackpad's sideways swipe, Shift+wheel): the browser already scrolls it;
 *   - Ctrl/Cmd+wheel: that is zoom;
 *   - a strip that also scrolls vertically, or has nothing to scroll;
 *   - the end of the strip: the wheel is not swallowed there, so the page scrolls on.
 */

export interface WheelInput {
	deltaX: number;
	deltaY: number;
	/** WheelEvent.deltaMode: 0 pixels, 1 lines, 2 pages. */
	deltaMode: number;
	ctrlKey: boolean;
	metaKey: boolean;
}

export interface StripState {
	scrollLeft: number;
	/** scrollWidth - clientWidth. */
	maxLeft: number;
	clientWidth: number;
	/** The strip can itself scroll vertically. */
	scrollsY: boolean;
}

/** Pixels in a "line" for deltaMode 1 (Firefox's default wheel unit). */
export const LINE_PX = 16;

/** The strip's next scrollLeft for this wheel, or null to let the browser handle it. */
export function sidewaysTarget(e: WheelInput, s: StripState): number | null {
	if (e.ctrlKey || e.metaKey) return null;
	if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;
	if (s.maxLeft <= 1 || s.scrollsY) return null;
	const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? s.clientWidth : 1;
	const next = Math.max(0, Math.min(s.maxLeft, s.scrollLeft + e.deltaY * unit));
	return Math.abs(next - s.scrollLeft) < 0.5 ? null : next;
}

/** Attach to a strip; returns the detach. Non-passive, because it must stop the page scrolling under the strip. */
export function wheelSideways(el: HTMLElement): () => void {
	const onWheel = (e: WheelEvent) => {
		if (e.defaultPrevented) return;
		const cs = getComputedStyle(el);
		const next = sidewaysTarget(e, {
			scrollLeft: el.scrollLeft,
			maxLeft: el.scrollWidth - el.clientWidth,
			clientWidth: el.clientWidth,
			scrollsY: /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1,
		});
		if (next === null) return;
		e.preventDefault();
		el.scrollLeft = next;
	};
	el.addEventListener('wheel', onWheel, { passive: false });
	return () => el.removeEventListener('wheel', onWheel);
}
