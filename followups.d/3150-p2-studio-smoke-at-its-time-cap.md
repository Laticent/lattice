---
origin: 3150
priority: P2
recorded: 2026-11-12
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: blocked — the 20-minute cap is an owner number (PR #2822 raised it from 15); raising it again or trimming the smoke set is the owner's call, not a session's
source: https://github.com/Laticent/lattice/pull/3150
---

# `studio-smoke` runs into its 20-minute cap: a green run is cancelled with all its tests passed but one

why now   — on #3136, `studio-smoke` for 588b6f8d passed in 19m34s (05:14:31 to 05:34:05), and the run for 82caca39 was
            cancelled at the cap: `npm run test:e2e:smoke` started 07:27:14, test 154 of 155 passed at 07:43:51, and the
            job ended three seconds later at 20m16s. Nothing hung and nothing failed; the job ran out of time. The cap was
            raised from 15 to 20 on 2026-10-22 when a passing run took 14m56s (tests 12m17s); the tests alone now take
            about 16.5 minutes on 2 workers. `studio-smoke` is advisory (the `ci` gate does not count it), so a cancel
            does not block a merge, but it hides a real red behind a timeout.
where     — .github/workflows/ci.yml, the `studio-smoke` job (`timeout-minutes: 20`); the @smoke set (155 tests).
done when — the owner picks one: raise the cap with measured headroom, run the smoke set on more workers or shards, or
            trim it to its purpose; and three PR runs finish under the cap with room to spare.
evidence  — job 131028781438 (cancelled) and the 588b6f8d run's timings above.
verify    — tier 1 checker.
