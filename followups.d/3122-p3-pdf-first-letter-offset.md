---
origin: 3122
priority: P3
recorded: 2026-11-11
area: engine
severity: low
swimlane: engineering/pipeline.md
deferred: off-path — the PDF writer's word reader; this PR changed only how drawn text is hidden from the photo
source: https://github.com/Laticent/lattice/pull/3122
---

# The vector PDF draws a styled `::first-letter` out of line and in the wrong color

```text
  P3 · a drop-cap-style first letter is drawn out of line in the vector PDF
       why now   — found while writing test/fixtures/pdf-list-markers.md: with
                   `li::first-letter { font-size: 2em }`, the CLI PDF draws the "M" of "Mike" on its own
                   line above "ike", identically before and after the list-marker fix. A first letter at
                   the item's own size is drawn in line, so the size change is what the reader misplaces.
                   Its COLOR is lost too: a `::first-letter { color: red }` letter is drawn in the item's
                   color (the word reader reads the element's style, not the pseudo's), before and after.
       where     — the word reader in lib/core/pdf-compose/read-slide.mjs (how a ::first-letter's box and
                   baseline become a run); compare with the PNG render of the same deck.
       done when — a styled first letter sits on the line's baseline in its own color in the PDF as on
                   screen, pinned by a test; or the writer leaves such a word in the photo, as it does rotated text.
       verify    — tier 0 plus one PDF compared with the HTML render.
```
