---
origin: 2750
priority: P1
recorded: 2026-10-17
area: infra
severity: low
swimlane: docs/route-budget.d/README.md
source: https://github.com/Laticent/lattice/pull/2750
---

# The route budget charges a PR bytes it does not add

why now   — #2750 changes no Studio code, yet CI measured +8 bytes of Studio eager JS against main
            on two heads (e3c60fc, and b035c0f after rebasing onto main); the same script run
            locally measures +0 against both 07e11f4 and d2a17d1. #2744 saw +2/+7/+8 swings too.
            A gate that charges phantom bytes taxes every PR with a declaration it cannot explain.
where     — docs/scripts/measure-route-base.sh (base build in a worktree), docs/scripts/
            check-route-budget.mjs; compare the base and head chunk lists CI writes against a
            local run of the same two commits
done when — the base and head builds of an unchanged route measure equal in CI, or the gate
            tolerates a stated noise floor that the measurement justifies
evidence  — CI and local per-route numbers for one PR that changes no Studio code, before and after
verify    — tier 1 checker, because it changes a gate every PR runs
