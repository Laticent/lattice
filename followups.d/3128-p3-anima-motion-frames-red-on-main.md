---
origin: 3128
priority: P3
recorded: 2026-11-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-10-compose-first.md §5
deferred: off-path — fails 3 of 3 on main at 192618d, deterministically (not a timing test); PR #3128 does not touch motion
source: https://github.com/Laticent/lattice/pull/3128
---

# anima-motion-frames "createDrawable normalizes real marks" fails on main

why now   — `docs/e2e/anima-motion-frames.spec.ts:303` ("createDrawable normalizes real marks and
            seeks deterministically") fails on `main` 3 times out of 3 with
            `expect(received).toBeLessThan(1000)`, received 1228.4. The 1000 is anime's normalized
            path length (`pathLength="1000"`), not a duration: the drawn length at t=0.5 reads past
            the whole path, so `stroke-dasharray` is no longer in the normalized units the test (and
            the motion design it guards) assumes. Deterministic, so not a HARD RULE #32 flaky test.
where     — docs/e2e/anima-motion-frames.spec.ts:247-306 and the motion code it drives.
done when — the cause is found (an anime version change, or the live chart's mark now carrying its own
            pathLength) and the spec passes on main.
evidence  — reproduced 2026-11-11 on a full `main` build (192618d): `npx playwright test
            e2e/anima-motion-frames.spec.ts:247 --project=desktop --repeat-each 3`.
verify    — the same command, on a fresh build.
