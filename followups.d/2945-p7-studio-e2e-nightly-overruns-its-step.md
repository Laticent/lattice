---
origin: 2945
priority: P7
recorded: 2026-10-29
area: infra
severity: high
swimlane: engineering/gotchas/ci.md § The Studio E2E nightly is GREEN while specs fail
deferred: blocked — the owner's call: sharding adds CI jobs and raising the cap changes a number the owner set (CLAUDE.md second filter, rows 2 and 3)
source: https://github.com/Laticent/lattice/actions/runs/40674917008
---

# The Studio E2E nightly times out a quarter of the way through its suite, every night since 2026-09-22

why now   — The run step's `timeout-minutes: 45` stops 2,118 tests on two workers at about test
            509 (run 40674917008, 2026-10-28). The last green scheduled run is 35587408748
            (2026-09-21); the test count grew from 1,395 (10-19) to 2,118 (10-28). It is not the
            ubuntu-24.04 pin (#2939): every earlier run already used that image. Inside the quarter
            that runs, the same specs fail on 10-25, 10-27 and 10-28: `command-palette.spec.ts:139`,
            `compose-change-flash.spec.ts:49`, `journeys/author-export.spec.ts` (four tests),
            `chart-export.spec.ts:22`, `anima-motion-frames.spec.ts:247`; #2035 collects them.
            Three quarters of the suite has not run on main for five weeks.
where     — `.github/workflows/studio-e2e-nightly.yml` (`:138` step cap 45, `:65` job cap 60),
            `docs/playwright.config.ts:72` (`workers: isCI ? 2`).
done when — the owner picks a route (shard the job into N legs with a report merge, or raise the
            caps to fit about 3x today's runtime) and a scheduled run reaches the end of the suite;
            then the specs it reports red are triaged one by one.
evidence  — the per-night table in the PR body for P7; the workflow's own comment near `:330`
            records the step overrunning on 5 of 6 runs as early as 2026-09-20..25.
verify    — tier 1: a `workflow_dispatch` run of the changed workflow that completes.
