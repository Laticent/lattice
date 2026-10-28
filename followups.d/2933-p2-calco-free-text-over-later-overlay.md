---
origin: 2933
priority: P2
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §6
source: https://github.com/Laticent/lattice/pull/2933
---

# Focused-cell text lifted free in the editable PPTX lands over a later overlay

```text
  P2 · [no ticket] lifted text goes to the top, not just above its picture
       why now   — #2933 draws a focused cell's text free so the column picture stops covering it, but `drawOrder` emits free text after EVERY shape, so a positioned overlay painted after the picture (z-index box over a focused cell) now sits under that text. Before #2933 the text was under the tint (also wrong), so nothing regressed; no shipped deck has an overlay on a focused column. Confirmed by #2933's re-check in reader/drawOrder output, not in a rendered file.
       where     — docs/src/lib/calco/reader.ts `underPicture`; docs/src/lib/calco/shapes.ts `drawOrder` (free frames emitted last).
       done when — a lifted frame is drawn right after the picture it must clear, so an overlay painted later stays above it; fixture: calco-focus-column.test.js TABLE plus a z-index box over the "Fast" cell.
       evidence  — the fixture's draw order before and after, and an Impress render.
       verify    — tier 1 checker; editable-export bytes change, so the export sign-off applies.
```
