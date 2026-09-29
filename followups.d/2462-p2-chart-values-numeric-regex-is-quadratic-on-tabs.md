---
origin: 2462
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2462
---

# chart-values.js's numeric-pill regex is quadratic on a long run of tabs

why now   — CodeQL flagged Segno's port of this pattern (a polynomial regex on library input),
            and #2462 fixed the port. The shipped kernel still has it: a failing match on
            `1` + 50,000 tabs + `x!` takes about 2.8 s in `isValuePill`, reached from any
            chart pill an author types or pastes into the Studio.
where     — lib/core/chart-values.js:146. Two `\s*` runs are separated only by optional
            pieces (`\s*[^\w\s]{0,3}\s*` and `\s*(unit)?\s*`), so the engine tries every split.
            Segno's rewrite in docs/src/lib/segno/types.ts (NUMERIC) folds each optional piece
            and its trailing space into one group; it accepts the same strings on a
            300,000-case fuzz and runs in 0.1 ms on the same input.
done when — the kernel uses the rewritten pattern, and a unit test pins linear time on the
            tab-run input.
evidence  — before/after timing on the tab-run input, and the equivalence fuzz.
verify    — tier 1; the chart-values unit tests plus the new timing test.
