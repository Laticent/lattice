---
origin: 3340
priority: P2
recorded: 2026-11-20
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34 (2026-11-12)
deferred: blocked — no reproduction: about 140 targeted runs and three full runs passed, the last on the commit that failed
source: https://github.com/Laticent/lattice/pull/3340
---

# The offline warm-up test failed once to paint offline, and has no known cause

why now   — `studio-warm-offline.spec.ts`, "every on-demand Studio surface opens offline after a session that
            opened none of them", failed once in a full 2-worker Chromium run on 2026-11-19: the offline
            reload never painted. It has not failed since.
where     — `docs/e2e/studio-warm-offline.spec.ts` (`goOffline` now reports what the page held when the
            offline paint fails), and the service worker it exercises.
done when — the next failure's report names the cause, and that cause is fixed with a failing arm; or 30 days
            of nightly e2e on `main` pass it, and this file is deleted.
evidence  — PR 3340 body §Caveats. Ruled out: the service worker's cache cap (393 entries of 800), query-string
            misses, Studio path rewrites, a cut in the middle of the warm-up, CPU slowed 3x to 20x, CPU-hog
            neighbors, 4 to 6 workers.
verify    — read the "offline paint failed. The page held:" report in the failing run's error.
