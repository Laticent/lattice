import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { type Tier, windowFor } from '@/lib/veduta';
import { type Wireframe, wireframeOf } from '@/lib/wireframe';

/**
 * THE PLAYGROUND'S MAP RAIL: a second window over the same list of slides the filmstrip shows.
 *
 * The filmstrip is a one-frame virtual list (deck-render.js). The rail is the other half of Veduta's `pip`
 * policy: the stage is the one slide in focus, and the map is a strip of small tiles ranked by THE RAIL'S OWN
 * viewport. Each tile is a wireframe (a handful of boxes read from the slide's markup, ./wireframe.ts), and the
 * few nearest the reader are LIVE, a real render of the slide, up to Veduta's shared budget. A deck of 500 slides
 * mounts a screenful of tiles, the same as a deck of 15; the rest are spacers that keep the scrollbar honest.
 *
 * FOCUS IS NOT HELD HERE. The rail reads one number (`focus`, a rendered slide's index) and asks for moves
 * (`onGo`, `onStep`); the host feeds the number from the Fuoco hub the filmstrip's scroll reports into, and
 * turns a request into a scroll of the filmstrip. So the rail, the walk bar and the filmstrip cannot disagree:
 * there is one position and three views of it.
 *
 * Layout only: vertical beside the filmstrip on a wide pane, horizontal below it on a narrow one (`orientation`).
 * Semantics are a listbox: arrows, Home and End move the slide, and the tile in focus is the one tab stop.
 */
export type MapRailProps = {
	/** The rendered slides' markup, one entry per slide in the filmstrip, in order. */
	sections: readonly string[];
	/** The slide in focus (an index into `sections`). */
	focus: number;
	orientation: 'vertical' | 'horizontal';
	/** A slide's width over its height, from the deck's `size:`. */
	aspect: number;
	onGo: (index: number) => void;
	onStep: (action: 'first' | 'prev' | 'next' | 'last') => void;
	/** The live tier (MapRailLive.tsx): a frame pool that wraps the track, and the face of one tile. Absent: every tile is a wireframe. */
	live?: { Pool: React.ComponentType<{ children: React.ReactNode }>; renderFace: (index: number) => React.ReactNode } | null;
	/** How many live faces the whole page may hold, the filmstrip's included. */
	liveBudget?: number;
	/** Accessible name of a tile. */
	labelOf?: (index: number) => string;
};

const GAP = 8;
const PAD = 8;

/** Where the tiles go: a tile's size along the rail's axis and the scroll geometry, from the rail's measured width. */
function geometry(cross: number, aspect: number, orientation: 'vertical' | 'horizontal') {
	const inner = Math.max(24, cross - PAD * 2);
	// Vertical: the tile is as wide as the rail. Horizontal: as tall as the rail, so its width follows the aspect.
	const along = orientation === 'vertical' ? inner / aspect : inner * aspect;
	return { tileCross: inner, tileAlong: along, pitch: along + GAP };
}

export const MapRail = React.memo(function MapRail({ sections, focus, orientation, aspect, onGo, onStep, live, liveBudget = 4, labelOf }: MapRailProps) {
	const count = sections.length;
	const scroller = React.useRef<HTMLDivElement>(null);
	const [box, setBox] = React.useState({ cross: 96, main: 400, pos: 0 });
	const vertical = orientation === 'vertical';

	// Measure the rail and follow its scroll: the two facts the map's window is computed from.
	React.useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const read = () => setBox({ cross: vertical ? el.clientWidth : el.clientHeight, main: vertical ? el.clientHeight : el.clientWidth, pos: vertical ? el.scrollTop : el.scrollLeft });
		read();
		const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
		ro?.observe(el);
		let raf = 0;
		const onScroll = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				read();
			});
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			ro?.disconnect();
			el.removeEventListener('scroll', onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [vertical]);

	const g = geometry(box.cross, aspect, orientation);
	const total = count * g.pitch;

	// Veduta decides which tiles exist and at what fidelity. The stage is one slide (the filmstrip's, in focus);
	// the map is ranked by this rail's own viewport; the live budget is shared between the two.
	const intent = React.useMemo(
		() =>
			windowFor({
				policy: 'pip',
				stage: 'scrolled',
				count,
				focus,
				viewports: { map: { y: box.pos, h: box.main, top: PAD, pitch: g.pitch, cols: 1 } },
				budget: { live: live ? liveBudget : 0, stageTier: 'live', mapTile: live ? 'live' : 'wireframe', cost: { stage: 1, map: 1 } },
			}),
		[count, focus, box.pos, box.main, g.pitch, live, liveBudget],
	);
	const first = intent.mapUnits.length ? intent.mapUnits[0] : 0;
	const last = intent.mapUnits.length ? intent.mapUnits[intent.mapUnits.length - 1] : -1;

	// Keep the focused tile in the rail: scroll the RAIL, never an ancestor (`scrollIntoView` would also scroll the page).
	React.useEffect(() => {
		const el = scroller.current;
		if (!el || count === 0) return;
		const at = PAD + focus * g.pitch;
		const lo = vertical ? el.scrollTop : el.scrollLeft;
		const size = vertical ? el.clientHeight : el.clientWidth;
		if (at < lo || at + g.tileAlong > lo + size) {
			const target = Math.max(0, at - (size - g.tileAlong) / 2);
			if (vertical) el.scrollTop = target;
			else el.scrollLeft = target;
		}
	}, [focus, count, g.pitch, g.tileAlong, vertical]);

	const onKey = (e: React.KeyboardEvent) => {
		const next = vertical ? 'ArrowDown' : 'ArrowRight';
		const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
		const act = e.key === next ? 'next' : e.key === prev ? 'prev' : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
		if (!act) return;
		e.preventDefault();
		onStep(act);
	};

	const Prev = vertical ? ChevronUp : ChevronLeft;
	const Next = vertical ? ChevronDown : ChevronRight;
	const First = vertical ? ChevronsUp : ChevronsLeft;
	const Last = vertical ? ChevronsDown : ChevronsRight;
	const atStart = focus <= 0;
	const atEnd = focus >= count - 1;

	return (
		<aside className="pg-map" data-orientation={orientation} aria-label="Slide map">
			<div className="pg-map-cmds" role="toolbar" aria-label="Slide map commands">
				<button type="button" className="pg-map-cmd" onClick={() => onStep('first')} disabled={atStart} aria-label="First slide" title="First slide">
					<First aria-hidden="true" />
				</button>
				<button type="button" className="pg-map-cmd" onClick={() => onStep('prev')} disabled={atStart} aria-label="Previous slide" title="Previous slide">
					<Prev aria-hidden="true" />
				</button>
				<span className="pg-map-pos" aria-live="polite">
					{count > 0 ? `${Math.min(focus, count - 1) + 1}/${count}` : ''}
				</span>
				<button type="button" className="pg-map-cmd" onClick={() => onStep('next')} disabled={atEnd} aria-label="Next slide" title="Next slide">
					<Next aria-hidden="true" />
				</button>
				<button type="button" className="pg-map-cmd" onClick={() => onStep('last')} disabled={atEnd} aria-label="Last slide" title="Last slide">
					<Last aria-hidden="true" />
				</button>
			</div>
			<div ref={scroller} className="pg-map-scroll" role="listbox" aria-label="Slides" aria-orientation={orientation} onKeyDown={onKey}>
				<TrackPool Pool={live?.Pool}>
				<div className="pg-map-track" style={vertical ? { height: total + PAD * 2 } : { width: total + PAD * 2 }}>
					{intent.mapUnits.map((i) => {
						const tier: Tier = intent.tiers.map.get(i) ?? 'wireframe';
						const selected = i === focus;
						const style: React.CSSProperties = vertical
							? { top: PAD + i * g.pitch, left: PAD, width: g.tileCross, height: g.tileAlong }
							: { left: PAD + i * g.pitch, top: PAD, height: g.tileCross, width: g.tileAlong };
						return (
							<button
								key={i}
								type="button"
								role="option"
								aria-selected={selected}
								aria-label={labelOf ? labelOf(i) : `Slide ${i + 1}`}
								tabIndex={selected ? 0 : -1}
								className={`pg-map-tile${selected ? ' is-focus' : ''}`}
								data-tier={tier}
								data-index={i}
								style={style}
								onClick={() => onGo(i)}
							>
								{tier === 'live' && live ? (live.renderFace(i) ?? <WireframeFace wire={wireframeOf(sections[i])} />) : <WireframeFace wire={wireframeOf(sections[i])} />}
								<span className="pg-map-num" aria-hidden="true">
									{i + 1}
									{tier !== 'live' && wireframeOf(sections[i]).label ? <em>{wireframeOf(sections[i]).label}</em> : null}
								</span>
							</button>
						);
					})}
				</div>
				</TrackPool>
			</div>
			{/* What the rail mounted, for the tests and a person inspecting it: never read by the page itself. */}
			<span hidden data-map-window={`${first}-${last}`} data-map-count={count} />
		</aside>
	);
});

/** The frame pool around the track when there is a live tier, and nothing otherwise. */
function TrackPool({ Pool, children }: { Pool?: React.ComponentType<{ children: React.ReactNode }>; children: React.ReactNode }) {
	return Pool ? <Pool>{children}</Pool> : children;
}

/** A slide drawn as boxes. Pure CSS: each block is a few divs sized in percent of the tile. */
function WireframeFace({ wire }: { wire: Wireframe }) {
	if (wire.empty) return <span className="pg-wire pg-wire-empty" aria-hidden="true" />;
	return (
		<span className="pg-wire" aria-hidden="true">
			{wire.blocks.map((b, i) => {
				const key = i;
				switch (b.k) {
					case 'title':
						return <span key={key} className="pg-wire-title" />;
					case 'text':
						return (
							<span key={key} className="pg-wire-text">
								{Array.from({ length: b.n }, (_, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
									<span key={n} className="pg-wire-line" style={{ width: n === b.n - 1 && b.n > 1 ? '62%' : '100%' }} />
								))}
							</span>
						);
					case 'list':
						return (
							<span key={key} className="pg-wire-list">
								{Array.from({ length: b.n }, (_, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: bullets are positional.
									<span key={n} className="pg-wire-bullet">
										<i />
										<b style={{ width: `${88 - ((n * 13) % 30)}%` }} />
									</span>
								))}
							</span>
						);
					case 'cards':
						return (
							<span key={key} className="pg-wire-cards">
								{Array.from({ length: b.n }, (_, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: cards are positional.
									<i key={n} />
								))}
							</span>
						);
					case 'media':
						return <span key={key} className="pg-wire-media" />;
					case 'chart':
						return (
							<span key={key} className="pg-wire-chart">
								<i style={{ height: '45%' }} />
								<i style={{ height: '80%' }} />
								<i style={{ height: '60%' }} />
								<i style={{ height: '95%' }} />
							</span>
						);
					case 'code':
						return (
							<span key={key} className="pg-wire-code">
								{Array.from({ length: b.n }, (_, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
									<b key={n} style={{ width: `${90 - ((n * 17) % 50)}%` }} />
								))}
							</span>
						);
					case 'table':
						return (
							<span key={key} className="pg-wire-table">
								{Array.from({ length: b.rows }, (_, n) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
									<i key={n} />
								))}
							</span>
						);
					case 'quote':
						return <span key={key} className="pg-wire-quote" />;
					case 'math':
						return <span key={key} className="pg-wire-math" />;
					default:
						return null;
				}
			})}
		</span>
	);
}
