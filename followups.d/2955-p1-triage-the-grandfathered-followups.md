---
origin: 2955
priority: P1
recorded: 2026-10-29
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-28-raise-before-ask.md §6
deferred: large — re-checks 351 items against main, a session of its own
source: https://github.com/Laticent/lattice/pull/2955
---

# Triage the 351 follow-ups that predate the `deferred:` rule

why now   — 149 were filed in the 14 days to 2026-10-28, 89 of them `severity: low`; many are small enough to fix outright.
where     — followups.d/*.md recorded before 2026-10-29
done when — every pre-rule item is fixed, deleted as done or a duplicate, or carries `deferred: large|blocked|off-path — <why>`
evidence  — `npm run followups`; the decision doc §2 counts
verify    — `grep -L '^deferred:' followups.d/[0-9]*.md` prints nothing
