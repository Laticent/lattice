---
origin: 3334
priority: P2
recorded: 2026-11-20
area: infra
severity: medium
swimlane: engineering/quality-assessment.md
deferred: off-path — #3334 re-blessed only the dead-code rows; the other rows need their own look before any bless
source: https://github.com/Laticent/lattice/pull/3334
---

# The quality baseline's non-knip rows are far out of date

why now   — test/quality/baseline.json says 64 functions at complexity 15 or more, worst 45, and 93 duplicate clones; on 2026-11-20 the tree has 1,213, worst 289, and 433 clones (duplication fell from 2.56% to 1.57%, so the clone count may be a jscpd version change). The full `quality:check` therefore fails on main, which makes it useless as a ratchet.
where     — test/quality/baseline.json, tools/quality-assessment.js, tools/complexity-report.js, .jscpd.json.
done when — each moved row is explained (a real change, a tool version, or a counting change) and re-blessed with that reason in the PR, so `npm run quality:check` passes on main.
evidence  — per row: the old and new number and the reason.
verify    — tier 1 checker, because a re-bless hides real regressions if the reason is wrong.
