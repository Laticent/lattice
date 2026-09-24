---
origin: 2272
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2272#issuecomment-5762353273
---

# Assert the a11y tree in the integration tier

Backfilled verbatim from the continuation brief on #2272 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P1 · [no ticket] Assert the a11y tree in the integration tier
       why now   — #2272 shipped a defect where a renamed matrix-grid shape reached the
                   visible key and NOT .cell-sr-label. Green CI, an independent checker, and
                   four rasterized decks all missed it; it was caught by reading acceptance
                   criteria against the diff. Every future adopter can reintroduce it, and
                   nothing in the tree would notice.
       where     — test/integration/parity/ (label-set-key-runtime.test.js is the pattern:
                   real Chromium, shipped dist/lattice-runtime.js). The lesson to encode is in
                   lib/components/chart/matrix-grid/matrix-grid.transform.js `syncCellSrLabels`.
       done when — a deck authoring a label-set override is asserted to announce the SAME words
                   it displays, read from the accessibility tree (CDP
                   Accessibility.getFullAXTree), not from the DOM.
       evidence  — the assertion failing on a deliberately de-synced build, then passing.
                   A DOM-text assertion is NOT evidence here: the bug was invisible to the PDF
                   and would be invisible to a textContent check on the wrong element.
       verify    — tier 0 gates, because it adds a test and changes no shipped behavior.
```
