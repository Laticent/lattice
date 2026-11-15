---
origin: 3226
priority: P3
recorded: 2026-11-15
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — a layout fix in a separate component, with its own demo deck and review (HARD RULE #17); fit debt that predates #3190 (all rising on Nov 13)
source: https://github.com/Laticent/lattice/pull/3226
---

# matrix-grid: a five-column grid runs off a 9:16 box

why now   — matrix-grid s3 story@laptop rose from clip 0 to 1. The slide is the gallery stress case ("six categories by five columns is the practical ceiling"), and the ceiling does not hold on a story box.
where     — lib/plugins/chart-family/kinds/matrix-grid/ (column sizing on a narrow stage).
done when — matrix-grid s3 fits at story@laptop, with every column label and pill in full, and the cell scores clip 0.
evidence  — the render shows `FIELD` as `FIELI` and `Chief` as `Chie`; the probe reports a content cut.
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only matrix-grid/ --ratchet test/fit/baseline.json`
