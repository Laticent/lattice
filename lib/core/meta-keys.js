/**
 * lib/core/meta-keys.js — the CJS door onto `meta-keys.mjs`, for the render-path modules that
 * `require()`. Read the `.mjs` for what the vocabulary is and where it comes from. CJS wraps ESM,
 * never the reverse (see comment-directive.js for why).
 */

module.exports = require('./meta-keys.mjs');
