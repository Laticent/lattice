---
origin: 3038
priority: P1
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P2 landed
deferred: large — replaces the outline's own incremental path and its unit-id carrying, which Fuoco's focus sync keys on; a tier-2 change of its own, not the two-line reader move PR 3038 made
source: https://github.com/Laticent/lattice/pull/3038
---

# The Studio's deck outline keeps one deck model across keystrokes

why now   — PR 3038 moved the outline's separators onto the deck model, but each region re-parse still builds a
            fresh model of that region (`parseSlideBoundaries`). `updateDeckModel` already keeps one model current
            per keystroke at about 45 µs on the gallery, re-reading one slide; the outline could hold it instead of
            its own region logic, and so could every Studio reader that re-derives boundaries from the same keystroke.
where     — docs/src/lib/deck-outline/deck-outline.ts `updateDeckIndex` and `separatorsOf`; lib/core/deck-model.mjs
            `updateDeckModel`. Heading sections (`sectionsOf`) stay on the boundary parser until P4.
done when — the outline holds a model and updates it with `updateDeckModel`, and its incremental-equals-full
            property and unit-id tests stay green.
evidence  — the outline's property suite; its per-keystroke parse count before and after.
verify    — tier 2, maker-checker: the outline's unit ids are what Fuoco's focus sync keys on.
