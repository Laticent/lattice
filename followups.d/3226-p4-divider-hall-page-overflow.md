---
origin: 3226
priority: P4
recorded: 2026-11-15
area: anchor
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — a layout fix in a separate component, with its own demo deck and review (HARD RULE #17); fit debt that predates #3190 (all rising on Nov 13)
source: https://github.com/Laticent/lattice/pull/3226
---

# divider: the anti-patterns slide splits to four pages and the last overflows at hall

why now   — divider s6 rose from clip 0 to 1 at square@hall and story@hall.
where     — lib/components/anchor/divider/ (divider.gallery.md s6, "When NOT to reach for divider").
done when — divider s6 at square@hall and story@hall has no page that overflows, and both cells score clip 0.
evidence  — the structural arm splits s6 into 4 pages; page 4 overflows by 38 px (fit run on this branch, Chrome 157).
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only divider/ --ratchet test/fit/baseline.json`
