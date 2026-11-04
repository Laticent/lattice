---
origin: 3021
priority: P9
recorded: 2026-11-03
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — 28 chart kinds, and the narrow form is a drawing change in each kind, not CSS
source: https://github.com/Laticent/lattice/pull/3021
---

# Charts draw a narrow form instead of scaling like a picture

why now   — every chart scales as a whole when its box narrows, so its labels shrink with it. A narrow form means fewer ticks, horizontal bars, the legend below; heatmap, matrix-grid and roadmap also take a Markdown table as data and need the labels-plus-a-run-of-columns idea in their drawing.
where     — lib/plugins/chart-family/kinds/*/ transforms.
done when — each kind draws a narrow form at narrow widths, verified in the lab and against main.
evidence  — the Frame Lab chart entries.
verify    — npm run lab:build; npm run check:chart-fit.
