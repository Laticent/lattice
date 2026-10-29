---
origin: 2909
priority: P1
recorded: 2026-10-29
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R1 landed
deferred: off-path — R1 ships the cap in Segno; using it changes how `splitRow` answers a hostile row, a flowchart behavior with its own deck and lint
source: https://github.com/Laticent/lattice/pull/2909
---

# The flowchart row parser does not set `maxNodes`, because `splitRow` has no way to refuse a row

why now   — R1 added `maxNodes` to Segno; no shipped grammar sets it. The row grammar matches every
            string, and `splitRow` throws on a refusal as a parser defect, so a cap there would turn a
            hostile row into a thrown error. The reset in `parse()` already lets a big tape go after
            the parse; the peak during one 3M-character row is what a cap would bound.
where     — `lib/core/flowchart-row-grammar.js` (the spec), `lib/core/flowchart-grammar.js` `splitRow`.
done when — the row spec sets a cap measured against the longest real row with headroom, and
            `splitRow` answers `code: 'nodes'` with a diagnostic on that row (not a throw), with a test.
evidence  — engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §"R1 landed".
verify    — tier 1: `test/unit/tools/flow-row-grammar.test.js` plus a hostile-row case.
