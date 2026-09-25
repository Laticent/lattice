---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart in a narrow pane draws its labels below their designed size

why now   — chart kernels pick a viewBox from orientation and the SVG scales into its box,
            so a chart in a 45% pane shrinks its value labels and legend (visible in
            examples/panes.pdf, the bar and pie slides). And nothing tells the author: a
            30-category bar pane at 50% truncates every label to "Region…" and overprints
            its values, yet neither the overflow probe nor the TYPE FLOOR probe
            (probeFigureLegibility) reported it (measured on PR #2376). That is why the chart
            pane budgets are `basis: editorial` — there was no ceiling to measure.
where     — lib/components/chart/_chart-family/cartesian.js (viewFor), svg-legend.js, the
            per-chart kernels.
done when — a chart pane's viewBox follows the pane's px box, so label size matches a
            full-slide chart and the collision logic runs at the real scale; the TYPE FLOOR
            probe flags an unreadable chart pane; and `tools/calibrate-capacity.js --pane`
            can measure a chart's ceiling, so its budget turns `measured`.
evidence  — decision note §6.2 and §3.2.
verify    — measure a value label's rendered px height in a 45% bar pane vs a bar slide.
