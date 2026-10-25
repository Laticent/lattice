---
group: Lint & audit
---
Chart-finish REACH gate (`tools/chart-finish-reach.mjs --check`): renders the chart gallery once per theme x mode, flips the finish in a real Chrome, and fails when a chart mark a finish should paint is left unpainted (and not sanctioned), a reached mark keeps a gradient, the default finish flattens a ramp's range, a heatmap value falls under 4.5:1 on its own cell, or any finish pushes a text run under the floor the unfinished paint cleared. Slow (a full theme sweep in Chromium), so it runs nightly in `integration-nightly.yml`, not per PR. Without the flag it is a report.
