/**
 * CommonJS door to `./heading-split-core.mjs`, where the `split: headings` boundary
 * computation lives.
 *
 * The module is ESM so the docs bundle can import it directly — the Studio's slide index
 * (docs/src/lib/deck-outline/deck-outline.ts) counts heading sections with it — and the docs dev
 * server serves only require-free CommonJS (docs/src/plugins/vite-cjs-lib-dev.mjs). Node
 * (>= 22.12) and esbuild both `require()` an ESM module, so every CommonJS caller keeps its
 * `require` unchanged. `./top-level-h2.js` ships the same way.
 */
module.exports = require('./heading-split-core.mjs');
