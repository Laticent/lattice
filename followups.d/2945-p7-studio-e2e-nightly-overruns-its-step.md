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

status    — built 2026-10-29 (owner's pick D1, eight legs at the 45-minute step after the four the
            card first offered measured about 46 minutes each). FIRST FULL RUN: dispatched on #2973's
            branch, run 40841405144 at c02d2d6. Every leg finished its run step inside the cap
            (13.4-29.3 minutes, 272-273 tests each), and `e2e-report` joined them: 2,073 passed and
            the suite reached its end for the first time since 2026-09-22. What is left is not the
            time budget but the 48 failing tests the old nightly never reached, in 26
            specs: studio-raster-export-marker.spec.ts (6), journeys/author-export.spec.ts (4), studio-read-article-charts.spec.ts (4), compose-stress.spec.ts (3), mermaid-cache-bindings.spec.ts (3), playground-kpi-pill.spec.ts (3), print-preview-documents.spec.ts (3), visual.spec.ts (3), studio-warm-offline.spec.ts (2), anima-motion-frames.spec.ts (1), blank-slide-editors.spec.ts (1), command-palette.spec.ts (1), journeys/chart-export.spec.ts (1), marp-bundle-panes.spec.ts (1), mermaid-unavailable-export.spec.ts (1), preview-remote-subresource.spec.ts (1), scenarios/exec-board-update.spec.ts (1), scenarios/power-user-fabricate.spec.ts (1), venue-fixed-size.spec.ts (1), workspace-backup-size.spec.ts (1), preview-nav.spec.ts (1), ios-zoom.spec.ts (1), chart-popup-dismiss.spec.ts (1), demo-mobile.spec.ts (1), library-header-search.spec.ts (1), library-images.spec.ts (1). The four nearest #2973's diff (mermaid-cache-bindings,
            preview-remote-subresource, studio-read-article-charts, mermaid-unavailable-export) fail
            identically on origin/main. Close this item once a SCHEDULED run on main finishes; the
            failing specs belong to #2035 and are triaged there one by one.
            SECOND FULL RUN, on main at 242de4a (dispatched 2026-10-29, run 40914402541): all eight legs
            ended their run step inside the 45-minute cap (14.6, 30.5, 19.8, 25.2, 27.5, 13.6, 29.6 and
            32.0 minutes for legs 1 to 8), the run took 42 minutes end to end, and `e2e-report` joined
            all eight verdicts ("legs: 1/8 failed … 8/8 failed", the same specs). Its filing step
            FAILED: the job checks nothing out, so `gh issue list` died with "failed to run git: not a
            git repository", and no rolling issue was filed or appended. Fixed by `GH_REPO` on the
            job's env; the next run shows whether it files.
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
