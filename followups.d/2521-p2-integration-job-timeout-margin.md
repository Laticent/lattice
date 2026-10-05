---
origin: 2521
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2521
---

# The integration job runs into its 25-minute timeout after every test has passed

why now   — on #2521 (9c37039) `integration (node 22)` ran 972 tests (971 pass, 0 fail, 1
            skipped, 1427 s) and was then cancelled at `timeout-minutes: 25`
            (.github/workflows/ci.yml, the integration job). The `ci` gate counts `cancelled`
            as passing (it is the supersession case), so a real cancelled-by-timeout run
            reads green, and a run that grows a little longer cancels mid-suite with no
            failure shown. #2517's runs took 21 to 25 minutes on the same job.
where     — .github/workflows/ci.yml (the integration job's `timeout-minutes`, and the
            `ci` gate's `success|skipped|cancelled` case); the integration tier's slowest
            files (`node --test` durations in the job log)
done when — the integration job finishes with margin (or is split or sped up), and a
            timeout cancel no longer reads as a pass at the gate
evidence  — job durations over a week of `main` runs before and after; a run cancelled by
            timeout shown failing the gate
verify    — owner call first: a CI job change is on CLAUDE.md's stop list (the CI / hook
            contract), so put the options and their measured cost to the owner
