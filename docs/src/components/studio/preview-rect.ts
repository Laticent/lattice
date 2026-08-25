// The ONLY import this module may take, and it is deliberate: `split-storage` has no imports
// of its own, so this file stays safe for `studio.astro` to pull in at build time without
// dragging React (or react-resizable-panels) into the page's module graph. See #1495.
import { bucketFor, collapseKeyFor } from '../ui/split-storage';

// Fixed chrome constants for the Studio preview box — the CSS-fixed dimensions of the topbar,
// pane padding, per-stop header/footer, and the split's default preview share. Measured from the live app (docs at 2026-07-21); identical across breakpoints, so they
// live here as the shared contract. The pre-hydration shell's first-load COMPUTE fallback
// (studio.astro) uses these to derive the Nacre box's rect when there is NO persisted preview rect
// to replay; the shell's preferred rect-REPLAY path uses the persisted viewport fractions instead
// and does not touch these constants.
//
// (History: a `computePreviewRect(inputs) → rect` closed-form prototype ["option B"] lived here to
// derive the box without measuring; that helper function was removed, and its compute logic now
// lives inline in studio.astro's seed as the first-load fallback (the shipped path prefers
// rect-REPLAY of the app's own measured rect whenever a persisted rect exists). See
// `engineering/decisions/2026-07-21-studio-preview-reframe-in-place.md`.)

/**
 * Where the app persists its measured preview box (as viewport FRACTIONS) for the
 * pre-paint shell to replay. One declaration, read by the writer (StudioShell) and
 * the reader (studio.astro's seed, via define:vars).
 *
 * VERSIONED, and the version is load-bearing. A stored rect is a measurement taken
 * under the geometry rules in force at the time, and replaying one taken under
 * DIFFERENT rules paints a skeleton the hydrated app then corrects — which is the
 * jump this whole replay path exists to remove. Retiring the 760px comfort cap
 * (#1283) is exactly such a rule change: every returning user on a monitor wider
 * than ~1500px had a capped rect stored, so the shell would have painted a 760px
 * box and the app would have snapped it to as much as 1342px on first hydration.
 *
 * Bump the suffix whenever a change moves the box for the SAME inputs. A stale rect
 * under a new key is simply absent, and absent means the compute fallback runs —
 * correct by construction, at the cost of one un-replayed load.
 */
export const PREVIEW_RECT_KEY = 'lattice-studio-preview-rect-v2';

/**
 * Where the app persists the editor|preview split — `useResizableSplit`'s `storageKey`
 * on the Studio surface. Declared here, beside the rest of the geometry contract, so the
 * WRITER (StudioShell) and the pre-paint READER (studio.astro's seed) share one string.
 *
 * The stored shape is `{ [bucket]: { [panelId]: percent } }`, bucketed by the sorted panel
 * ids actually present, so each configuration (Settings docked, Library open, bare Write)
 * keeps its own widths. `STUDIO_SPLIT_BUCKET` is the bare editor|preview pair — the only
 * configuration the shell models, and the one every visitor is in at Read and Write.
 * The collapsed side lives in sessionStorage under `<key>-collapsed`.
 */
export const STUDIO_SPLIT_KEY = 'lattice-docs-split-studio';

/**
 * The Studio split's panel ids — ONE declaration, consumed by every side (#1495).
 *
 * `StudioShell` passes these to its two `ResizablePanel`s, the bucket below is DERIVED from
 * them, and the pre-paint seed indexes the restored layout with them. Before this they were
 * retyped in three places (the shell's JSX, the seed's `saved['studio-editor']` lookups, and
 * the e2e helper), so renaming a panel compiled cleanly and simply missed the lookup at
 * runtime — no throw, a silent fall back to `defaultPreviewFrac`, and a split line up to
 * ~300px from where the app was about to draw it.
 *
 * Ordered editor-then-preview to match the rendered order; `bucketFor` sorts, so the bucket
 * string does not depend on that.
 */
export const STUDIO_SPLIT_PANEL_IDS = ['studio-editor', 'studio-preview'] as const;

/** The stored bucket, DERIVED — never restated. See `bucketFor`'s note. */
export const STUDIO_SPLIT_BUCKET = bucketFor(STUDIO_SPLIT_PANEL_IDS);

/**
 * Where the collapsed side lives — `sessionStorage`, under a key derived from the layout key.
 * Derived rather than concatenated at each call site, so the hook and the seed cannot drift.
 */
export const STUDIO_SPLIT_COLLAPSE_KEY = collapseKeyFor(STUDIO_SPLIT_KEY);

/**
 * THESE ARE DEFAULT-FONT-SIZE MEASUREMENTS, and what that does and does not bound (#1496).
 *
 * Every content-sized band here was measured once, in a browser at its default font size. A
 * reader who raises the browser's MINIMUM font size (Chrome: Settings -> Appearance ->
 * Customize fonts — a low-vision setting) makes the app's rows grow; a frozen number cannot
 * follow. Measured at 24px the shell was out by 18px on the sub-bar, 38px on the footer and
 * 20px on the status strip — a visible seam, not a rounding nit.
 *
 * The fix was NOT to re-measure. The skeletons in StudioChromeSkeleton.tsx now carry the app's
 * own text metrics, and the bands are FLOORED by these constants rather than pinned to them
 * (min-height, not height, in studio.astro). At the default size content lands exactly on the
 * constant, so nothing about the common case changed; above it, the band tracks the app's row.
 *
 * So read a number here as "the height this band has at the default font size, and the floor
 * it never goes below" — not as "the height of this band".
 *
 * ONE PLACEMENT still derives from a constant and therefore still drifts for those readers,
 * pinned by the `@minfont` cases in studio-instant-shell.spec.ts so it cannot grow unseen:
 *   - `mobileBarH` PLACES everything below the phone's action bar. The bar itself is fluid and
 *     correct; the sub-bar under it sits up to 24px high at 24px minimum font.
 * The SECOND one is resolved. `headerWrite*` and `footerWrite` used to place the slide box from
 * their frozen values while the bands themselves grew, putting the box up to 11px off on a wide
 * viewport (13.4px once the sub-bar got shorter — the two errors had been partly canceling).
 * The seed now GROWS both from the root's computed font size, which Blink clamps by the same
 * minimum-font-size setting and which `getComputedStyle` will answer in `<head>`, where a probe
 * element cannot: measured 13.40px -> <= 2px, i.e. band-agreement tolerance. The derivation and
 * its fit live in studio.astro beside the code; these numbers stay the DEFAULT-SIZE floors that
 * derivation starts from.
 * The phone is deliberately excluded from that correction — its third frozen band (`mobileBarH`)
 * errs the other way, so correcting two of its three bands moved its box OUT of tolerance
 * (measured). It keeps the frozen model until the action bar can be modeled with them.
 * A post-paint measure-and-republish would fix `mobileBarH` too and loses a race against the
 * rotation re-seed; the note in studio.astro records what broke when it was tried.
 */
export const PREVIEW_CHROME = {
	topbarH: 54, // the studio topbar (StudioShell `header` h-[54px])
	// Mobile only: the eight-cell deck-actions bar below the topbar (pane starts at 103).
	// Was 53 — the number the PANE-TOGGLE bar measured before the eight-cell redesign
	// (2026-07-26-studio-mobile-eight-cell-bar.md) reshaped that row and never re-measured
	// here. Re-measured 2026-08-09 on the built site at 320/360/390/393/430/600/699: 49px,
	// flat across every mobile width. The 4px was invisible while the shell only PLACED a
	// box with it; it is not invisible now that the shell DRAWS the band.
	mobileBarH: 49,
	padDesktop: 20, // holder `sm:p-5` (viewport >= 640px)
	padMobile: 16, // holder `p-4` (viewport < 640px)
	// The landscape-phone CINEMA morph pads the holder on ONE axis: `px-0 py-3`. Modeling it
	// as "no padding at all" cost 24px of height — and, because the box is height-bound at
	// that aspect, 43px of width — which is the largest single error the adversarial trio
	// found in the compute path.
	padCinemaY: 12,
	// Chrome ABOVE/BELOW the holder inside the preview pane, per stop (CSS-fixed):
	//  read/chromeless — no preview header, a 49px read affordance below.
	//  write/build     — a 45px (two-pane) / 38.2px (phone) preview header, 81.6px
	//                    slide-navigator below.
	headerRead: 0,
	// The write/build sub-bar has ONE height per tier, and the tier is the whole story: the
	// height is set by the tallest control in the row, and the two tiers do not have the same
	// one.
	//   · two-pane (tablet + desktop) — the 32px `icon-sm` "Collapse preview" button, which
	//     exists only where the split does. 32 + 12 (`py-1.5`) + 1 (`border-b`) = 45.
	//   · phone — no collapse button, so the pills decide: 25.2 + 13 = 38.2.
	// It used to depend on the PANE's width too, through a container query: the lens picker
	// was `px-3 py-1.5 text-[12.5px]`, the tallest thing in the row at 34px, and it shed 6px
	// when a narrow pane (<336px) dropped its text label. That is gone — the picker is now
	// sized to the `Slide N / M` counter beside it (lens-picker.tsx `DENSE_PILL`), so it is
	// 25.2px labeled AND 20px bare, under both tiers' governing control either way. Dropping
	// the label still narrows the row; it no longer shortens it, so `headerNarrowPaneW` and
	// the two `…Narrow…` constants it selected are retired rather than re-measured.
	// Re-measured 2026-08-25 on the built site at 320/360/390/430/600/699 (38.2px, flat) and
	// at 700/760/820/1024/1099/1100/1280/1440 (45px, flat).
	headerWriteSplit: 45,
	headerWriteMobile: 38.2,
	footerRead: 49,
	footerWrite: 81.6,
	// The write/build footer is TWO stacked bands — the slide navigator on top, the deck
	// status strip below it. Only the total (`footerWrite`) bounds the preview box, so the
	// split lived nowhere until the shell started DRAWING the footer; the navigator's height
	// is derived (`footerWrite - statusH`) so the total stays the one source of truth.
	// Measured 2026-08-09 at 393x651: navigator 51, status 30.6.
	statusH: 30.6,
	// Desktop at the CRAFT stop only: the left activity rail (`w-[52px]`). It sits OUTSIDE the
	// editor|preview split, so the split divides `vw - railW`, not `vw` — miss it and every band
	// right of it lands ~29px off while the editor band lands 52px off. That was the shape of the
	// worst divergence the adversarial trio found (#1444), and it existed because the shell
	// modelled Craft as "Write minus the slim header tail".
	railCraftDesktop: 52,
	// (`cap: 760` — the old comfort width cap — is RETIRED. The app no longer caps the
	//  preview box at all: the splitter grows and shrinks the slide continuously and the
	//  letterbox math bounds it (#1283). Keeping the constant here would have re-created
	//  the exact drift this file exists to prevent — the shell computing a <=760px box
	//  that the hydrated app then widens, which reads as the placeholder painting and the
	//  split line jumping straight after.)
	defaultPreviewFrac: 0.54, // editor|preview split — preview's share (ResizablePanel defaultSize 54)
	// ── The editor|preview split, exactly as react-resizable-panels lays it out ──────────
	// The library distributes PERCENTAGES over the group width MINUS its separators, so the
	// preview pane is `(groupW - splitSeparatorW) * pct`. Verified to 0.01px at 1440 for the
	// default share, two dragged shares, a collapsed editor, and the Craft stop's narrower
	// group. The 1px looks like rounding until you notice it is the difference between a
	// band that lands on the divider and one that lands beside it.
	splitSeparatorW: 1, // <ResizableHandle> is `w-px`
	splitRailW: 46, // a collapsed pane's width (ResizablePanel `collapsedSize={46}`)
	// A restored percentage is bounded by these px minimums — but NOT by clamping. Both panes
	// are `collapsible`, and react-resizable-panels snaps a pane to `collapsedSize` once the
	// requested size falls below the MIDPOINT of collapsedSize and minSize; only above that
	// does it clamp to the minimum. The shell has to mirror both branches: clamping alone
	// painted a 300px preview where the app handed off to a 46px rail. Consumed by StudioShell
	// as the panels' own `minSize`, so the numbers themselves cannot drift.
	splitEditorMin: 300,
	splitPreviewMin: 300,
} as const;
