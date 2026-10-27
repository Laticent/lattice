---
origin: 2924
priority: P1
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §6
source: https://github.com/Laticent/lattice/pull/2924
---

# The editable PPTX export hides a focused column's text

```text
  P1 · [no ticket] the editable PPTX export hides a focused column's text
       why now   — `lattice deck.md deck.pptx --editable` turns a `_focus: col N` column's tint and edge into an opaque picture and stacks it ABOVE the native text boxes, so the column's header and its last text cell vanish. Seen on `ring` (examples/focus.md slide 4) and `highlight` (examples/focus-highlight-axes.md slide 3), so it predates highlight. The default raster PPTX and the PDF are fine. Found by #2924's P2 check, opened in LibreOffice Impress; the order is in the slide XML (the `pic` follows the `SPRIG + LOG` and `Same day` text), so PowerPoint should match.
       where     — lib/export/office-export.js (the foreground/sprite pictures and their z-order against native text).
       done when — on both decks, the focused column keeps its header and every cell's text in the editable PPTX, with the tint behind the text.
       evidence  — an Impress render of examples/focus.md slide 4 and examples/focus-highlight-axes.md slide 3 from `--editable`, before and after.
       verify    — tier 1 checker, because it changes export bytes; the export sign-off in CLAUDE.md's Quality Bar applies (dark and light renders to the owner).
```
