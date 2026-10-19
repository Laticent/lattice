import type * as React from 'react';
import { buildDeckIndex } from '@/lib/deck-outline';
import { partCount, partOfFlat, partText } from '@/lib/fuoco/outline';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { PooledThumbFace, PreviewPool } from '../studio/preview-pool';
import { hasDrawnFence } from '../studio/slide-thumb';

/**
 * The map rail's LIVE tier: real renders of the slides nearest the reader, drawn by the Studio's pooled frames
 * (studio/preview-pool.tsx), which re-point a few long-lived frames instead of creating one per tile.
 *
 * This file is imported lazily (`import('./MapRailLive')` in PlaygroundApp.tsx), AFTER the first render: it pulls in
 * the single-slide renderer, which the Playground's own filmstrip does not need, and a route's eager JS is budgeted
 * (docs/route-budget.json). Until it arrives, and for any deck it cannot map, every tile is a wireframe.
 */
export type LiveContext = {
	options: SingleSlideOptions;
	/** The deck's source, as the filmstrip rendered it. */
	source: string;
	/** How many slides the filmstrip holds. */
	count: number;
	palette: string;
	mode: 'light' | 'dark';
};

/**
 * What the rail needs to draw live tiles for this deck, or null when it cannot: a live tile is one slide of the
 * WHOLE deck rendered in deck context (so it carries its true page number), addressed by its position among the
 * deck's slides. A portrait deck the preview splits into more pages than the source has slides, or a deck the
 * outline cannot cut the way the engine does, has no such address, and keeps wireframes.
 */
export function liveKit(ctx: LiveContext) {
	const index = buildDeckIndex(ctx.source);
	if (partCount(index) !== ctx.count) return null;
	const frontMatter = ctx.source.slice(0, index.bodyStart);
	return {
		Pool: ({ children }: { children: React.ReactNode }) => <PreviewPool className="pg-map-pool">{children}</PreviewPool>,
		renderFace: (i: number) => {
			const ref = partOfFlat(index, i);
			if (!ref) return null;
			const text = partText(index, ref.unit, ref.part);
			return (
				<PooledThumbFace
					className="pg-map-live"
					options={ctx.options}
					sample={ctx.source}
					slideIndex={i}
					slideCount={ctx.count}
					slideMarkdown={frontMatter + text}
					drawn={hasDrawnFence(text)}
					paletteOverride={ctx.palette}
					modeOverride={ctx.mode}
				/>
			);
		},
	};
}
