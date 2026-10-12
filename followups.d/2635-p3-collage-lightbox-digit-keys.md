---
origin: 2635
priority: P3
recorded: 2026-10-11
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §5.4
source: https://github.com/Laticent/lattice/pull/2635
---

# Digit keys jump to a photo in the collage lightbox

```text
  P3 · [no ticket] Digit keys jump to a photo in the collage lightbox
       why now   — number keys are the Present surface's jump verb and the lightbox currently ignores them.
       where     — lib/core/collage-lightbox.mjs, lib/core/present-transport.mjs.
       done when — pressing 1 to 6 opens or switches to that photo, and it does not collide with the deck's own slide-jump digits.
       evidence  — the key map lists the digit verb for the lightbox and a test pins the no-collision rule.
       verify    — tier 1: unit test of the key map; tier 2: Present run.
```
