import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { hasMermaid } from './slide-thumb';

// ── A POOL OF PREVIEW FRAMES THAT ARE NEVER DESTROYED (#1538) ───────────────────────
//
// WHY THIS EXISTS. Every thumbnail grid in the Studio renders its tiles as real engine
// documents, and the windowing that bounds them works by TEARING ONE DOWN when a tile
// scrolls away. Measured on WebKit — the engine an iPhone runs — a torn-down preview
// document is never given back:
//
//   5 cycles of "create 16 engine frames, destroy them, idle 12s", MB over base AFTER
//   the teardown, with zero frames alive:
//     Chromium   170 → 86 → 87 → 79 → 78     (reclaims; flat)
//     WebKit     149 → 230 → 282 → 401 → 442 (monotonic ratchet)
//
// So browsing the 69-tile add-slide gallery costs ~69 documents' worth of memory on
// WebKit no matter how small the window is — the window is what CREATES the churn.
// Measured on the real Studio: +784 MB retained with 8 live tiles, against 69 × ~11 MB
// ≈ 760 MB predicted. Recycling harder makes it worse, not better.
//
// WHAT FIXES IT is not fewer live documents but fewer documents EVER CREATED. A pool
// keeps N frames alive for the lifetime of the grid and RE-POINTS them: a tile scrolling
// in takes a slot and the slot's existing document is patched to show the new slide.
// `single-slide-render.ts` already has that path and states its property outright — "the
// same iframe + same realm, restyled. No reparse of the runtime, no new realm." Measured,
// same harness, 5 rounds of swapping all 16 tiles to different content:
//
//     WebKit, recreate   175 → 274 → 357 → 480 → 579 → 603   (ratchets)
//     WebKit, re-point   197 → 195 → 198 → 205 → 209 → 213   (flat)
//
// ── WHY THE TILES STAY INTERACTIVE, which is the first question anyone asks ──────────
// They never stopped being. The preview frame is `pointer-events-none` today and always
// was — a decorative render behind a real button. Every interactive thing in these grids
// is parent DOM: the insert button, the looks toggle, the search field, the facet tabs,
// the variant panel. A tile now renders an EMPTY box where its frame used to be, keeps
// all of its chrome, and the pixels arrive from a pooled frame positioned over that box.
// Nothing about focus, hit-testing, keyboard or the accessibility tree changes.
//
// ── WHY THE LAYER SCROLLS WITH THE CONTENT ──────────────────────────────────────────
// The slot layer is `position:absolute` INSIDE the grid's own scroll content, not fixed
// over the viewport. So it scrolls natively with the tiles and a slot's offset from its
// tile is invariant under scroll — there is no per-frame sync, and therefore no way for
// a tile's picture to lag behind its label. Positions are recomputed only when the LAYOUT
// moves (resize, a filter changing the result set, a looks panel opening a row).
//
// ── WHY NOT ONE DOCUMENT FOR THE WHOLE GRID ─────────────────────────────────────────
// Measured cheaper still (~60 MB for all 69 tiles) and rejected: a local component ships
// its own CSS (`extraCss`), and in one shared document that CSS applies to EVERY tile.
// One saved component with a `.name` rule would restyle the gallery. Per-tile documents
// keep that isolation, which is why the pool is frames rather than sections.

export type PooledPreviewProps = {
	options: SingleSlideOptions;
	sample: string;
	slideIndex?: number;
	slideCount?: number;
	slideMarkdown?: string;
	mermaid?: boolean;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	extraCss?: string;
	specimen?: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };

type Tile = {
	id: number;
	el: HTMLElement;
	props: PooledPreviewProps;
	inBand: boolean;
	/** Bumped every time the tile re-enters the band, so eviction order is LRU. */
	seq: number;
};

/**
 * Which slots a tile may be re-pointed into WITHOUT a full document rewrite.
 *
 * `single-slide-render`'s patch path is taken only when the render signature is unchanged —
 * theme, mode, geometry, the mermaid flag and the author CSS. The MARKDOWN is deliberately not
 * in that signature, which is exactly what makes a pool possible: a slot can show any other
 * slide of the same shape for free. A tile whose shape differs forces a full srcdoc write, a
 * fresh realm, and on WebKit a permanent one — so slots are keyed by shape and a tile prefers a
 * slot that already matches. Within one gallery almost everything shares a key; the diagram
 * bucket (mermaid) and saved local components (their own CSS) are the two that do not.
 */
function shapeKey(p: PooledPreviewProps): string {
	const mermaid = p.mermaid ?? hasMermaid(p.sample);
	return `${mermaid ? 'M' : '-'}|${p.extraCss || ''}|${p.paletteOverride || ''}|${p.modeOverride || ''}|${p.extraTheme?.name || ''}`;
}

type PoolApi = {
	register: (tile: Tile) => void;
	unregister: (id: number) => void;
	setInBand: (id: number, inBand: boolean) => void;
	updateProps: (id: number, props: PooledPreviewProps) => void;
};

const PoolContext = React.createContext<PoolApi | null>(null);

/** How many frames a pool may grow to. It never shrinks — releasing a frame is the thing this
 *  whole module exists to avoid — so this is the ceiling on documents for the grid's lifetime.
 *  Sized above the largest in-band set measured on any surface (12-17 tiles at 390-1440px). */
const MAX_SLOTS = 10;

/** Minimum gap between re-point passes. Long enough that a flick settles into one reassignment
 *  rather than sixty, short enough that letting go feels immediate. */
const APPLY_MS = 220;
/** How long a tile keeps its slot after leaving the band. Absorbs an edge flicker, and covers
 *  the common "scroll a little and come back" without a re-point. */
const RELEASE_GRACE = 600;

/**
 * Owns one grid's frames. Wrap the grid's scroll CONTENT — the element whose height is the
 * scrollable extent — so the slot layer scrolls with it.
 *
 * One pool per grid rather than one per app, deliberately: two grids open at once (the picker
 * and its looks panel) have different coordinate spaces, and a pool's positions are only
 * meaningful inside one of them.
 */
export function PreviewPool({ children, className }: { children: React.ReactNode; className?: string }) {
	const layerRef = React.useRef<HTMLDivElement>(null);
	const tiles = React.useRef(new Map<number, Tile>());
	const seq = React.useRef(0);
	// slot index → the tile it currently shows, and the shape its document was last built for.
	const [slots, setSlots] = React.useState<{ tileId: number | null; rect: Rect; props: PooledPreviewProps | null; key: string }[]>([]);
	const slotsRef = React.useRef(slots);
	slotsRef.current = slots;
	const pending = React.useRef<number | null>(null);
	const lastApply = React.useRef(0);
	/** Tiles that have left the band but whose slot is not released yet — see RELEASE_GRACE. */
	const leftAt = React.useRef(new Map<number, number>());

	/** Where a tile sits inside the layer. Both scroll together, so this is scroll-invariant and
	 *  only has to be recomputed when the layout itself moves. */
	const rectOf = React.useCallback((el: HTMLElement): Rect => {
		const layer = layerRef.current;
		if (!layer) return { top: 0, left: 0, width: 0, height: 0 };
		const a = el.getBoundingClientRect();
		const b = layer.getBoundingClientRect();
		return { top: a.top - b.top, left: a.left - b.left, width: a.width, height: a.height };
	}, []);

	/**
	 * Re-derive slot assignments from the current in-band set.
	 *
	 * THROTTLED, and this is the difference between the pool working and the pool being
	 * pointless. Re-pointing a slot is only free when the render takes `single-slide-render`'s
	 * PATCH path; a re-point that arrives while the previous write is still in flight falls
	 * through to a full srcdoc write, which mints a fresh realm — the exact thing WebKit does
	 * not reclaim. A flick delivers observer callbacks every frame, so an un-throttled pool
	 * re-points every slot ~60 times a second and manufactures realms faster than the old
	 * per-tile design did. Measured on the first cut: 9 iframe elements (the pool working) but
	 * 50 extra srcdoc writes across four traversals, and +472MB retained.
	 *
	 * So assignments settle rather than track: at most one re-point pass per APPLY_MS, and a
	 * slot is not taken away from a tile until that tile has been out of band for RELEASE_GRACE.
	 * Tiles you are actually looking at are unaffected — they hold their slots throughout.
	 */
	const schedule = React.useCallback(() => {
		if (pending.current !== null) return;
		const wait = Math.max(0, APPLY_MS - (Date.now() - lastApply.current));
		pending.current = window.setTimeout(() => {
			pending.current = null;
			lastApply.current = Date.now();
			const now = Date.now();
			// A tile still inside its grace window keeps its slot, so a tile that flickers across
			// the band edge during a scroll does not cost two re-points.
			const holding = (t: Tile) => t.inBand || (leftAt.current.has(t.id) && now - (leftAt.current.get(t.id) as number) < RELEASE_GRACE);
			// ON SCREEN FIRST, then in-band, then most-recently-seen — and the order is
			// load-bearing, not tidy. Slots are handed out in this order and the list is capped at
			// the pool size, so whatever sorts last is what goes without a preview.
			//
			// Two earlier orderings were wrong in ways worth keeping. Ascending `seq` gave the slots
			// to the OLDEST tiles and starved the ones being looked at. Sorting on `inBand` alone is
			// not enough either: the band reaches 250px past the viewport, and during a downward
			// scroll the most recently entered tiles are the ones BELOW the fold — so recency
			// prefers tiles nobody can see yet over tiles filling the screen right now.
			const seen = (t: Tile) => {
				const r = t.el.getBoundingClientRect();
				return r.bottom > 0 && r.top < (typeof window === 'undefined' ? 0 : window.innerHeight) && r.height > 0;
			};
			const rank = (t: Tile) => (seen(t) ? 0 : t.inBand ? 1 : 2);
			const want = [...tiles.current.values()]
				.filter(holding)
				.sort((a, b) => (rank(a) === rank(b) ? b.seq - a.seq : rank(a) - rank(b)))
				.slice(0, MAX_SLOTS);
			const next = slotsRef.current.map((s) => ({ ...s }));
			const held = new Set<number>();
			// 1. A tile keeps the slot it already has — but ONLY if it survived the cap above.
			//
			//    Testing `holding()` here instead was a real bug and a visible one: a tile that had
			//    scrolled off but was still inside its grace window kept squatting on a slot while a
			//    tile now filling the screen waited for one. Caught by looking at the grid — three
			//    on-screen tiles rendered as empty cards. The priority order is only worth computing
			//    if it also decides who KEEPS a slot, not just who gets a free one.
			const wantIds = new Set(want.map((t) => t.id));
			for (const s of next) {
				if (s.tileId !== null && wantIds.has(s.tileId)) held.add(s.tileId);
				else s.tileId = null;
			}
			// 2. Everything else takes a free slot, preferring one whose document is already the
			//    right SHAPE so the render patches instead of rewriting.
			for (const t of want) {
				if (held.has(t.id)) {
					const mine = next.find((s) => s.tileId === t.id);
					if (mine) {
						mine.props = t.props;
						mine.rect = rectOf(t.el);
					}
					continue;
				}
				const k = shapeKey(t.props);
				let slot = next.find((s) => s.tileId === null && s.key === k) ?? next.find((s) => s.tileId === null);
				if (!slot && next.length < MAX_SLOTS) {
					slot = { tileId: null, rect: { top: 0, left: 0, width: 0, height: 0 }, props: null, key: k };
					next.push(slot);
				}
				if (!slot) break; // every slot is serving a visible tile; the rest wait a beat
				slot.tileId = t.id;
				slot.props = t.props;
				slot.key = k;
				slot.rect = rectOf(t.el);
			}
			setSlots(next);
		}, wait);
	}, [rectOf]);

	const api = React.useMemo<PoolApi>(
		() => ({
			register(tile) {
				tiles.current.set(tile.id, tile);
				schedule();
			},
			unregister(id) {
				tiles.current.delete(id);
				schedule();
			},
			setInBand(id, inBand) {
				const t = tiles.current.get(id);
				if (!t || t.inBand === inBand) return;
				t.inBand = inBand;
				if (inBand) {
					t.seq = ++seq.current;
					leftAt.current.delete(id);
				} else leftAt.current.set(id, Date.now());
				schedule();
			},
			updateProps(id, props) {
				const t = tiles.current.get(id);
				if (!t) return;
				t.props = props;
				if (t.inBand) schedule();
			},
		}),
		[schedule],
	);

	// The layout moving is the ONLY thing that invalidates a position, so it is the only thing
	// that recomputes one. Covers a resize, a column-count change, a filter shortening the grid
	// and a looks panel opening a row — all of which move tiles without any of them scrolling.
	React.useEffect(() => {
		const layer = layerRef.current;
		if (!layer || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => schedule());
		if (layer.parentElement) ro.observe(layer.parentElement);
		return () => ro.disconnect();
	}, [schedule]);

	return (
		<PoolContext.Provider value={api}>
			<div className={cn('relative', className)}>
				{children}
				{/* The frames. `aria-hidden` and `pointer-events-none`: every tile's chrome is a real
				    button in `children` above, and this layer must never take a click or a tab stop. */}
				<div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0">
					{slots.map((s, i) => (
						<div
							// KEYED BY SLOT, NEVER BY TILE — the whole mechanism in one line. React then
							// reuses this DeckPreview across reassignments, so its iframe is never
							// unmounted and the new sample reaches a live document through the patch path.
							// Keying by tile would unmount and remount, which is precisely the teardown
							// WebKit does not reclaim.
							// biome-ignore lint/suspicious/noArrayIndexKey: the slot index IS the identity here.
							key={i}
							className="absolute"
							style={{ top: s.rect.top, left: s.rect.left, width: s.rect.width, height: s.rect.height, visibility: s.tileId === null ? 'hidden' : 'visible' }}
						>
							{s.props ? <DeckPreview {...s.props} mermaid={s.props.mermaid ?? hasMermaid(s.props.sample)} active className="size-full" aria-hidden /> : null}
						</div>
					))}
				</div>
			</div>
		</PoolContext.Provider>
	);
}

let nextTileId = 1;

/**
 * A tile's preview box. Renders NOTHING but an empty box of the right size — the pixels come
 * from a pooled frame positioned over it. Drop-in for `SlideThumbFace`: same props, same
 * `className` contract (the caller passes the box, e.g. `aspect-video w-full`).
 *
 * Outside a `PreviewPool` it renders the placeholder and no preview rather than throwing, so a
 * caller that has not been wrapped yet degrades to an empty tile instead of a crash.
 */
export function PooledThumbFace({ className, ...props }: PooledPreviewProps & { className?: string }) {
	const pool = React.useContext(PoolContext);
	const ref = React.useRef<HTMLDivElement>(null);
	const id = React.useRef(0);
	if (id.current === 0) id.current = nextTileId++;
	// The observer reports band membership; the POOL decides what that earns. Kept separate from
	// the props effect below so a prop change does not re-subscribe the observer.
	React.useEffect(() => {
		const el = ref.current;
		if (!el || !pool) return;
		const tileId = id.current;
		pool.register({ id: tileId, el, props: propsRef.current, inBand: false, seq: 0 });
		if (typeof IntersectionObserver === 'undefined') {
			// No observer (jsdom, very old engines): treat everything as in band. The pool's slot
			// ceiling still bounds the documents, so this degrades to "eager" rather than "unbounded".
			pool.setInBand(tileId, true);
			return () => pool.unregister(tileId);
		}
		const io = new IntersectionObserver(
			(entries) => {
				// READ THE LAST ENTRY, never `entries[0]` — a coalesced batch carries several records
				// for one target and only the last is the observer's current answer. The same hazard,
				// and the same fix, as `useInView` in slide-thumb.tsx, which documents the measurements.
				const e = entries[entries.length - 1];
				if (e) pool.setInBand(tileId, e.isIntersecting);
			},
			// TIGHTER than the 250px the per-tile window used, and for a different reason: there,
			// the margin bought a head start on an expensive cold mount. Here a re-point is a patch
			// into a living document, so the head start is cheap to give up — and every tile the
			// band admits is a slot the pool has to own. 150px still covers most of a row.
			{ rootMargin: '150px' },
		);
		io.observe(el);
		return () => {
			io.disconnect();
			pool.unregister(tileId);
		};
	}, [pool]);

	const propsRef = React.useRef(props);
	propsRef.current = props;
	// Deliberately dependency-less: it runs after EVERY render, which is what keeps a slot's
	// content in step with a tile whose sample changed (a variant token applied, a search
	// re-ranking the same component into a different tile).
	React.useEffect(() => {
		if (pool) pool.updateProps(id.current, propsRef.current);
	});

	return <span ref={ref} className={cn('block', className)} />;
}
