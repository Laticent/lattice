---
origin: 2836
priority: P1
recorded: 2026-10-21
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md §7
source: https://github.com/Laticent/lattice/pull/2836
---

# A long chart label ellipsizes mid-word ("peaked afte…")

A heatmap callout "Support backlog peaked after the migration" prints as three lines ending
"peaked afte…". `measureLabel` cuts the last allowed line by characters, so the ellipsis can
land inside a word. `main` renders the same label the same way; #2836 does not change it.

why now   — found driving long sketch-mode callout labels on #2836's preview; not caused by it.
where     — lib/components/chart/_chart-family/svg-label.js `measureLabel`, shared by every SVG chart label.
done when — the last line drops whole words before the ellipsis ("peaked…"), unless one word alone overflows the line.
evidence  — a render of the long-label callout deck before and after, plus the chart galleries' golden diff.
verify    — tier 1: unit tests on measureLabel; the golden diff shows only ellipsized labels move.
