---
origin: 2635
priority: P6
recorded: 2026-10-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2635
---

# Tell a mouse drag from a tap in the Studio's collage click path

```text
  P6 · [no ticket] Tell a mouse drag from a tap in the Studio's collage click path
       why now   — the player ignores a click that ends a drag of more than 8 px, but the Studio's onTap opens the photo on any click, so a mouse drag across a bleed slide (where tiles cover the slide) can open the photo it ends on.
       where     — docs/src/components/studio/StudioShell.tsx (onTap, previewHolderRef), docs/src/playground/collage-host.js (tapCollageAt).
       done when — a mouse drag of more than 8 px across a collage tile in the Studio does not open it, and a plain click does.
       evidence  — a unit test of the threshold and a real-Studio run.
       verify    — tier 0 gates, because the change is local to one click handler and reversible.
```
