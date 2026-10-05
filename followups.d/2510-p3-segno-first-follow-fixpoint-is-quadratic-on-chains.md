---
origin: 2510
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2510
---

# Segno's FIRST/FOLLOW fixpoint is quadratic on a rule chain listed bottom-up

why now   — The PR's fourth checker timed `lint()` on long rule chains. A chain whose rules
            are listed bottom-up (`r4000` first, `r0` last) costs about one fixpoint round per
            rule in `firstSets()` / `followSets()`: on main, 968 ms at 1,000 rules, 3.1 s at
            2,000, 12.8 s at 4,000 (no greedy, no until, so it predates #2510). #2510's own
            dead-code check now solves rules in dependency order and adds nothing on top. It
            only bites a grammar with thousands of rules, so no shipped grammar is near it;
            it matters if Segno compiles grammars that arrive at runtime (the /segno page does).
where     — docs/src/lib/segno/grammar.ts, `Analysis.firstSets()` and `followSets()`: both
            sweep every expression per round until nothing changes, so a value moves one rule
            per round when rules are listed against reference order.
done when — both fixpoints visit rules in dependency order (the Tarjan pass `excludedSets()`
            already builds), and a 4,000-rule bottom-up chain lints in under a second.
evidence  — before/after `lint()` times on 1k/2k/4k-rule chains in both orders, and the
            existing grammar-fuzz and engine-additions suites unchanged.
verify    — tier 1, an independent checker: it touches the LL(1) proof every grammar relies on.
