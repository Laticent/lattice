---
origin: 3389
priority: P3
recorded: 2026-11-21
area: chart
severity: low
swimlane: engineering/chart-styling.md
deferred: off-path — a chart-kernel label change; #3389 adds the corpus that found it
source: https://github.com/Laticent/lattice/pull/3389
---

# scatter's point labels sit on its gridlines

On the preset corpus's scatter slide (slide 20), the gridlines run through the point labels
("Rotterdam to Ruhr", "Barcelona to Toulouse") in every preset and both modes. Judge A of the
first §8 round named it the worst slide of the PDF row in three of four presets. The labels stay
above 4.5:1; the line through them is the defect.

done when — no gridline crosses a point label on the corpus scatter slide in classic, light and
dark, and the chart-family label halo (or a gap in the gridline) is what clears it.
