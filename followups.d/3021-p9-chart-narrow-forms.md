---
origin: 3021
priority: P9
recorded: 2026-11-03
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — the mechanism shipped with its first reader (bar) on #3060; each remaining kind needs its own reader and a look at its redrawn form, kind by kind
source: https://github.com/Laticent/lattice/pull/3021
---

# Charts redraw for their box in the fluid view, kind by kind

why now   — a chart is drawn once, for the box the export gave it; in the fluid view on a phone that box turns tall and narrow and the drawing only scales (a 16:9 bar chart's labels at 7px). The owner chose on-demand redraw from the chart's own marks (#3060, 2026-11-06): no second drawing, no stored source. lib/runtime/chart-redraw.js does it, with a READER per kind that rebuilds the source list from the rendered marks. Bar has one; every other kind keeps its exported drawing until it gets one.
where     — lib/runtime/chart-redraw.js `READERS`: one reader per kind, from what its marks carry. The 2026-11-06 survey (decision doc §"Charts redraw on demand"): whole source on the marks for bullet, ep-curve, funnel, heatmap, line, map, piechart, slope, stacked-bar, tower, waterfall, hub-spoke, journey, matrix-grid, roadmap; part of it only in geometry or `<desc>` for histogram, gantt, scatter, quadrant, risk-matrix, radar, word-cloud (those kinds first record the missing values on their marks); kanban, progress, timeline-list never change with the box; flowchart and state-chart redraw from their stored model through their own browser layout, which the fluid boot does not run yet.
done when — every kind whose drawing depends on its box redraws in the fluid view at 390 × 844 with no label under 10px and no name shortened that the export printed in full, and restores its exported drawing when the box returns.
evidence  — the fluid render of each kind's gallery at 390 × 844, before and after; the redraw time per kind (test/unit/runtime/chart-redraw.test.js round trips; the kernel timing in the decision doc).
verify    — node --test test/unit/runtime/chart-redraw.test.js test/integration/export/fluid-chart-redraw.test.js; the fluid render of each gallery at phone width.
