---
origin: 2772
priority: P5
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
deferred: off-path — the same on main; the fix is in the shared deck splitter (docs/src/lib/deck-lint.ts `splitSlides`), which lint and every Studio reader use, not in the Compose code #3136 changes
source: https://github.com/Laticent/lattice/pull/3136
---

# A slide that starts with an indented example turns it on when Compose writes the slide

why now   — found by the checker on #3136. `splitSlides` trims each slide, so `    <!-- {layout=kpi} -->\n\n## T` (an
            indented code example; the engine applies nothing) reaches Compose as `<!-- {layout=kpi} -->` and is
            written back unindented, and the slide renders `kpi`. `emitDeck` re-emits the trimmed `raw` even for an
            untouched slide. #3136 keeps a leading indent inside splitSlideDirectives, which covers an example below a
            lifted setting but not one on the slide's first line.
where     — docs/src/lib/deck-lint.ts `splitSlides` (the trim), docs/src/lib/compose/deck-source.ts `parseDeck` (`raw`).
done when — a slide whose first line is an indented example keeps it indented through deckToDoc → emitDeck and through
            docToDeck, and lint's line numbers are unchanged.
evidence  — engine class of `    <!-- {layout=kpi} -->\n\n## T` before and after a Compose round trip.
verify    — add the shape to the seeded round trip in deck-source.test.ts (it skips slides that start indented today).
