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

## Measured 2026-10-12 — five real merge-queue runs (not built; the options need the owner)

Source: `list_workflow_jobs` on five green `ci.yml` merge_group runs from 2026-10-12 (every job runs
there, so `docs-build` is always present). mm:ss.

| run         | docs-build | its Vitest step | slowest integration job | docs-build ends after last integration | `changes` checkout |
| 38254870711 | 9:55       | 5:42            | 9:00                    | +1:21                                  | 2:38 |
| 38272823518 | 9:42       | 5:26            | 8:58                    | +0:44                                  | 1:34 |
| 38273528557 | 10:20      | 5:51            | 9:34                    | +0:46                                  | 1:32 |
| 38284063058 | 10:00      | 5:42            | 8:15                    | +1:52                                  | 1:01 |
| 38294389459 | 7:23       | 3:53            | 7:27                    | -0:04 (fast runner)                    | 1:29 |

- docs-build is median 9:55, not the 11.5 min the handoff carried. It is still last in 4 of 5 runs, but by a
  median of ~57 s, not minutes. The run's wall time is 12:30 in run 38284063058.
- Vitest is 5:26-5:51 in four runs (3:53 on a fast runner). The overflow guard is a steady ~1:45.
- Moving Vitest to its own job (option B) leaves `docs-build` near 4:15 and the new job near 7:25 (its own
  setup is root deps 0:30 + bundles 0:45 + docs deps 0:15 + Vitest 5:40). Both end before the slowest
  integration job (median 8:58), so the critical path becomes integration. Expected wall-time gain: about
  1 minute per run, for one more runner (~1.75 min of extra setup billed).
- **Found while measuring, a bigger lever (option D):** every gated job `needs: changes`, and on merge_group
  `changes` runs `actions/checkout` with `fetch-depth: 0`. That step took 1:01-2:38 (median 1:32) before
  integration and docs-build could start. A shallow fetch of just `merge_group.base_sha` and `head_sha`
  would keep the same diff and cut that step to seconds. That is about 1.5 min off every queue run, more than
  option B buys, and it needs no new job. It changes a CI step, so it is the owner's call.
- Not measured: option C (tune Vitest in place). It needs a real 2- or 4-vCPU runner; a local run here is
  contended and would not transfer.
