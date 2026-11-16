---
origin: 3226
priority: P1
recorded: 2026-11-15
area: chart
severity: high
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: off-path — a pre-existing clip in a separate component this diff does not touch; it was already rising on Nov 13, before #3190, and gets its own PR, demo deck and review (#17)
source: https://github.com/Laticent/lattice/pull/3226
---

# stacked-bar: a two-line period label loses its year row below the axis

why now   — the fit nightly counts stacked-bar s5 as clipped in 4 cells (square@laptop, square@hall, portrait@laptop, story@laptop). It is the most common chart, and any author who writes `Q1 FY24` periods hits this.
where     — lib/plugins/chart-family/kinds/stacked-bar/ (the period label row under the axis); gallery slide 5 "Six parts, six periods".
done when — stacked-bar s5 scores clip 0 in all four cells on the fit harness, both lines of each period label render, and the fit baseline is re-blessed at the lower count.
evidence  — the export probe (probeContentClipped) names `FY24` as cut text; the render shows only `Q1 … Q2` with no year row (fit dispatch 43730170891, Chrome 157).
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only stacked-bar/ --ratchet test/fit/baseline.json`
