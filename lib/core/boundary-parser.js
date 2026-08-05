/**
 * lib/core/boundary-parser.js — the CommonJS door onto `boundary-parser.mjs`.
 *
 * The parser and its configuration live in the `.mjs` sibling, and the reason is a hard
 * constraint rather than a preference: `lib/core/slide-boundaries.mjs` imports it, that
 * module is bundled for the browser Studio, and Rollup will not do named-export interop
 * on a CommonJS file under `lib/**` — the site build fails with
 * "boundaryParser is not exported by lib/core/boundary-parser.js".
 *
 * This shim exists so the CommonJS callers (`bake-splits.js`, `section-source-split.js`,
 * `slide-class-spans.js`, and the unit tests) keep requiring the same path they always
 * have. There is ONE parser configuration, in the `.mjs`, and one instance: `require()`
 * of an ES module returns that module's own namespace, so both doors hand out the same
 * `boundaryParser`.
 */
module.exports = require('./boundary-parser.mjs');
