---
origin: 3256
priority: P3
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — the owner ruled on #3256 to take its merge ask first and fix this right after; claimed by session_01DPMMjFQcat1AAf5y6KDELj
source: https://github.com/Laticent/lattice/pull/3256
---

# supplied-page-position reads Present's frame before it repaints

why now   — docs/e2e/supplied-page-position.spec.ts:18 read page "9" with the counter at 8, once in #3256's full run.
where     — Present's counter moves on the click; the presented frame repaints only when the coalesced render lands
            (the same shape #3414 fixed in proof-run). The loop reads the frame's section right after the counter.
done when — the test waits for the frame's own `data-lattice-pagination` to equal the counter before reading.
evidence  — base 84bb0806e: 1 failure in 48 at --workers=8 ("9" vs "8"). After: failing arm (read without the wait,
            under load), 10/10 alone, ×5 at 4 workers, plus ≥48 at 8 workers.
verify    — tier 0 gates, because it is test-only.
