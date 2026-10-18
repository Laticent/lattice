studio: +218
playground: +205
home: +206
The media source rows (`lib/core/media-sources.js`) now carry `scheme` and a `resolve` function each, so the resolver loops the table instead of branching on a row id. Those functions and the table's scheme lookup ship in the shared `bg-image` core that all three routes bundle. The player assembler (`lib/export/player-core.mjs`) also gained an optional `inlineDocAssets` hook, a few bytes in the routes that bundle it. This is real growth, taken from CI's per-PR allowance block on d376aff; nothing was given back elsewhere.
