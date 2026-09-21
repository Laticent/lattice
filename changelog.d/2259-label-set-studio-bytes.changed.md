- **The label-set grammar no longer drags an HTML extractor into the browser.** `liftLabelSet`
  — and with it `plainText`/`stripTags` — moved out of `lib/core/label-set.js` into
  `lib/core/lift-label-set.js`. The split is by INPUT rather than convenience: `label-set.js`
  parses a string an author typed and the deck LINTER imports it, on the CLI and in the bundle
  the docs Studio loads; the lift parses markdown-it's OUTPUT and only a transform wants it.
  Measured on the built Studio route: 5 occurrences of `liftLabelSet`/`stripTags` in
  `authoring-core.generated.js` before, 0 after.
- **The `studio` route budget is raised 679500 → 681300** for what the new deck-lint rule
  legitimately costs. Measured twice off one tree with the bundles regenerated both times:
  677756 bytes gz with the rule stubbed, 679301 with it — **+1545**, chunk count unchanged at
  84. Set against the EXPECTED CI reading rather than the local one, per that route's own note
  (local + the recorded ~896-byte CI offset ≈ 680197, cleared by ~1.1KB). The previous budget
  passed locally with 199 bytes of headroom and CI still read it over, which is that warning
  working exactly as written. (`docs/route-budget.json`)
