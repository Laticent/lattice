---
origin: 3021
priority: P15
recorded: 2026-11-08
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — a design change across every chart kernel; the owner chose "fix jank now, redesign next" on #3088 (2026-11-08), design note first for the owner's review
source: https://github.com/Laticent/lattice/pull/3088
---

# Responsive chart labels: one box contract, one label rule, one key rule; every kind's source on its marks

why now   — #3088 made 21 kinds redraw for a phone, but the phone forms are per-kind patches: quadrant swaps a module-level `let GEOM` for the length of a render, word-cloud scales its key by a hand-picked `scale(2.4)`, tower and risk-matrix each restack their own way, and the "this is the phone redraw" signal rides as a `fluid` field on the pane canvas. funnel and gantt read no canvas at all (9px on a phone). `--chart-text-min` resolves to 25px in the fluid view, so roadmap's phase pill had to bypass the floor. And several readers (line, slope, stacked-bar, heatmap, bullet, hub-spoke, ep-curve, tower) still parse the `<desc>` prose, the screen-reader table or painted text, which is where the wording coupling and the stripped-name gap (3021-p13) come from. The owner: labels should be responsive, and every chart should carry its source in data attributes the way bar does.
where     — lib/plugins/chart-family/shared/cartesian.js (`viewFor`, `fluidNarrow`), the kernel ctx (chart-family.dispatch.js THE KIND CONTRACT), shared/legend-svg-key.js, every kind's transform, lib/runtime/chart-readers/, the `--chart-text-min` token in the fluid view.
done when — a design note the owner approved, then: (1) one box contract every kernel reads (`{w, h, pxPerUnit, fluid}`), (2) one label rule (every label prints at the slide's text size in px, never under 10px, in any box), (3) one key rule for a narrow box (under the chart, wrapping rows, at label size) replacing tower's, quadrant's, risk-matrix's and word-cloud's one-offs, (4, done on #3088: every kind records its source on its marks and no reader parses prose; the redraw sizes labels from the slide's body text) funnel and gantt redraw at 390 x 844 with no label under 10px.
evidence  — every gallery at 390 x 844 before/after; the narrow-forms and chart-readers tests; exports byte-identical bar the new attributes.
verify    — node --test test/unit/runtime/chart-readers.test.js test/unit/components/narrow-forms.test.js test/integration/export/fluid-chart-redraw.test.js; the fluid render of each gallery at phone width.
