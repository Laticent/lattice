---
origin: 2648
priority: P1
recorded: 2026-10-12
area: imagery
severity: medium
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2648
---

# Drive a live Present session to prove the lightbox digits do not reach the chart-detail keys

```text
  P1 · [no ticket] Drive a live Present session to prove the lightbox digits do not reach the chart-detail keys
       why now   — #2648 claims no collision between the lightbox's 1 to 6 and Present's own 1-9/0 chart-detail keys, but that rests on reading listener order (a capture-phase document listener that stops propagation versus a bubble-phase window listener in PresentOverlay.tsx). It was never driven, and it is the one claim that held the merge card at `high`.
       where     — docs/src/components/studio/PresentOverlay.tsx (onKey, ~1895-1971), docs/src/components/chart-detail-layer.tsx, lib/core/collage-lightbox.mjs (onKey), docs/e2e/collage-lightbox.spec.ts for the fixture pattern.
       done when — in a real Present session on a deck with a collage slide and a chart slide, a digit pressed with the lightbox open jumps the photo and marks no chart point, and a digit pressed after it closes marks the chart point again.
       evidence  — a Playwright spec (Chromium) driving Present, with the chart-detail state asserted both ways.
       verify    — tier 0 gates: it adds a test and changes no shipped code unless the claim proves wrong; if it does, tier 1 checker on the fix.
```
