---
"@laticent/lattice": minor
---

`grammar.json` now publishes, per component, every place it reads ordinary Markdown as structure: `lists` (what `-` versus `1.` means), `titledItems` (a card or ledger layout's titles, and whether the engine sets them bold), `beats` (the trailing key insight and below-note it renders) and `inlineReads` (where bold or italic means something, such as `pricing`'s ribbon).

LFM 1.0 §3.4 states the rule these serve: bold and italic keep their ordinary meaning unless a component declares otherwise. §2.2 now states two parser rules the engine always had: a newline inside a paragraph is a line break, and `***` or `___` at the top level separates slides like `---`.

The registries now carry their versions: `front-matter.schema.json` states `x-lattice-version`, every key its `x-lattice-since`, a retired key the version that retired it, and the record-only fields (`layout`, `class`, `carry`, `lens`, `pane`, `focus-steps`, …) under `x-lattice-record-fields`; `grammar.json` states `version` and each component its `since`, and `components.json` publishes the modifier prefix families. `lint:deck --json` lists the tiers it left out in `coverage.skipped`. Lint reports a malformed plugin key (`Acme.Tally:`) and stays quiet on a well-formed one (`acme.tally:`).
