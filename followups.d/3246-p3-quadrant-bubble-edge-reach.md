---
origin: 3226
priority: P3
recorded: 2026-11-16
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: off-path — pre-existing on main, identical before and after #3246, in the bubble reach rather than the axis titles that PR fixes; it gets its own PR, demo deck and review (#17)
source: https://github.com/Laticent/lattice/pull/3246
---

# quadrant bubble: an edge bubble covers the range ticks and pushes a corner name off the canvas

why now   — the card checker for #3246 stress-tested the bubble variant at hall and found two defects that render the same on `main`.
where     — lib/plugins/chart-family/kinds/quadrant/quadrant.transform.js (`bubbleRoom` shrinks the plot but the range ticks and the corner-name band do not move with the reach).
done when — a bubble at any edge leaves every range tick readable ("100", "10" in full, not under a bubble) and every quadrant name on the canvas, at square, portrait and story at hall.
evidence  — a bubble at the top or right edge covers the range ticks: "100" reads "1", and "10" sits under the bubble. A top-edge bubble pushes "STRATEGIC BETS" past the top of the canvas. Seen side by side on main and on #3246's head.
verify    — a quadrant bubble deck with size-4 bubbles at each edge (x 0.3 / 9.7, y near 0 and 100), rendered at square, portrait and story at hall; then `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only quadrant/ --ratchet test/fit/baseline.json`
