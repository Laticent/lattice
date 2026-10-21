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
import { createPortal } from 'react-dom';
import { MapRail, type RailStep } from '@/components/map-rail/MapRail';
import { useSettled } from '@/components/map-rail/use-settled';
import { wireOf } from '@/components/map-rail/wireframe';
import { PooledThumbFace, PreviewPool } from '@/components/studio/preview-pool';
import { hasDrawnFence } from '@/components/studio/slide-thumb';
import { type DeckIndex, deckOutliner } from '@/lib/deck-outline';
import { resolveDeckTheme } from '@/lib/deck-theme';
import type { FocusHub } from '@/lib/fuoco/hub';
import { partOfFlat, partText } from '@/lib/fuoco/outline';
import { useFocus } from '@/lib/fuoco/react';
import { flatOfPage, type RenderedIndex } from '@/lib/rendered-index';
import type { SingleSlideOptions } from '@/lib/single-slide-render';

export interface PlaygroundMapProps {
	/** The Playground's one focus hub (lib/playground-sync.ts): the editor feeds it, the preview and the map read it. */
	hub: FocusHub;
	/** The source the preview rendered, and a counter that bumps with each render of it. */
	rendered: { source: string; key: number };
	/** The index of the latest render (rendered-index.ts), lazily computed. */
	getIndex: () => Promise<RenderedIndex> | null;
	/** The deck's slide box. */
	geom: { w: number; h: number };
	/** Explore's current page, or null when the walk has none (Edit, or no render yet). */
	walkPage: number | null;
	/** Palette names a deck's own `theme:` may use. */
	palettes: string[];
	options: SingleSlideOptions;
	orientation: 'vertical' | 'horizontal';
	/** Draw the rail into this element (the walk bar, on a narrow screen) instead of where it is rendered. */
	portal?: HTMLElement | null;
}

export default function PlaygroundMap({ hub, rendered, getIndex, geom, walkPage, palettes, options, orientation, portal }: PlaygroundMapProps) {
	const [ix, setIx] = React.useState<RenderedIndex | null>(null);
	const ixRef = React.useRef<RenderedIndex | null>(null);
	ixRef.current = ix;
	// What the map draws is the deck the preview RENDERED, so its labels, pictures and count agree with the
	// rendered index below. The hub holds the editor's live text, which runs ahead of a render by a
	// debounce, and answers only "which slide is the reader on".
	const deck = React.useMemo(() => deckOutliner.update(null, rendered.source) as DeckIndex, [rendered]);

	// The index of the render. A chunk that fails to load leaves the previous index in place; the next
	// render asks again.
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new render is the trigger; `getIndex` reads the latest one.
	React.useEffect(() => {
		let live = true;
		getIndex()
			?.then((next) => {
				if (live) setIx(next);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [rendered, getIndex]);

	// Explore REPORTS the walk's page. (In Edit the focus sync reads the preview's scroll itself, so the
	// editor hears it even with the map closed.)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the index is a trigger (the walk reports again once it lands); the report reads it through a ref.
	React.useEffect(() => {
		const index = ixRef.current;
		if (walkPage == null || !index || !index.pages.length) return;
		const flat = flatOfPage(index, walkPage);
		if (flat >= 0 && flat !== hub.get().flat) hub.go('preview', { flat });
	}, [walkPage, ix, hub]);

	const flat = useFocus(hub, (f) => f.flat);
	const count = ix ? ix.byFlat.length : 0;
	const outline = deck;
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
			return `Slide ${i + 1}${title ? `, ${title.slice(0, 80)}` : ''}`;
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
	// One element per tile per snapshot: React then skips a tile whose input did not change, so a keystroke does not
	// re-point the pool's frames (the pool's props effect runs after every render of a tile).
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new snapshot is what empties the cache.
	const liveCache = React.useMemo(() => new Map<number, React.ReactNode>(), [snap]);
	const live = React.useCallback(
		(i: number) => {
			const at = snap.outline && i < snap.count ? partOfFlat(snap.outline, i) : null;
			const text = snap.outline && at ? partText(snap.outline, at.unit, at.part) : '';
			// Until the pictures catch up with an edit, a tile whose slide changed keeps its sketch (see StudioMap).
			if (!at || text !== textOf(i)) return null;
			const hit = liveCache.get(i);
			if (hit) return hit;
			const face = <PooledThumbFace options={snap.options} sample={snap.source} slideIndex={i} slideCount={snap.count} slideMarkdown={snap.front + text} drawn={hasDrawnFence(text)} paletteOverride={snap.look.palette} modeOverride={snap.look.mode} className="size-full" />;
			liveCache.set(i, face);
			return face;
		},
		[snap, liveCache, textOf],
	);

	const onStep = React.useCallback((action: RailStep) => void hub.step('rail', action, { pages: false }), [hub]);
	const onPick = React.useCallback((unit: number) => hub.go('rail', { flat: unit }), [hub]);

	const rail = (
		<MapRail
			count={count}
			focus={Math.min(flat, Math.max(0, count - 1))}
			onPick={onPick}
			onStep={onStep}
			wire={wire}
			label={label}
			live={live}
			wrap={(tiles, report) => <PreviewPool onSettle={report}>{tiles}</PreviewPool>}
			aspect={geom.w / geom.h}
			orientation={orientation}
			// The walk bar beside a strip already steps, and draws its own edge.
			controls={orientation === 'vertical'}
			className={portal ? 'border-0' : undefined}
		/>
	);
	return portal ? createPortal(rail, portal) : rail;
}
