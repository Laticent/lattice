---
origin: 2717
priority: P2
recorded: 2026-10-16
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §6.3 rule 1
---

# Check a debt entry's `seeded` date against git, not the entry's own word

why now   — lib/conformance/ledger.js enforces "debt only on the clause's day" by comparing two hand-written dates, so a back-dated entry passes; phase 2 is the first phase that will seed real debt
where     — lib/conformance/ledger.js ledgerProblems; test/conformance/debt.json
done when — the commit that added each ledger entry is compared with the commit that added its clause, and a later entry fails
evidence  — a failing-arm test with a back-dated entry in test/unit/conformance/static.test.js
verify    — tier 0, because it is one function with its own failing arm
