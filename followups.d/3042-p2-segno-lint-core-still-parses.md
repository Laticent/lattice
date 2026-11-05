---
origin: 3042
priority: P2
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §The Studio's readers derive, not parse
deferred: blocked — installing the deriver in the browser costs 1.1 KB gzipped of either the engine's first-paint bytes or the lint core's `lintCoreGz` ceiling, which bundle pays is the owner's call, and a lazily loaded segno entry for `updateDeckModel` is the third option
source: https://github.com/Laticent/lattice/pull/3043
---

# The Studio still parses the deck from nothing on every keystroke

why now   — PR 3043 ships an exact deriver for the boundary memo (lib/core/slide-boundaries.mjs `setBoundaryDeriver`,
            lib/core/deck-model.mjs `deriveFromNearest`): a miss updates the nearest held model instead of parsing. It is
            installed in Node (the bench, the tests) and not in the browser, where the preview and the lint both run in
            the engine's esm bundles and a keystroke still costs 2 full parses.
where     — docs/public/playground/esm (tools/build-playground.js: the engine and lint entries); docs/route-budget.json
            `engineJsGz` / `lintCoreGz`; docs/src/lib/segno-markdown (one module today, so `updateDeckModel` cannot be
            lazily split out of it).
done when — the browser bundle that holds the boundary memo installs the deriver within its ceiling, and a Studio
            keystroke builds no deck model from nothing, counted in a browser run.
evidence  — the route budget before and after; `deckModelStats.full` per keystroke in a browser Studio run.
verify    — tier 2, maker-checker; a real Studio run (HARD RULE #23).
