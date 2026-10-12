---
origin: 2641
priority: P1
recorded: 2026-10-12
area: imagery
severity: medium
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2646
---

# Run the collage lightbox's swipe and pinch on a real iPhone

```text
  P1 · [no ticket] Run the collage lightbox's swipe and pinch on a real iPhone
       why now   — #2646 shipped stepping and zoom verified through Chromium's CDP touch pipeline; WebKit's tap is covered, but Playwright's WebKit has no touch pipeline, so swipe and pinch on iOS are UNVERIFIED and hold the pre-merge confidence at medium.
       where     — lib/core/collage-lightbox.mjs (touch handlers), lib/export/player-core.mjs (collage block), docs/src/playground/collage-host.js.
       done when — on a real iPhone, in the exported player and in the Studio preview, a one-finger swipe steps, a two-finger pinch zooms without stepping, one finger pans while zoomed, and the pill returns to fit.
       evidence  — a screen recording or screenshots from the device, named as such in the PR.
       verify    — tier 0: a manual device run; no code change expected.
```
