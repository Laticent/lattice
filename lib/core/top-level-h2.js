/**
 * CommonJS door to `./top-level-h2.mjs`, where the tokenizer lives.
 *
 * The module is ESM so the docs bundle can import it directly: the docs bundler
 * resolves `lib/**.mjs` as ESM and does no named-export interop on a CommonJS file
 * there. Node (>= 22.12, `engines` in package.json) and esbuild both `require()` an
 * ESM module, so every existing CommonJS caller keeps its `require` unchanged.
 * `lib/core/video-providers.mjs` and `slide-boundaries.mjs` ship the same way.
 */
module.exports = require('./top-level-h2.mjs');
