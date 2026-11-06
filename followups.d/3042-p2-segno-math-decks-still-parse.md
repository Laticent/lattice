---
origin: 3042
priority: P2
recorded: 2026-11-05
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §The Studio's readers derive, not parse
deferred: large — splicing past a forward-scanning rule means recording how far each `$$` attempt read and which slide its "no closer ahead" memo reached, a change to the block pass and the model's reuse test, held to the parity fuzz on its own
source: https://github.com/Laticent/lattice/pull/3042
---

# A deck with `$$` math still parses from nothing on every keystroke

why now   — the boundary memo now derives a miss from the nearest held model, which takes the Studio's lint and
            preview to 0 parses from nothing per keystroke, except on a deck with display math: `updateDeckModel`
            rebuilds whenever a `scansAhead` rule was tried above the reused tail (bench edit tier: math 2 parses/key).
where     — docs/src/lib/segno-markdown/deck.ts `updateDeckModel` (the `forward` checks), block.ts `forward` recording,
            lib/plugins/math (the block rule's closer memo).
done when — the bench edit tier's `math` row reads 0 parses per keystroke, and the deck-model parity fuzz stays at 0.
evidence  — `npm run bench` edit tier `parses` before and after; test/unit/core/deck-model.test.js.
verify    — tier 2, maker-checker.
