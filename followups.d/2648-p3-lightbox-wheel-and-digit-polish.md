---
origin: 2648
priority: P3
recorded: 2026-10-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2648
---

# Lightbox polish left open by the wheel and digit verbs: pan on a zoomed wheel, digits past 6, digit from a focused tile

```text
  P3 · [no ticket] Lightbox polish left open by the wheel and digit verbs
       why now   — #2648 chose the narrow reading on three small points; each is a one-line decision for the owner, not a defect. (1) A plain wheel while a photo is zoomed does nothing; it could pan. (2) A collage of 7+ photos is reachable by stepping only, since digits stop at 6 (digitAction); [1-9] would cost nothing but collides in spirit with Present's 1-9. (3) A digit does not open a photo from the closed state; the collision-free form is a digit while a tile has keyboard focus.
       where     — lib/core/collage-lightbox.mjs (wheel handler, onKey), lib/core/present-transport.mjs (digitAction), the frame guard in docs/src/playground/deck-preview.js and the player's collage block for (3).
       done when — the owner has picked each of the three; the chosen ones ship with a unit test and a spec §11 line, the rest are recorded as declined.
       evidence  — unit tests of the changed rule plus a real Studio run for any verb added to a host.
       verify    — tier 1 checker for (3), because it adds a key to the player and three hosts; tier 0 for (1) and (2).
```
