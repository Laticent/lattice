---
"@laticent/lattice": patch
---

The deck and import skills and the deck-settings guide now start a deck with `pagination: true`, so a deck copied from them no longer fails lint.

They still taught `paginate: true`, the key's old name, which the linter rejects with `key-renamed`. A new unit test,
`test/unit/docs/no-retired-keys-taught.test.js`, reads every skill and docs-site page and fails on any front-matter key
`lib/core/deck-settings.js` marks retired, so the next rename is caught the same way.
