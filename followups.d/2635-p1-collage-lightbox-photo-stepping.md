---
origin: 2635
priority: P1
recorded: 2026-10-11
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §5.4
source: https://github.com/Laticent/lattice/pull/2635
---

# Step between photos inside the collage lightbox

```text
  P1 · [no ticket] Step between photos inside the collage lightbox
       why now   — v1 of the lightbox opens one photo and closes; a viewer who wants the next photo must close and click again.
       where     — lib/core/collage-lightbox.mjs (once the lightbox lands), lib/core/present-transport.mjs for the shared key verbs.
       done when — arrow keys and swipe move to the previous or next photo in the open lightbox on every surface that hosts it.
       evidence  — a test that drives the keys, plus a real Playground and exported-player run.
       verify    — tier 2: real Playground and exported player, keyboard and touch.
```
