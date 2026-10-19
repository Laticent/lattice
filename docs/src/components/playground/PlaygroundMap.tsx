// THE PLAYGROUND'S MAP RAIL — the second window over the deck the preview already shows.
//
// The preview is one filmstrip of PAGES in one iframe, windowed by Veduta's `multi` policy
// (playground/deck-render.js). This rail maps the same deck as PARTS, the rendered slides the PDF
// numbers, and the two are tied together by two things that already existed:
//
//   · the FOCUS HUB (Fuoco). One hub holds the focused part. The preview reports where the reader is
//     (the walk's slide in Explore, the slide with most of the view in Edit) and the rail asks
//     for moves; neither hears its own, because each names its origin.
//   · the RENDERED INDEX (lib/rendered-index.ts). It turns a page into its part and a part into its
//     first page, so a portrait deck whose slides split into several pages, or a deck whose focus
//     steps clone a slide, still has one rail tile per part and a click that lands on the right page.
//
// This module is loaded only when the reader turns the map on (React.lazy in PlaygroundApp), so the
// Playground without a map pays nothing: no hub, no pool, no extra bytes.
//
// LIVE TILES use the Studio's pooled preview frames (studio/preview-pool.tsx), the same ones its slide
// overview draws, so the Playground does not grow a second thumbnail renderer and a WebKit frame is
// re-pointed, never destroyed.

import * as React from 'react';
import { MapRail, type RailStep } from '@/components/map-rail/MapRail';
import { useSettled } from '@/components/map-rail/use-settled';
import { wireOf } from '@/components/map-rail/wireframe';
import { PooledThumbFace, PreviewPool } from '@/components/studio/preview-pool';
import { hasDrawnFence } from '@/components/studio/slide-thumb';
import { type DeckIndex, deckOutliner } from '@/lib/deck-outline';
import { resolveDeckTheme } from '@/lib/deck-theme';
import { createFocusHub } from '@/lib/fuoco/hub';
import { partOfFlat, partText } from '@/lib/fuoco/outline';
import { useFocus } from '@/lib/fuoco/react';
import { flatOfPage, pageOfFlat, type RenderedIndex } from '@/lib/rendered-index';
import type { SingleSlideOptions } from '@/lib/single-slide-render';

export interface PlaygroundMapProps {
	/** The source the preview rendered, and a counter that bumps with each render of it. */
	rendered: { source: string; key: number };
	/** The index of the latest render (rendered-index.ts), lazily computed. */
	getIndex: () => Promise<RenderedIndex> | null;
	/** The deck's slide box. */
	geom: { w: number; h: number };
	/** The frame the preview runs in, for the reading position in Edit. */
	getFrame: () => HTMLIFrameElement | null;
	/** Explore's current page, or null when the walk has none (Edit, or no render yet). */
	walkPage: number | null;
	/** Move the preview to a page. The host decides how (the walk in Explore, a scroll in Edit). */
	onPickPage: (page: number) => void;
	/** Palette names a deck's own `theme:` may use. */
	palettes: string[];
	options: SingleSlideOptions;
	orientation: 'vertical' | 'horizontal';
}

/**
 * The page the reader is on: the slide with the most of itself in the view, the lower one on a tie.
 * This is `readingSlideIndex`'s rule (playground-controller.ts), computed from the first two sections'
 * geometry rather than every band, because the filmstrip's slides are one size and one pitch apart
 * and a scroll event is not the moment to measure five hundred of them.
 *
 * `current` is the page the focus already names. Like the walk's rule, it is kept while at least half
 * as much of it is in view as of the best page: a pick near the end of a deck cannot scroll its slide
 * to the top, and without this the preview would report the slide below it and overrule the pick.
 */
function readingPage(frame: HTMLIFrameElement | null, count: number, current = -1): number | null {
	const win = frame?.contentWindow;
	const secs = frame?.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]');
	if (!win || !secs?.length || !count) return null;
	const r0 = secs[0].getBoundingClientRect();
	const pitch = secs.length > 1 ? secs[1].getBoundingClientRect().top - r0.top : r0.height;
	if (!(pitch > 0) || !(r0.height > 0)) return null;
	const top = win.scrollY + r0.top;
	const from = Math.max(0, Math.floor((win.scrollY - top) / pitch));
	const to = Math.min(count - 1, Math.floor((win.scrollY + win.innerHeight - top) / pitch));
	const seenOf = (i: number) => {
		const start = top + i * pitch;
		return Math.max(0, Math.min(win.scrollY + win.innerHeight, start + r0.height) - Math.max(win.scrollY, start));
	};
	let best = from;
	let bestSeen = -1;
	for (let i = from; i <= to; i++) {
		const seen = seenOf(i);
		if (seen > bestSeen) {
			bestSeen = seen;
			best = i;
		}
	}
	if (current >= 0 && current < count && seenOf(current) * 2 >= bestSeen) return current;
	return Math.min(count - 1, best);
}

export default function PlaygroundMap({ rendered, getIndex, geom, getFrame, walkPage, onPickPage, palettes, options, orientation }: PlaygroundMapProps) {
	const hub = React.useMemo(() => createFocusHub({ outliner: deckOutliner }), []);
	const [ix, setIx] = React.useState<RenderedIndex | null>(null);
	const ixRef = React.useRef<RenderedIndex | null>(null);
	ixRef.current = ix;
	// A pick scrolls the preview, and a scroll in flight passes through every slide on the way. Until it
	// has been still for a moment (or this much time has gone by) the preview does not report, so it
	// cannot move the focus off the slide the reader just asked for. The walk's own guard does this in
	// Explore (walkScrollRef); this is the same idea for the scroll Edit reads.
	const pickUntil = React.useRef(0);
	const SETTLE_MS = 160;
	const MAX_PICK_MS = 1500;

	// The hub learns the deck the preview shows, and the index of that render. They are one pair: the
	// hub is fed first, so by the time the index resolves its outline is the one the index describes.
	React.useEffect(() => {
		hub.update(rendered.source, { by: 'preview' });
		let live = true;
		void getIndex()?.then((next) => {
			if (live) setIx(next);
		});
		return () => {
			live = false;
		};
	}, [hub, rendered, getIndex]);

	// The preview REPORTS where the reader is. Explore knows (the walk); Edit reads the slide with most of the view.
	const report = React.useCallback(
		(page: number | null) => {
			const index = ixRef.current;
			if (page == null || !index || !index.pages.length) return;
			const flat = flatOfPage(index, page);
			if (flat >= 0 && flat !== hub.get().flat) hub.go('preview', { flat });
		},
		[hub],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the index is a trigger (the walk reports again once it lands); report reads it through a ref.
	React.useEffect(() => {
		if (walkPage != null) report(walkPage);
	}, [walkPage, ix, report]);
	React.useEffect(() => {
		if (walkPage != null) return; // Explore reports through the walk
		const frame = getFrame();
		if (!frame) return;
		let raf = 0;
		let timer = 0;
		let lastScroll = 0;
		const read = () => {
			raf = 0;
			if (performance.now() < pickUntil.current && performance.now() - lastScroll < SETTLE_MS) {
				timer = window.setTimeout(schedule, SETTLE_MS / 2);
				return;
			}
			const index = ixRef.current;
			const at = index ? pageOfFlat(index, hub.get().flat) : -1;
			report(readingPage(frame, index?.pages.length ?? 0, at));
		};
		const schedule = () => {
			timer = 0;
			if (!raf) raf = frame.contentWindow?.requestAnimationFrame(read) ?? 0;
		};
		const onScroll = () => {
			lastScroll = performance.now();
			schedule();
		};
		// A full srcdoc write replaces the frame's document and drops every listener on it, while the
		// WindowProxy keeps its identity, so bind to whatever window the frame holds at each load.
		const bind = () => {
			const win = frame.contentWindow;
			win?.removeEventListener('scroll', onScroll);
			win?.addEventListener('scroll', onScroll, { passive: true });
			schedule();
		};
		frame.addEventListener('load', bind);
		bind();
		return () => {
			frame.removeEventListener('load', bind);
			frame.contentWindow?.removeEventListener('scroll', onScroll);
			if (timer) window.clearTimeout(timer);
			if (raf) frame.contentWindow?.cancelAnimationFrame(raf);
		};
	}, [getFrame, hub, report, walkPage]);

	// The rail ASKS for moves; the preview follows them, and only the rail's own (a move the preview
	// reported would scroll the preview to where it already is).
	React.useEffect(
		() =>
			hub.subscribe(
				(f) => f.seq,
				(_seq, f) => {
					const index = ixRef.current;
					if (f.origin !== 'rail' || !index) return;
					const page = pageOfFlat(index, f.flat);
					if (page < 0) return;
					pickUntil.current = performance.now() + MAX_PICK_MS;
					onPickPage(page);
				},
			),
		[hub, onPickPage],
	);

	const flat = useFocus(hub, (f) => f.flat);
	const count = ix ? ix.byFlat.length : 0;
	const outline = hub.outline() as DeckIndex | null;
	const textOf = React.useCallback(
		(i: number) => {
			const at = outline ? partOfFlat(outline, i) : null;
			return outline && at ? partText(outline, at.unit, at.part) : '';
		},
		[outline],
	);
	const wire = React.useCallback((i: number) => wireOf(textOf(i)), [textOf]);
	const label = React.useCallback(
		(i: number) => {
			const title = wire(i).title;
			return `Slide ${i + 1}${title ? `, ${title}` : ''}`;
		},
		[wire],
	);

	// A deck's own `theme:` wins over the site palette, exactly as the preview resolves it.
	const look = React.useMemo(() => {
		const root = document.documentElement;
		return resolveDeckTheme(rendered.source, {
			sitePalette: root.getAttribute('data-palette') || 'cuoio',
			siteMode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
			isKnownTheme: (name) => palettes.includes(name),
		});
	}, [rendered, palettes]);
	const front = outline ? outline.source.slice(0, outline.bodyStart) : '';
	// The pictures follow the deck once typing pauses (use-settled.ts); the sketches follow it at once.
	const input = React.useMemo(() => ({ source: rendered.source, count, front, outline, look, options }), [rendered.source, count, front, outline, look, options]);
	const snap = useSettled(input);
	const live = React.useCallback(
		(i: number) => {
			const at = snap.outline ? partOfFlat(snap.outline, i) : null;
			const text = snap.outline && at ? partText(snap.outline, at.unit, at.part) : '';
			return <PooledThumbFace options={snap.options} sample={snap.source} slideIndex={i} slideCount={snap.count} slideMarkdown={snap.front + text} drawn={hasDrawnFence(text)} paletteOverride={snap.look.palette} modeOverride={snap.look.mode} className="size-full" />;
		},
		[snap],
	);

	const onStep = React.useCallback((action: RailStep) => void hub.step('rail', action, { pages: false }), [hub]);
	const onPick = React.useCallback((unit: number) => hub.go('rail', { flat: unit }), [hub]);

	return (
		<MapRail
			count={count}
			focus={Math.min(flat, Math.max(0, count - 1))}
			onPick={onPick}
			onStep={onStep}
			wire={wire}
			label={label}
			live={live}
			wrap={(tiles) => <PreviewPool>{tiles}</PreviewPool>}
			aspect={geom.w / geom.h}
			orientation={orientation}
		/>
	);
}
