---
origin: 2593
priority: P1
recorded: 2026-10-07
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2593
---

# The shipped inline dispatcher asks every row, so ordinary code costs 4.4x the retired kernel

why now   — #2593 gave `npm run parser:bakeoff:segno` a column for the dispatcher Lattice ships
            (lib/core/inline-code-directives.js). On 4,585 ordinary-code spans it measures
            136 ns against 31 ns for the retired kernel and 67 ns for the arm's own copy, and
            3.54 µs against 1.15 µs on the 386 spans written in Segno's notation. The design
            note's target is 1.5x. Every inline code span in every deck pays this.
where     — lib/core/inline-code-directives.js `dispatches` / `renderHtml`: the four rows
            (state, pill, spark, icon) each run their own check. A cheap first-character
            reject before the loop, or one Segno parse whose result every row reads, would
            close most of it.
done when — the bakeoff's shipped column is within 1.5x of the kernel on ordinary code, with
            byte-identical render output (test/unit/core/inline-code-table.test.js) and a bench
            baseline ratchet per HARD RULE #19.
evidence  — the arm's shipped column before and after, same machine.
verify    — tier 1: engine unit suite and the integration tier, because it changes the render path.
