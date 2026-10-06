---
origin: 2545
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2545
---

# Segno phase 3: the remaining list-text grammars (leading markers, `_track`)

why now   — Phase 3b (#2545) moved flowchart rows onto a generated Segno grammar. The note's
            Plan table still lists leading markers and `_track` as hand-written readers, which
            decision 20 (Segno is the one parser) rules out.
where     — engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Plan (row 3) and
            § What every current grammar becomes; the pattern to copy is phase 3b:
            lib/core/flowchart-row-grammar.js → tools/build-segno-grammar.js →
            lib/core/flowchart-row.generated.js, with the old reader frozen in
            tools/segno-legacy/ and its outputs frozen before the swap
            (tools/parser-bakeoff/freeze-flow-rows.mjs).
done when — each reader calls a generated grammar, its old outputs were frozen first and a unit
            test holds the grammar to them, and the decks that use them render byte-identical.
evidence  — parity on the corpus and a fuzz; tools/pixel-check.js on the decks that use them;
            npm run bench before/after.
verify    — tier 2 trio: each replaces a render-path reader (HARD RULE #1).
