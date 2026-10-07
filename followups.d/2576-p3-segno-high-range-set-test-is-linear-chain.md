---
origin: 2576
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2576
---

# A character set with many non-ASCII ranges is tested by a linear `||` chain

why now   — found by #2576's red team, pre-existing. `testExpr()` in codegen.ts writes one
            comparison per range above U+007F, so a set of every other code unit (32k ranges) costs
            about 32k comparisons per character: main took 44.5 s for 256k characters of it. #2576's
            regex tail hides it on long runs outside an attempt window (28 ms), but the first 16
            characters of every run, and every character inside a window, still pay it. Still
            linear in input; a large constant per character.
where     — `docs/src/lib/segno/codegen.ts` `testExpr()` (and compile()'s `compileTest` in
            charset.ts): past a few high ranges, emit a binary search over a sorted Uint16Array
            of range bounds instead of the chain.
done when — a 32k-range set inside an attempt window reads 256k characters in under 100 ms, and
            the generated output for the three shipped grammars (few high ranges) is unchanged.
evidence  — the timing before and after, and `npm run segno-lib:check` showing the shipped
            parsers unchanged.
verify    — tier 1 checker (codegen change).
