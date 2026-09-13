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
	/** Slide markdown (front-matter already prepended by the caller for theme/size parity), or —
	 *  with `slideIndex` — a whole deck document. */
	sample: string;
	/** DECK CONTEXT (see DeckPreview's `slideIndex`): `sample` is a whole deck and this 0-based
	 *  slide is the one shown, so the thumbnail carries the page number the engine computes
	 *  against the real deck instead of "1" on every tile. Omit for a standalone sample (the
	 *  add-slide gallery's component skeletons), where 1-of-1 is the truth. */
	slideIndex?: number;
	/** Required with `slideIndex` — see DeckPreview. The count the caller believes, and the shown
	 *  slide alone, so a deck whose sections do not correspond 1:1 to its slides falls back to the
	 *  right slide instead of painting a different one. */
	slideCount?: number;
	slideMarkdown?: string;
	/** Override Mermaid detection. Required alongside `slideIndex`: auto-detection reads
	 *  `sample`, and for a deck document that means ANY mermaid slide would inject the mermaid
	 *  runtime into EVERY thumbnail. Pass the shown slide's own markdown result. */
	mermaid?: boolean;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	/** A local component's own CSS — the engine theme doesn't know a `.name` rule, so
	 *  without this a local-component thumbnail paints unstyled. It is also part of a slot's
	 *  shape key: one document's CSS must never reach another tile. */
	extraCss?: string;
	/**
	 * This tile shows a CATALOG SPECIMEN — a sample the author did not write and cannot edit
	 * — so the engine's authoring alarms (the overflow ring/tab and the type-floor alarm)
	 * have no addressee here and are silenced. See `SingleSlideOptions.specimen`.
	 *
	 * PER-CALLER, deliberately. An earlier face declared it for every thumbnail, which silenced
	 * the alarms in Present's slide overview and Reshape's variant tiles as well — and those show
	 * the AUTHOR'S OWN SLIDES, where a clipped slide is the whole thing the grid is being scanned
	 * for. Measured on the real Studio, an overflowing slide read `rings=1, tabs=1` in the main
	 * preview and `rings=0, tabs=0` on its own overview tile. Being small is not what makes a
	 * preview unworthy of the signal; not being yours is.
	 */
	specimen?: boolean;
};

type Box = { top: number; left: number; width: number; height: number };
/** Where a slot's frame goes, and how much of it the reader may see. `clip` is the part of the
 *  tile that its own scrolling ancestors have not hidden — see `visibleBox`. */
type Rect = Box & { radius?: string; clip?: Box };

/** Does this element CLIP what overflows it? Asked positively, never as `!== 'visible'`: an
 *  unresolved computed style (jsdom answers `''` for a plain div) would otherwise read as clipping,
 *  and a chain of them clips everything down to nothing. */
function clips(cs: CSSStyleDeclaration): boolean {
	return /(auto|scroll|hidden|clip|overlay)/.test(`${cs.overflowX} ${cs.overflowY} ${cs.overflow}`);
}

/**
 * The rounding a tile's own card imposes on its preview, as a `border-radius` shorthand.
 *
 * A pooled frame is NOT inside the tile, so the tile's `overflow-hidden rounded-xl` cannot clip
 * it: the slide paints square corners straight over the card's curve. Measured on Present's
 * overview — the tile's gold border curves and the dark slide fills the corner behind it. So the
 * slot clips itself, copying the radius from the nearest ancestor that actually clips.
 *
 * PER CORNER, because a preview is usually not the whole card. In the add-slide gallery the
 * preview sits at the TOP of a card with the component's name under it, so its bottom corners are
 * square and its top ones are not; in the overview the preview IS the card. Comparing the box's
 * own rect against the clipping ancestor's answers that without anyone declaring it. The border
 * width comes off each radius, because a card's inner curve is tighter than its outer one by
 * exactly that much.
 */
function clipOf(el: HTMLElement): string {
	if (typeof getComputedStyle !== 'function') return '0px';
	const box = el.getBoundingClientRect();
	for (let a = el.parentElement; a; a = a.parentElement) {
		const cs = getComputedStyle(a);
		if (!clips(cs)) continue;
		const r = a.getBoundingClientRect();
		const bw = (side: string) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
		// Only a plain px length can have a border width subtracted from it. A percentage (`50%`)
		// and an elliptical pair (`10px 20px`) both lose their meaning under `parseFloat`, so they
		// pass through untouched — slightly rounder than the card's inner curve, which is invisible,
		// where `parseFloat('50%') + 'px'` would be a different shape altogether.
		// The two ADJACENT sides decide the inset, not one: an asymmetric border (`border-l-4
		// border-t`) insets a corner by the smaller of the two it touches.
		// ONE TOKEN PER CORNER, always, or the four-corner shorthand below is invalid and the browser
		// drops the whole declaration — which paints SQUARE corners, the exact defect this exists to
		// stop. An elliptical radius (`10px 20px`) computes as two tokens, so only the horizontal one
		// survives here; the shape is a hair off and the declaration is legal. A percentage is one
		// token and passes through, because `parseFloat('50%') + 'px'` would be a different shape
		// altogether. Only a plain px length can have a border width subtracted from it.
		// The two ADJACENT sides decide the inset, not one: an asymmetric border (`border-l-4
		// border-t`) insets a corner by the smaller of the two it touches.
		const inset = (value: string, a1: string, a2: string) => {
			const one = value.trim().split(/\s+/)[0] || '0px';
			return /^[\d.]+px$/.test(one) ? `${Math.max(0, parseFloat(one) - Math.min(bw(a1), bw(a2)))}px` : one;
		};
		const near = (x: number, y: number, w: number) => Math.abs(x - y) <= w + 1;
		const top = near(box.top, r.top, bw('top'));
		const bottom = near(box.bottom, r.bottom, bw('bottom'));
		const left = near(box.left, r.left, bw('left'));
		const right = near(box.right, r.right, bw('right'));
		const tl = top && left ? inset(cs.borderTopLeftRadius, 'top', 'left') : '0px';
		const tr = top && right ? inset(cs.borderTopRightRadius, 'top', 'right') : '0px';
		const br = bottom && right ? inset(cs.borderBottomRightRadius, 'bottom', 'right') : '0px';
		const bl = bottom && left ? inset(cs.borderBottomLeftRadius, 'bottom', 'left') : '0px';
		return `${tl} ${tr} ${br} ${bl}`;
	}
	return '0px';
}

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

/**
 * What a slot can NEVER be re-pointed across, as opposed to what it merely prefers.
 *
 * `shapeKey` above is a preference: crossing it costs a full `srcdoc` write, which is expensive
 * but correct. This is a HARD partition, because crossing it would be silently WRONG and no write
 * path fixes it — `DeckPreview` builds its renderer once, on first mount
 * (`createSingleSlideRenderer`, DeckPreview.tsx), so whichever tile lands in a slot first fixes
 * `specimen` and the engine/runtime/theme URLs for every later tile in that slot, however many
 * times the document is rewritten.
 *
 * `specimen` is the one that bites: a catalog sample re-pointed into a slot built for the author's
 * own slide would take that slide's overflow alarm away — the exact regression the `specimen`
 * docstring above exists to warn about, reappearing inside the pool. Every grid today is uniform,
 * so this partitions nothing; it is here so that stays true when one is not.
 */
function identityKey(p: PooledPreviewProps): string {
	const o = p.options;
	return `${p.specimen ? 'S' : '-'}|${o.themeBase}|${o.runtimeUrl}|${o.engineUrl}|${o.katexUrl || ''}`;
}

/**
 * How much of a tile the reader can actually see, in viewport coordinates — its own box,
 * intersected with every ancestor that clips it, and with the viewport.
 *
 * PER TILE, walking the tile's OWN ancestors, and that is the whole point. An earlier cut measured
 * one box for the pool (the layer's scrolling ancestor) and applied it to every tile, which is
 * right until a grid nests a second scroller inside the first — the add-slide gallery's looks
 * panel is `max-h-[46vh] overflow-y-auto` INSIDE the dialog's own scroller. A look tile scrolled
 * out of that panel is still inside the dialog, so the pool called it visible, gave it a slot, and
 * painted its frame at the tile's coordinates: outside the panel, on top of the gallery rows above
 * it. Measured at 390x844, six frames bleeding, four of them over other tiles, and steady — not a
 * flicker. The frames cannot be clipped by the panel because they are not inside it (the layer
 * spans the OUTER scroll content), so the pool has to do the clipping itself, which is what the
 * returned box is for.
 *
 * `overflow: hidden` counts as clipping here, unlike in `scrollParent` where only scrollable
 * ancestors qualify: this asks what is VISIBLE, and a hidden overflow hides just as well.
 */
function visibleBox(el: HTMLElement): { top: number; bottom: number; left: number; right: number } {
	const b = el.getBoundingClientRect();
	let top = b.top;
	let bottom = b.bottom;
	let left = b.left;
	let right = b.right;
	if (typeof getComputedStyle === 'function') {
		for (let a: HTMLElement | null = el.parentElement; a; a = a.parentElement) {
			const cs = getComputedStyle(a);
			if (!clips(cs)) continue;
			const r = a.getBoundingClientRect();
			top = Math.max(top, r.top);
			bottom = Math.min(bottom, r.bottom);
			left = Math.max(left, r.left);
			right = Math.min(right, r.right);
		}
	}
	if (typeof window !== 'undefined') {
		top = Math.max(top, 0);
		left = Math.max(left, 0);
		bottom = Math.min(bottom, window.innerHeight);
		right = Math.min(right, window.innerWidth);
	}
	return { top, bottom, left, right };
}

/** The element a tile actually scrolls inside, or null for the viewport. The observer roots here
 *  so its `rootMargin` means something (see the call site). What is VISIBLE is a different
 *  question, asked per tile by `visibleBox` — a tile can be inside its scroller's subtree and
 *  scrolled out of view, and only one of those two is about clipping. */
function scrollParent(el: HTMLElement): HTMLElement | null {
	if (typeof getComputedStyle !== 'function') return null;
	for (let a: HTMLElement | null = el.parentElement; a; a = a.parentElement) {
		const cs = getComputedStyle(a);
		if (/(auto|scroll|overlay)/.test(cs.overflowY + cs.overflowX)) return a;
	}
	return null;
}

type PoolApi = {
	register: (tile: Tile) => void;
	unregister: (id: number) => void;
	setInBand: (id: number, inBand: boolean) => void;
	updateProps: (id: number, props: PooledPreviewProps) => void;
};

const PoolContext = React.createContext<PoolApi | null>(null);

/**
 * The slot ceiling, and it FOLLOWS WHAT IS ON SCREEN rather than sitting at a constant.
 *
 * A fixed 10 shipped first and was wrong in the one way that matters: a desktop gallery puts
 * 11-12 tiles on screen at 1440x900 and 12 at 1920x1200, so the tiles that lost the cap rendered
 * as permanently empty cards — permanently, because nothing re-runs the assignment pass while the
 * grid sits still. Measured at 1440x900 scrolled to 60%: one fully-visible tile blank at 4s, 8s
 * and 15s; at 1920x1200, two. That is the invariant the design this replaced stated outright —
 * "the budget caps RETENTION, never what is on screen" — broken by its replacement.
 *
 * So the cap is `max(BASE_SLOTS, tiles on screen)`, bounded by `HARD_MAX_SLOTS`. A pool never
 * releases a frame, so it settles at the high-water mark of the biggest grid the session actually
 * looked at — which is the honest cost of never tearing a document down, and is still bounded.
 */
export const BASE_SLOTS = 10;
/** The stop. A runaway on-screen count (a huge display, a future dense grid) must not become a
 *  runaway document count — past this the pool starves the least-recently-seen tiles again, which
 *  is a visible defect rather than an invisible one. */
export const HARD_MAX_SLOTS = 28;

/** Minimum gap between re-point passes. Long enough that a flick settles into one reassignment
 *  rather than sixty, short enough that letting go feels immediate. */
export const APPLY_MS = 220;
/** How long a tile keeps its slot after leaving the band. Absorbs an edge flicker, and covers
 *  the common "scroll a little and come back" without a re-point. */
export const RELEASE_GRACE = 600;

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
	const [slots, setSlots] = React.useState<{ tileId: number | null; rect: Rect; props: PooledPreviewProps | null; key: string; id: string; gen: number }[]>([]);
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
		// The CLIP box comes along, in the same coordinates: the part of the tile its own scrolling
		// ancestors leave visible. Without it a frame paints wherever its tile's coordinates say,
		// even where the tile itself is hidden — see `visibleBox`.
		const v = visibleBox(el);
		return {
			top: a.top - b.top,
			left: a.left - b.left,
			width: a.width,
			height: a.height,
			radius: clipOf(el),
			clip: { top: v.top - b.top, left: v.left - b.left, width: Math.max(0, v.right - v.left), height: Math.max(0, v.bottom - v.top) },
		};
	}, []);

	/**
	 * Re-measure where the assigned slots go, WITHOUT re-deciding who holds one.
	 *
	 * The layer scrolls with the grid's own scroll content, so an outer scroll moves tiles and
	 * frames together and needs no work at all. A NESTED scroller does not: the gallery's looks
	 * panel scrolls its tiles underneath a layer that stays put, so a slot's offset from its tile
	 * changes with every wheel tick. Positions used to be recomputed only when the LAYOUT moved,
	 * and an inner scroll is not a layout move — so a look tile scrolled halfway out of the panel
	 * kept the box it had when it was fully in, and its frame painted over the gallery rows above.
	 *
	 * Cheap by construction: it touches `rect` only, so no slot changes hands and no document is
	 * written. Driven by rAF rather than the APPLY_MS throttle, because a frame that lags its tile
	 * by a fifth of a second while you scroll is exactly the jank the layer was placed inside the
	 * scroll content to avoid.
	 */
	const reposition = React.useCallback(() => {
		setSlots((prev) => {
			let moved = false;
			const next = prev.map((s) => {
				const t = s.tileId === null ? null : tiles.current.get(s.tileId);
				if (!t) return s;
				const rect = rectOf(t.el);
				if (rect.top === s.rect.top && rect.left === s.rect.left && rect.width === s.rect.width && rect.height === s.rect.height && rect.clip?.top === s.rect.clip?.top && rect.clip?.height === s.rect.clip?.height) return s;
				moved = true;
				return { ...s, rect };
			});
			return moved ? next : prev;
		});
	}, [rectOf]);

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
			//
			// ON SCREEN MEANS INSIDE THE SCROLLERS THE TILE ITSELF SITS IN, not inside the window, and
			// the difference is not academic: every grid this serves scrolls inside a container (the
			// picker's dialog, the phone sheet, Reshape's `max-h-[60vh]` popover, the overview's flex
			// column), and the gallery nests a SECOND one — the looks panel — inside the first.
			// Measuring against `window.innerHeight` counted tiles the scroller had clipped away as
			// visible (19 "on screen" against 12 really visible at one desktop offset), and measuring
			// against one box for the whole pool got the nested case wrong the same way one level
			// down. Both collapse this three-tier order into the pure LRU the paragraph above says is
			// not enough, by making almost everything rank 0.
			const seen = (t: Tile) => {
				const v = visibleBox(t.el);
				return v.bottom - v.top > 1 && v.right - v.left > 1;
			};
			const ranked = [...tiles.current.values()].filter(holding).map((t) => ({ t, on: seen(t) }));
			const rank = (x: { t: Tile; on: boolean }) => (x.on ? 0 : x.t.inBand ? 1 : 2);
			// THE CAP COVERS EVERYTHING ON SCREEN, so the sort decides who waits a beat, never who is
			// left staring at an empty card.
			const cap = Math.min(HARD_MAX_SLOTS, Math.max(BASE_SLOTS, ranked.filter((x) => x.on).length));
			const want = ranked
				.sort((a, b) => (rank(a) === rank(b) ? b.t.seq - a.t.seq : rank(a) - rank(b)))
				.slice(0, cap)
				.map((x) => x.t);
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
						// The KEY too. Without this a held slot keeps the shape it was built for while its props
						// move on — a palette or mode toggle changes the key of every tile at once — and the
						// shape-preference lookup below then matches an arriving tile against a document that no
						// longer exists, sending it down the full-write path it exists to avoid.
						mine.key = shapeKey(t.props);
						// The identity cannot change under a held tile — it is the same tile — so it is not
						// re-derived here.
						mine.rect = rectOf(t.el);
					}
					continue;
				}
				const k = shapeKey(t.props);
				const idk = identityKey(t.props);
				// A free slot of the same IDENTITY, preferring one that also matches the shape so the
				// render patches instead of rewriting. Never a slot of another identity, whatever the
				// pressure: that one is not a cost, it is a wrong answer.
				const free = next.filter((s) => s.tileId === null && s.id === idk);
				let slot = free.find((s) => s.key === k) ?? free[0];
				if (!slot && next.length < cap) {
					slot = { tileId: null, rect: { top: 0, left: 0, width: 0, height: 0 }, props: null, key: k, id: idk, gen: 0 };
					next.push(slot);
				}
				if (!slot) {
					// LAST RESORT: re-key a free slot of another identity. Bumping `gen` makes React unmount
					// and remount it, which destroys a document — the thing this module exists to avoid — so it
					// happens only when the alternative is a tile that can never be shown at all. Reachable only
					// in a grid that MIXES identities (none does today) once every slot belongs to the other one:
					// without this the grid would render permanently blank, because nothing re-runs this pass
					// while it sits still. A blank grid is a worse answer than one recycled frame.
					const spare = next.find((x) => x.tileId === null);
					if (!spare) continue;
					spare.id = idk;
					spare.gen++;
					spare.props = null;
					slot = spare;
				}
				slot.tileId = t.id;
				slot.props = t.props;
				slot.key = k;
				slot.rect = rectOf(t.el);
			}
			setSlots(next);
		}, wait);
	}, [rectOf]);

	/** Scrollers BETWEEN a tile and the layer — the ones whose scrolling moves tiles under a layer
	 *  that stays still. Counted once per element and released with the pool. */
	const nested = React.useRef(new Map<HTMLElement, () => void>());
	const raf = React.useRef(0);
	const watchNested = React.useCallback(
		(el: HTMLElement) => {
			const wrapper = layerRef.current?.parentElement;
			if (!wrapper || typeof window === 'undefined') return;
			for (let a: HTMLElement | null = el.parentElement; a && a !== wrapper && wrapper.contains(a); a = a.parentElement) {
				if (nested.current.has(a) || typeof getComputedStyle !== 'function') continue;
				const cs = getComputedStyle(a);
				if (!/(auto|scroll|overlay)/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
				const onScroll = () => {
					if (raf.current) return;
					raf.current = window.requestAnimationFrame(() => {
						raf.current = 0;
						reposition();
					});
				};
				a.addEventListener('scroll', onScroll, { passive: true });
				nested.current.set(a, () => a.removeEventListener('scroll', onScroll));
			}
		},
		[reposition],
	);

	const api = React.useMemo<PoolApi>(
		() => ({
			register(tile) {
				tiles.current.set(tile.id, tile);
				watchNested(tile.el);
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
		[schedule, watchNested],
	);

	// The layout moving is the ONLY thing that invalidates a position, so it is the only thing
	// that recomputes one. Covers a resize, a column-count change, a filter shortening the grid
	// and a looks panel opening a row — all of which move tiles without any of them scrolling.
	// A pass is ALWAYS armed at teardown — unmounting the grid unregisters every tile, and each
	// unregister schedules one — so without this the timer fires up to APPLY_MS later against a null
	// layer and keeps the tile map and every tile's props closure alive past unmount. Harmless to
	// React; not harmless in the one module whose subject is retained memory.
	React.useEffect(
		() => () => {
			if (pending.current !== null) window.clearTimeout(pending.current);
			pending.current = null;
			if (raf.current) window.cancelAnimationFrame(raf.current);
			raf.current = 0;
			for (const off of nested.current.values()) off();
			nested.current.clear();
		},
		[],
	);

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
					{slots.map((s, i) => {
						// TWO BOXES, and the outer one is what stops a frame painting where its tile is
						// hidden. The OUTER box is the visible part of the tile (`rect.clip`) and clips;
						// the INNER box is the tile's WHOLE rect, offset back into place. The frame has to
						// keep the tile's full size because `single-slide-render` scales its render to the
						// host box — cropping that box would shrink the slide instead of cropping it.
						const clip = s.rect.clip ?? { top: s.rect.top, left: s.rect.left, width: s.rect.width, height: s.rect.height };
						const hidden = s.tileId === null || clip.width < 1 || clip.height < 1;
						return (
							<div
								// KEYED BY SLOT, NEVER BY TILE — the whole mechanism in one line. React then
								// reuses this DeckPreview across reassignments, so its iframe is never
								// unmounted and the new sample reaches a live document through the patch path.
								// Keying by tile would unmount and remount, which is precisely the teardown
								// WebKit does not reclaim.
								// biome-ignore lint/suspicious/noArrayIndexKey: the slot index IS the identity here.
								key={`${i}:${s.gen}`}
								className="absolute overflow-hidden"
								style={{ top: clip.top, left: clip.left, width: clip.width, height: clip.height, visibility: hidden ? 'hidden' : 'visible' }}
							>
								<div className="absolute overflow-hidden" style={{ top: s.rect.top - clip.top, left: s.rect.left - clip.left, width: s.rect.width, height: s.rect.height, borderRadius: s.rect.radius }}>
									{s.props ? <DeckPreview {...s.props} mermaid={s.props.mermaid ?? hasMermaid(s.props.sample)} active className="size-full" aria-hidden /> : null}
								</div>
							</div>
						);
					})}
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
			// ROOTED AT THE SCROLLER, not at the viewport, because `rootMargin` is applied to the
			// ROOT only: with a null root the observer still clips against intermediate scrollers and
			// the margin buys nothing on any of these grids (all three scroll inside a container).
			// The margin itself is TIGHTER than the 250px the per-tile window used, and for a
			// different reason: there it bought a head start on an expensive cold mount, while here a
			// re-point is a patch into a living document. 150px covers most of a row.
			{ root: scrollParent(el), rootMargin: '150px' },
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
