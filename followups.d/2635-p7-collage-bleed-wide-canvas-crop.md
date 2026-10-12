---
origin: 2635
priority: P7
recorded: 2026-10-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2635
---

# Measure how much bleed crops on a wide canvas and say so, or fit the packer to it

```text
  P7 · [no ticket] Measure how much bleed crops on a wide canvas and say so, or fit the packer to it
       why now   — bleed stretches the grid to the slide and the packer assumes 16:9, 1:1 or 9:16, so a deck on a wide canvas crops more at each photo's edges than the few percent stated; nobody has measured it.
       where     — lib/core/collage-pack.js (STAGE_ASPECT bleed), lib/components/imagery/collage/collage.styles.css (section.collage.bleed .collage-list), lib/forms/cell/stage/stage.css (--_wide-gutter).
       done when — the crop on a wide-canvas bleed deck is measured and the docs state it, or the packer takes the real slide aspect and the crop stays within the stated few percent.
       evidence  — tools/pixel-check.js on a wide-canvas bleed slide, plus the measured crop numbers in the PR body.
       verify    — tier 0 gates, because the change stays inside the collage component.
```
