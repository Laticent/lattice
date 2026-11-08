---
origin: 3021
priority: P9
recorded: 2026-11-03
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — the whole-source kinds shipped on this branch; each remaining kind needs its source recorded on its marks (an export change the owner signs off) or its own browser layout run by the fluid boot
source: https://github.com/Laticent/lattice/pull/3021
---

# Charts redraw for their box in the fluid view, kind by kind

why now   — a chart is drawn once, for the box the export gave it; in the fluid view on a phone that box turns tall and narrow and the drawing only scales. lib/runtime/chart-redraw.js redraws on demand from the chart's own marks, with a READER per kind (lib/runtime/chart-readers/). Bar, line, slope, ep-curve, tower, stacked-bar, waterfall, bullet, heatmap, funnel, piechart, map, hub-spoke, roadmap and journey have one (2026-11-08). What is left needs more than a reader.
where     — (1) funnel: redraws its tall shape but its kernel reads no canvas, so labels stay 9px; reading `paneView` changes every funnel-in-a-pane export (owner sign-off). (2) histogram, gantt, scatter, quadrant, risk-matrix, radar, word-cloud keep part of their source only in geometry or `<desc>`: record the missing values on their marks first (an export change), then a reader each. (3) bar's reader takes a hue for a series, so a grouped `diverging` bar (a tornado) reads wrong and the redraw's check keeps its exported drawing; read the series from the key's order instead. (4) flowchart and state-chart redraw from their stored model through their own browser layout, which the fluid boot does not run yet. matrix-grid, kanban, progress and timeline-list never change with the box.
done when — every kind whose drawing depends on its box redraws in the fluid view at 390 × 844 with no label under 10px and no name shortened that the export printed in full, and restores its exported drawing when the box returns.
evidence  — the fluid render of each kind's gallery at 390 × 844, before and after; test/unit/runtime/chart-readers.test.js passing for the kind with its gallery read back byte for byte.
verify    — node --test test/unit/runtime/chart-readers.test.js test/unit/runtime/chart-redraw.test.js test/integration/export/fluid-chart-redraw.test.js; the fluid render of each gallery at phone width.
