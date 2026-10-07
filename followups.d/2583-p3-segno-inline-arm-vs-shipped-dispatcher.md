---
origin: 2583
priority: P3
recorded: 2026-10-07
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2583
---

# The inline bakeoff arm races a retired kernel, so 387 Segno-syntax spans have no comparator

why now   — `npm run parser:bakeoff:segno` compares Segno against the legacy inline kernel
            (tools/segno-legacy), which no longer reads what the decks are written in. #2583
            gave the 387 spans in Segno's notation (`{icon=mail}`, chart points) a row of
            their own with no kernel figure, and the arm's pills row now reads 4.0x where the
            README's older table says 2.0x. Neither figure says how fast the shipped path is.
where     — tools/parser-bakeoff/segno.mjs: time lib/core/inline-code-directives.js's
            `dispatches` (the dispatcher Lattice ships) beside, or instead of, the arm's own
            `segnoInline` copy and the legacy kernel.
done when — the arm reports the shipped dispatcher's ns per span on every row, including the
            Segno-syntax row, and the README § Speed table quotes it with a run date.
evidence  — the arm's output before and after.
verify    — tier 0 gates.
