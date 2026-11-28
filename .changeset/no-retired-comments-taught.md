---
"@laticent/lattice": patch
---

The title, closing and divider guides, the base reference and the authoring guide now show `@meta` records instead of the old `_class`, `_footer` and `_backgroundImage` comments, which the engine no longer reads.

A unit test (`test/unit/docs/no-retired-keys-taught.test.js`) now fails when agent-facing text teaches any slide comment
that lint-core reports as `legacy-directive-comment`, so the old forms stay out of the guidance.
