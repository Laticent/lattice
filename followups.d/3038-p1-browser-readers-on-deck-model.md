---
origin: 3038
priority: P1
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P2 landed
deferred: blocked — moving the browser readers puts the deck model (+8.8 KB gzipped in the lint core, +8.4 KB in eager JS) in the Studio's startup JavaScript and lint core, over the route budget; raising a ceiling is the owner's call, asked on PR 3038
source: https://github.com/Laticent/lattice/pull/3038
---

# Move the browser boundary readers onto the deck model: slide-boundaries.mjs and the Studio outline

why now   — P2 moved `section-source-split.js` and held the other two readers its row names, because the move
            fails `check-route-budget` (lint core 147.9 KB gzipped against 139.6; Studio eager JS 556.3 against
            554.5; home 286.4 against 281.6), measured +8.8, +8.4 and +8.3 KB against the held tree. The change itself is two lines in `lib/core/slide-boundaries.mjs`
            (`parseSlideBoundaries` reads `bodyModel(text).boundaries` and `.leadingEmpty`), built and tested on
            PR 3038 before it was reverted. The outline reads separators through slide-boundaries, so it follows.
where     — lib/core/slide-boundaries.mjs `parseSlideBoundaries`; docs/route-budget.d/ if the owner raises the
            ceilings; docs/src/lib/deck-outline/deck-outline.ts, which could then hold one model and update it
            with `updateDeckModel` (about 45 µs a keystroke on the gallery) instead of its own region logic.
done when — slide-boundaries reads the model and the docs build passes its route budget, by a raised ceiling
            or by the bytes P4 removes when the Studio stops loading markdown-it.
evidence  — `cd docs && npm run build` route-budget lines before and after; slide-boundaries and deck-outline
            suites green.
verify    — tier 2, maker-checker: the outline's unit ids are what Fuoco's focus sync keys on.
