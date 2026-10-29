// THE SLIDE MENU, and the ways to open it, for both Studio strips (2026-10-27-slide-structure-strip.md §5, §9).
//
// The strips (the pill navigator, `SlideRail.tsx`, and the slide map, `StudioMap.tsx`) render their slides; this module
// adds the actions on top, so the two strips behave as one. It never plugs into `MapRail` itself, which the Playground
// also uses and which cannot edit there: `StudioMap` hands it the rail's container and a ⋯ slot.
//
// Four ways in, one menu: the ⋯ button beside the current slide, a right-click, Shift+F10 or the context-menu key on a
// focused slide, and a tap on the slide that is already current. Opening it makes its slide current first (the shell's
// `openMenu`), so what an action takes is never in doubt; the menu stays on that slide until it closes. It closes on a
// scroll the user starts (wheel, touch), never on one the strip makes itself.
//
// The same listeners carry the strip's keyboard shortcuts (§5's table, `stripShortcut` in model.ts), which fire only on
// focus that arrived by keyboard (§9).

//
// THIS FILE IS THE EAGER HALF, and it is small on purpose: the Studio's startup bundle is budgeted
// (docs/route-budget.json). The menu (menu.tsx), its doors and the shortcuts (gestures.ts) and drag (drag.ts) load on
// demand the moment a strip that edits mounts; until they arrive the ⋯ is a placeholder and the strip only navigates.

import * as React from 'react';
import type { StripActionId, StripMenuState, StripShortcut } from './model';

/** A rendered slide in the full deck: part `part` of block `unit` (the shape of deck-ops' `SlideAt`). */
export type StripSlide = { readonly unit: number; readonly part: number };
export type StripVia = 'pointer' | 'key';

/** What the shell gives a strip. Stable while the menu stays as it is, so a memoized strip does not re-render per keystroke. */
export interface StripActions {
	/** The slide whose menu is open, and how it was opened; null while it is closed. */
	menu: { at: StripSlide; via: StripVia } | null;
	/** What the open menu's items are computed from (`menuItems` in model.ts); null while it is closed. */
	menuState: StripMenuState | null;
	/** Make `at` current (no editor focus, no pane expanding) and open its menu. */
	openMenu: (at: StripSlide, via: StripVia) => void;
	closeMenu: () => void;
	/** Run an item on the menu's slide. True keeps the menu open (Delete arming its confirm). */
	run: (id: StripActionId) => boolean;
	/** Run a strip shortcut on `at`, the slide holding keyboard focus. True when focus should stay in the strip (false
	 *  when the action opened something that takes focus, like the gallery). */
	shortcut: (id: StripShortcut, at: StripSlide) => boolean;
	/** Whether the shortcuts are the Mac's (⌘) or everyone else's (Ctrl). */
	mac: boolean;
	/** Drag's drop: move slide `from` so it lands at deck position `to`, as one step of the undo history. */
	move: (from: StripSlide, to: number) => void;
}

export const sameSlide = (a: StripSlide | null | undefined, b: StripSlide | null | undefined): boolean => !!a && !!b && a.unit === b.unit && a.part === b.part;

export interface StripGestureOptions {
	actions: StripActions | undefined;
	/** The strip slide a DOM node belongs to (its `[data-unit]` button), or null. */
	slideOf: (el: Element) => StripSlide | null;
	/** The strip's current slide. */
	current: StripSlide | null;
	/** The strip's scrolling element: it holds a dragged slide's pointer and scrolls itself near either end. */
	scroller: () => HTMLElement | null;
	vertical?: boolean;
	/** The deck's revision (`DeckIndex.rev`): a drag drops nothing if it changed while the slide was lifted. */
	rev: unknown;
	/** How many slides the strip lists (its `data-unit` runs 0 to count - 1, the deck's places on the full view). */
	count: number;
}

const LazyMenuButton = React.lazy(() => import('./menu').then((m) => ({ default: m.SlideMenuButton })));

/** The ⋯ beside the current slide, and the menu it anchors. Rendered by a strip next to its current slide only. Until
 *  the menu's code arrives, an empty box holds its place so the strip does not shift. */
export function SlideMenuButton(props: { actions: StripActions; at: StripSlide; className?: string }) {
	return (
		<React.Suspense
			fallback={
				<span aria-hidden data-strip-menu="" className={`block size-7 shrink-0 [@media(pointer:coarse)]:size-11 ${props.className ?? ''}`} />
			}
		>
			<LazyMenuButton {...props} />
		</React.Suspense>
	);
}

/**
 * The menu's other doors, on the strip's container: a right-click, Shift+F10 or the context-menu key, and a tap on
 * the slide that is already current; the strip's keyboard shortcuts; drag; and the menu's one automatic exit, a scroll
 * the user starts. Native listeners (gestures.ts), so a strip that renders its slides through someone else's component
 * (the map, through `MapRail`) needs no hook inside it. They load on demand and attach when they arrive.
 */
export function useStripMenuGestures(ref: React.RefObject<HTMLElement | null>, o: StripGestureOptions): void {
	const opts = React.useRef(o);
	opts.current = o;
	const on = !!o.actions;
	React.useEffect(() => {
		const el = ref.current;
		if (!el || !on) return;
		let detach = () => {};
		let gone = false;
		void import('./gestures').then((m) => {
			if (!gone) detach = m.attachStripGestures(el, opts);
		});
		return () => {
			gone = true;
			detach();
		};
	}, [ref, on]);
}
