---
origin: 2854
priority: P3
recorded: 2026-10-21
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md § 7 P2
source: https://github.com/Laticent/lattice/pull/2854
---

# `flowchart` and `state-chart` do not read `@callout`

The other seventeen charts with marks take callouts through `callout-layer.js`. `flowchart` and `state-chart` cannot: the server half writes only a measuring harness and the browser lays the chart out (`flowchart.layout.js`, `state-chart.layout.js`, Trama), so the shapes' boxes do not exist where the transform runs.

why now   — P2 of the placement note lists both; the owner's split asks for callouts wherever a chart has marks.
where     — `lib/components/chart/flowchart/flowchart.layout.js` and `state-chart/state-chart.layout.js`: after the layout paints, read the callouts off the model payload (`data-fc-model`), find each shape's box, and call the same `place` and `choose` with the painted box as the plot. `liftLegends` has to run in the server half too, so the paragraph is off the slide.
done when — a callout on a flowchart and a state chart rings its shape and sets its note beside or under the figure, in the browser and in the export, and the demo deck `examples/callouts-schedule.md` carries one slide of each.
evidence  — the deck at 16:9, 4:3, 1:1, 4:5 and 9:16, light and dark.
verify    — the browser layout and the runtime path agree (HARD RULE #1); `CALLOUT_READERS` gains both names and `chart-callouts.test.js` its rows.
