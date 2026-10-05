---
origin: 2519
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2519
---

# Add `attempt(x, { max, then })` to Segno before phase 3 moves flowchart rows

why now   — Phase 3 moves the list-text grammars onto Segno, starting with flowchart rows. The
            #2519 spike (`npm run parser:bakeoff:flow`) showed no strict LL(1) grammar can read them
            (the arrow-or-word choice at a word start needs up to 64 characters of lookahead) and
            that greedy() does not help; a bounded ordered choice does, and matches the kernel on
            436/436 corpus rows and 200,096 fuzzed ones.
where     — docs/src/lib/segno/grammar.ts (the checker, compile()) and codegen.ts (generate());
            engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Flowchart rows need a
            bounded attempt, which states the spec; tools/parser-bakeoff/flow-segno.mjs, whose
            stand-in loop the primitive replaces.
done when — attempt(x, { max, then }) compiles in both runtimes; the checker accepts an overlap only
            between an attempt branch and the branches after it; it refuses an attempt reachable
            from another attempt; a flowchart-row grammar using it matches splitRow on every corpus
            row and the fuzz; the linear bound holds on a hostile ladder.
evidence  — parser:bakeoff:flow parity with the primitive instead of the stand-in; per-row time
            against the kernel (the stand-in is 1.9x); a 2k/8k/32k ladder near 4x per 4x.
verify    — tier 2, the adversarial trio: it widens what the LL(1) checker accepts, which every
            grammar's linear-time guarantee rests on (greedy() got a checker, a red team and two
            more checkers).
