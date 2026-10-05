---
origin: 2510
priority: P2
recorded: 2026-10-04
source: https://github.com/Laticent/lattice/pull/2510
---

# playground-first-paint: confirm the seed fix holds over twenty CI runs

status    — FIX LANDED on claude/segno-phase-2: the seed step now runs at full speed and waits
            on the live preview before the snapshot; the 6x throttle applies only to the reload
            under test. Locally: 5 of 5 throttled runs green (20 of 20 tests across the file's
            @smoke cases). What is left is the CI count in "done when".
            2026-10-05, the trama continuation PR: the Explore reload case now seeds at full
            speed too. Locally, production build, --repeat-each 30 --workers 2: 60 of 60 for
            the two reload cases with the seed unthrottled; 60 of 60 before it (2 and 4
            workers), so the flake does not reproduce here and CI is the only count.

why now   — studio-smoke failed on #2510 (run 37244171446) and on an unrelated PR
            (claude/plugin-system-continuation-imi319, run 37219253540), both in the same
            test and the same place. Both PRs passed the test on their other runs, and recent
            merge-queue runs are green. #2510 touches no Playground code (only
            docs/src/lib/segno/, which only /segno imports). An intermittent red per-PR check
            costs a re-run and a diagnosis on every PR it lands on.
where     — docs/e2e/playground-first-paint.spec.ts:171, inside seedRealSession(): under
            6x CPU throttling the poll waits 40 s for `lattice-docs-pg-last-slide` in
            localStorage — the Playground's first snapshot — and the slow runs never write it
            in time. The test's real check (one geometry per element on reload) never runs.
done when — the seed step waits on the condition that actually precedes the snapshot (the
            live preview, the way the reload half waits on `.pg-preview-wrap.is-live`), or
            seeds without the throttle and throttles only the reload, so it no longer times
            out on a slow runner; and twenty consecutive CI runs of the spec are green.
evidence  — the failing runs' annotations (the timeout at :171 on both), and the run count
            after the fix.
verify    — tier 2; `npm run test:e2e:smoke -- playground-first-paint` locally under the
            same throttle, then CI.
