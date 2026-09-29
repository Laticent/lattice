---
origin: 2462
priority: P1
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Prove Segno can read flowchart rows before phase 2 starts

why now   — #2462's inversion review: the bake-off calls `flow` context-sensitive, and the
            kernel reads it with a speculative arrow per word start. Segno's compiler refuses
            that pattern by construction (LL(1) over characters, no predicates, no external
            tokenizer). If phase 3 finds out late, it either bolts on a second reader (the
            thing HARD RULE #1 forbids) or leaves flowchart on its kernel.
where     — docs/src/lib/segno/grammar.ts (the combinators); lib/core's flowchart row kernel;
            engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Plan.
done when — a Segno grammar for flowchart rows (`Storefront -SEV1-> Payments`) either
            compiles and matches the kernel on every corpus row, or the note records the
            escape hatch it needs (bounded lookahead or an external token) and its cost.
evidence  — the spike's parity run against the kernel on the corpus rows.
verify    — tier 1; the parser-bakeoff harness's flow target.
