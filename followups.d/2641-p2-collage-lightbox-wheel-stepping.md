---
origin: 2641
priority: P2
recorded: 2026-10-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2646
---

# A mouse wheel flick steps photos in the collage lightbox

```text
  P2 · [no ticket] A mouse wheel flick steps photos in the collage lightbox
       why now   — the lightbox answers keyboard and touch, but a plain wheel is only blocked (so the page behind does not scroll), which falls short of the input-verb parity rule (keyboard, wheel and touch on every slide-showing surface).
       where     — lib/core/collage-lightbox.mjs (the wheel listener), lib/core/present-transport.mjs (createWheelGate), docs/src/playground/collage-host.js and lib/export/player-core.mjs (hand the gate in through `kernel`).
       done when — a decisive plain-wheel flick steps to the next or previous photo with the deck's own cooldown, ctrl or cmd plus wheel still zooms, and a trackpad pinch never steps.
       evidence  — a unit test of the gate and a real Studio and exported-player run with a mouse wheel.
       verify    — tier 1 checker, because it adds an input verb to the player and the hosts; export bytes change for collage decks, so owner dark and light sign-off applies.
```
