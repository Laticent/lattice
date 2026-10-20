---
origin: 2816
priority: P3
recorded: 2026-10-20
area: chart
severity: low
swimlane: engineering/decisions/2026-10-19-universal-legend.md §18
source: https://github.com/Laticent/lattice/pull/2816
---

# Owner's pick: on a crowded heatmap, ring alone or a smaller number marker

```text
  P3 · Decide D1: ring alone (A) or a smaller marker (B)
       why now   — from about 8 rows of four-digit values a
                   called-out cell gets a ring and no number;
                   the reader matches it to its label by row
       where     — heatmap.transform.js MARKER_MIN;
                   legend-anchored.test.js (densest-grid test)
       done when — the owner answers D1 on #2816. Default A
                   (ring alone) already ships; B lowers
                   MARKER_MIN to 0.4, which the CLI flags at
                   5.2pt, under its 5.4pt type floor
       evidence  — the light and dark PDFs of both options,
                   posted to the owner in the #2816 session
       verify    — owner review of the PDF, light and dark
```
