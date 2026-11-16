---
origin: 3153
priority: P1
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/workflow.md §Performance
deferred: off-path — the drifted rows are the gallery's auto-split counts, which this PR does not touch; a clean main worktree at 8b889f61 drifts the same way
---

# `bench:check` reports the gallery's split rows moved on main, so the bench says "re-bless" on every branch

why now   — `npm run bench:check` on a clean `origin/main` (8b889f61) prints `split · gallery @square pages 356 → 359, split
            64 → 65` and `split · gallery @mobile pages 362 → 355, split 66 → 64`, both `MOVED (re-bless, and say why)`, then
            "Workload/dataset set drifted from baseline". Until someone re-blesses with a reason, every PR's bench run carries
            the same warning, and a real move would hide behind it. The likely cause is #3117's type change re-flowing the
            gallery; it has not been confirmed.
where     — test/benchmark/baseline.json (`split` rows), test/benchmark/engine-bench.mjs.
done when — the cause of each move is named (the commit that moved it and why the new count is right), and
            `npm run bench:bless` commits the new counts with that reason, so `bench:check` on main reports no drift.
evidence  — `npm run bench:check` on main, before and after, with no `MOVED` row.
verify    — tier 0: the owner of the change that moved the split confirms the new page count is the intended one.
