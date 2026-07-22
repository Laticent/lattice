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

The hit-surface CSS (`chart-interact.css`, which sets `pointer-events:auto` on the surface) now ships
WITH the shared component, so every mounting surface gets it — it was previously imported only by the
Playground / Drawing-Board pages, so the Studio's surface had no pointer-events and swallowed the hover.

## Verification

The editing-preview path is verified on the real `/studio` in headless Chromium **with real
`mouse.move` (true hit-testing, not synthetic iframe-document events)**: the popover reveals on hover
for a static piechart AND a settled animated one, and clears when the cursor leaves; zero page errors.
The Playground is unaffected (measured `S = 1`, so the geometry changes are no-ops; the checker
confirmed its reveal still works).

**Present's runtime is UNVERIFIED on a real browser.** Its overlay `DeckPreview` never leaves the
`nacre-loader` skeleton in this headless sandbox — the reveal-gate's scale-to-real-width never
completes there (the editing preview, outside the overlay, paints fine) — so the pinned layer never
receives a frame and the reveal can't be driven here. This is the same class of sandbox limitation as
iOS Safari (HARD RULE #23). Present runs the SAME pinned path that is now verified working on the
editing preview (same scale-corrected geometry, same re-pin observers, same shipped hit-surface CSS),
so confidence is high — but it still needs a real-browser check on the deploy preview before it's
considered done. The earlier scale-geometry concern the checker raised for Present is the same bug
fixed above; it is no longer outstanding.

## Notes / follow-ups

- The hidden poster's marks stay in the DOM (`display:none`) beside the clone; a real cursor only ever
  hits the visible clone, so binding the visible svg is both the correctness fix and the geometry fix
  (a zero-box poster would break Present's hit-surface pinning).
