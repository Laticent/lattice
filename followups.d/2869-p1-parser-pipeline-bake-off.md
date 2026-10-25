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

why now   — #2869's decision note picks a four-stage parsing pipeline on one Segno spine. The
            numbers behind it come from one session's bake-off on one machine: markdown-it
            59 MB/s; a typed line index 78; a staged line pass with rule predicates 84
            (1.42×); the same stage from a Segno-generated tokenizer 69 (1.17×); a second pass
            over Segno's tape costs 1–7%; a generated "scan until one of these characters"
            loop ran 278 MB/s against 647 for the hand-written one. Every arm matched
            markdown-it's block structure on the whole corpus. None of it is repeated, on a
            second machine or with variance.
where     — the scripts in the evidence folder beside this file; the engine change is in
            docs/src/lib/segno/ (code generation for terminator runs).
done when — the numbers are re-run with variance (at least 5 runs per arm, median and spread)
            on two machines, the decision note is updated with them, and the scripts move to
            tools/parser-bakeoff/ with a capabilities row (HARD RULE #15) or are deleted.
evidence  — the re-run table, and the commit each number ran against.
verify    — tier 0: a measurement, with nothing shipped.
