---
origin: 3038
priority: P2
recorded: 2026-11-05
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §Speed targets
deferred: large — the remaining cost is structural (one tape record per markdown-it token, the line index pass), not a tunable; closing it means a leaner tape or the generated line classifier, a design step of its own
source: https://github.com/Laticent/lattice/pull/3038
---

# The deck model's S0-S1 over the gallery: 0.73 ms against a 0.5 ms target

why now   — §Speed targets sets S0-S1 over the 59 KB gallery under 0.5 ms. P2 measured 0.73 ms (median of five,
            range 0.71-0.76, `npm run parser:bakeoff:deck -- --model --runs 5`, 4-core Xeon 2.8 GHz, Node 22),
            3.0x faster than markdown-it's block parse on the same machine. The P0 audit's 3.6 ms baseline was
            markdown-it's WHOLE parse on a different machine, so the target is 6.7x that and the measured 4.9x.
where     — docs/src/lib/segno-markdown/block.ts. A profile puts the time in the list rule's recursion (15%),
            the tokenize loop (12%), the line index (11%) and copying the tape out (8%). Tried and reverted: a
            character loop instead of `indexOf` for line ends (38% slower).
done when — S0-S1 over the gallery is under 0.5 ms on the bake-off machine, with corpus parity unchanged.
evidence  — `npm run parser:bakeoff:deck -- --model --runs 5`, before and after.
verify    — tier 1, a checker on the bench numbers.
