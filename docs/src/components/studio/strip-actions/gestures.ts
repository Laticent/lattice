// THE STRIP'S LISTENERS: the menu's doors, the keyboard shortcuts and drag, for both Studio strips
// (2026-10-27-slide-structure-strip.md §5, §9). Loaded on demand by `useStripMenuGestures` (index.tsx), off the
// Studio's budgeted startup path. Native listeners on the strip's container.

import { attachStripDrag } from './drag';
import { type StripGestureOptions, type StripSlide, sameSlide } from './index';
import { stripShortcut } from './model';

/** Focus the strip's current slide once an action has moved it, unless focus has gone somewhere that took it on
 *  purpose. The action lands a render or two later, so it tries again briefly. */
export function refocusStrip(strip: Element | null): void {
	if (!strip) return;
	const tryFocus = () => {
		const a = document.activeElement;
		if (a && a !== document.body && !strip.contains(a)) return;
		strip.querySelector<HTMLElement>('[data-unit][aria-current="true"]')?.focus({ preventScroll: true });
	};
	requestAnimationFrame(tryFocus);
	for (const ms of [120, 400]) setTimeout(tryFocus, ms);
}

/** Attach every listener to a strip's container; returns the teardown. `opts` is read at each event, never cached. */
export function attachStripGestures(el: HTMLElement, opts: { readonly current: StripGestureOptions }): () => void {
	// Drag first: its click and context-menu listeners swallow what a lift has already answered, ahead of the menu's.
	const detachDrag = attachStripDrag<StripSlide>(el, {
		scroller: () => opts.current.scroller(),
		vertical: !!opts.current.vertical,
		count: () => opts.current.count,
		enabled: () => !!opts.current.actions,
		pick: (tile) => opts.current.slideOf(tile),
		rev: () => opts.current.rev,
		move: (s, to) => opts.current.actions?.move(s, to),
		hold: (s) => opts.current.actions?.openMenu(s, 'pointer'),
	});
	const slideAt = (t: EventTarget | null) => {
		const node = t instanceof Element ? t.closest('[data-unit]') : null;
		return node && el.contains(node) ? opts.current.slideOf(node) : null;
	};
	// A tap on the current slide while its menu is open closes the menu (the press outside it does, in Radix);
	// the click that follows must not open it again.
	let openAtPress = false;
	const onPointerDown = () => {
		openAtPress = !!opts.current.actions?.menu;
	};
	// THE SHORTCUTS FIRE ONLY ON FOCUS THAT ARRIVED BY KEYBOARD (§5): a pointer pick hands focus back to the editor, so
	// Backspace never deletes a slide while the author thinks they are typing. `:focus-visible` cannot say it at
	// keydown, because the key press itself flips the browser's heuristic, so the strip remembers how focus arrived:
	// with a pointer press just before it, or without one (Tab, the arrows, a refocus after an action).
	let pressedAt = -1;
	let keyboardArrived = false;
	const onAnyPointerDown = () => {
		pressedAt = performance.now();
	};
	const onFocusIn = () => {
		keyboardArrived = performance.now() - pressedAt > 300;
	};
	const onClick = (e: MouseEvent) => {
		const a = opts.current.actions;
		const s = slideAt(e.target);
		// `detail` 0 is a click from the keyboard (Enter, Space): that still picks, as it always has.
		if (!a || !s || e.detail === 0 || !sameSlide(s, opts.current.current)) return;
		e.preventDefault();
		e.stopPropagation();
		// Radix closes a menu on a touch only when that tap's click reaches the document, which this click no longer
		// does, so the strip closes it itself.
		if (openAtPress) a.closeMenu();
		else a.openMenu(s, 'pointer');
	};
	// Windows sends `contextmenu` on the context-menu key's release, after the keydown already opened the menu from
	// the keyboard; that echo must not reopen it as a pointer open (which would not hand focus back to the strip).
	let menuKeyAt = -Infinity;
	const onContextMenu = (e: MouseEvent) => {
		const a = opts.current.actions;
		const s = slideAt(e.target);
		if (!a || !s) return;
		e.preventDefault();
		if (performance.now() - menuKeyAt < 600) return;
		a.openMenu(s, 'pointer');
	};
	const onKeyDown = (e: KeyboardEvent) => {
		const a = opts.current.actions;
		const s = a ? slideAt(e.target) : null;
		if (!a || !s || e.isComposing) return;
		if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
			e.preventDefault();
			menuKeyAt = performance.now();
			a.openMenu(s, 'key');
			return;
		}
		const id = stripShortcut(e, a.mac);
		if (!id || !keyboardArrived) return;
		e.preventDefault();
		if (a.shortcut(id, s)) refocusStrip(el);
	};
	const onUserScroll = () => {
		if (opts.current.actions?.menu) opts.current.actions.closeMenu();
	};
	el.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('pointerdown', onAnyPointerDown, true);
	el.addEventListener('focusin', onFocusIn);
	el.addEventListener('click', onClick, true);
	el.addEventListener('contextmenu', onContextMenu);
	el.addEventListener('keydown', onKeyDown);
	el.addEventListener('wheel', onUserScroll, { passive: true });
	el.addEventListener('touchmove', onUserScroll, { passive: true });
	return () => {
		detachDrag();
		el.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('pointerdown', onAnyPointerDown, true);
		el.removeEventListener('focusin', onFocusIn);
		el.removeEventListener('click', onClick, true);
		el.removeEventListener('contextmenu', onContextMenu);
		el.removeEventListener('keydown', onKeyDown);
		el.removeEventListener('wheel', onUserScroll);
		el.removeEventListener('touchmove', onUserScroll);
	};
}
