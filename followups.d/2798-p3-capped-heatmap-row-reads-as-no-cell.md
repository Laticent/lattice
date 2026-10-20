---
origin: 2798
priority: P3
recorded: 2026-10-20
area: chart
severity: low
swimlane: engineering/decisions/2026-10-19-universal-legend.md §15
source: https://github.com/Laticent/lattice/pull/2798
---

# A callout on a row the heatmap cut at its cap is described as naming no cell

```text
  P3 · Say "past the row cap", not "names no cell"
       why now   — the checker on #2798 found a callout on row 11 of a
                   12-row heatmap is not drawn (the grid keeps 10 rows) and
                   the description says it "names no cell", which is not
                   true; lint (`slideTable` counts every row) likely stays
                   silent. Pre-existing cap, met by the legend
       where     — heatmap.transform.js `resolveCallouts` (match against the
                   parsed overflow rows/cols) and lint-core.js `legendOnGrid`
       done when — such a callout is listed as "past the 10-row limit" in
                   the description, and lint says the same
       evidence  — a unit test with a 12-row table and a callout on row 11
       verify    — node --test test/unit/components/legend-anchored.test.js
```
