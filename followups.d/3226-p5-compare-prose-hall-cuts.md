---
origin: 3226
priority: P5
recorded: 2026-11-15
area: comparison
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — a layout fix in a separate component, with its own demo deck and review (HARD RULE #17); fit debt that predates #3190 (all rising on Nov 13)
source: https://github.com/Laticent/lattice/pull/3226
---

# compare-prose: footer and content cuts across the axis slide at hall

why now   — compare-prose s10 rose at square@hall (clip 0 to 1) and portrait@hall (clip 9 to 10).
where     — lib/components/comparison/compare-prose/ (compare-prose.gallery.md s10, the axis variant).
done when — compare-prose s10 at hall has no footer or content cut on any page, and both cells score at or below baseline.
evidence  — at square@hall the structural pages read footer cut (p1) and content cut (p2, p3).
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only compare-prose/ --ratchet test/fit/baseline.json`
