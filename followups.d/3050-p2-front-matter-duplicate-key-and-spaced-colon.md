---
origin: 3050
priority: P2
recorded: 2026-11-06
area: engine
severity: low
swimlane: engineering/decisions/2026-08-05-deck-document-model.md
deferred: blocked — owner decision: first-wins or last-wins for a repeated top-level key, and whether `key :` is a key; either answer changes how some decks render, so it is not a fix #3050 can pick alone (on the decision card on #3050)
source: https://github.com/Laticent/lattice/pull/3050
---

# Engine and front-matter readers still disagree on a duplicate key and on `key :`

why now   — after #3050 the engine (`parseFrontMatter`) and `topLevelFrontMatterValue` agree on
            indentation, but two gaps remain: the engine keeps the LAST of a repeated top-level key
            while the shared reader keeps the FIRST, and the engine accepts `class :` (space before
            the colon) while the readers do not. A deck with either reads one way in the render and
            another in the band, lint and Studio.
found     — the independent checker on PR #3050; already pinned as a KNOWN RESIDUAL in
            test/unit/core/deck-class-register.test.js for the duplicate case.
where     — lib/engine/directives.js parseFrontMatter; lib/core/front-matter-key.js
            topLevelFrontMatterValue / frontMatterValue.
done when — one rule for both (pick first- or last-wins and `key :` or not), with a test asserting
            the engine and the reader side by side.
evidence  — the residual test flipped from KNOWN RESIDUAL to agreement.
verify    — node --test test/unit/core/deck-class-register.test.js
