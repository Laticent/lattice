---
origin: 2494
priority: P1
recorded: 2026-09-29
area: infra
severity: high
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2494
---

# The `ci` gate still passes a tier that timed out on a PR run

status    — narrowed 2026-10-05 by #2524's follow-up PR: in the merge queue a `cancelled` tier now
            fails the gate, so a timed-out tier can no longer MERGE. On a PR run it still passes,
            because a superseded run reads the same `cancelled`. What is left is a green PR check
            that a reviewer reads as tested.
why now   — on PR #2494's `3dcc7bf`, `integration (node 22)` ran into its 25-minute
            `timeout-minutes` and GitHub concluded it `cancelled`. The `ci` gate's Verify
            step accepted `success|skipped|cancelled`, so it passed, and the CI-green beacon
            reported "cancelled: integration" under a green headline. A timeout arrives with
            the same word as a supersession.
where     — `.github/workflows/ci.yml`, the `ci` job's Verify gate (the `case` over each
            tier's result). Changing it is a CI-contract change: the owner decides.
done when — on a PR run, a tier killed by its own `timeout-minutes` fails the gate, while a
            run superseded by a newer push on the same PR still does not paint the old SHA red.
            One route: the gate reads the job's steps through the API and treats a
            `cancelled` job whose run was not superseded as a failure.
evidence  — run 36570365889, job 109413411097: the test step ended "The operation was
            canceled." at 25 minutes with 952 passed and 0 failed so far; the `ci` job
            concluded success.
verify    — a PR whose integration step sleeps past the cap turns `ci` red; a force-push
            mid-run still leaves the superseded run's `ci` green.
