studio: +968
playground: +596
Deck presets can now recommend a theme, color mode, hand, marks and backdrop (P0 of engineering/decisions/2026-11-20-deck-preset-study.md). The Studio's preset mirror (`deck-preset.ts`) and the Playground sheet (`deck-config.js`) read those keys, handle multi-word values and the `chart-finish` alias, and label Auto with what a preset recommends, and both load the preset table from `front-matter-key.js` up front.
Given back first: the preset-token validation and CSS generator moved out of `front-matter-key.js` into `lib/core/resolve-preset.js`, which neither route loads up front. That took the leaf's growth from +698 to +201 bytes.
The last 124 bytes (studio +52, playground +72) are the review fix that makes the Auto labels read keys through the engine's own scalar rule, so a comment, a quoted empty value or an unknown palette labels exactly what renders.
