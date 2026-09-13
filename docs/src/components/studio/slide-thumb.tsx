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
// So the window is now two-way, with its hysteresis supplied by a SHARED COUNT of
// retained tiles rather than a second distance threshold: a tile mounts when it
// enters the observer's band and stays mounted after it leaves, until it is the
// oldest of more than `PREVIEW_RETAIN` tiles waiting behind the band. Only an
// OUT-OF-BAND tile is ever recycled — a tile you can see is never torn down — so
// the knob caps RETENTION, never what is on screen. Scrolling far enough
// re-renders, which is the trade this deliberately makes: a cold tile beats a
// dead tab.
//
// ── AND THE KNOB COUNTS RETENTION, NOT THE TOTAL (#1538) ───────────────────
// 32 was one desktop measurement applied to every device, and a phone is not a small
// desktop: it has a fraction of the memory AND shows a fraction of the tiles, so a fixed
// cap on the mounted TOTAL lands hardest exactly where there is least headroom. Measured on
// the built site at budget 32 — a phone was showing THREE slides and paying for THIRTY-ONE:
//
//   viewport     tiles you can see    live documents held
//   1440x900             7                    31
//    820x1180            6                    31
//    390x844             3                    31
//
// A cap on the TOTAL conflates two different things: the tiles on screen, which are not
// negotiable and are decided by the viewport, and the tiles kept warm behind you, which are
// negotiable and are the entire memory question. So the knob counts only the second —
// `PREVIEW_RETAIN` out-of-band tiles — and the in-band set is simply never touched. A phone
// and a workstation both retain four; they differ in how many they SHOW, which was never the
// budget's business. Measured across the whole gallery: 33 mounted engine documents became
// 14-15, and what an author can SEE is unchanged at 3 / 6 / 7.
//
// A THIRD BUG had to go with it, and it is why the total used to look random. The observer's
// "left the band" branch was guarded on `visibleRef.current` — React state that is not yet
// committed when a flick delivers the matching leave — so the leave was DROPPED and the tile
// kept an in-band flag while off screen. Stranded tiles are never evictable, so the mounted
// total drifted with however many the last scroll stranded: 15 then 30 across two identical
// WebKit traversals, 24 vs 11 across three identical opens at 390x844. The count is now
// deterministic to ±1 over five runs.
//
// TWO EARLIER SHAPES WERE MEASURED AND REJECTED, both recorded because each looks right:
//
//   · SCALE THE TOTAL BY VIEWPORT AREA. Fixes the phone, does nothing for a tablet — it hands
//     an iPad 24, and 24 measures no better than 32.
//   · DERIVE THE TOTAL FROM THE BAND (`clamp(inBandCount, 8, 32)`). Correct on paper and
//     fragile in fact: the count came from the slots' own `inBand` flags, so ONE stale `true`
//     — the coalesced-delivery hazard this file spends forty lines on — did not merely fail to
//     evict one tile, it raised the ceiling for every tile. Measured on the built site, two
//     identical traversals settled at 32 and then 11 mounted documents at the SAME offset, and
//     on WebKit at 10 then 17. Counting the RETAINED set instead makes a stale flag cost
//     exactly what it should: that one tile survives, and nothing else moves.
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

/**
 * How many OUT-OF-BAND previews the window keeps — the retention slack, and the only knob
 * left now that the ceiling is not a total.
 *
 * The old `PREVIEW_BUDGET = 32` was a cap on the mounted TOTAL, which conflates two different
 * things: the tiles on screen (not negotiable, and viewport-determined) and the tiles kept
 * warm behind you (negotiable, and the entire memory question). Counting only the second makes
 * the knob mean what it is for, and makes it independent of viewport, column count and
 * rotation without reading any of them — a phone and a workstation retain four tiles each; they
 * differ in how many they SHOW, which was never the budget's business.
 *
 * 4 is a measurement, not a guess — the knee of the curve. Peak resident set above the Studio's
 * own baseline while browsing the gallery once, against tiles surviving a 700px scroll away and
 * back (by ELEMENT identity: a remounted tile is present too, so presence proves nothing):
 *
 *   retain      390x844                     820x1180
 *     0       +657 MB   ·  0/3 survive     +695 MB   ·  0/6 survive
 *     4       +722 MB   ·  3/3 survive     +792 MB   ·  3/6 survive
 *     8       +940 MB   ·  3/3 survive     +952 MB   ·  6/6 survive
 *
 * 8 buys a tablet its second half for ~200MB, which is the wrong way round for the device that
 * was being discarded. 0 was measured and briefly shipped, and is the one row that is a
 * REGRESSION rather than a trade: it takes the two-way window's hysteresis away entirely, so a
 * phone re-renders every tile you scroll back to.
 *
 * READ THOSE MB FIGURES AS ±200. Peak RSS is a noisy instrument: five IDENTICAL runs of the
 * shipped code at 390x844 gave 730, 931, 931, 974, 991 MB — a 261MB spread. What survives that
 * noise, and is the honest claim, is (a) the two arms do not OVERLAP — five runs of this design
 * span 730..991 against four of the fixed 32 at 1237..1327 — and (b) the DOCUMENT COUNT is
 * near-deterministic and halves: 33 mounted engine documents became 14-15, a spread of ONE over
 * those same five runs. Prefer the count when re-deriving any of this; it is the quantity that
 * actually moves, ~10-13MB per tile converts it, and it is the only one of the two that a
 * single run can be trusted on.
 *
 * SHARED ACROSS GRIDS. `livePreviews` is module-global — the add-slide gallery, Present's slide
 * overview and Reshape's variant tiles all feed it — so this is 8 retained tiles in total, not
 * per grid. Two grids open at once share the slack rather than each minting their own.
 */
export const PREVIEW_RETAIN = 4;

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
	// Count the RETAINED tiles — the out-of-band ones — and evict the oldest until only
	// `PREVIEW_RETAIN` remain. Insertion order is last-in-band order, so the survivors are the
	// ones you most recently scrolled past, which are the ones you scroll back to.
	//
	// DERIVED FROM THE RETAINED SET, NEVER FROM A COUNT OF THE BAND, and that is the whole
	// robustness of it. An earlier cut computed a ceiling as `clamp(inBandCount, 8, 32)` from
	// the slots' own `inBand` flags — so a single stale `true` (the coalesced-delivery hazard
	// this file spends forty lines on) did not just fail to evict ONE tile, it raised the
	// ceiling for every tile, and the mounted set stopped being a function of anything
	// observable. Measured on the built site, two identical traversals of the gallery settled
	// at 32 and then 11 mounted documents at the SAME offset. Here a stale flag costs exactly
	// what it should: that one tile is not recycled, and nothing else moves.
	let retained = 0;
	for (const s of livePreviews.values()) if (!s.inBand) retained++;
	if (retained <= PREVIEW_RETAIN) return;
	for (const [token, slot] of livePreviews) {
		if (retained <= PREVIEW_RETAIN) return;
		if (slot.inBand) continue;
		livePreviews.delete(token);
		slot.recycle();
		retained--;
	}
}

let sweepHandle = 0;
/**
 * Re-run the sweep once the observer has gone quiet.
 *
 * REQUIRED by a ceiling that tracks the band, and it is the half that was missing. Enforcement
 * runs inside an observer callback, so it can only ever see the band AS IT WAS AT THAT INSTANT
 * — and mid-scroll that is the widest the band ever gets. The callbacks then stop, the band
 * settles smaller, and nothing re-checks: the mounted set stays parked at whatever the last
 * callback licensed. With a FIXED ceiling that was invisible (32 was 32 whenever you asked).
 *
 * Measured on real WebKit at the iPhone 15 Pro profile, two identical traversals of the gallery
 * settled at 10 and then 17 mounted documents — a 7-tile spread with the grid at the same
 * offset both times, which is the metamorphic saturation relation failing for a true reason.
 * One trailing sweep per frame converges the set to the settled band instead, which is what
 * this file claims the ceiling does.
 *
 * Coalesced to one pending frame: a flick delivers callbacks continuously, and a sweep per
 * callback would walk the registry on every one of them for a band that is still moving.
 */
function scheduleBudgetSweep(): void {
	if (sweepHandle) return;
	const run = () => {
		sweepHandle = 0;
		enforcePreviewBudget();
	};
	// `setTimeout` where there is no rAF (jsdom, a backgrounded tab): a sweep that never runs
	// would leave the very over-retention this exists to collect.
	sweepHandle = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 0) as unknown as number);
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
				// Both branches enforce IMMEDIATELY and then again on the next frame. The immediate
				// pass keeps the ceiling honest while the band is moving; the trailing one is what
				// makes it honest once it has STOPPED, because a callback can only ever see the
				// band as it was mid-scroll — see `scheduleBudgetSweep`.
				if (e.isIntersecting) {
					setVisible(true);
					touchPreview(token, { inBand: true, recycle: () => setVisible(false) });
					enforcePreviewBudget();
					scheduleBudgetSweep();
				} else {
					// Left the band but still mounted — it becomes evictable, newest-last, and
					// only actually goes when it is the oldest of too many waiting.
					//
					// NOT guarded on `visibleRef.current`, and that guard is what made the mounted
					// set float. `visible` is React state: it is assigned during render, so between
					// the intersecting callback and React committing it, `visibleRef.current` is
					// still FALSE. A flick delivers the matching leave inside that window routinely
					// — and the guard then DROPPED the leave, stranding `inBand: true` on a tile
					// that is off screen, permanently. Stranded slots are never evictable, so the
					// mounted total drifted with however many the last scroll happened to strand:
					// measured on WebKit at 15 then 30 documents across two identical traversals,
					// and at 24 vs 11 across three identical opens in Chromium at 390x844.
					//
					// The guard was also redundant. It was standing in for "is there a slot for
					// this tile", and `livePreviews.get(token)` answers that directly and
					// correctly — a tile that never mounted has no slot and falls through.
					const slot = livePreviews.get(token);
					if (slot) {
						slot.inBand = false;
						enforcePreviewBudget();
						scheduleBudgetSweep();
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
