import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';

// Shared windowing + preview face for slide-thumbnail grids — the Present-mode
// Slide Overview (the "slides in Present" sorter) AND the Studio add-slide gallery
// (SlidePicker) both render a grid of live engine thumbnails, so they share ONE
// IntersectionObserver windowing policy and ONE DeckPreview render (HARD RULE #15).
// The CALLER owns the wrapper element: both wrap the face in a single <button> that
// IS the click target — the picker's "+ Insert" affordance is a decorative,
// pointer-events-none overlay, not a nested focusable button, so one button per tile.

/**
 * Does this slide's markdown contain a Mermaid fence? A diagram-bucket component's
 * thumbnail must render as a DIAGRAM, not raw code — `DeckPreview`'s `mermaid` flag
 * gates the runtime injection per render, so a thumbnail grid can't hardcode it.
 */
export function hasMermaid(md: string): boolean {
	return /```mermaid|~~~mermaid|language-mermaid/.test(md);
}

// ── The live-preview BUDGET (#1463) ─────────────────────────────────────────
// Every mounted thumbnail is a real engine render in ITS OWN iframe document, and
// a document is expensive: measured on the built site, scrolling the add-slide
// gallery once from top to bottom took the page from 12 live frames to 62 and
// Chrome's resident set from ~1.1GB to ~1.6GB — about 10MB per tile.
//
// The windowing used to be ONE-WAY: observe → first intersection → `disconnect()`.
// `visible` never went back to false, so a tile that had EVER been on screen kept
// its iframe for the lifetime of the grid, and the count only ever went up (more
// still with looks panels expanded). That is a memory-exhaustion profile, and a
// renderer OOM presents to the user exactly as "the tab died and reloaded".
//
// So the window is now two-way, with its hysteresis supplied by a SHARED BUDGET
// rather than a second distance threshold: a tile mounts when it enters the
// observer's band and STAYS mounted after it leaves, until the grid needs the slot
// back. Only an OUT-OF-BAND tile is ever recycled — a tile you can see is never
// torn down — so the budget caps RETENTION, never what is on screen. Scrolling
// back within the slack (budget minus whatever is in band, ~3 rows on the desktop
// dialog) still costs nothing; scrolling far enough re-renders, which is the trade
// this deliberately makes: a cold tile beats a dead tab.
export const PREVIEW_BUDGET = 32;

type Slot = { inBand: boolean; recycle: () => void };
/** Mounted previews, insertion-ordered by when each was last IN BAND — so the head
 *  is the least-recently-seen tile and eviction order falls out as LRU. Keyed by an
 *  opaque per-tile token, so two grids (the picker and Present's overview) share one
 *  ceiling instead of each minting its own. */
const livePreviews = new Map<object, Slot>();

/** (Re)insert at the tail — the tile is in band, so it is the most recently seen. */
function touchPreview(token: object, slot: Slot): void {
	livePreviews.delete(token);
	livePreviews.set(token, slot);
}

/** Recycle least-recently-seen OUT-OF-BAND previews until the budget is met. If every
 *  mounted preview is in band we simply run over: the on-screen set is not negotiable. */
function enforcePreviewBudget(): void {
	if (livePreviews.size <= PREVIEW_BUDGET) return;
	for (const [token, slot] of livePreviews) {
		if (livePreviews.size <= PREVIEW_BUDGET) return;
		if (slot.inBand) continue;
		livePreviews.delete(token);
		slot.recycle();
	}
}

/** How many previews are mounted right now — for tests and diagnostics only. */
export function livePreviewCount(): number {
	return livePreviews.size;
}

/**
 * Render on scroll-in (default `rootMargin` 250px) and recycle on scroll-far-away —
 * a two-way window over the shared preview budget above. The observer is kept
 * CONNECTED (the one-way version disconnected on first intersection, which is what
 * made the mounted set monotonic — #1463).
 *
 * No `IntersectionObserver` (jsdom / very old browsers) → render eagerly rather than
 * never; the windowing is a perf optimization, not a correctness gate, and those
 * environments have no scroll to accumulate against.
 */
export function useInView<T extends Element>(rootMargin = '250px'): [React.RefObject<T | null>, boolean] {
	const ref = React.useRef<T>(null);
	const [visible, setVisible] = React.useState(false);
	// Stable identity for this tile's registry entry. A ref (not the element) because the
	// entry must survive the element being re-rendered, and must be unique per hook call.
	const tokenRef = React.useRef<object>({});
	// The observer callback needs the CURRENT visibility without re-subscribing on it —
	// re-subscribing is what forced the old hook to disconnect and never look again.
	const visibleRef = React.useRef(visible);
	visibleRef.current = visible;
	React.useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (typeof IntersectionObserver === 'undefined') {
			setVisible(true);
			return;
		}
		const token = tokenRef.current;
		const io = new IntersectionObserver(
			(entries) => {
				// READ THE LAST ENTRY, never `entries[0]`. IntersectionObserver accumulates
				// records and delivers them as one array when its task finally runs, so if the
				// "update intersection observations" step runs twice before that task is
				// serviced — which a flick-scroll over a grid of booting engine iframes does
				// routinely — one target arrives with several entries. Measured on the real
				// Studio: 4–10 coalesced `[intersecting, not-intersecting]` batches per
				// flick-scroll of the gallery.
				//
				// The one-way version could destructure the first entry safely: a dropped
				// record only delayed a mount that was going to happen anyway. This hook keeps
				// PERSISTENT STATE keyed off the read, so a dropped record is permanent
				// corruption — `[in, out]` mounts the tile and marks it `inBand: true` while it
				// is actually out of band, and `enforcePreviewBudget` skips in-band slots, so
				// that slot can never be reclaimed. Poison ~32 of them and the budget can evict
				// nothing: #1463 restored in full, by the very code that fixes it. The
				// symmetrical shape `[out, in]` is what let an ON-SCREEN tile be recycled,
				// falsifying this file's own central invariant.
				//
				// The last entry is the observer's current answer, which is the only one this
				// hook has any use for. (The repo's other two IntersectionObserver call sites —
				// RestyleShowcase, FieldCardsLive — take `entries.some(...)`; the destructure
				// here was the outlier.)
				const e = entries[entries.length - 1];
				if (!e) return;
				if (e.isIntersecting) {
					setVisible(true);
					touchPreview(token, { inBand: true, recycle: () => setVisible(false) });
					enforcePreviewBudget();
				} else if (visibleRef.current) {
					// Left the band but still mounted — it becomes evictable, newest-last, and
					// only actually goes when someone else needs the slot.
					const slot = livePreviews.get(token);
					if (slot) {
						slot.inBand = false;
						enforcePreviewBudget();
					}
				}
			},
			{ rootMargin },
		);
		io.observe(el);
		// If we were ALREADY mounted when this observer was (re)built — a `rootMargin` change,
		// or React re-running the effect — re-register, or the tile would be holding a preview
		// that the budget cannot see and therefore can never reclaim. The observer's first
		// callback corrects `inBand` a tick later.
		if (visibleRef.current) touchPreview(token, { inBand: true, recycle: () => setVisible(false) });
		return () => {
			io.disconnect();
			livePreviews.delete(token);
		};
	}, [rootMargin]);
	return [ref, visible];
}

export type SlideThumbFaceProps = {
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
	 *  without this a local-component thumbnail paints unstyled. */
	extraCss?: string;
	/** Windowing gate — the caller pairs this with `useInView`. False UNMOUNTS the preview
	 *  (see below), so pass a `className` that carries the tile's box (`aspect-video w-full`
	 *  at every call site) and the placeholder holds the layout open. */
	active: boolean;
	className?: string;
};

/**
 * The preview face only — a windowed `<DeckPreview>` with Mermaid auto-detected
 * from the sample. The caller supplies the wrapping element, which owns the
 * accessible NAME; the face itself is `aria-hidden` (a decorative render), so a
 * screen reader hears the tile's button once, never a duplicate figure node.
 *
 * `active: false` UNMOUNTS the preview rather than merely pausing it. Pausing was
 * the bug behind #1463: `DeckPreview`'s `active` gates RE-RENDERS, not the frame —
 * once a tile had rendered, dropping `active` left the whole iframe document resident,
 * so a "windowed" grid still accumulated every tile the user had scrolled past.
 * Unmounting runs `DeckPreview`'s cleanup (`renderer.dispose()` + React removing the
 * `<figure>`), which is what actually returns the memory. The placeholder inherits the
 * same `className`, so the tile's box — and therefore the scroll height — is unchanged.
 */
export function SlideThumbFace({ options, sample, slideIndex, slideCount, slideMarkdown, mermaid, paletteOverride, extraTheme, modeOverride, extraCss, active, className }: SlideThumbFaceProps) {
	if (!active) return <span aria-hidden className={cn('block', className)} />;
	return (
		<DeckPreview
			options={options}
			sample={sample}
			slideIndex={slideIndex}
			slideCount={slideCount}
			slideMarkdown={slideMarkdown}
			mermaid={mermaid ?? hasMermaid(sample)}
			paletteOverride={paletteOverride}
			extraTheme={extraTheme}
			modeOverride={modeOverride}
			extraCss={extraCss}
			active={active}
			className={className}
			// THE thumbnail declaration, made once for every grid that uses this face — the
			// picker's tiles AND its looks panel, Present's slide overview, and Reshape's
			// variant tiles. It stamps the frame so the engine runtime routes its overflow /
			// type-floor watcher to `off`: at this size the marks are unreadable, and the
			// watcher's probe pass forces layout once per frame across the whole grid.
			// (It does NOT remove an observer — see isThumbnailDocument() in lib/runtime.)
			thumbnail
			aria-hidden
		/>
	);
}
