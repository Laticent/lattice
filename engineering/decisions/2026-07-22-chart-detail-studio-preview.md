---
status: shipped
summary: >
  Wire the chart mark-detail reveal (the `.chart-details` hover popover) into the Studio's live
  editing preview and Present, as ONE shared widget instead of a fork per surface. It ran only on
  /playground + the frozen Drawing-Board present; the newer Studio surfaces (DeckPreview editing
  preview, PresentOverlay) never mounted it. Extract `ChartDetailLayer` (the parent-hosted
  chart-interact layer + its shadcn popover), refactor the Playground onto it, opt the Studio editing
  preview in via a DeckPreview `chartDetail` prop, and wire Present in pinned mode over its
  pointer-events-none delivery card. Motion + detail compose with NO special handshake once
  chart-interact binds the VISIBLE svg (an animated chart carries a hidden poster + a live clone).
---

# Chart mark-detail popups in the Studio preview + Present, reconciled with motion

**Date:** 2026-07-22 · **Status:** Accepted

## Problem

The per-mark detail reveal (an authored sublist under a chart mark → an inert
`<template class="chart-detail" data-mark>` that a parent-hosted layer, `chart-interact.js`, reveals
on hover/tap) was only mounted on `/playground` and the frozen Drawing-Board present. The Studio's
own surfaces — the live editing preview (`DeckPreview`) and Present (`PresentOverlay`) — never
mounted it, so an author composing a deck couldn't see the detail they'd authored. Separately, the
new chart-motion feature (#1156) hides the original chart svg and animates a clone; how the two
compose was unspecified.

## Decision

1. **One shared widget, not a fork per surface (HARD RULE #15).** Extract `ChartDetailLayer`
   (`docs/src/components/chart-detail-layer.tsx`) — the `createChartInteract` mount + the shadcn
   popover it renders via the `onDetail` hook — and refactor `PlaygroundApp` onto it
   (behavior-preserving). It binds LAZILY on the first `rebind()`/`onSlide()` once the frame exists,
   covering both the Playground's at-mount iframe and a DeckPreview host's after-paint iframe.
2. **Editing preview opts in — PINNED mode.** `DeckPreview` gains a `chartDetail` prop; only the
   Studio's primary editing preview sets it (thumbnails / Fabricate specimens must stay static — a grid
   of popovers is noise). It uses the SAME pinned-hit-surface mechanism as Present, NOT `hoverAny`:
   the Studio preview box is `pointer-events:none` (a swipe surface, #1121), so a real cursor's hover
   never reaches the iframe — an in-iframe listener gets nothing. A parent `pointer-events:auto`
   hit-surface over the chart rectangle receives it instead (re-pinned each paint via `onSlide(0)`, the
   frame being one section). The Playground keeps `hoverAny` because ITS iframe is interactive.
   (An earlier draft used `hoverAny` for the editing preview and a synthetic-event harness "verified"
   it — a false positive: dispatching events on the iframe document bypasses `pointer-events:none` and
   hit-testing, which a real cursor does not. The independent checker caught it; re-verified below with
   real `mouse.move`.)
3. **Motion + detail compose with no handshake.** An animated chart carries BOTH the hidden poster
   (`display:none`) and the live clone. `chart-interact` now binds the VISIBLE svg (`chartSvgIn`), and
   the popover is cursor-anchored — so static, mid-build, AND settled charts all reveal the correct
   detail. A `data-anima-state="playing"` reveal-suppression guard was tried and **removed**: it was
   unnecessary (coexistence already worked) and it stranded a later reveal after a mid-build hover.
4. **Present uses pinned mode.** Present's delivery card is intentionally `pointer-events-none`, so
   `hoverAny` (which listens on the iframe doc) can't work there. Instead a pinned hit-surface
   (`pointer-events:auto`) sits over the current chart — the mechanism the Drawing-Board present
   shipped — re-pinned after each slide via a new `DeckPreview` `onRender` callback → `onSlide(0)`
   (the present frame is one section), plus number-key reveal routed through the presenter key handler.

## Geometry — the scaled frame + async layout

The Studio scales its preview iframe with `transform: scale()` (~0.59 to fit the pane), which broke the
pinned hit-surface two ways, both now fixed in `chart-interact.js`:
- **Scale.** `getBoundingClientRect` on the OUTER iframe is scaled; a mark's rect INSIDE the iframe is
  not. A shared `frameGeom()` returns the frame rect + scale `S = rect.width / offsetWidth`; every
  parent↔frame hop now bridges it (parent→inner ÷S in `sliceAt`, inner→parent ×S in `reflow` /
  `ptrFromFrame`). `S = 1` on an unscaled host (Playground / Drawing-Board), so it's a no-op there.
- **Async layout staleness (the jank).** A chart lays out a beat AFTER the slide paints — after
  `onSlide`'s fixed re-pin timers — so a hit-surface pinned once ends up in the wrong place. Fixed with
  ResizeObservers: on the frame element (re-scale) and, re-targeted per chart, on the chart's own svg
  inside the iframe (its layout settle). No polling; the surface re-pins when the geometry it depends on
  actually changes.
- **The LATE reveal a `ResizeObserver` can't see (the Present-on-mobile bug).** A `loader` host
  (Present) holds its iframe at `opacity:0` / a placeholder scale until `single-slide-render`'s
  `scaleFrame` reveals it — by mutating the iframe's inline `transform` + `opacity` once a real width is
  known and the slide has painted. A CSS `transform` does NOT change the border-box, so the frame
  `ResizeObserver` never fires; and the reveal lands AFTER `onSlide`'s fixed re-pin timers, so the pinned
  hit-surface is stuck at a stale/zero geometry and every tap misses (the reported "Present popup never
  shows on mobile"). Fixed with a `MutationObserver` on the frame element's `style` attribute
  (`watchFrame`) → `reflow`; it re-targets if `getFrame()` returns a new element and disconnects in
  `destroy`. The editing preview never hit this because it has no loader — its scale is stable before the
  timers fire. `reflow` writes only the parent hit-surface's style (never the frame's), so observing the
  frame can't self-trigger.

## The mobile card size — scale WITH the slide

The preview iframe is transform-scaled to fit its pane (~0.59 desktop, ~0.28 on a 390px mobile pane), so
a full-size popover card dwarfs the tiny chart (the reported "way too big, doesn't scale with the
slide"). `reveal()` now hands the host the frame's render scale `S` in the `onDetail` payload, and
`ChartDetailLayer` scales the VISIBLE card by `cardScale = min(1, max(S, 0.5))` — floored at 0.5 so the
text stays readable on a heavily-scaled mobile preview, capped at 1 so it never grows.

The card scales via **CSS `zoom`, not a child `transform: scale()`**. `zoom` shrinks the element's
LAYOUT box, so the OUTER `PopoverContent` that Radix / Floating-UI measures for collision / flip / shift
is the SAME size the user sees. A child `transform` leaves the measured box full-size, so Radix reserves
~320px, spuriously collision-shifts a near-edge card left, and the visible half-size card DETACHES from
the mark — which the maker-checker caught and a mobile probe reproduced (the card's left edge sat left
of the tapped band). With `zoom`, the card's top-left tracks the tapped mark exactly (measured anchor
`dx = 0px`, `dy = 7px` on a 390px preview). On that preview (S≈0.28 → cardScale 0.5) the card lands at
~40% of the slide width — a proper tooltip, not a slide-swallowing panel. (`zoom` is Baseline across
current Chromium / WebKit / Firefox ≥126; the docs site targets modern browsers.)

The hit-surface CSS (`chart-interact.css`, which sets `pointer-events:auto` on the surface) now ships
WITH the shared component, so every mounting surface gets it — it was previously imported only by the
Playground / Drawing-Board pages, so the Studio's surface had no pointer-events and swallowed the hover.

## Verification

The editing-preview path is verified on the real `/studio` in headless Chromium **with real
`mouse.move` / `touchscreen.tap` (true hit-testing, not synthetic iframe-document events)**:
- **Desktop** (S=0.592): the popover reveals on hover for a static piechart AND a settled animated one,
  clears on leave, zero page errors; the card scales to S (151×54px).
- **Mobile** (390px pane, S=0.278): a tap reveals the popover and the card lands at ~40% of the slide
  width — proportionate, readable, cleanly a tooltip (the "way too big" report is fixed). Emulated
  touch, real hit-testing.

The Playground is unaffected (measured `S = 1`, so the geometry changes are no-ops).

**The Present late-reveal re-pin (`watchFrame`) is proved by a wiring unit test, NOT by Present's real
runtime.** `docs/src/playground/chart-interact.test.ts` mounts the REAL `createChartInteract` in jsdom
(where `ResizeObserver` is a no-op stub) and asserts that a `style` mutation on the frame element
re-pins the hit-surface — which can ONLY be the new `MutationObserver`. It is a genuine guard: with
`watchFrame` disabled the test fails (the surface stays at the stale size). **Present's real-browser
runtime remains UNVERIFIED in this sandbox** — its overlay `DeckPreview` never leaves the
`nacre-loader` skeleton here (the reveal-gate's scale-to-real-width needs real layout the headless
overlay doesn't complete; a probe confirmed the delivery card stays a blurred skeleton with zero chart
marks), the same class of limitation as iOS Safari (HARD RULE #23). The root cause of the reported
"Present popup never shows on mobile" is now identified (the `ResizeObserver`-blind late reveal) and
fixed, but it still needs a **real-device check on the deploy preview** before it's considered done.

## Notes / follow-ups

- The hidden poster's marks stay in the DOM (`display:none`) beside the clone; a real cursor only ever
  hits the visible clone, so binding the visible svg is both the correctness fix and the geometry fix
  (a zero-box poster would break Present's hit-surface pinning).
- **Two Present-path fixes folded from PR review** (both on the number-key / motion paths the sandbox
  can't drive, so review caught them, not runtime): (1) a **number-key / presenter-window reveal has no
  live pointer**, so `anchorPt` was null and the host popover anchored at its off-screen `(-9999)`
  default → invisible; `markAnchor(i)` now supplies the mark's own center in parent coords as the
  no-pointer fallback. (2) When `reflow` swaps `chartEl` to the freshly-mounted **Anima clone**, the
  per-chart `chartRO` (bound to the poster in `setChart`) must **re-attach to the clone** or the animated
  chart's async layout-settle re-pin watches a hidden node; the observer setup is now an `observeChart()`
  helper called from both sites. (A third low-confidence review note — `enabled={false}` not tearing down
  the controller — is moot: `PresentOverlay` is `if (!open) return null`, so closing Present unmounts the
  layer and the effect cleanup runs `destroy()`.) *(Update: `enabled` is now a real off-switch anyway —
  a toggle-to-false on a still-mounted layer destroys the controller + clears the open card.)*
- **Adversarial-trio fold** (red team + Munger inversion + independent checker, on the shipping diff;
  verdict: **no jank added** — teardown airtight, no per-frame re-measurement, the reveal-poll storm is
  defused by CSSOM same-value short-circuiting). Real items folded: (a) **rAF-coalesce `reflow`** — a
  pane-divider drag could fire the stage RO + `frameMO` in one frame → two cross-iframe layout flushes;
  observers now schedule through one `scheduleReflow` (rAF), so a burst collapses to one. (b) **Vanilla
  (Drawing-Board) keyboard-reveal regression** — `markAnchor` made `anchorPt` a zero-*size* rect, which
  tripped `placePop`'s `!ptr && !r.width` bail so the card rendered unplaced; the guard is now
  `!ptr && !anchorPt && …` and a `chartCenter()` second fallback covers a box-less mark. (c) **`onSlide`
  idempotency** — clear pending re-pin timers up front so same-index re-emits (every keystroke) don't
  stack them. (d) **`chartSvgIn` prefers `.scene-live` explicitly** — removes the `display:none`-poster
  coupling landmine (the box-size heuristic is now only the static-chart fallback). (e) hygiene: `rebind`
  drops the dead-realm `chartRO` + re-arms `watchFrame`; `cardScale` guards non-finite; a `disposed`
  tombstone stops a late imperative call re-creating the controller.
- **Present's REAL root cause (corrects the earlier MutationObserver diagnosis).** The `watchFrame`
  MutationObserver (above) catches a late frame reveal, but it was NOT why Present failed. The actual
  bug is a **parse race**: Present's first render is a full srcdoc WRITE; the host re-pin
  (`onRender → onSlide(0)`) runs a microtask later, but the srcdoc doesn't PARSE until the next task —
  so `onSlide` finds an empty document, binds nothing, and (the killer) the `[80,360,1240]ms` re-pin
  timers are armed only `if (interactive())`, so nothing ever retries. When the slide finally paints,
  `watchFrame` DOES fire, but `reflow` bails (`chartEl` is null). Pinned mode had no self-heal: the
  iframe-`load` re-bind was `hoverAny`-only. **Fix:** attach the `load` listener in BOTH modes — hover
  re-binds its doc listeners, pinned re-runs `onSlide(curIdx)` — so the hit-surface binds the instant
  the srcdoc parses. This is the exact mechanism that makes the editing preview reliable, now shared.
  Deterministic on all platforms (microtask-vs-task ordering); felt worst on mobile where tap is the
  only reveal. Guarded by a unit test that reproduces the race (empty doc → `onSlide` → inject chart →
  fire `load` → assert bound); it fails without the pinned-mode `load` bind.
- **Present's live runtime stays UNVERIFIED in the sandbox** — its overlay `DeckPreview` never creates
  its iframe here (card holds the `nacre-loader` skeleton), a pre-existing limitation independent of
  this fix (Present renders slides fine on a real device). Confirmed the root cause + fix by static
  trace + the race unit test; the live tap needs a real-device / deploy-preview check.
- **Popover sizing — readable-first (reversed the scale-with-slide approach).** A detail tooltip is an
  on-demand READOUT whose job is legibility; scaling it down to a ~0.28× mobile editing-preview slide
  makes it unreadable. So the card is a fixed, legible, collision-aware size (may overflow the small
  authoring thumbnail; reads as proportionate on full-screen Present, the real viewing context). The
  `scale`-in-`onDetail` payload + the `zoom: cardScale` treatment were removed. This is a UX judgment
  the human made after seeing both.
- **Why NOT "attach the popover inside the iframe" (the intuitive fix).** Investigated and rejected:
  the preview iframe is deliberately `pointer-events:none` so a swipe reaches the slide-nav container
  instead of the iframe swallowing it. The iframe ELEMENT gates all inner pointer events — make it
  interactive and it captures every swipe (breaking nav); leave it inert and NOTHING inside (marks
  included) can receive a tap. So a parent-side hit-surface over the chart is the CORRECT layer for the
  swipe-vs-tap tension; the defect was never the layer's location, only its (now-fixed) binding.
- **Deferred (logged, not blocking):** (1) an integration assertion pinning the three cross-file
  invariants (`.scene-live` bind, frame-element style writes, poster hiding) so an upstream change fails
  a test, not silently janks — `chartSvgIn`'s explicit `.scene-live` query already removes the sharpest
  edge. (2) Optional hover close-hysteresis for edge-oscillation flicker in `hoverAny` (pre-existing;
  rAF-coalesce already trims its cost). (3) A real-surface eyeball of `zoom` + `updatePositionStrategy`
  for any sub-pixel shimmer, and the graceful Firefox&lt;126 degrade (card renders unscaled but correctly
  placed) — both need a browser the sandbox can't drive.
