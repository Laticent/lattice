/**
 * Quick scroll — the jump-to-top / jump-to-bottom control's pure kernel.
 *
 * `components/ui/quick-scroll.tsx` owns the DOM; this file owns the decisions, so they test without a
 * browser: whether a pane is long enough to earn the control, which arrows a position shows, which layout
 * the pointer gets, and where each button sits so it clears the scrollbar and any floating control the
 * page marks with `data-quick-scroll-avoid`.
 *
 * THE HYBRID (picked by the owner from three scored placements):
 *   - `rail` — a mouse or trackpad (fine pointer). Two small buttons along the scrollbar edge: up near the
 *     pane's top, down near its bottom. Each arrow sits at the end it goes to, and the pair covers the
 *     least text of the three candidates (1,568 px² against the corner stack's 3,872).
 *   - `stack` — a touch screen (coarse pointer). Both buttons stacked bottom-right at 44px, where the
 *     thumb already is, matching the HTML player's read view (`lib/export/player-core.mjs` #lp-read-nav).
 *     A rail's up arrow at the top of a phone pane sits out of thumb reach.
 * The layout follows the POINTER, not the width: a touch laptop at 1440px is a thumb, a narrow desktop
 * window is a mouse.
 */

export type QuickScrollLayout = 'rail' | 'stack';

export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Content must be MORE than this many screens tall before the control appears (owner's pick: two). */
export const MIN_SCREENS = 2;
/** Idle time after the last scroll before the control hides, in ms (the player's value). */
export const IDLE_MS = 1500;
/**
 * The control answers the READER's scrolling, not the app's. A scroll counts only within this many ms of
 * the reader's own input on that pane (wheel, touch, a press on it or its scrollbar, a paging key). Without
 * it, typing in the Playground editor showed BOTH panes' controls, because the preview scrolls to follow
 * the caret. Long enough to cover a trackpad's or a finger's momentum tail.
 */
export const INTENT_MS = 1200;
/** An overlay scrollbar takes no width; a press this close to a gutterless scroller's right edge counts as on it. */
export const OVERLAY_BAR = 16;
/** A scroll within this many ms of the previous counted one extends the reader's window (a slow drag, a glide). */
export const STREAK_MS = 250;
/** Keys that page or jump a pane. Arrows and typing move the caret, and the scroll that follows is not a request. */
export const PAGING_KEYS: ReadonlySet<string> = new Set(['PageUp', 'PageDown', 'Home', 'End', ' ']);
/** A jump re-aims at most this many times when the document grows under it (CodeMirror measures lazily). */
export const JUMP_RETRIES = 3;
/** A position within this many px of an end counts as AT that end (the player's tolerance). */
export const EDGE_SLOP = 4;
/** Button edge, px: small on a fine pointer, the 44px touch minimum on a coarse one. */
export const SIZE: Record<QuickScrollLayout, number> = { rail: 28, stack: 44 };
/** Space between the button and the pane edge / scrollbar, and between stacked buttons, px. */
export const INSET = 8;
export const GAP = 8;

export function layoutFor(coarse: boolean): QuickScrollLayout {
	return coarse ? 'stack' : 'rail';
}

export interface EdgeState {
	/** Long enough to earn the control at all. */
	long: boolean;
	atTop: boolean;
	atBottom: boolean;
}

/** Where the scroller stands. `scrollTop` / `scrollHeight` / `clientHeight` as the DOM reports them. */
export function edgeState(scrollTop: number, scrollHeight: number, clientHeight: number, minScreens = MIN_SCREENS): EdgeState {
	const max = Math.max(0, scrollHeight - clientHeight);
	return {
		long: clientHeight > 0 && scrollHeight > clientHeight * minScreens,
		atTop: scrollTop <= EDGE_SLOP,
		atBottom: scrollTop >= max - EDGE_SLOP,
	};
}

export interface Placement {
	/** Top-left corner of each button, viewport px. */
	up: { x: number; y: number };
	down: { x: number; y: number };
	size: number;
	layout: QuickScrollLayout;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where the two buttons go. `pane` is the scroller's visible box in viewport px; `gutter` is the width its
 * vertical scrollbar takes (0 for an overlay scrollbar); `avoid` are boxes of floating controls the buttons
 * must not cover (the Studio's "New slide" button). A pane too short to hold a rail falls back to the stack.
 *
 * Avoidance moves a button AWAY from the pane edge it is anchored to: a bottom button lifts above the
 * control, a top rail button drops below it. It never moves sideways, so the buttons keep their column
 * against the scrollbar.
 */
export function place(pane: Box, gutter: number, layout: QuickScrollLayout, avoid: readonly Box[] = []): Placement {
	const size = SIZE[layout];
	const height = pane.bottom - pane.top;
	const effective: QuickScrollLayout = layout === 'rail' && height < size * 4 + INSET * 2 ? 'stack' : layout;
	const x = pane.right - gutter - INSET - size;
	const column = (y: number): Box => ({ left: x, top: y, right: x + size, bottom: y + size });
	const inColumn = avoid.filter((a) => a.left < x + size && x < a.right && a.top < pane.bottom && pane.top < a.bottom);

	// Lift the bottom-anchored button(s) above every avoid box they would cover.
	let downY = pane.bottom - INSET - size;
	const span = () => (effective === 'stack' ? { left: x, top: downY - GAP - size, right: x + size, bottom: downY + size } : column(downY));
	for (let guard = 0; guard < inColumn.length + 1; guard++) {
		const hit = inColumn.find((a) => overlaps(span(), a));
		if (!hit) break;
		downY = hit.top - GAP - size;
	}

	let upY = effective === 'stack' ? downY - GAP - size : pane.top + INSET;
	if (effective === 'rail') {
		for (let guard = 0; guard < inColumn.length + 1; guard++) {
			const hit = inColumn.find((a) => overlaps(column(upY), a));
			if (!hit) break;
			upY = hit.bottom + GAP;
		}
	}
	return { up: { x, y: upY }, down: { x, y: downY }, size, layout: effective };
}

/** True when the placement still fits inside the pane (a crowded pane hides the control rather than spill it). */
export function fits(p: Placement, pane: Box): boolean {
	const top = Math.min(p.up.y, p.down.y);
	const bottom = Math.max(p.up.y, p.down.y) + p.size;
	return top >= pane.top && bottom <= pane.bottom && (p.layout === 'stack' || p.up.y + p.size + GAP <= p.down.y);
}
