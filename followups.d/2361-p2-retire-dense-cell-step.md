---
origin: 2361
priority: P2
recorded: 2026-09-27
---

# Decide and cost retiring the dense-cell step (`--fs-body-compact`)

why now   — the owner's reading on 2026-09-27 (PR #2399): a smaller size for table, glossary and
            ledger cells is the same kind of shrink as `compact`'s. The venue sets the size, the
            budget says how much to write, and an author who wants more room picks a smaller venue.
            Retiring it changes one of the twelve typography roles (HARD RULE #4) on every
            table-bearing slide, so it was measured and put to the owner rather than folded in.
measured  — 2026-09-27 (PR #2410): the 26 galleries of the 27 components whose CSS reads
            `--fs-body-compact`, rendered with a deck-local `section { --fs-body-compact:
            var(--fs-body) !important; }` (without `!important` the theme wins the cascade and
            nothing changes — verified: a table cell goes 17.92px → 21.38px with it). Clipped
            gallery pages: 2 → 13. New clips: obligation-matrix 6 (pp. 2, 3, 5, 6, 8, 10),
            team-profile 2 (8, 10), code 1 (3), pricing 1 (5), list-tabular 1 (17); table,
            glossary and the rest clip nothing new at the designed size. Not yet measured:
            `examples/` decks, other venues, and the re-measured `venueCapacity` rows. The
            owner's call is still open; nothing changed in the engine.
where     — lib/base/base.tokens.css (`--fs-body-compact`), the 27 component stylesheets that use
            it (`grep -rl fs-body-compact lib/components`), engineering/typography.md §1 and §7,
            every affected manifest's `venueCapacity` (re-measure), the galleries.
how       — first MEASURE: render every gallery with `--fs-body-compact` pinned to `--fs-body`
            (a deck-local override, as the `compact` audit did) and count clipped slides, then
            re-run tools/calibrate-capacity.js for the table/ledger components. Separate the true
            dense cells (table, glossary, list-tabular, obligation-matrix, matrix-grid) from the
            secondary-text uses (a list's second line, a card's nested detail), which may be a
            different decision. Back-row x-height today, body vs dense cell, laptop / huddle /
            conference / hall: 17′/13′/11′/10′ vs 14.5′/11′/9.4′/8.2′ (~12′ comfortable).
done when — the owner has chosen with the clip count and capacity loss in hand, and the chosen
            change ships with its galleries re-rendered and budgets re-measured.
evidence  — the clip count before/after, the re-measured budgets, rendered pages light and dark.
verify    — tier 1 checker: it touches a token every table inherits.
