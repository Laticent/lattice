---
origin: 3042
priority: P2
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §The outline keeps one deck model
deferred: large — each Studio boundary reader (the preview's `slideBoundaries` call sites, the lint's `chunkBoundaryLines`) gets its text through a different path (the preview rebuilds `editorSample` from trimmed chunks); routing them to one held model is a change of the Studio's data flow, not of this outline
source: https://github.com/Laticent/lattice/pull/3042
---

# The Studio's boundary readers read the model the outline holds

why now   — the outline now updates one deck model per keystroke, but the preview and the lint still miss the
            boundary memo on every keystroke and parse the whole deck from nothing, which is where the parses go.
where     — docs/src/components/studio (StudioShell's `editorSample`), docs/src/lib/deck-lint.ts, lib/core/slide-boundaries.mjs.
done when — one keystroke in the Studio costs one incremental model update and no full parse, counted by `deckModelStats`.
evidence  — `deckModelStats.full` per keystroke in a Studio run, before and after.
verify    — tier 2, maker-checker.
