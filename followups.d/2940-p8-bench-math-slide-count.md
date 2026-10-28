---
origin: 2940
priority: P8
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/workflow.md §Performance
deferred: off-path — the drift is on main (be19565) and no Filo change touches the math deck
source: https://github.com/Laticent/lattice/pull/2940
---

# `npm run bench:check` reports the math deck at 16 slides against a blessed 17

```text
  P8 · [no ticket] re-bless the math rows, saying which change moved the count
       why now   — on be19565, `npm run bench:check` prints "math 17 → 16 slides, WORKLOAD
                   CHANGED" for the render and edit tiers, so those two rows record nothing
                   until someone re-blesses them with the reason.
       where     — test/benchmark/baseline.json (datasets.math, editDatasets["edit · math"])
       done when — the commit that changed the math deck's slide count is named and the rows are
                   re-blessed with it, and `bench:check` reads them ok.
       evidence  — the bench:check output before and after.
       verify    — tier 0.
```
