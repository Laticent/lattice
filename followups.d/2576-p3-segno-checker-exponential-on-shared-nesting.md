---
origin: 2576
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2576
---

# Segno's grammar checker takes exponential time on deeply nested shared pieces

why now   — found by #2576's red team, pre-existing on main. A grammar built as
            `E_{k+1} = seq(big(), alt(seq('y', E_k), seq('z', E_k)))` reuses each piece twice
            per level, and `compile()` takes 30 / 74 / 254 / 936 ms at depth 16 / 18 / 20 / 22
            (main: 40 / 76 / 288 / 964). `generate()` adds about 2x on the branch; main's
            `generate()` was worse (130 MB of output at depth 14). Build time only, not parse
            time; the live exposure is the /segno demo page, where a user can stall only their
            own tab with a grammar they typed.
where     — `docs/src/lib/segno/grammar.ts` `analyze()`: the FIRST / nullable / follow walks
            treat a shared Expr object as a tree, not a DAG; memoize per Expr object.
done when — the depth-22 grammar above compiles in under 50 ms, and lint() / generate() /
            parses are identical to the previous engine on the random-grammar differential.
evidence  — the depth ladder before and after.
verify    — tier 1 checker (engine analysis change).
