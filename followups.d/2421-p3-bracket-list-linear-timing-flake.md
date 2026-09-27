---
origin: 2421
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2421
---

# `bracket-list` "cost stays linear" fails on a busy CI runner

`test/unit/core/bracket-list.test.js` › "nothing backtracks" › "cost stays linear in input
length" times `parseBracketList` on 4,000 and 16,000 characters and asserts the larger run takes
under 8× as long. On PR #2421 (`f3c075a`) it failed on `unit (node 22)` while passing on
`unit (node 24)` in the same run, on Node 22 one commit earlier, and 5 of 5 times locally; the PR
does not touch `lib/core/bracket-list`. The assertion measures wall-clock time on a shared runner,
so noise can fail it with no regression.

where     — test/unit/core/bracket-list.test.js (the linear-cost arm).
done when — the arm proves linearity without wall-clock ratios: count the parser's steps (an
            instrumented pass or a step counter the parser already exposes), or take the minimum
            of several runs per size so one noisy sample cannot fail it; and a mutant that makes
            the parse quadratic still fails the arm.
evidence  — the mutant failing, and the arm passing under a loaded runner (e.g. run beside
            `stress` or with a CPU hog locally).
