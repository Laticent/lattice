---
origin: 3050
priority: P1
recorded: 2026-11-06
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md
deferred: off-path — PR #3050 fixed slide-output bugs; its split change is byte-identical on this record, which was already stale
source: https://github.com/Laticent/lattice/pull/3050
---

# `npm run split:golden:check` reports 288 drifts on a clean `main`

why now   — the split golden is the check P1-style split fixes cite as evidence, and on `main` at
            dd1fb87 it reports `288 drift(s) across 80 deck(s)`, mostly "page 1 moved first". A
            check that is red on `main` cannot show whether a change moved a split page. No CI job
            runs it, so nothing caught the drift.
found     — while verifying PR #3050 P1: the check's output was byte-identical with and without the
            change, and identical on clean `main`.
where     — test/oracle/split-pages.json, tools/split-pages-golden.js; find the commit that moved
            page 1 everywhere (likely a cover or rail change) and decide whether it was intended.
done when — `npm run split:golden:check` exits 0 on `main`, re-blessed with the reason, or the
            drift is fixed; and a decision is recorded on whether the check joins CI.
evidence  — the check's exit code and drift count before and after.
verify    — npm run split:golden:check
