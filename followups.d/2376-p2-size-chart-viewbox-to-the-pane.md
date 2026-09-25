---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart in a narrow pane draws its labels below their designed size

why now   — chart kernels pick a viewBox from orientation and the SVG scales into its box,
            so a chart in a 45% pane shrinks its value labels and legend (visible in
            examples/panes.pdf, the bar and pie slides).
where     — lib/components/chart/_chart-family/cartesian.js (viewFor), svg-legend.js, the
            per-chart kernels.
done when — a chart pane's viewBox follows the pane's px box, so label size matches a
            full-slide chart and the collision logic runs at the real scale.
evidence  — decision note §6.3.
verify    — measure a value label's rendered px height in a 45% bar pane vs a bar slide.
