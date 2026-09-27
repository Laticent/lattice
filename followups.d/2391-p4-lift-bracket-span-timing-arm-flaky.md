---
origin: 2391
priority: P4
recorded: 2026-09-27
---

# `lift-bracket-span` linear-growth arm compares two single ~1 ms samples

why now   — `many fences stay linear rather than quadratic` (test/unit/core/lift-bracket-span.test.js)
            failed once in a full `npm test` run on a branch that touches no `lib/` file, then
            passed 23/23 in isolation. It times one run of 200 fences against one run of 800 and
            asserts a ratio under 12; each sample is about a millisecond, so one GC pause or a
            scheduler hiccup under suite load decides it.
where     — test/unit/core/lift-bracket-span.test.js:156.
done when — the arm compares a median (or the minimum) of several runs at sizes large enough to
            sit well above timer noise, and still fails when the regex fix it pins is reverted.
evidence  — 20 full-suite runs with no failure, plus the reverted-fix run failing.
verify    — tier 0: the gates, plus the revert arm.
