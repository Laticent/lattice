---
origin: 3194
priority: P1
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §7
deferred: large — 6 to 10 sessions on one branch and one PR, by the owner's choice (2026-11-13)
source: https://github.com/Laticent/lattice/pull/3194
---

# Replace lint-core with Squadra, in one PR

why now   — The owner chose a clean rewrite over the rule-by-rule strangler (PR #3194, closed unmerged): every deck
            rule becomes a Squadra rule on lattice-deck's tree, every consumer reads Squadra findings, one fix path,
            build-time verification, and the front-matter island built inside the rewrite.
where     — The plan and its order of work: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §7. Branch
            claude/squadra-lint-library-m1b-ox5i70. The parts of #3194 that carry over (§4) are on the closed PR's
            head, 4d350d66 (refs/pull/3194/head).
done when — §8 of the plan: lint-core.js is gone, the reference diff is 0 or explained, every consumer reads Squadra
            findings, the Studio surfaces are verified on the built Studio, lintCoreGz is measured, and the owner has
            signed off dark and light export renders.
evidence  — the reference diff and the fix diff reports; the bundle measurement; the export renders.
verify    — tier 3, the adversarial trio, on the finished PR.
