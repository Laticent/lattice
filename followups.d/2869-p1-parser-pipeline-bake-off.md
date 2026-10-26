---
origin: 2869
priority: P1
recorded: 2026-10-23
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-28-parser-library-bakeoff.md
source: https://github.com/Laticent/lattice/pull/2869
---

# Raise the confidence in the deck-parser bake-off before building the block driver

why now   — #2869's decision note picks a four-stage parsing pipeline on one Segno spine. Five
            runs on one machine (2026-10-26, at 1fc891b, in the note's § What the bake-off
            measured) put the hand-written staged arm at 1.35x markdown-it (1.15-1.36x), the
            Segno-generated arm at 1.17x (0.99-1.30x), and the line pass at 665 vs 361 MB/s.
            The sandbox moves a lot: the markdown-it baseline alone spans 19% across the five.
            Still missing: the same five runs on a second machine.
where     — the scripts in the evidence folder beside this file; the engine change is in
            docs/src/lib/segno/ (code generation for terminator runs).
done when — the numbers are re-run with variance (at least 5 runs per arm, median and spread)
            on a second machine (the first is done), the decision note is updated with them, and the scripts move to
            tools/parser-bakeoff/ with a capabilities row (HARD RULE #15) or are deleted.
evidence  — the re-run table, and the commit each number ran against.
verify    — tier 0: a measurement, with nothing shipped.
