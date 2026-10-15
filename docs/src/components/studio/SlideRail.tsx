// THE SLIDE NAVIGATOR — one pill per RENDERED slide, the focused one highlighted and centered.
//
// One pill per rendered slide, not per authored chunk: a deck that splits on headings (the
// engine's default) renders `# Title` + two `##` as three slides, and the PDF numbers them
// 1, 2, 3. The rail used to show one pill for the three and number every later slide one
// short of the PDF (backlog #1570). The slide index (docs/src/lib/fuoco/deck-index.ts)
// knows where each section begins, so the rail lists those.
//
// IT RE-RENDERS FOR TWO REASONS ONLY: the deck text changed, or the focused slide did. Before
// Fuoco the rail lived inside the Studio shell and re-rendered with it on every caret line
// change, and each render re-derived every pill's component class through a markdown parse
// memoized six entries deep — 120 slides through 6 slots, a 100% miss rate, about 9 ms per
// render on the gallery deck (engineering/decisions/2026-10-15-fuoco-focus-sync.md §4).
// Labels are cached here by text, so a keystroke re-derives only the slide it touched.

import * as React from 'react';
import { type DeckIndex, type FocusHub, flatSection, sectionText } from '@/lib/fuoco';
import { useFocus } from '@/lib/fuoco/react';
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
	onPick: (chunkIndex: number, section: number) => void;
}

export const SlideRail = React.memo(function SlideRail({ hub, index, view, readLabels, liveBySlide, onPick }: SlideRailProps) {
	const flat = useFocus(hub, (f) => f.flat);
	const pills = React.useMemo(() => {
		const out: Array<{ chunk: number; section: number; flat: number; n: number; label: string; aria: string }> = [];
		let n = 0;
		for (const c of view) {
			const ch = index.chunks[c];
			if (!ch) continue;
			for (let k = 0; k < ch.sections.length; k++) {
				n++;
				const text = sectionText(index, c, k);
				const title = cached(titleLabels, text, slideTitle);
				const cls = cached(classLabels, text, slideClass);
				const label = readLabels ? title || `Slide ${n}` : cls;
				const aria = readLabels ? `Slide ${n}${title ? ` — ${title}` : ''}` : `Slide ${n} — ${cls}`;
				out.push({ chunk: c, section: k, flat: flatSection(index, c, k), n, label, aria });
			}
		}
		return out;
	}, [index, view, readLabels]);

	// Keep the focused pill in view, centered so the slides on either side show too. Scrolls the
	// rail itself, never an ancestor (`scrollIntoView` would also scroll the page, which jolts a
	// phone). Paging through a split slide's run does not move `flat`, so the rail holds still
	// while the preview pages.
	const navRef = React.useRef<HTMLElement | null>(null);
	const center = React.useCallback((nav: HTMLElement | null, animate: boolean) => {
		const pill = nav?.querySelector<HTMLElement>('button[aria-current="true"]');
		// A zero-width rail has not been laid out yet (measured at mount: width 0, so the
		// centering maths scrolled it 39.5px and the first pill sat half under the rail's own
		// edge). Do nothing now; the ResizeObserver below centers it once it has a width.
		if (!nav || !pill || !nav.clientWidth || nav.scrollWidth <= nav.clientWidth) return;
		const n = nav.getBoundingClientRect();
		const p = pill.getBoundingClientRect();
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

	return (
		<nav ref={navCallback} className="flex items-center gap-1.5 overflow-x-auto" aria-label="Slide navigator">
			{pills.map((p) => {
				const on = p.flat === flat;
				const people = p.section === 0 ? liveBySlide.get(p.chunk) : undefined;
				return (
					<button
						type="button"
						key={`${index.chunks[p.chunk].id}:${p.section}`}
						onClick={() => onPick(p.chunk, p.section)}
						aria-current={on}
						aria-label={p.aria}
						className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
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
				);
			})}
		</nav>
	);
});
