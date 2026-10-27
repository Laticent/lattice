---
origin: 2933
priority: P1
recorded: 2026-10-27
area: engine
severity: low
swimlane: docs/src/lib/calco/README.md
source: https://github.com/Laticent/lattice/pull/2933
---

# A card split by drawOrder can draw its text under its own later picture

```text
  P1 · [no ticket] a split card's text rides with its first chunk
       why now   — `drawOrder` (docs/src/lib/calco/shapes.ts) holds a card member back into a later chunk when another card's shape paints between; the card's text always goes with the FIRST chunk, so a picture of the same card held back into a later chunk would cover that text. Found by #2933's checker by reading the code; not reproduced on any shipped deck.
       where     — docs/src/lib/calco/shapes.ts `drawOrder` (the `framesGiven` / "first group of the card" rule).
       done when — a fixture with a held-back picture over its card's text draws the text after that picture, or the case is shown unreachable from `readSlide`.
       evidence  — a calco integration fixture, before and after.
       verify    — tier 1 checker; editable-export bytes change, so the export sign-off applies.
```
