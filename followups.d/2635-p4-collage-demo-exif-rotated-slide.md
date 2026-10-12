---
origin: 2635
priority: P4
recorded: 2026-10-11
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §5.4
source: https://github.com/Laticent/lattice/pull/2635
---

# Add an EXIF-rotated photo slide to examples/collage.md

```text
  P4 · [no ticket] Add an EXIF-rotated photo slide to examples/collage.md
       why now   — PR #2627 fixes the aspect read for EXIF-rotated JPEGs, but the demo deck has no slide that proves it on the real render.
       where     — examples/collage.md, after #2627 merges to main.
       done when — a demo slide uses a portrait photo stored rotated (Orientation 6 or 8) and renders portrait in the PDF.
       evidence  — the CI-rendered PDF shows the tile with the right aspect.
       verify    — tier 2: the PDF CI renders for the PR.
```
