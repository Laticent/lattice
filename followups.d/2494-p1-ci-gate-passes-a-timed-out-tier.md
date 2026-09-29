---
origin: 2494
priority: P1
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2494
---

# The `ci` gate passes a tier that timed out

why now   — on PR #2494's `3dcc7bf`, `integration (node 22)` ran into its 25-minute
            `timeout-minutes` and GitHub concluded it `cancelled`. The `ci` gate's Verify
            step accepts `success|skipped|cancelled`, so it passed, and the CI-green beacon
            reported "cancelled: integration" under a green headline. The allowlist reads
            `cancelled` as a run superseded by a newer push (the drift-watch note), but a
            timeout arrives with the same word. A tier that never finished can merge.
where     — `.github/workflows/ci.yml`, the `ci` job's Verify gate (the `case` over each
            tier's result). Changing it is a CI-contract change: the owner decides.
done when — a tier killed by its own `timeout-minutes` fails the gate, while a run
            superseded by a newer push on the same PR still does not paint the old SHA red.
            One route: the gate reads the job's steps through the API and treats a
            `cancelled` job whose run was not superseded as a failure.
evidence  — run 36570365889, job 109413411097: the test step ended "The operation was
            canceled." at 25 minutes with 952 passed and 0 failed so far; the `ci` job
            concluded success.
related   — the tier runs close to that cap on its own. Its test step took 15 min 20 s on
            #2494's `f9dd027` and 23 min 5 s on `87e42c4`. Unrelated #2482's job took
            23 min 45 s the same morning. Per suite, every file slowed by 50–70% together,
            so it is runner speed, not one test. At 23–24 minutes against a 25-minute cap,
            a slow runner times the tier out, and with the gate as it is, that passes.
verify    — a PR whose integration step sleeps past the cap turns `ci` red; a force-push
            mid-run still leaves the superseded run's `ci` green.
