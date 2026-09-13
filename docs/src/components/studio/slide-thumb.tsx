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
//
// ── AND THE CEILING FOLLOWS THE BAND, NOT A CONSTANT (#1538) ────────────────
// 32 was one desktop measurement applied to every device, and a phone is not a small
// desktop: it has a fraction of the memory AND shows a fraction of the tiles, so a fixed
// retention ceiling lands hardest exactly where there is least headroom. Measured on the
// built site at budget 32 — a phone was showing THREE slides and paying for THIRTY-ONE:
//
//   viewport     tiles you can see    live documents held
//   1440x900             7                    31
//    820x1180            6                    31
//    390x844             3                    31
//
// The ceiling is now `max(PREVIEW_BUDGET_MIN, whatever is in band)`: retain the band, and
// beyond it the floor. The floor is what keeps the old slack where it is cheap — a grid
// smaller than it (a short looks panel, Present's overview of a small deck) still retains
// everything and re-renders nothing.
//
// WHY NOT SCALE BY VIEWPORT AREA, which is the obvious move and was measured first: it
// fixes the phone and does nothing for a tablet. Area-scaling hands an iPad 24, and 24
// measures no better than 32. Peak resident set above the Studio's own baseline, browsing
// the gallery once, same protocol for every row:
//
//   mapping          390x844          820x1180         1440x900
//   fixed 32         +1237/+1323 MB   +985/+1251 MB    +984 MB
//   area-scaled       +573 MB (10)    +1119 MB (25)    +984 MB (33)
//   THIS (in-band)    +629 MB (11)     +827 MB (12)    +890 MB (17)
//
// — and the column that makes it cheap: visible tiles are 3 / 6 / 7 under EVERY row. The
// budget caps retention and never the on-screen set, so none of this changes what the
// author can see. Following the band also needs no device signal at all, which matters
// because the obvious one is unavailable: WebKit does not implement
// `navigator.deviceMemory`, so it is absent on exactly the devices this is for.
//
// PEAK is the meter, not post-GC retained heap. iOS discards a tab on footprint under
// memory pressure and that discard is what a user reports as "the page reloaded". There is
// no LEAK here and this does not claim to fix one: four open/close cycles settle flat at
// 1011 / 1017 / 1024 / 1026 MB. Measured with no CDP heap client attached, because a forced
// `HeapProfiler.collectGarbage` does not dispose Blink's detached realms and recycling a
// tile mints exactly those — see engineering/gotchas/memory-profiling.md, which is also why
// an earlier pass of this work reported a +144MB per-cycle ratchet that does not exist.
//
// WHAT THIS DOES NOT FIX, so the next person does not re-measure it: the band itself. An
// in-band tile is never recycled, so ~12 live engine documents at 390 and 820 alike are
// irreducible while a tile IS an engine document — which is the whole remaining cost on a
// tablet. Only a cheaper tile addresses that.
export const PREVIEW_BUDGET = 32;

/** The hard ceiling, whatever the band does — a runaway in-band set must not become a
 *  runaway document count. This is the number the constant above used to mean outright. */
const PREVIEW_BUDGET_MAX = PREVIEW_BUDGET;
/** The floor: retain at least this many even when the band is smaller, so a short grid keeps
 *  the free scroll-back the two-way window was built for. */
const PREVIEW_BUDGET_MIN = 8;

/**
 * How many previews may stay mounted right now, given how many are currently IN BAND.
 *
 * Derived per enforcement rather than fixed, which is what makes it self-tuning: it needs no
 * viewport read, no breakpoint and no device signal, and it follows a rotation, a window
 * resize and a column-count change for free, because all three move the band.
 */
export function previewBudget(inBand = 0): number {
	return Math.min(PREVIEW_BUDGET_MAX, Math.max(PREVIEW_BUDGET_MIN, inBand));
}

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
	let inBandNow = 0;
	for (const s of livePreviews.values()) if (s.inBand) inBandNow++;
	const cap = previewBudget(inBandNow);
	if (livePreviews.size <= cap) return;
	for (const [token, slot] of livePreviews) {
		if (livePreviews.size <= cap) return;
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
				// Studio with the observer instrumented, across three flick traversals of the
				// gallery: 87 coalesced batches at 1440px and 24 at 390px, EVERY one of them
				// the shape `[intersecting, not-intersecting]`.
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
				// hook has any use for. (Nothing else in `docs/src` destructures the first entry:
				// of the four other call sites, RestyleShowcase and FieldCardsLive take
				// `entries.some(...)`, and anima/hydrate and deck-preview iterate the whole
				// batch. This one was the outlier.)
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
	/**
	 * This tile shows a CATALOG SPECIMEN — a sample the author did not write and cannot edit
	 * — so the engine's authoring alarms (the overflow ring/tab and the type-floor alarm)
	 * have no addressee here and are silenced. See `SingleSlideOptions.specimen`.
	 *
	 * PER-CALLER, deliberately, and this face is the reason why. It used to declare
	 * `thumbnail` for everyone, which silenced the alarms in Present's slide overview and
	 * Reshape's variant tiles as well — and those show the AUTHOR'S OWN SLIDES, where a
	 * clipped slide is the whole thing the grid is being scanned for. Measured on the real
	 * Studio, an overflowing slide read `rings=1, tabs=1` in the main preview and
	 * `rings=0, tabs=0` on its own overview tile. Being small is not what makes a preview
	 * unworthy of the signal; not being yours is.
	 */
	specimen?: boolean;
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
export function SlideThumbFace({ options, sample, slideIndex, slideCount, slideMarkdown, mermaid, paletteOverride, extraTheme, modeOverride, extraCss, active, className, specimen }: SlideThumbFaceProps) {
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
			specimen={specimen}
			aria-hidden
		/>
	);
}
