---
origin: 3313
priority: P7
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 3
deferred: large — a cross-component refactor with its own decision note and owner sign-off (D5)
source: https://github.com/Laticent/lattice/pull/3313
---

# One shared card surface instead of 37 hand-built ones

why now   — about 37 component sheets paint their own card; padding and radius have drifted (provisional count: 9 paddings, 9 radius forms), the way card-tag had before engineering/decisions/2026-09-27-card-tag-register.md.
where     — a new lib/base/base.card.css with a zero-specificity :where() recipe and tokens --card-fill, --card-radius, --card-pad, --card-lift; components keep their own slots.
done when — a decision note for the contract is approved, then wave 1 (components already on the majority recipe) migrates with 0 differing elements in light, dark and print.
evidence  — computed-style gate summaries per wave.
verify    — tier 2 trio on the contract, tier 1 per wave, because it touches most components.
