/**
 * CommonJS door to `./split-sections.mjs`, the shared section walker.
 *
 * The walker is ESM so the docs bundle can import it directly (the Studio preview's
 * section count and the Playground's per-slide splitter walk it too, HARD RULE #1).
 * See `./top-level-h2.js` for why a CommonJS caller can still `require` it.
 */
module.exports = require('./split-sections.mjs');
