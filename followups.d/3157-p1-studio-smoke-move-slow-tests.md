---
origin: 3157
priority: P1
recorded: 2026-11-22
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — an owner's call on the CI contract (moving tests out of a per-PR job), and moot while the job runs well under its cap
source: https://github.com/Laticent/lattice/pull/3157
---

# Option: move the two slowest `@smoke` tests out of the per-PR `studio-smoke` job

why now   — An owner's-call option, recorded with its numbers. It is moot today. #3157 stopped recording a trace and a
            video per test, and `studio-smoke` now runs 9–12 min against its 20-min cap (8.2 min measured locally
            with neither). If the job climbs back toward the cap, two tests carry the most time:
            `export-photo-size` (95–110 s) and `demo` (56–61 s). Moving both to the nightly saves about 1.5 min a
            PR run, and they would no longer run on every PR. Related: followups.d/3150-p2-studio-smoke-at-its-time-cap.md,
            whose 16.5-min premise predates #3157.
where     — .github/workflows/ci.yml, the `studio-smoke` job; the `@smoke` tags on those two specs in docs/e2e/.
done when — the owner picks: keep them per-PR, or move them to the nightly with the time saved measured on three
            PR runs.
evidence  — the per-test times from #3157; the job times after it.
verify    — `studio-smoke` durations on three PR runs before and after.
