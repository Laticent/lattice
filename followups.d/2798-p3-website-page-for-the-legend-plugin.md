---
origin: 2798
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-19-universal-legend.md §15
source: https://github.com/Laticent/lattice/pull/2798
---

# Give the legend plugin a page in the website's plugin catalog

```text
  P3 · A /plugins/ page for the legend plugin
       why now   — every plugin an author writes has a page under
                   docs/src/content/catalog/plugins/; the legend (#2798) does not,
                   so an author finds `@legend{…}` only from the heatmap docs
       where     — docs/src/content/catalog/plugins/legend.md (model on pills.md)
       done when — the page builds and links the docs, fixtures and demo deck
       evidence  — tools/screenshot.js at 1440, 820 and 390 widths
       verify    — owner review of the copy
```
