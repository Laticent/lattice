---
origin: 2933
priority: P5
recorded: 2026-10-27
area: engine
severity: low
swimlane: docs/src/lib/calco/README.md
source: https://github.com/Laticent/lattice/pull/2933
---

# Editable PPTX card text frames run past their cards in Impress

```text
  P5 · [no ticket] card text frames ~30pt wider than their cards
       why now   — #2933's checker saw every card's text frame on examples/focus-highlight-axes.md slide 8 run about 30pt past the card's right edge, and in LibreOffice Impress a long body line ("…that informed", "…outcomes") renders over the card's edge (also examples/focus.md slides 6 and 8). The frame sizes are identical before and after #2933, so it predates it; not checked in PowerPoint.
       where     — docs/src/lib/calco/reader.ts text-frame width (`w`), docs/src/lib/calco/layout.ts placement.
       done when — a card's text frames stay inside the card in the editable PPTX, and no line renders past the card edge in Impress.
       evidence  — Impress renders of examples/focus-highlight-axes.md slide 8 before and after, and the frame widths from the slide XML.
       verify    — tier 1 checker; export sign-off applies.
```
