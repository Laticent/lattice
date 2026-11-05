---
origin: 3040
priority: P2
recorded: 2026-11-05
area: engine
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §2
deferred: off-path — a timing assertion in the segno parser's tests; PR #3040 changes no segno file
---

# The segno "grows linearly" test failed on a wall-clock ratio a hair over its ceiling

`docs/src/lib/segno/engine-additions.test.ts` › "the guarantee, on a grammar that uses all three" › "grows linearly: many
short comments" times a parse at 1× and 8× the input and asserts the ratio stays under 24 (3× the linear 8). In
`docs-build` at `7a1a709` (job 127526524305) it read 24.27, the only failure in 9,198 tests. PR #3040 changes no segno
file, and the same test passed at that PR's previous head.

A ceiling at 3× linear should not trip on a linear parser, so either the runner stalled mid-measurement (one GC pause or
a noisy neighbor during the short 1× timing inflates the ratio) or the 1× sample is too short to time well. Leads, not
verified: take the best of several timings at each size, or time a larger 1× input so a single stall cannot dominate.

done when — the ratio is measured in a way one stall cannot push past the ceiling, or the test's flake rate over 50 CI
runs is shown to be zero with the reason recorded.
