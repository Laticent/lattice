---
origin: 3128
priority: P3
recorded: 2026-11-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-10-compose-first.md §5
deferred: off-path — fails 3 of 3 on main at 192618d; PR #3128 does not touch motion
source: https://github.com/Laticent/lattice/pull/3128
---

# anima-motion-frames "createDrawable normalizes real marks" fails on main

why now   — `docs/e2e/anima-motion-frames.spec.ts:247` ("createDrawable normalizes real marks and
            seeks deterministically") fails on `main` 3 times out of 3 with
            `expect(received).toBeLessThan(1000)`, received 1228.4. The spec is nightly, so nothing gates
            on it. If the 1000 is a duration, the assertion is a stopwatch, which HARD RULE #32 bars from
            a pass/fail test.
where     — docs/e2e/anima-motion-frames.spec.ts:247 and the motion code it drives.
done when — the test passes on main without a time budget, asserting on work done instead (#32).
evidence  — reproduced 2026-11-11 on a full `main` build (192618d): `npx playwright test
            e2e/anima-motion-frames.spec.ts:247 --project=desktop --repeat-each 3`.
verify    — the same command, on a fresh build.
