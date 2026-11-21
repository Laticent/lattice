---
origin: 3315
priority: P1
recorded: 2026-11-19
area: engine
severity: high
swimlane: engineering/decisions/2026-11-18-calco-master-theme.md §2. What was built
deferred: large — its own feature with its own pixel A/B and reader change; the owner chose a separate PR right after #3315 (2026-11-19)
source: https://github.com/Laticent/lattice/pull/3315
---

# Native bullet lists in the editable .pptx

why now   — The owner, opening the anchor decks in Google Slides (2026-11-19): "bullet lists are not native yet?"
            They are not. `pptx.ts` writes every paragraph with `<a:buNone/>`, and `reader.ts` leaves each list
            marker in the slide's picture (or lifts it as a small `list-marker` shape). In PowerPoint or Google
            Slides the dot does not move with its text, Enter at the end of a list gives an item with no bullet, the
            bullet's color, symbol and level cannot be changed, and the body placeholder #3315 adds to every layout
            says "no bullet" at every level, so a new slide's body has none either.
where     — docs/src/lib/calco/reader.ts (read each `li`'s marker: character or numbering, color, size, indent
            and the gap to the text, per nesting level; stop leaving it in the picture), docs/src/lib/calco/types.ts
            (a paragraph's bullet), docs/src/lib/calco/pptx.ts (`a:buChar`/`a:buAutoNum`, `a:buClr`, `a:buSzPct`,
            `marL`/`indent` per level; the master's `bodyStyle` and each layout's body placeholder in the deck's
            bullet look), docs/src/lib/calco/odp.ts (`text:list` for the .odp).
done when — a list item's bullet is part of its paragraph in the .pptx and .odp, so editing, adding, re-leveling and
            restyling an item in PowerPoint, Google Slides and LibreOffice behaves as a list; a new slide's body
            placeholder types bullets in the deck's look; existing slides render pixel-identical to main in
            LibreOffice on the five decks #3315 measured (venue-chrome, chart-finishes, mermaid-12, card-tags and
            the anchor deck), with every bullet shape the gallery uses (disc, numbers, custom `::marker`, nested).
evidence  — the LibreOffice A/B against main; a unit test per bullet kind, each red with its reader or writer
            change reverted; the owner's Google Slides screenshots of an edited list and a new slide's body.
verify    — tier 1 checker (maker-checker), because it changes the shared reader and both writers.
