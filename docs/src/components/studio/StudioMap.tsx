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
//   · POSTERS. Once a tile's live picture has rendered and the rail is still, the pool captures it
//     (preview-pool.tsx `onPicture`) and the picture goes into a content-addressed cache
//     (map-rail/poster-cache.ts). A tile past the live budget then shows it instead of a sketch, and so does a
//     live tile while its frame is being re-pointed during a fast scroll. The rail's mounted window is pinned.
//
// Loaded only when the map is on (React.lazy in StudioShell): the Studio's eager bundle is budgeted.

import * as React from 'react';
import { MapRail, type RailStep } from '@/components/map-rail/MapRail';
import { createPosterCache, posterKey } from '@/components/map-rail/poster-cache';
import { useSettled } from '@/components/map-rail/use-settled';
import { wireOf } from '@/components/map-rail/wireframe';
import type { DeckIndex } from '@/lib/deck-outline';
import type { FocusHub } from '@/lib/fuoco/hub';
import { flatPart, partText } from '@/lib/fuoco/outline';
import { useFocus } from '@/lib/fuoco/react';
import { deckDerivedFactsFor, type SingleSlideOptions } from '@/lib/single-slide-render';
import { slideClass } from './lint';
import { liveColor } from './live/live-model';
import { type CapturePicture, PooledThumbFace, PreviewPool } from './preview-pool';
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

/** How many tiles may show a poster at once, and how many bytes of posters the cache keeps beyond the pinned window.
 *  A poster is a JPEG at tile size, measured at about 6 to 15 KB, so 8 MB holds several hundred slides. */
const POSTER_TILES = 24;
const POSTER_BYTES = 8 * 1024 * 1024;

/** A plain (non-underscore) directive comment carries onto every later slide, Marp's rule, so it is part of what a
 *  slide looks like even though it is not in the slide's text. `header` and `footer` set their own slide
 *  only (audit §11r), so they are not carried. */
const CARRIED = /<!--\s*(?!_|(?:header|footer|paginate)\s*:)[A-Za-z][\w-]*\s*:[\s\S]*?-->/g;

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
	// ── POSTERS ── keyed by the slide's text and everything outside it that changes its picture: the look (theme,
	// palette, mode, finish CSS, front matter), the slide's place and the deck's length (a page number), and the plain
	// directives carried from earlier slides. A deck that trips a deck-derived fact (a divider's rail and total, a proof
	// run's ordinal, `glossary: auto`, an expander: single-slide-render.ts `DECK_DERIVED_FACTS`) draws a slide from the
	// whole deck, so its key carries the whole deck and any edit retires its posters.
	// Hashed once per look, so a key is a hash of the slide's text and a short string, not of the theme CSS again.
	const lookHash = React.useMemo(() => {
		const whole = deckDerivedFactsFor(look.sample).length > 0 ? look.sample : '';
		return posterKey(whole, JSON.stringify([look.front, look.paletteOverride ?? '', look.modeOverride ?? '', look.extraTheme?.name ?? '', look.extraTheme?.css ?? '', look.extraCss ?? '', look.options.themeBase, look.items.length]));
	}, [look]);
	const carriedAt = React.useMemo(() => {
		const out: string[] = [];
		let acc = '';
		for (const it of look.items) {
			out.push(acc);
			const found = partText(look.index, it.unit, it.section).match(CARRIED);
			if (found) acc += found.join('');
		}
		return out;
	}, [look]);
	const keyOf = React.useCallback(
		(i: number) => {
			const it = look.items[i];
			return it ? posterKey(partText(look.index, it.unit, it.section), `${lookHash}\u0000${i}\u0000${carriedAt[i]}`) : '';
		},
		[look, lookHash, carriedAt],
	);
	const [cache] = React.useState(() => createPosterCache<string>({ budget: POSTER_BYTES, release: (url) => URL.revokeObjectURL(url) }));
	// A capture that finishes after the map unmounts must not mint an object URL nothing will revoke.
	const mounted = React.useRef(true);
	React.useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			cache.clear();
		};
	}, [cache]);
	const [posterRev, setPosterRev] = React.useState(0);
	const inflight = React.useRef(new Set<string>());
	const onPicture = React.useCallback(
		(i: number, capture: CapturePicture) => {
			const key = keyOf(i);
			if (!key || cache.has(key) || inflight.current.has(key)) return;
			inflight.current.add(key);
			capture().then((blob) => {
				inflight.current.delete(key);
				if (!blob || !mounted.current) return;
				cache.set(key, URL.createObjectURL(blob), blob.size);
				setPosterRev((r) => r + 1);
			});
		},
		[keyOf, cache],
	);
	const onPictureRef = React.useRef(onPicture);
	onPictureRef.current = onPicture;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `posterRev` is the trigger (a poster arrived); the body reads the cache.
	const poster = React.useCallback(
		(i: number) => {
			// The same rule as a live tile: a slide edited since the pictures settled shows its sketch, never an old poster.
			const it = look.items[i];
			if (!it || partText(look.index, it.unit, it.section) !== textOf(i)) return null;
			const url = cache.get(keyOf(i));
			return url ? <img src={url} alt="" draggable={false} className="block size-full object-cover" /> : null;
		},
		[look, textOf, keyOf, cache, posterRev],
	);
	// The pinned window follows the rail's mounted tiles, and is re-keyed when the look changes under them.
	const windowUnits = React.useRef<readonly number[]>([]);
	const onWindow = React.useCallback(
		(units: readonly number[]) => {
			windowUnits.current = units;
			cache.pin('map', units.map(keyOf).filter(Boolean));
		},
		[cache, keyOf],
	);
	React.useEffect(() => cache.pin('map', windowUnits.current.map(keyOf).filter(Boolean)), [cache, keyOf]);

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
			const face = <PooledThumbFace options={look.options} sample={look.sample} slideIndex={i} slideCount={look.items.length} slideMarkdown={look.front + text} drawn={hasDrawnFence(text)} paletteOverride={look.paletteOverride} extraTheme={look.extraTheme} modeOverride={look.modeOverride} extraCss={look.extraCss} className="size-full" onPicture={(capture) => onPictureRef.current(i, capture)} />;
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
	return <MapRail count={items.length} focus={focus} onPick={(i) => go(i)} onStep={onStep} wire={wire} label={label} live={live} poster={poster} posterBudget={POSTER_TILES} onWindow={onWindow} caption={classLabels ? caption : undefined} mark={people ? mark : undefined} wrap={(tiles, report) => <PreviewPool maxSlots={maxSlots} onSettle={report}>{tiles}</PreviewPool>} aspect={aspect} orientation={orientation} stage={STAGE} controls={orientation === 'vertical'} />;
}
