---
origin: 2771
priority: P3
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2771
---

# Platform suites: measure a runner, and move the other OS-dependent checks onto the registry

why now   — The registry has one entry (`export-confine`, macOS). Other surfaces are already marked UNVERIFIED for lack of a real macOS or
            Windows run, for example the `flock(2)` lock and the missing GNU `timeout` on macOS in `engineering/development.md`
            (the "macOS itself remains UNVERIFIED" note), and the git-hook Windows rules (`lefthook.yml`). The first runs also give the
            wall-clock the workflow's header promises to record, which has not been measured on a runner.
where     — `.github/platform-suites.json`; the notes named above in `engineering/development.md`.
done when — each OS-dependent check that is named UNVERIFIED for want of a runner is a suite entry (with `paths` and a `why`) or is
            recorded as not worth one; the first nightly's per-suite wall-clock is written into the workflow header.
verify    — read the first nightly run of every suite and the job summaries.
---
