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

import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { attachStripDrag } from './drag';
import { type StripActionId, type StripMenuItem, type StripShortcut, stripShortcut } from './model';

/** A rendered slide in the full deck: part `part` of block `unit` (the shape of deck-ops' `SlideAt`). */
export type StripSlide = { readonly unit: number; readonly part: number };
export type StripVia = 'pointer' | 'key';

/** What the shell gives a strip. Stable while the menu stays as it is, so a memoized strip does not re-render per keystroke. */
export interface StripActions {
	/** The slide whose menu is open, and how it was opened; null while it is closed. */
	menu: { at: StripSlide; via: StripVia } | null;
	/** The open menu's items (empty while it is closed). */
	items: readonly StripMenuItem[];
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

export const sameSlide = (a: StripSlide | null | undefined, b: StripSlide | null | undefined): boolean => !!a && !!b && a.unit === b.unit && a.part === b.part;

/** The ⋯ beside the current slide, and the menu it anchors. Rendered by a strip next to its current slide only. */
export function SlideMenuButton({ actions, at, className }: { actions: StripActions; at: StripSlide; className?: string }) {
	const open = sameSlide(actions.menu?.at, at);
	// Enter or Space on the ⋯ opens the menu from the keyboard, so closing it hands focus back to the strip.
	const via = React.useRef<StripVia>('pointer');
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	// How the open menu was opened, kept past its closing (the shell has cleared `menu` by the time Radix asks where focus goes).
	const openedVia = React.useRef<StripVia>('pointer');
	if (open && actions.menu) openedVia.current = actions.menu.via;
	return (
		<DropdownMenu modal={false} open={open} onOpenChange={(o) => (o ? actions.openMenu(at, via.current) : actions.closeMenu())}>
			<DropdownMenuTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					aria-label="Slide actions"
					data-strip-menu=""
					onPointerDown={() => {
						via.current = 'pointer';
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') via.current = 'key';
					}}
					className={cn(
						'grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-[var(--accent)] data-[state=open]:border-[var(--accent)] data-[state=open]:text-[var(--accent)] [@media(pointer:coarse)]:size-11',
						className,
					)}
				>
					<MoreHorizontal className="size-4" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				collisionPadding={8}
				data-strip-menu-content=""
				className="min-w-[13rem]"
				// It closes on a pick, Escape, a press outside it, or a scroll the user starts, never because focus moved: a
				// pick's editor focus can land a moment after the menu opens.
				onFocusOutside={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => {
					// Radix would focus the trigger, which an action has usually moved to another slide. A keyboard user goes back
					// to the strip's current slide; a pointer user's focus is left where the pointer put it.
					e.preventDefault();
					if (openedVia.current !== 'key') return;
					const strip = triggerRef.current?.closest('[data-strip]');
					requestAnimationFrame(() => strip?.querySelector<HTMLElement>('[data-unit][aria-current="true"]')?.focus({ preventScroll: true }));
				}}
			>
				{actions.items.map((it) => (
					<DropdownMenuItem
						key={it.id}
						disabled={!!it.disabled}
						variant={it.danger ? 'destructive' : 'default'}
						data-strip-action={it.id}
						onSelect={(e) => {
							if (actions.run(it.id)) e.preventDefault();
						}}
						className="gap-3 [@media(pointer:coarse)]:min-h-11"
					>
						<span>{it.label}</span>
						{it.disabled ? <span className="ml-auto text-[11px] text-muted-foreground">{it.disabled}</span> : <DropdownMenuShortcut className="[@media(pointer:coarse)]:hidden">{it.keys}</DropdownMenuShortcut>}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

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

/**
 * The menu's other doors, on the strip's container: a right-click, Shift+F10 or the context-menu key, and a tap on
 * the slide that is already current. And its one automatic exit, a scroll the user starts. Native listeners, so a
 * strip that renders its slides through someone else's component (the map, through `MapRail`) needs no hook inside it.
 */
export function useStripMenuGestures(ref: React.RefObject<HTMLElement | null>, o: StripGestureOptions): void {
	const opts = React.useRef(o);
	opts.current = o;
	const on = !!o.actions;
	React.useEffect(() => {
		const el = ref.current;
		if (!el || !on) return;
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
	}, [ref, on]);
}
