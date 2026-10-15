---
origin: 2708
priority: P1
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-09-29-route-budget-soft-hard.md
source: https://github.com/Laticent/lattice/pull/2708
---

# The docs build is not byte-deterministic, so the route budget charges PRs for noise

why now   — a route above its soft target must declare every byte it grows, and the same commit
            builds a few bytes apart; #2708 (no bundled code changed) failed docs-build on +2 bytes.
where     — docs/scripts/check-route-budget.mjs (measure), docs/scripts/measure-route-base.sh; the
            chunk that differs between two builds of one commit (diff the two dist/_astro trees).
done when — two builds of one commit measure identical eagerJsGz on every route, or the gate
            ignores a stated noise band the owner sets.
evidence  — `measure-route-base.sh origin/main` twice at 9cef5d6: studio +2, playground +3 bytes
            apart (2026-10-15).
verify    — tier 0 gates plus three repeated builds of one commit measuring identical.
