---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Let an author place a flowchart group's title, with a default that heals itself

why now   — The owner flagged it reviewing #2385. `placeTitles` in
            `lib/components/chart/_chart-family/graph-layout.js` always puts a group's
            title at the top-left inset. It slides it right only to dodge a line or a
            label, and an author cannot choose top-center, top-right or a bottom band.
where     — graph-layout.js (`placeTitles`, the title bands in `solveRoutes`, the band
            opened after dagre); lib/core/flowchart-grammar.js (a span word on the
            group's row, e.g. `:title-center`); flowchart.styles.css; flowchart.docs.md.
done when — An author can set a group's title position (at least left, center and
            right along the top) with one span word. The default stays top-left.
            The placement heals: if the chosen slot is crossed by a line or label,
            the title moves to the nearest free slot on the same band, and the
            router still charges W.band for a line that leaves it no slot.
            `measureQuality` keeps `linesThroughTitles` and `titlesUnderShapes` at
            zero for every position across the unit gallery. Lint names an unknown
            position word.
evidence  — The owner's review of the #2385 typing deck (Services and Data platform
            slides).
verify    — node --test test/unit/components/graph-layout.test.js; render
            examples/flowchart.md with each position and look.
