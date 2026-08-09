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
export const STUDIO_SPLIT_BUCKET = 'studio-editor,studio-preview';

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
	//  write/build     — 47px preview header, 81.6px slide-navigator below.
	headerRead: 0,
	headerWrite: 47,
	// The preview sub-bar is a CONTAINER query, not a viewport one: the pane is
	// `[container-type:inline-size]`, and the lens picker keeps its text label only at
	// `@[21rem]` (336px) and up. Below that the label drops and the bar gets shorter. That is
	// reachable two ways — a ≤335px phone, and a splitter dragged down to the 300px preview
	// minimum on any width — so the threshold is on the PANE width, never the viewport's.
	// Once the label is gone the tallest thing left decides, and that differs by tier: the
	// "Collapse preview" button exists only where the split does (tablet + desktop), so a
	// narrow phone bar is 41px and a narrow SPLIT pane is 45px.
	headerWriteNarrowSplit: 45,
	headerWriteNarrowMobile: 41,
	headerNarrowPaneW: 336,
	footerRead: 49,
	footerWrite: 81.6,
	// The write/build footer is TWO stacked bands — the slide navigator on top, the deck
	// status strip below it. Only the total (`footerWrite`) bounds the preview box, so the
	// split lived nowhere until the shell started DRAWING the footer; the navigator's height
	// is derived (`footerWrite - statusH`) so the total stays the one source of truth.
	// Measured 2026-08-09 at 393x651: navigator 51, status 30.6.
	statusH: 30.6,
	// Desktop at the BUILD stop only: the left activity rail (`w-[52px]`). It sits OUTSIDE the
	// editor|preview split, so the split divides `vw - railW`, not `vw` — miss it and every band
	// right of it lands ~29px off while the editor band lands 52px off. That was the shape of the
	// worst divergence the adversarial trio found (#1444), and it existed because the shell
	// modelled Build as "Write minus the slim header tail".
	railBuildDesktop: 52,
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
	// default share, two dragged shares, a collapsed editor, and the Build stop's narrower
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
