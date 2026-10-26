---
origin: 2494
priority: P2
recorded: 2026-10-26
area: infra
severity: medium
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2494
---

# Prove the `ci` gate's timeout arm on a real PR run

why now   — the gate now fails a `cancelled` tier on a PR run when the PR's head is still the
            run's commit (`ci.yml`, Verify gate, exception 3). It was checked only against a
            stubbed `gh`. Three GitHub behaviors it relies on were not exercised: a job killed
            by `timeout-minutes` reads `cancelled` in `needs.<job>.result`; the `if: always()`
            `ci` job and its Verify step run in a run that `cancel-in-progress` killed; and the
            PR API already shows the new head when that step runs.
where     — a scratch PR on a throwaway branch (never this PR's branch).
done when — two runs seen: (a) a tier whose step sleeps past a shortened `timeout-minutes`
            turns `ci` red with the "cancelled on the PR's current head" error; (b) a push
            during a running tier leaves the superseded run's `ci` green.
evidence  — the two run URLs and the Verify step's log line from each.
verify    — tier 2: a real GitHub Actions run, not a stub.
