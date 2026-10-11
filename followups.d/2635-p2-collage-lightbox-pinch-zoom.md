---
origin: 2635
priority: P2
recorded: 2026-10-11
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §5.4
source: https://github.com/Laticent/lattice/pull/2635
---

# Pinch zoom inside the collage lightbox

```text
  P2 · [no ticket] Pinch zoom inside the collage lightbox
       why now   — the enlarged photo is fit-to-screen only; fine detail in a mood-board photo cannot be inspected.
       where     — lib/core/collage-lightbox.mjs, engineering/decisions/2026-08-10-preview-pinch-zoom.md for the shared zoom contract.
       done when — the open lightbox pinch-zooms and pans through the shared zoom kernel, not a private copy.
       evidence  — the lightbox imports the shared zoom code; no second implementation.
       verify    — tier 2: a real touch device or the closest reachable surface, with UNVERIFIED named if iOS is out of reach.
```
