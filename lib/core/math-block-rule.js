/**
 * lib/core/math-block-rule.js — the CommonJS door onto `math-block-rule.mjs`.
 *
 * The rule itself lives in the `.mjs` sibling because `lib/core/slide-boundaries.mjs`
 * reaches it through `boundary-parser.mjs`, and that chain has to survive Rollup: the
 * docs bundler will not do named-export interop on a CommonJS file under `lib/**`, so
 * an ESM module importing this one directly fails the site build outright.
 *
 * This shim exists so the CommonJS callers (`lib/engine/math.js`, the boundary modules)
 * keep working unchanged. There is ONE definition, in the `.mjs`.
 */
module.exports = require('./math-block-rule.mjs');
