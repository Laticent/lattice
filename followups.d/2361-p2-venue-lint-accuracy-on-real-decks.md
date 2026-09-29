---
origin: 2361
priority: P2
recorded: 2026-09-27
---

# `capacity-scale` on a real deck: half its warnings miss, and it claims clips that do not happen

why now   — tested on the agentic-practices talk (PR #2399), lint vs the export's trim list, per
            venue: huddle 7 right / 10 false / 8 missed; conference 16 / 6 / 14; hall 27 / 4 / 18.
            Two causes, both measured on that deck:
            • FALSE, and worded as a clip: every false warning is a `list takeaway` slide. The `list`
              row is measured on the default register, and at 14 words it says "holds about 3 … even
              at the designed size … it is clipped" (10 such claims per venue) — the laptop export
              clips none of them. The variant holds more than the bare component.
            • MISSED: 13 of the 14 missed slides at conference carry an `insight-*` callout
              (list-steps, cards-grid, code, compare-prose, …), whose height the bare-component rows
              never saw; the rest have no count row (compare-prose, matrix-2x2 lint no count).
progress  — 2026-09-27 (PR #2410, font-scale-fit.md Amendment (4)): interpolated word lengths,
            a `list takeaway` row, measured callout costs (keyed on the trailing blockquote), and
            venue-only components (compare-prose) judged. Talk, right/false/missed: huddle 16/3/1,
            conference 25/4/6, hall 38/1/9 (was 9/10/8, 18/6/13, 29/4/18); no finding claims a
            designed-size clip. LEFT: components with no venue row (roadmap, diagram, divider,
            mermaid), pessimistic rows for some `list takeaway` / `glossary` slides (false 21, 28,
            58, 66), and "length in characters, not words" (not attempted). The 11-slide test deck
            named in the brief was not found in the tree, so it was not scored.
progress  — 2026-09-27 (2): two more measured rows. `list takeaway` with a trailing callout
            (`venueCapacity.variants.takeaway.insight`, 8/7/6/5 at 6 words, 8/7/6/2 at 10, 4/3/3/2 at
            14; the bare `list` pair had charged it 0 at hall) and the `code` pane with a callout
            (`lines.insight` 11/9/8/7, `lines.eyebrowInsight` 10/8/7/5). Talk, right/false/missed:
            huddle 16/3/1 (unchanged), conference 26/4/5 (was 25/4/6), hall 40/1/7 (was 38/1/9).
            TRIED AND REVERTED: judging a slide by FILL (each element takes 1/N(w) of the box at its
            own length) instead of by its longest element. False + missed across the three venues:
            22 with the rows above, 21 with fill interpolated, 23 with fill read at the next measured
            length. It swaps misses for false warnings instead of removing either: a title-plus-body
            item takes two lines whatever its word count (slide 31), and interpolating across the
            one-line → two-line cliff undercounts a 12-word item (slide 22). The next step is a LINE
            model (characters per line at each rung, a nested title as its own line), not a better
            word model. Still missed: matrix-2x2 (20, every venue — no count row), cards-grid and
            cycle with a callout at conference (56, 9), `list takeaway numbered` with a callout (62),
            compare-code (16, 32 — lint counts no compare-code pane), roadmap (54), table-fill (55),
            and a code slide whose two-line heading the pane row does not see (41 at conference).
            Still false: list-steps / cards-grid with a callout (5, 7, 36), long-item `list takeaway`
            (21, 28, 58), glossary (66).
            SECOND DECK, 2026-09-27: test/integration/baseline-decks/gallery.md (116 pages, every
            component) forced to each venue, scored the same way. Clipped 18 / 41 / 71 (laptop 0).
            Right/false/missed, identical on main and after PR #2425: huddle 7/0/11, conference
            14/3/27, hall 29/1/42. So the rows above cost nothing there, and lint still misses most
            clips on a broad deck — the target this item's `done when` sets should be scored on it
            too, not on the talk alone.
            THREE MORE REAL DECKS, same day: examples/bloom-engineering-journey (13 pages),
            seven-steps-problem-to-code (17), kaizen-craftsmanship (16), each forced to huddle /
            conference / hall. Clipped 1/3/4, 1/3/7, 0/5/12. Lint, identical on main and after #2425:
            bloom 0/0/1, 0/0/3, 0/0/4; seven-steps 0/0/1, 1/0/2, 1/0/6; kaizen 0/0/0, 3/1/2, 5/0/7.
            By component, the 17 misses at hall: split-panel 6, compare-prose 3, premise 2, and one
            each of matrix-grid, list-steps, content, quote, stats, cycle. split-panel has no venue
            row at all, so it is the next row to measure.
progress  — 2026-09-28 (font-scale-fit.md Amendment (5)): two fixes. (1) The rig measured at
            `class: scale-*`, which lacks the venue's meta lift, so every conference/hall row was
            measured on a smaller slide than the room gets. It now writes `venue:`; 88 stored rows
            re-measured, 21 lowered. (2) `split-panel` got a claim-panel row
            (`venueCapacity.panel`, lede words per heading length; `proof`/`capstone` rows), and
            lint judges heading + lede against it. Five decks (talk, gallery, bloom, seven-steps,
            kaizen) summed, right/false/missed: huddle 25/3/16 (unchanged), conference 46/8/43 →
            47/8/42, hall 78/2/68 → 82/2/64. No new false warning.
            HELD BACK, with their measured values: `compare-prose vertical` @20 conference 2 → 1
            and `actors` @12 conference 6 → 3 each warned on a real slide that fits (talk 44,
            gallery 68), so both stay as stored.
            THE LINE MODEL IS NOW MEASURED TO BE THE NEXT STEP, not guessed. At hall seven-steps
            slide 8 (heading 47 chars, lede 154) clips and slide 10 (50, 160) fits; rendered line
            counts separate all 13 proof/capstone slides across the three decks (a 3-line heading
            leaves 7 lede lines, a 2-line one 8). A line model needs per-glyph widths in lint-core,
            which the Studio bundles eagerly (this change alone cost +668 bytes gz and a
            route-budget raise): price that first.
            Still missed at hall: seven-steps 5, 7, 8 (panel, at the line margin), premise (both
            decks), compare-prose / cycle / list-steps / matrix-grid / quote / stats / content.
            Not judged: a split-panel slide with no points (the count loop stops before the panel
            check), and a `![bg …]` split background, which moves the slide off the `wide` family.
            The scorer lives nowhere in the tree: it renders each deck with `venue:` forced into
            its front matter (`renderProbe`) and compares the OVERFLOW pages with lint's
            `capacity-scale` slides.
progress  — 2026-09-28 (font-scale-fit.md Amendment (6)): the LINE model, for the claim panel. The
            rig (`calibrate-capacity split-panel --panel`) now measures line geometry per register
            and venue: characters a line holds and px a line takes for the eyebrow, heading, the
            `proof` opening question (its own block) and the lede, plus the column's budget.
            `panelOver` wraps the slide's text into it. Five decks, right/false/missed: huddle 26/3/16
            and conference 48/8/42 (unchanged), hall 83/2/64 → 86/2/61; no new false warning. The
            Studio bundle costs +276 B gz (633,752 → 634,028 on main 7138b99), and
            route-budget.json moved to 634,310 by the owner's rule (measurement + ~280 B). Per-glyph widths were NOT needed: a flat
            character count at each font's measured average advance wraps 56/60 headings,
            51/52 questions and 56/60 ledes right.
            LEFT: seven-steps 11 at hall (a heading that fills its line to half a character); every
            other miss is a component with no line model. By count at hall, the misses are in
            `gallery.md` (39) and the talk (9). A line model for the COUNT rows (cards, lists) is the
            next step if the owner wants the hall numbers to move further, and it would need its own
            bundle budget.
            NEW FALSE WARNINGS to score against, from the talk trimmed to `venue: huddle` on
            #2361's branch (a348745): its OVERFLOW line is empty, yet `lint:deck --strict` warns
            `capacity-scale` on slides 24 (`list takeaway`, 5 items), 39 and 58 (`list-steps` with a
            callout, 4 and 5 items) and 64 (`list takeaway numbered` with a callout, 4 items). The
            count rows read these as full at huddle; the render fits them.
progress  — 2026-09-29 (font-scale-fit.md Amendment (7)): the LINE model for the count rows. `list`
            (bare, `takeaway`, `takeaway numbered`), `cards-grid` (bare, `three`, `four`) and
            `list-steps` (`1.`, two to five steps, one row) are judged by the lines their eyebrow,
            heading, items and callout wrap to (`venueCapacity.rows`, measured by
            `calibrate-capacity <component> --rows`), each glyph weighed by its width. Five decks,
            right/false/missed: huddle 26/3/16 → 28/0/14, conference 48/8/42 → 55/5/35, hall
            86/2/61 → 91/1/56; no slide lost, no new false warning. The talk at `venue: huddle`
            (d7be56f): 4 false warnings → 0. 22 more decks (the checker's): no new false warning;
            two slides no longer warned, system-design-foundations 45 and 209 at conference, whose
            POINTS column clips (149 px) while main warned on their claim panel, which fits: the
            split-panel points count row misses them on main too. Studio eager JS +2,160 B gz
            (paired, on main d2d9a58), budget 637,490.
            LEFT, by misses at hall on the four smaller decks: compare-prose (4), compare-code (3),
            premise (2), matrix-2x2 / matrix-grid (no row), cycle, roadmap, table-fill, content,
            quote, stats, split-panel pullquote, list-steps capsule; `gallery.md` 37 across the
            catalog. `cards-stack` has no line model (its probe is not linear at seven items, cause
            not found). Still false, as before this change: talk 5 at conference (a 65-character
            heading on the edge of one line) and talk 72 (`glossary`). Next: the same rows for
            `compare-prose` and `cycle`, both a title over a body, and the split-panel POINTS
            column (the two slides above); each component adds geometry to the Studio bundle, so
            price it the same way.
where     — lib/authoring/lint-core.js (the `capacity-scale` rule and its "even at the designed
            size" branch); tools/lib/calibrate-core.js (measure with a trailing insight callout, and
            the `list takeaway` register); the manifests' `venueCapacity`.
done when — on the talk at each venue, lint's warnings match the export's trim list closely
            enough to trust (target set by the owner), and no warning claims a clip the laptop
            export does not show.
evidence  — the per-venue right/false/missed table before and after, on the talk and the galleries.
verify    — tier 1 checker: shared lint kernel (#7).
