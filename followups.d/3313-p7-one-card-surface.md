---
origin: 3313
priority: P7
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 3
deferred: large — a cross-component refactor with its own decision note; D5 (2026-11-19) says no uniform look, every current look stays as token values
source: https://github.com/Laticent/lattice/pull/3313
---

# One shared card surface instead of 37 hand-built ones

why now   — about 37 component sheets paint their own card; padding and radius have drifted (provisional count: 9 paddings, 9 radius forms), the way card-tag had before engineering/decisions/2026-09-27-card-tag-register.md.
where     — a new lib/base/base.card.css with tokens in :where() (painted properties keep today's specificity) and tokens --card-fill, --card-radius, --card-pad, --card-lift; components keep their own slots. Precondition: guard G5 in the plan note §3 (Guards from the adversarial review).
done when — a decision note for the contract is approved, then wave 1 (components already on the majority recipe) migrates with 0 differing elements in light, dark and print.
evidence  — computed-style gate summaries per wave.
verify    — tier 2 trio on the contract, tier 1 per wave, because it touches most components.
