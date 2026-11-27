---
"@laticent/lattice": patch
---

The deck and import skills and the deck-settings guide now start a deck with `pagination: true`, and the registers reference names `trim-spectrum:`, so guidance copied from them no longer fails lint.

They still taught `paginate: true` and `spectrum-trim:`, the old names of two keys, which the linter rejects. A new unit
test, `test/unit/docs/no-retired-keys-taught.test.js`, reads every source an agent reads (the skills, the docs site,
the component and register docs, the `lattice-*` Claude skills, the Studio tool descriptions and the llms.txt text)
and fails on a front-matter key `lib/core/deck-settings.js` marks retired, unless the same paragraph names it as
history. The next rename is caught the same way.
