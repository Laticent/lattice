// THE SLIDE NAVIGATOR — one pill per RENDERED slide, the focused one highlighted and centered.
//
// One pill per rendered slide, not per authored unit: a deck that splits on headings (the
// engine's default) renders `# Title` + two `##` as three slides, and the PDF numbers them
// 1, 2, 3. The rail used to show one pill for the three and number every later slide one
// short of the PDF (backlog #1570). The slide index (docs/src/lib/deck-outline/deck-outline.ts)
// knows where each section begins, so the rail lists those.
//
// IT RE-RENDERS FOR TWO REASONS ONLY: the deck text changed, or the focused slide did. Before
// Fuoco the rail lived inside the Studio shell and re-rendered with it on every caret line
// change, and each render re-derived every pill's component class through a markdown parse
// memoized six entries deep — 120 slides through 6 slots, a 100% miss rate, about 9 ms per
// render on the gallery deck (engineering/decisions/2026-10-15-fuoco-focus-sync.md §4).
// Labels are cached here by text, so a keystroke re-derives only the slide it touched.

import * as React from 'react';
import type { DeckIndex } from '@/lib/deck-outline';
import type { FocusHub } from '@/lib/fuoco/hub';
import { flatPart, partText } from '@/lib/fuoco/outline';
import { useFocus } from '@/lib/fuoco/react';
import { SlideMenuButton, type StripActions, type StripSlide, useStripMenuGestures } from '@/lib/strip-actions/menu';
import { cn } from '@/lib/utils';
import { slideClass, slideTitle } from './lint';
import { type LiveColor, liveColor } from './live/live-model';

// Labels by section text. Bounded by clearing, not by eviction order: the working set is the
// deck's own slides, so a cap far above any real deck only ever trips on a deck switch.
const LABEL_CAP = 4096;
const classLabels = new Map<string, string>();
const titleLabels = new Map<string, string>();
function cached(map: Map<string, string>, text: string, derive: (t: string) => string): string {
	let v = map.get(text);
	if (v === undefined) {
		if (map.size >= LABEL_CAP) map.clear();
		v = derive(text);
		map.set(text, v);
	}
	return v;
}

export interface RailPerson {
	id: string;
	color: LiveColor;
}

export interface SlideRailProps {
	hub: FocusHub;
	index: DeckIndex;
	/** The chunk indices on show, in order: every chunk, or a reader lens's set. */
	view: readonly number[];
	/** The Read stop labels pills by title; the others by component class. */
	readLabels: boolean;
	/** People on each chunk (full-deck index), for the Live presence dots. */
	liveBySlide: ReadonlyMap<number, readonly RailPerson[]>;
	/** `key` is true for an arrow, Home or End on the strip, which must not take keyboard focus away from it. */
	onPick: (unitIndex: number, section: number, via?: { key: boolean }) => void;
	/** The slide menu and its doors (lib/strip-actions), on the full view only; absent, the strip only navigates. */
	actions?: StripActions;
	/** An empty deck's one tile, "+ Add your first slide", where the strip edits. */
	onAddFirst?: () => void;
}

export const SlideRail = React.memo(function SlideRail({ hub, index, view, readLabels, liveBySlide, onPick, actions, onAddFirst }: SlideRailProps) {
	const flat = useFocus(hub, (f) => f.flat);
	const pills = React.useMemo(() => {
		const out: Array<{ unit: number; section: number; flat: number; n: number; label: string; aria: string }> = [];
		let n = 0;
		for (const c of view) {
			const ch = index.units[c];
			if (!ch) continue;
			for (let k = 0; k < ch.parts.length; k++) {
				n++;
				const text = partText(index, c, k);
				const title = cached(titleLabels, text, slideTitle);
				const cls = cached(classLabels, text, slideClass);
				const label = readLabels ? title || `Slide ${n}` : cls;
				const aria = readLabels ? `Slide ${n}${title ? ` — ${title}` : ''}` : `Slide ${n} — ${cls}`;
				out.push({ unit: c, section: k, flat: flatPart(index, c, k), n, label, aria });
			}
		}
		return out;
	}, [index, view, readLabels]);

	// Keep the focused pill in view, centered so the slides on either side show too. Scrolls the
	// rail itself, never an ancestor (`scrollIntoView` would also scroll the page, which jolts a
	// phone). Paging through a split slide's run does not move `flat`, so the rail holds still
	// while the preview pages.
	const navRef = React.useRef<HTMLElement | null>(null);
	// While a slide's menu is open the strip holds still: the menu is anchored beside that slide.
	const holdRef = React.useRef(false);
	holdRef.current = !!actions?.menu;
	const center = React.useCallback((nav: HTMLElement | null, animate: boolean) => {
		if (holdRef.current) return;
		const pill = nav?.querySelector<HTMLElement>('button[aria-current="true"]');
		// The current pill and the menu's ⋯ beside it are centered as one.
		const menu = nav?.querySelector<HTMLElement>('[data-strip-menu]');
		// A zero-width rail has not been laid out yet (measured at mount: width 0, so the
		// centering maths scrolled it 39.5px and the first pill sat half under the rail's own
		// edge). Do nothing now; the ResizeObserver below centers it once it has a width.
		if (!nav || !pill || !nav.clientWidth || nav.scrollWidth <= nav.clientWidth) return;
		const n = nav.getBoundingClientRect();
		const r = pill.getBoundingClientRect();
		const m = menu?.getBoundingClientRect();
		const p = m ? { left: r.left, width: Math.max(r.right, m.right) - r.left } : r;
		const left = nav.scrollLeft + (p.left + p.width / 2) - (n.left + n.width / 2);
		const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		nav.scrollTo({ left: Math.max(0, Math.min(left, nav.scrollWidth - nav.clientWidth)), behavior: animate && !reduce ? 'smooth' : 'auto' });
	}, []);
	// A rail that MOUNTS (back from the article view, a phone rotated back from landscape)
	// starts at scrollLeft 0: center it at once, without animating — and, if it has no width
	// yet, the first time it gets one. Never again on a resize, which would fight a reader who
	// has scrolled the rail by hand.
	const observerRef = React.useRef<ResizeObserver | null>(null);
	const navCallback = React.useCallback(
		(nav: HTMLElement | null) => {
			observerRef.current?.disconnect();
			observerRef.current = null;
			navRef.current = nav;
			center(nav, false);
			if (nav && !nav.clientWidth && typeof ResizeObserver !== 'undefined') {
				const ro = new ResizeObserver(() => {
					if (!nav.clientWidth) return;
					ro.disconnect();
					center(nav, false);
				});
				ro.observe(nav);
				observerRef.current = ro;
			}
		},
		[center],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the focused slide, the pill count and the label set (which changes pill widths) ARE the triggers; the body reads the DOM.
	React.useLayoutEffect(() => {
		center(navRef.current, true);
	}, [flat, pills.length, readLabels]);
	// A menu opening on a pill near the strip's edge brings its ⋯ into view, so the menu never hangs off a button the
	// strip has scrolled away. The strip's own scroll, which never closes the menu.
	const menuOpen = !!actions?.menu;
	React.useLayoutEffect(() => {
		const nav = navRef.current;
		const btn = menuOpen ? nav?.querySelector<HTMLElement>('[data-strip-menu]') : null;
		if (!nav || !btn) return;
		const n = nav.getBoundingClientRect();
		const b = btn.getBoundingClientRect();
		if (b.right > n.right) nav.scrollLeft += b.right - n.right + 8;
		else if (b.left < n.left) nav.scrollLeft -= n.left - b.left + 8;
	}, [menuOpen]);

	const here = pills.find((p) => p.flat === flat);
	const current: StripSlide | null = here ? { unit: here.unit, part: here.section } : null;
	const slideOf = React.useCallback((el: Element) => {
		const p = pills[Number((el as HTMLElement).dataset.unit)];
		return p ? { unit: p.unit, part: p.section } : null;
	}, [pills]);
	useStripMenuGestures(navRef, { actions, slideOf, current });

	// THE KEYBOARD (2026-10-27-slide-structure-strip.md §9): a roving-tabindex list. The current pill is the strip's one
	// tab stop; the arrows, Home and End move the deck's focus and keyboard focus follows it, so the strip keeps focus
	// while it walks. A modified arrow is not a step: ⇧⌘← is Move earlier (lib/strip-actions).
	const keyNav = React.useRef(false);
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !pills.length) return;
		const at = Math.max(0, pills.findIndex((p) => p.flat === flat));
		const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? pills.length - 1 : null;
		if (to === null) return;
		e.preventDefault();
		const p = pills[Math.max(0, Math.min(pills.length - 1, to))];
		if (p.flat === flat) return;
		keyNav.current = true;
		onPick(p.unit, p.section, { key: true });
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: the focused slide is the trigger; the body reads the DOM.
	React.useLayoutEffect(() => {
		if (!keyNav.current) return;
		keyNav.current = false;
		navRef.current?.querySelector<HTMLElement>('button[aria-current="true"]')?.focus({ preventScroll: true });
	}, [flat]);
	const tabStop = here ? here.flat : pills[0]?.flat;

	return (
		<nav ref={navCallback} data-strip="pills" className="flex items-center gap-1.5 overflow-x-auto" aria-label="Slide navigator">
			{!pills.length && onAddFirst && (
				<button type="button" onClick={onAddFirst} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-[var(--accent)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] [@media(pointer:coarse)]:min-h-11">
					+ Add your first slide
				</button>
			)}
			<ol className="m-0 flex list-none items-center gap-1.5 p-0" onKeyDown={onKeyDown}>
			{pills.map((p, i) => {
				const on = p.flat === flat;
				const people = p.section === 0 ? liveBySlide.get(p.unit) : undefined;
				return (
					<li key={`${index.units[p.unit].id}:${p.section}`} className="flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						data-unit={i}
						onClick={() => onPick(p.unit, p.section)}
						aria-current={on}
						aria-label={p.aria}
						tabIndex={p.flat === tabStop ? 0 : -1}
						className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
					>
						<span className={cn('grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold', on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{p.n}</span>
						<span className={cn('text-[11px]', readLabels ? 'max-w-[18ch] truncate font-sans font-medium' : 'font-mono', on ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{p.label}</span>
						{/* Live presence: who else is on this slide (§5.3). Decorative — the Live panel lists it in words. */}
						{people && people.length > 0 && (
							<span aria-hidden className="flex -space-x-1">
								{people.slice(0, 3).map((x) => (
									<span key={x.id} className="size-2.5 rounded-full border border-[var(--bg)]" style={{ background: liveColor(x.color) }} />
								))}
							</span>
						)}
					</button>
					{/* The menu's ⋯ sits BESIDE the current pill, never inside it (a button in a button is not a button), and
					    outside the roving set: Tab reaches it after the pill, the arrows never land on it. */}
					{on && actions && <SlideMenuButton actions={actions} at={{ unit: p.unit, part: p.section }} />}
					</li>
				);
			})}
			</ol>
		</nav>
	);
});
