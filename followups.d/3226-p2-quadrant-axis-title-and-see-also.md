---
origin: 3226
priority: P2
recorded: 2026-11-15
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — the label-placement pass on a plane the heading squeezes to a strip needs a placement rework, not a band size; the axis-title half of this item shipped in the PR that narrowed it
source: https://github.com/Laticent/lattice/pull/3226
---

# quadrant: the fourteen-point stress slide overprints and clips its labels at portrait@hall

why now   — quadrant's portrait@hall cell is one clip above its baseline (2 to 3). The y-axis-title rise at square@hall is fixed; this is the rise left. The See-also overflow the first version of this item named is inside the baseline (square@hall is back to 1).
where     — lib/plugins/chart-family/kinds/quadrant/quadrant.transform.js, the item-label placement on the chart form kernel; quadrant.gallery.md, the "Stress test — fourteen initiatives, dense labels, one owner" slide.
done when — at portrait@hall that slide sets every item label inside the canvas without overprinting another label or a quadrant name, and quadrant's portrait@hall cell scores at or below its baseline.
evidence  — the export probe names `Decision-log` as cut text. The render shows a four-line heading squeezing the plane to a strip, "Weekly signal brief" cut at the top, and "Adoption dashboard" printed into "TIME SINKS".
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only quadrant/ --ratchet test/fit/baseline.json`
