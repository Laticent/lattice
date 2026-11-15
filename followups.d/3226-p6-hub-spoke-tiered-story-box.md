---
origin: 3226
priority: P6
recorded: 2026-11-15
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — a layout fix in a separate component, with its own demo deck and review (HARD RULE #17); fit debt that predates #3190 (all rising on Nov 13)
source: https://github.com/Laticent/lattice/pull/3226
---

# hub-spoke: a tiered figure runs off both sides of a 9:16 box

why now   — hub-spoke s7 story@laptop rose from clip 0 to 1, and so did gallery.md slide 94 (clip 1 to 2), the same tiered figure.
where     — lib/plugins/chart-family/kinds/hub-spoke/hub-spoke.transform.js (the two-tier layout and the portrait stage ceilings).
done when — a tiered hub-spoke at story@laptop keeps every leaf and leaf label inside the viewBox; hub-spoke s7 and gallery.md s94 score at baseline.
evidence  — the leaves and their labels run off both sides; the probe names leaf label `Exports` as cut (gallery.md s94).
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only hub-spoke/ --ratchet test/fit/baseline.json`
