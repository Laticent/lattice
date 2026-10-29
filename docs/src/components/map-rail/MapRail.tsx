// A MAP OF THE DECK: a rail of small tiles, one per unit, drawn from Veduta's map window.
//
// This is the first connector for Veduta's second window (docs/src/lib/veduta). The rail never
// decides what to mount. Each time the reader scrolls it, resizes it or moves the focus, it asks
// `windowFor` for an intent and mounts exactly that: the tiles near the rail's own view, each at
// the fidelity Veduta names. A tile at `live` gets the host's picture (a pooled preview frame),
// a tile at `wireframe` gets a sketch read from the slide's source, and every other tile is an
// offset in a spacer and costs nothing. A host with no live pictures leaves `live` out, and the
// rail reports that as a live capacity of zero, so the core stops asking for them.
//
// WHY NOT ONE TILE PER UNIT. A deck of 500 slides would hold 500 buttons and, once each wanted a
// picture, 500 frames. The window holds the visible tiles plus two rows either side, so the cost
// follows the rail's size, not the deck's.
//
// The rail knows nothing about decks. It takes a count, a focus and a few callbacks. The Playground
// feeds it from the Fuoco hub and the rendered index (playground/PlaygroundMap.tsx); the Studio
// will feed it from its own hub.

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { createVeduta, type Tier } from '@/lib/veduta';
import type { Block, Wire } from './wireframe';

export type RailStep = 'first' | 'prev' | 'next' | 'last';

export interface MapRailProps {
	/** How many units the rail maps. */
	count: number;
	/** The focused unit, 0-based. */
	focus: number;
	/** The reader picked a unit. */
	onPick: (unit: number) => void;
	/** The reader asked to move by a step; the host resolves it against the focus hub. `key` is true for an arrow, Home or End on the rail, which must not take keyboard focus away from it. */
	onStep: (action: RailStep, via?: { key: boolean }) => void;
	/** The sketch of a unit. Called only for units in the window, and the host should memoize it. */
	wire: (unit: number) => Wire;
	/** The screen-reader name of a unit ("Slide 4, Overview"). */
	label: (unit: number) => string;
	/** The picture of a unit, called only for units Veduta asks at `live`. Omit for a sketch-only rail. */
	live?: (unit: number) => React.ReactNode;
	/** A still picture of a unit (poster-cache.ts), for units Veduta asks at `poster` (a tile that misses the live budget
	 *  falls to it before the sketch) and, while `posterBudget` is above 0, as the floor under a `live` tile, so a tile
	 *  whose pooled frame has not been re-pointed to it yet shows its last picture rather than a sketch. Return null
	 *  when there is none yet: the sketch shows. */
	poster?: (unit: number) => React.ReactNode | null;
	/** How many tiles may be posters at once (default 0, so Veduta never asks for one). */
	posterBudget?: number;
	/** Wraps the tile list, so a host's frame pool can position its frames over the tiles. The pool passes its
	 *  capacity to `report` (a `PreviewPool`'s `onSettle` does), and the rail hands it to Veduta's `settle` as the
	 *  live cap, so no more tiles are asked live than the pool can hold. */
	wrap?: (tiles: React.ReactNode, report: (pool: { capacity: number }) => void) => React.ReactNode;
	/** The slide's width over its height, from the deck's box. */
	aspect: number;
	/** `vertical` is a rail beside the preview; `horizontal` is a strip under it. */
	orientation: 'vertical' | 'horizontal';
	/** The least number of tiles that may be live at once (default 8). The rail raises it to cover the tiles on screen, since the budget caps what a pool RETAINS, never what the reader sees. The pool's reported capacity caps it. */
	liveBudget?: number;
	/** The host's stage (the big preview beside the rail) is a live view on the same page: name what one costs and
	 *  Veduta charges it to the same live budget as the tiles, and ranks it first. The rail adds the same cost to
	 *  the budget and the cap, so it never takes a tile from the map. The Studio's stage is one frame by ruling
	 *  (Veduta README, "Why the Studio's stage is one frame"), so in production this price binds nothing. Omit it
	 *  when the stage is not priced. */
	stage?: { cost: number };
	/** A short visible caption beside a tile's number (the Studio's component class, which the pill navigator showed
	 *  and no slide renders). Called only for mounted tiles. Return '' for none. */
	caption?: (unit: number) => string;
	/** A small decoration for a tile's top corner (the Studio's Live presence dots), called only for mounted tiles.
	 *  Decorative: the host lists the same facts in words elsewhere. Return null for none. */
	mark?: (unit: number) => React.ReactNode | null;
	/** The units the rail has mounted, each time that set changes, so a host can pin their posters (poster-cache.ts). */
	onWindow?: (units: readonly number[]) => void;
	/** Something to sit beside the FOCUSED tile, over its top corner and outside its button (the Studio's slide menu ⋯).
	 *  Called only for the focused unit. The rail knows nothing about what it does. */
	adorn?: (unit: number) => React.ReactNode | null;
	/** Draw first, previous, next and last and the position (default). A host that already has its own stepping beside the rail (a walk bar) turns them off. */
	controls?: boolean;
	className?: string;
}

/** Space round the tiles and between them, in px. */
const PAD = 8;
const GAP = 8;

export interface Geometry {
	/** A tile's size along the scroll axis, and across it. */
	main: number;
	cross: number;
	/** One tile plus its gap: the distance between two tiles' starts. */
	pitch: number;
	/** The length of the scroll content. */
	total: number;
}

/** Tile geometry for a rail whose scroll axis is `viewCross` px thick. Pure, so a test can pin it. */
export function geometryFor(count: number, viewCross: number, aspect: number, orientation: 'vertical' | 'horizontal'): Geometry {
	const a = aspect > 0 ? aspect : 16 / 9;
	const cross = Math.max(1, viewCross - PAD * 2);
	const main = orientation === 'vertical' ? cross / a : cross * a;
	const pitch = main + GAP;
	return { main, cross, pitch, total: PAD * 2 + Math.max(0, count) * pitch - (count > 0 ? GAP : 0) };
}

/** The wireframe's shapes, as SVG in a 0-100 box high and `100 * aspect` wide. */
function Sketch({ wire, aspect }: { wire: Wire; aspect: number }) {
	const w = 100 * (aspect > 0 ? aspect : 16 / 9);
	const m = 7;
	const shapes: React.ReactNode[] = [];
	let y = m;
	if (wire.title) {
		shapes.push(<rect key="t" x={m} y={y} width={Math.min(w - m * 2, 28 + wire.title.length * 1.6)} height={8} rx={1.5} className="fill-current opacity-70" />);
		y += 14;
	}
	const draw = (b: Block, k: number) => {
		const left = w - m * 2;
		switch (b) {
			case 'text':
				shapes.push(<rect key={k} x={m} y={y} width={left} height={3.2} rx={1} className="fill-current opacity-35" />, <rect key={`${k}b`} x={m} y={y + 6} width={left * 0.8} height={3.2} rx={1} className="fill-current opacity-35" />);
				y += 14;
				break;
			case 'list':
				for (let i = 0; i < 3; i++) shapes.push(<circle key={`${k}d${i}`} cx={m + 2} cy={y + 2 + i * 8} r={1.6} className="fill-current opacity-55" />, <rect key={`${k}l${i}`} x={m + 7} y={y + i * 8} width={left * (0.7 - i * 0.1)} height={3.6} rx={1} className="fill-current opacity-35" />);
				y += 26;
				break;
			case 'table':
				shapes.push(<rect key={k} x={m} y={y} width={left} height={22} rx={1.5} className="fill-none stroke-current opacity-45" strokeWidth={0.9} />, <path key={`${k}p`} d={`M${m} ${y + 7.3}H${m + left}M${m} ${y + 14.7}H${m + left}M${m + left / 3} ${y}V${y + 22}M${m + (left * 2) / 3} ${y}V${y + 22}`} className="stroke-current opacity-35" strokeWidth={0.8} fill="none" />);
				y += 28;
				break;
			case 'image':
				shapes.push(<rect key={k} x={m} y={y} width={left} height={26} rx={1.5} className="fill-current opacity-18" />, <path key={`${k}p`} d={`M${m} ${y + 26}L${m + left * 0.35} ${y + 10}L${m + left * 0.6} ${y + 20}L${m + left * 0.8} ${y + 13}L${m + left} ${y + 26}Z`} className="fill-current opacity-30" />);
				y += 32;
				break;
			case 'code':
				shapes.push(<rect key={k} x={m} y={y} width={left} height={24} rx={1.5} className="fill-current opacity-30" />, <rect key={`${k}a`} x={m + 3} y={y + 4} width={left * 0.5} height={2.6} rx={1} className="fill-current opacity-45" />, <rect key={`${k}c`} x={m + 3} y={y + 11} width={left * 0.7} height={2.6} rx={1} className="fill-current opacity-45" />);
				y += 30;
				break;
			case 'quote':
				shapes.push(<rect key={k} x={m} y={y} width={2} height={16} rx={1} className="fill-current opacity-60" />, <rect key={`${k}q`} x={m + 6} y={y + 1} width={left * 0.7} height={3.4} rx={1} className="fill-current opacity-35" />);
				y += 22;
				break;
		}
	};
	wire.blocks.forEach(draw);
	return (
		<svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" role="presentation" aria-hidden className="absolute inset-0 size-full text-[var(--text-muted)]">
			{shapes}
		</svg>
	);
}

interface Plan {
	units: number[];
	tiers: Map<number, Tier>;
	sig: string;
}
const EMPTY: Plan = { units: [], tiers: new Map(), sig: '' };

export function MapRail({ count, focus, onPick, onStep, wire, label, live, poster, posterBudget = 0, caption, mark, adorn, onWindow, wrap, aspect, orientation, liveBudget = 8, stage, controls = true, className }: MapRailProps) {
	const vertical = orientation === 'vertical';
	const scrollerRef = React.useRef<HTMLDivElement>(null);
	const veduta = React.useRef<ReturnType<typeof createVeduta>>(null as unknown as ReturnType<typeof createVeduta>);
	if (!veduta.current) veduta.current = createVeduta();
	const [viewCross, setViewCross] = React.useState(0);
	const [plan, setPlan] = React.useState<Plan>(EMPTY);
	const keyNav = React.useRef(false);
	const keyNavTimer = React.useRef(0);
	React.useEffect(() => () => window.clearTimeout(keyNavTimer.current), []);
	const geo = React.useMemo(() => geometryFor(count, viewCross, aspect, orientation), [count, viewCross, aspect, orientation]);
	const liveOn = !!live;
	const stageOn = !!stage;
	const posterOn = !!poster;
	const stageCost = stage && Number.isFinite(stage.cost) ? Math.max(0, stage.cost) : 0;
	// The pool's capacity, as it reported it (undefined until a pool has, or with no pool at all).
	const [poolCap, setPoolCap] = React.useState<number | undefined>(undefined);
	const report = React.useCallback((pool: { capacity: number }) => {
		if (!Number.isFinite(pool.capacity)) return;
		const cap = Math.max(0, Math.floor(pool.capacity));
		setPoolCap((c) => (c === cap ? c : cap));
	}, []);

	/** Ask Veduta what the rail's view needs and keep the answer if it changed. */
	const refresh = React.useCallback(() => {
		const el = scrollerRef.current;
		if (!el || !count || viewCross <= 0) {
			setPlan((p) => (p.sig === '' ? p : EMPTY));
			return;
		}
		const pos = vertical ? el.scrollTop : el.scrollLeft;
		const len = vertical ? el.clientHeight : el.clientWidth;
		const intent = veduta.current.windowFor({
			policy: 'pip',
			stage: 'paged',
			count,
			focus: Math.max(0, Math.min(count - 1, focus)),
			viewports: { map: { y: pos, h: len, top: PAD, pitch: geo.pitch, cols: 1 } },
			// The budget covers the tiles on screen, plus the stage when the host prices it. It is not capped here: the
			// pool's reported capacity reaches the core through `settle` (below) and caps it there.
			budget: {
				live: (liveOn ? Math.max(liveBudget, Math.ceil(len / geo.pitch) + 1) : 0) + stageCost,
				poster: posterOn && Number.isFinite(posterBudget) ? Math.max(0, posterBudget) : 0,
				wireframe: Infinity,
				stageTier: stageOn ? 'live' : 'placeholder',
				mapTile: liveOn ? 'live' : 'wireframe',
				cost: { stage: stageCost, map: 1 },
			},
		});
		const sig = intent.mapUnits.map((i) => `${i}${intent.tiers.map.get(i)}`).join(',');
		setPlan((p) => (p.sig === sig ? p : { units: intent.mapUnits, tiers: intent.tiers.map, sig }));
	}, [count, focus, geo.pitch, liveBudget, liveOn, posterOn, posterBudget, stageOn, stageCost, vertical, viewCross]);

	// Measure the rail's thickness (the axis the tiles scale to) and re-ask when it changes.
	// The scroller always carries its scrollbar track (`overflow-*-scroll`), so the thickness read here cannot
	// change when the tiles start to overflow: a scrollbar that came and went with the content made the tiles
	// shrink and grow in a loop (React #185 wherever scrollbars take space). `refresh` is read through a ref so
	// this effect does not re-run, and so re-measure, every time it changes.
	const refreshRef = React.useRef(refresh);
	refreshRef.current = refresh;
	React.useLayoutEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const read = () => setViewCross(vertical ? el.clientWidth : el.clientHeight);
		read();
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => {
			read();
			refreshRef.current();
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [vertical]);

	const raf = React.useRef(0);
	const onScroll = React.useCallback(() => {
		if (raf.current) return;
		raf.current = requestAnimationFrame(() => {
			raf.current = 0;
			refresh();
		});
	}, [refresh]);
	React.useEffect(
		() => () => {
			if (raf.current) cancelAnimationFrame(raf.current);
		},
		[],
	);

	// The focus moved, or the list or its geometry did: bring the focused tile into view if it is not
	// (a reader scrolling the rail by hand is left alone while their tile is on screen), then re-ask.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the focus, the pitch and the count are the triggers; the body reads the DOM.
	React.useLayoutEffect(() => {
		const el = scrollerRef.current;
		if (el && count && focus >= 0 && geo.pitch > 0 && viewCross > 0) {
			const start = PAD + focus * geo.pitch;
			const end = start + geo.main;
			const pos = vertical ? el.scrollTop : el.scrollLeft;
			const len = vertical ? el.clientHeight : el.clientWidth;
			if (start < pos || end > pos + len) {
				const to = Math.max(0, start - (len - geo.main) / 2);
				if (vertical) el.scrollTop = to;
				else el.scrollLeft = to;
			}
		}
		refresh();
	}, [focus, geo.pitch, count, viewCross, refresh]);

	// Tell Veduta what is mounted. Only `cap` changes what it asks next (the core reads `map` and `live` only
	// under a test switch), so this keeps the held run for the hysteresis band and reports the live capacity:
	// zero for a host with no pictures, which keeps every tile at the sketch, and otherwise what the pool
	// reported, plus the stage's cost when the host prices its stage, since the cap is page-wide. The very
	// first ask of a mount runs before any settle, so it is uncapped; the settle after it carries the cap and,
	// because that changes what Veduta holds, re-asks at once (the pool clamps the extra meanwhile, so nothing
	// shows). A capacity that changes later re-asks the same way, so a smaller pool is never left over-asked.
	// The one tab stop is the focused tile; when a hand scroll has taken it out of the window, the first mounted tile.
	const tabStop = plan.units.includes(focus) ? focus : (plan.units[0] ?? -1);
	const liveMounted = liveOn ? plan.units.filter((i) => plan.tiers.get(i) === 'live').length : 0;
	const liveCap = !liveOn ? 0 : poolCap === undefined ? undefined : poolCap + stageCost;
	const heldCap = React.useRef<number | undefined>(undefined);
	React.useEffect(() => {
		const next = veduta.current.settle({ map: plan.units, live: liveMounted, ...(liveCap === undefined ? {} : { cap: { live: liveCap } }) });
		const held = next ? next.caps.live : undefined;
		if (held !== heldCap.current) {
			heldCap.current = held;
			refreshRef.current();
		}
	}, [plan, liveMounted, liveCap]);

	const onWindowRef = React.useRef(onWindow);
	onWindowRef.current = onWindow;
	React.useEffect(() => {
		onWindowRef.current?.(plan.units);
	}, [plan]);
	const posterFloor = posterOn && posterBudget > 0;

	// After a key moved the focus, put keyboard focus on the new current tile. A jump (Home, End) lands on a tile
	// the window has not mounted yet, so the request waits for it, and gives up after a second.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the focus and the plan are the triggers (the tile may not be mounted until the plan lands); the body reads the DOM.
	React.useEffect(() => {
		if (!keyNav.current) return;
		const tile = scrollerRef.current?.querySelector<HTMLElement>('button[aria-current="true"]');
		if (tile) {
			keyNav.current = false;
			tile.focus({ preventScroll: true });
			return;
		}
		const t = window.setTimeout(() => {
			keyNav.current = false;
		}, 1000);
		return () => window.clearTimeout(t);
	}, [focus, plan]);

	const onKeyDown = (e: React.KeyboardEvent) => {
		const next = vertical ? 'ArrowDown' : 'ArrowRight';
		const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
		const action: RailStep | null = e.key === next || e.key === (vertical ? 'ArrowRight' : 'ArrowDown') ? 'next' : e.key === prev || e.key === (vertical ? 'ArrowLeft' : 'ArrowUp') ? 'prev' : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
		if (!action) return;
		e.preventDefault();
		// The request lasts a second at most, so a key that moves nothing (at the end of the deck) cannot leave it
		// armed to take keyboard focus from wherever the reader goes next.
		keyNav.current = true;
		window.clearTimeout(keyNavTimer.current);
		keyNavTimer.current = window.setTimeout(() => {
			keyNav.current = false;
		}, 1000);
		onStep(action, { key: true });
	};

	const Prev = vertical ? ChevronUp : ChevronLeft;
	const Next = vertical ? ChevronDown : ChevronRight;
	const First = vertical ? ChevronsUp : ChevronsLeft;
	const Last = vertical ? ChevronsDown : ChevronsRight;
	const atStart = count === 0 || focus <= 0;
	// With no focused tile (a reader lens hides the focus before every shown slide) First is still a move.
	const atFirst = count === 0 || focus === 0;
	const atEnd = count === 0 || focus >= count - 1;
	const btn = 'grid min-h-8 min-w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

	const tiles = (
		<ol className="relative m-0 list-none p-0" style={vertical ? { height: geo.total, width: '100%' } : { width: geo.total, height: '100%' }}>
			{plan.units.map((i) => {
				const tier = plan.tiers.get(i) ?? 'wireframe';
				const on = i === focus;
				const at = PAD + i * geo.pitch;
				// The window mounts a few tiles of a long deck, so each says where it sits in the whole list: a screen reader
				// then hears "4 of 40", as it did on the pill navigator, which listed every slide.
				return (
					<li key={i} aria-setsize={count} aria-posinset={i + 1} className="absolute" style={vertical ? { top: at, left: PAD, width: geo.cross, height: geo.main } : { left: at, top: PAD, height: geo.cross, width: geo.main }}>
						<button
							type="button"
							onClick={() => onPick(i)}
							aria-current={on ? 'true' : undefined}
							aria-label={label(i)}
							tabIndex={i === tabStop ? 0 : -1}
							data-tier={tier}
							data-unit={i}
							className={cn('group relative block size-full text-left outline outline-2 outline-offset-[3px] transition-[outline-color]', on ? 'outline-[var(--accent)]' : 'outline-transparent hover:outline-[color-mix(in_srgb,var(--accent)_45%,var(--border))] focus-visible:outline-[var(--accent)]')}
						>
							{/* The sketch is the floor: it is there before a picture and under one. */}
							{tier !== 'placeholder' && (
								<span className="absolute inset-0 block bg-card">
									<Sketch wire={wire(i)} aspect={aspect} />
								</span>
							)}
							{poster && (tier === 'poster' || (tier === 'live' && posterFloor)) ? <span className="pointer-events-none absolute inset-0 block">{poster(i)}</span> : null}
							{tier === 'live' && live ? <span className="pointer-events-none absolute inset-0 block">{live(i)}</span> : null}
							{mark ? <span aria-hidden className="pointer-events-none absolute right-1 top-1 z-10 flex">{mark(i)}</span> : null}
							<span className="absolute bottom-1 left-1 right-1 z-10 flex min-w-0 items-end gap-1">
									<span className="shrink-0 rounded-sm bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-1 font-mono text-[10px] font-bold leading-4 text-[var(--text-heading)]">{i + 1}</span>
									{caption?.(i) ? <span aria-hidden className="min-w-0 truncate rounded-sm bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-1 font-mono text-[10px] leading-4 text-muted-foreground">{caption(i)}</span> : null}
								</span>
						</button>
						{on && adorn ? adorn(i) : null}
					</li>
				);
			})}
		</ol>
	);

	return (
		<nav aria-label="Slide map" data-map-rail={orientation} className={cn('flex min-h-0 min-w-0 bg-[var(--bg-alt)]', vertical ? 'h-full flex-col border-l border-border' : 'h-full w-full flex-row border-t border-border', className)}>
			{controls && (
			<div className={cn('shrink-0 gap-1 p-1', vertical ? 'grid grid-cols-4 [@media(pointer:coarse)]:grid-cols-2' : 'grid grid-cols-2 content-center')}>
				<button type="button" className={btn} aria-label="Map, first slide" disabled={atFirst} onClick={() => onStep('first')}>
					<First className="size-4" aria-hidden />
				</button>
				<button type="button" className={btn} aria-label="Map, previous slide" disabled={atStart} onClick={() => onStep('prev')}>
					<Prev className="size-4" aria-hidden />
				</button>
				<button type="button" className={btn} aria-label="Map, next slide" disabled={atEnd} onClick={() => onStep('next')}>
					<Next className="size-4" aria-hidden />
				</button>
				<button type="button" className={btn} aria-label="Map, last slide" disabled={atEnd} onClick={() => onStep('last')}>
					<Last className="size-4" aria-hidden />
				</button>
				{vertical && (
					<span className="col-span-4 text-center font-mono text-[10px] text-muted-foreground [@media(pointer:coarse)]:col-span-2" >
						{count ? `${focus >= 0 ? Math.min(count, focus + 1) : '-'} / ${count}` : ''}
					</span>
				)}
			</div>
			)}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys are the roving-tabindex pattern over the tile buttons inside it; the buttons are the interactive elements */}
			<div ref={scrollerRef} onScroll={onScroll} onKeyDown={onKeyDown} className={cn('min-h-0 min-w-0 flex-1', vertical ? 'overflow-y-scroll overflow-x-hidden' : 'overflow-x-scroll overflow-y-hidden')}>
				{wrap ? wrap(tiles, report) : tiles}
			</div>
		</nav>
	);
}
