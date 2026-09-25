---
origin: 2356
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2356
---

# Cadenza reads 2026 as "two thousand twenty-six", not "twenty twenty-six"

Raised in #2356. The owner deferred it to its own session and PR.

why now   — spoken English says years in pairs ("twenty twenty-six"); the current reading is
            deliberate (the FY2026 test pins it), so changing it is a decision, not a bug fix.
where     — docs/src/lib/cadenza/normalize.ts (year and fiscal-year branches) and the FY2026 case
            in docs/src/lib/cadenza/normalize.test.ts.
done when — a bare year in 1100–2099 (and FY2026) reads as pairs ("twenty twenty-six", "twenty
            oh five" for 2005, "two thousand" for 2000), other four-digit numbers keep the
            cardinal reading, and tests pin each case.
evidence  — heard in the #2356 audio renders.
verify    — npm test on the normalize suite, plus one rendered clip.
