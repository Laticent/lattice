// THE STUDIO'S SLIDE MAP — a rail of the deck's slides beside (or under) the focused preview.
//
// The second connector for Veduta's map window, after the Playground's (playground/PlaygroundMap.tsx).
// The rail itself is generic (map-rail/MapRail.tsx); this host feeds it from the Studio's own pieces:
//
//   · the FOCUS HUB. The Studio's hub already holds the focused part and every view reports to it, so
//     the rail only READS it (`useFocus`) and PICKS through `onPick`, the same call a pill makes, which
//     expands a collapsed preview and moves the hub. There is no second focus and nothing to echo.
//   · the VIEWED SET. A reader lens reshapes the deck (`viewChunks`), so the rail's units are the parts of
//     the chunks on show, in order, exactly as `SlideRail` lists its pills. A unit's number is its place in
//     the view, which is what the counter and the PDF print under that lens.
//   · LIVE TILES from the Studio's pooled preview frames (preview-pool.tsx), drawn from the same look as the
//     main preview (palette, mode, finish CSS) so a tile is the slide the preview shows. The pool reports its
//     capacity and the rail passes it to Veduta's `settle`; the focused preview is priced as the stage under
//     the same live budget (`STAGE`).
//   · LIVE PRESENCE. Where the map sits beside the slide the shell hides the pill navigator (the map is the
//     navigator there), so what the pills carried moves onto the tiles: the dots that say who else is on a slide
//     (`people`) and, outside the Read stop, the slide's component class as a caption (`classLabels`).
//
// Loaded only when the map is on (React.lazy in StudioShell): the Studio's eager bundle is budgeted.

import * as React from 'react';
import { MapRail, type RailStep } from '@/components/map-rail/MapRail';
import { useSettled } from '@/components/map-rail/use-settled';
import { wireOf } from '@/components/map-rail/wireframe';
import type { DeckIndex } from '@/lib/deck-outline';
import type { FocusHub } from '@/lib/fuoco/hub';
import { flatPart, partText } from '@/lib/fuoco/outline';
import { useFocus } from '@/lib/fuoco/react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { slideClass } from './lint';
import { liveColor } from './live/live-model';
import { PooledThumbFace, PreviewPool } from './preview-pool';
import type { RailPerson } from './SlideRail';
import { hasDrawnFence } from './slide-thumb';

export interface StudioMapProps {
	hub: FocusHub;
	index: DeckIndex;
	/** The chunk indices on show, in order: every chunk, or a reader lens's set. */
	view: readonly number[];
	/** Move the focus to a part; the shell's own rail pick (it expands a collapsed preview first). */
	onPick: (unit: number, section: number, via?: { key: boolean }) => void;
	options: SingleSlideOptions;
	/** The viewed deck as the main preview renders it, and its front matter. */
	sample: string;
	front: string;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	extraCss?: string;
	/** The slide's width over its height. */
	aspect: number;
	orientation: 'vertical' | 'horizontal';
	/** People on each chunk (full-deck index), drawn as dots on the chunk's first tile, as the pills draw them. */
	people?: ReadonlyMap<number, readonly RailPerson[]>;
	/** Caption each tile with its slide's component class, as the pills label them outside the Read stop. */
	classLabels?: boolean;
	/** Called once the map has mounted, so the shell hides the pills only when there is a map to replace them. */
	onReady?: () => void;
}

/** The focused preview beside the rail is one live document on the same page, so Veduta charges it to the same
 *  live budget as the tiles and the rail reports the pool's capacity plus this one frame. */
const STAGE = { cost: 1 };

/**
 * A DIAGNOSTIC CEILING for the map's frame pool, read once from `localStorage['lattice-studio-map-slots']` (an
 * integer, clamped by the pool to 1..HARD_MAX_SLOTS). Unset, the pool keeps its own ceiling and nothing changes.
 * It exists so the capacity report can be shown binding on the real Studio (e2e/studio-map.spec.ts): no shipped
 * setting lowers the ceiling, so without it the report always carries 28 and never limits what the rail asks for.
 */
function diagnosticSlots(): number | undefined {
	try {
		const n = Number.parseInt(window.localStorage.getItem('lattice-studio-map-slots') ?? '', 10);
		return Number.isFinite(n) && n > 0 ? n : undefined;
	} catch {
		return undefined;
	}
}

interface Item {
	unit: number;
	section: number;
	flat: number;
}

export default function StudioMap({ hub, index, view, onPick, options, sample, front, paletteOverride, extraTheme, modeOverride, extraCss, aspect, orientation, people, classLabels = false, onReady }: StudioMapProps) {
	const items = React.useMemo(() => {
		const out: Item[] = [];
		for (const unit of view) {
			const parts = index.units[unit]?.parts.length ?? 0;
			for (let section = 0; section < parts; section++) out.push({ unit, section, flat: flatPart(index, unit, section) });
		}
		return out;
	}, [index, view]);

	// The focused part's place in the view. A focus a lens hides sits on the nearest shown part before it, or on
	// none (-1) when the lens shows nothing before it: Next then goes to the first shown slide.
	const flat = useFocus(hub, (f) => f.flat);
	const focus = React.useMemo(() => {
		let at = -1;
		for (let i = 0; i < items.length; i++) if (items[i].flat <= flat) at = i;
		return at;
	}, [items, flat]);

	const textOf = React.useCallback((i: number) => (items[i] ? partText(index, items[i].unit, items[i].section) : ''), [items, index]);
	const wire = React.useCallback((i: number) => wireOf(textOf(i)), [textOf]);

	const go = React.useCallback(
		(i: number, via?: { key: boolean }) => {
			const it = items[Math.max(0, Math.min(items.length - 1, i))];
			if (it) onPick(it.unit, it.section, via);
		},
		[items, onPick],
	);
	const onStep = React.useCallback(
		(a: RailStep, via?: { key: boolean }) => go(a === 'first' ? 0 : a === 'last' ? items.length - 1 : a === 'next' ? focus + 1 : focus - 1, via),
		[go, items.length, focus],
	);
	// The pictures follow the deck once typing pauses (use-settled.ts); the sketches follow it at once.
	const input = React.useMemo(() => ({ sample, front, index, items, options, paletteOverride, extraTheme, modeOverride, extraCss }), [sample, front, index, items, options, paletteOverride, extraTheme, modeOverride, extraCss]);
	const look = useSettled(input);
	// One element per tile per look: React then skips a tile whose input did not change, so a keystroke does not
	// re-point the pool's frames (the pool's props effect runs after every render of a tile).
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new look is what empties the cache.
	const liveCache = React.useMemo(() => new Map<number, React.ReactNode>(), [look]);
	const live = React.useCallback(
		(i: number) => {
			const it = look.items[i];
			const text = it ? partText(look.index, it.unit, it.section) : '';
			// Until the pictures catch up with an edit, a tile whose slide changed keeps its sketch: a stale
			// picture of another slide, or one past the settled deck's end, is worse than none.
			if (!it || text !== textOf(i)) return null;
			const hit = liveCache.get(i);
			if (hit) return hit;
			const face = <PooledThumbFace options={look.options} sample={look.sample} slideIndex={i} slideCount={look.items.length} slideMarkdown={look.front + text} drawn={hasDrawnFence(text)} paletteOverride={look.paletteOverride} extraTheme={look.extraTheme} modeOverride={look.modeOverride} extraCss={look.extraCss} className="size-full" />;
			liveCache.set(i, face);
			return face;
		},
		[look, liveCache, textOf],
	);

	const mark = React.useCallback(
		(i: number) => {
			const it = items[i];
			const here = it && it.section === 0 ? people?.get(it.unit) : undefined;
			if (!here || here.length === 0) return null;
			return (
				<span className="flex -space-x-1">
					{here.slice(0, 3).map((x) => (
						<span key={x.id} className="size-2.5 rounded-full border border-[var(--bg)]" style={{ background: liveColor(x.color) }} />
					))}
				</span>
			);
		},
		[items, people],
	);

	// A markdown parse per slide, so cached by text: a keystroke re-derives only the slide it touched.
	const classes = React.useRef(new Map<string, string>());
	const caption = React.useCallback(
		(i: number) => {
			const text = textOf(i);
			let c = classes.current.get(text);
			if (c === undefined) {
				if (classes.current.size > 4096) classes.current.clear();
				c = slideClass(text);
				classes.current.set(text, c);
			}
			return c;
		},
		[textOf],
	);

	// The accessible name carries the class too, as a pill's does outside Read; the visible caption is aria-hidden.
	const label = React.useCallback(
		(i: number) => {
			const title = wire(i).title;
			const cls = classLabels ? caption(i) : '';
			return `Slide ${i + 1}${title ? `, ${title.slice(0, 80)}` : ''}${cls ? ` (${cls})` : ''}`;
		},
		[wire, classLabels, caption],
	);

	const onReadyRef = React.useRef(onReady);
	onReadyRef.current = onReady;
	React.useEffect(() => onReadyRef.current?.(), []);

	const [maxSlots] = React.useState(diagnosticSlots);
	return <MapRail count={items.length} focus={focus} onPick={(i) => go(i)} onStep={onStep} wire={wire} label={label} live={live} caption={classLabels ? caption : undefined} mark={people ? mark : undefined} wrap={(tiles, report) => <PreviewPool maxSlots={maxSlots} onSettle={report}>{tiles}</PreviewPool>} aspect={aspect} orientation={orientation} stage={STAGE} controls={orientation === 'vertical'} />;
}
