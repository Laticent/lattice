---
"@laticent/lattice": patch
---

The deck and import skills and the deck-settings guide now start a deck with `pagination: true`, and the base and registers references name `fit:` and `trim-spectrum:`, so guidance copied from them no longer fails lint.

They still taught `paginate: true`, `guards:` and `spectrum-trim:`, the old names of three keys, which the linter rejects. A new unit
test, `test/unit/docs/no-retired-keys-taught.test.js`, reads every source an agent reads (the skills, the docs site,
the component and register docs, the `lattice-*` Claude skills, the Studio tool descriptions and the llms.txt text)
and fails on a front-matter key `lib/core/deck-settings.js` marks retired. A mention passes only when its own
paragraph says it was renamed or retired, in a short list of phrases; a settings block never passes. The next rename is caught the same way.
