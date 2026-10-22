---
origin: 2855
priority: P3
recorded: 2026-10-22
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md § 7 P2
source: https://github.com/Laticent/lattice/pull/2855
---

# The heatmap's notes under the grid still stack in one column

`buildHeatmap` now calls the shared `choose` (the pick rule is one copy), but `layoutHeatmap` still calls `laneSvg` without `flow`. Every other chart sets its notes under the figure as a group that wraps (`flow: true`, #2855).

why now   — a heatmap's notes under the grid are the one place a column still ate the plot at 9:16, and the one chart whose side choice is measured rather than defaulted.
where     — `lib/components/chart/heatmap/heatmap.transform.js` `layoutHeatmap` (`laneSvg` call, `belowBottom`), `heatmap-placement.test.js` ("square puts the key under the grid and keeps the notes beside it").
done when — the heatmap's below-grid notes flow like the other charts', and the owner has re-decided, with measured numbers, which side wins on a square slide; the test and the decision note change together, and every other heatmap slide is byte for byte as before or the PR names each one that moved.
evidence  — `diff -r` of the twelve heatmap decks at five shapes before and after (the P1 check), plus plot share at 16:9, 4:3, 1:1, 4:5, 9:16 for beside, stacked and flowing notes.
verify    — `heatmap-placement.test.js` updated with the owner's choice, nothing else changed.
