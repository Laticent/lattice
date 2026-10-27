---
origin: 2920
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §5
source: https://github.com/Laticent/lattice/pull/2920
---

# Open highlight in a PPTX export, the live Playground and a Quartz PDF viewer

```text
  P2 · [no ticket] open highlight in a PPTX export, the live Playground and a Quartz PDF viewer
       why now   — #2920 shipped at high, not very high, because three surfaces were never opened: the PPTX export, the live Playground, and a viewer that uses Apple PDFKit. CI and poppler renders passed; none of them is those surfaces (#23).
       where     — examples/focus-styles.md and examples/focus-highlight-axes.md; tools/screenshot.js for the Playground at 1440, 820 and 390.
       done when — each surface shows the target tinted and edged on a card, a row, a code line and a chart mark, or a defect is logged with its render.
       evidence  — a PPTX slide image, a Playground screenshot at the three widths, and a PDFKit render of the same slide.
       verify    — tier 0 gates, because it only looks. A defect found goes to its own fix.
```
