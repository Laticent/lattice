# lib/exemplars — deck tier filter

`tier-filter.js`: pure `splitDeck(deck, tier)` that trims a worked example
deck to its short/standard/full variant using `<!-- tier: ... -->` markers.
Author a deck once, ship three lengths.

Consumed by the Studio's Drafting picker (browser) and the exemplar
integration tests.

**Gotchas:** bundled to the browser by `tools/build-exemplar-core.js` —
keep it pure/fs-free. Don't confuse this folder (the code) with the
repo-root `exemplars/` (the 45 worked decks it filters).
