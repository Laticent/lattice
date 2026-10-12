---
origin: 2622
priority: P2
recorded: 2026-10-11
area: infra
severity: medium
swimlane: engineering/development.md
---

# Cut docs-build, now the CI critical path after the integration shard

```text
  P2 · [no ticket] After the integration job was sharded (#2623) a CI run takes about 12 min and
       `docs-build` finishes after the slowest integration leg.
       why now   — carried in from the 2623 handoff: docs-build 11.5 min vs slowest integration
                   leg 10.2 min; its Vitest step alone is 5:46. NOT re-measured in this session:
                   the one CI run sampled (38125793642) skipped docs-build (no docs change), and a
                   local Vitest timing run was killed at its time limit under CPU contention.
       where     — .github/workflows/ci.yml docs-build job: "Test docs React islands (Vitest + RTL)",
                   "Measure the base for the per-PR route allowance" (~67s), "Build docs site",
                   the overflow guard. docs/vitest.config.ts (jsdom, default pool).
       options   — owner's call (CLAUDE.md second filter, row 2: adding or splitting a CI job):
                   (A) shard Vitest across a 2-4 leg matrix (`vitest --shard=K/N`), a new matrix
                       in the docs-build job; (B) move the Vitest step to its own parallel job and
                       keep build + overflow in docs-build (removes ~5:46 from the critical path;
                       adds one runner and one `needs` edge); (C) no job change: tune Vitest in place
                       (pool/worker count, `isolate`), measured on a 4-vCPU runner first.
       done when — the docs-build wall time drops below the slowest integration leg, with no test skipped.
       evidence  — per-step timings from two real docs-touching CI runs, before and after. Pull them
                   with the Actions API (`list_workflow_jobs` on a run whose `changes.docs` is true).
       verify    — tier 1 checker; the `ci` gate's `needs` list must still include every blocking tier.
```
