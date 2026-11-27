---
origin: 2988
priority: P3
recorded: 2026-11-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §25
deferred: off-path — sixteen decks this PR's phone fixes do not touch; the fix is a new lint rule and per-deck edits, its own change
source: https://github.com/Laticent/lattice/pull/2988
---

# A hand-wrapped list item renders hard breaks in the middle of its sentence

why now   — The engine renders Markdown with line breaks on (Marp's convention), so a list item whose text is
            wrapped by hand in the source keeps every wrap as a `<br>`, mid-sentence, at every size. #2988 found
            it on `examples/drawn-not-typed.md` (fixed there, on its path); a scan of the decks finds 37 such
            items in 16 more, e.g. the flowchart and state-chart galleries (4 each), `chart-axis-grammar.md`,
            `finish-backdrops.md`, `footer-cell.md` (3 each).
where     — lib/authoring/lint-core.js (a new rule), then the decks it names
done when — `lint:deck` warns on a list item continued on an indented line (outside a fence), naming the line,
            and the shipped decks are joined so none warns
evidence  — the scan in §25 (37 items, 16 decks); the drawn-not-typed render before and after its join
verify    — `npm run lint:deck -- examples/` reports none; a deck with a wrapped item gets the warning
