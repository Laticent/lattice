---
origin: 2385
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2385
---
# The `live` status paints as pass in the chart family and as info in the state chart and gantt

why now   — The flowchart design (2026-09-25-flowchart-authoring.md §2.4) takes its status paint from `.chart-status[data-s]` in `chart-family.css`, which groups `live` with `on-track` and `done` as pass. The state chart and gantt paint `live` as info. One status word meaning two colors across sibling charts is the drift `lib/core/chart-status.js` exists to prevent. Found by the checker reviewing #2385; pre-existing and off that PR's path.
where     — lib/components/chart/_chart-family/chart-family.css (`.chart-status[data-s="live"]`), lib/components/chart/state-chart/state-chart.styles.css, lib/components/chart/gantt/
done when — `live` paints one way in every chart member, the choice is recorded in chart-family.docs.md, and a test pins the grouping.
evidence  — The checker's report on #2385: chart-family pills paint `live` as pass; the state chart and gantt paint it as info.
verify    — Render a deck with a `live` status in a pill, a state-chart state and a gantt bar, in light and dark; the three swatches match.
