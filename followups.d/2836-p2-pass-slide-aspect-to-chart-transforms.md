---
origin: 2836
priority: P2
recorded: 2026-10-21
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md §5
source: https://github.com/Laticent/lattice/pull/2836
---

# Chart transforms see an orientation name, not the slide's aspect

The heatmap picks its callout and key placement by the plot it leaves at the slide's shape, but
`transformChartSection(html, cls, orientation, paneView)` carries only the orientation name.
`landscape` covers 16:9 and 4:3, `portrait` covers 4:5 and 9:16, and those pairs want different
layouts, so the heatmap scores landscape at 16:9 and portrait at both of its shapes
(`STAGE_ASPECTS` in `heatmap.transform.js`). The measured cost: at 4:5, three callouts under the grid
keep 82% of the grid `main` kept; at 4:3 the landscape pick is `main`'s layout, 83% of the best
grid on average against 88% when 4:3 is scored too.

why now   — every chart that adopts the placement rule (P3 of the placement note) inherits the same approximation.
where     — the section's `data-orientation` stamp (`lib/engine/css.js`, `lib/runtime/index.js` `stampOrientation`) and `lib/plugins/chart-family/chart-family.dispatch.js` `transformChartSection`; the runtime's rebuild key in `lib/transformers/chart-family.js` must include it.
done when — a chart transform can read the chart box's aspect (or the slide's), the heatmap scores at that one aspect, and `STAGE_ASPECTS` holds a single value per orientation as a fallback only.
evidence  — the demo deck `examples/callout-placement.md` at 16:9, 4:3, 1:1, 4:5 and 9:16, plot area against the best layout at each shape (`engineering/decisions/2026-10-20-callout-placement/real.js`).
verify    — tier 1 unit tests that the same deck at two aspects of one orientation can pick different layouts; the runtime and engine paths agree (HARD RULE #1).
