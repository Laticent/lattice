/**
 * CommonJS door to `./resolve-split.mjs`, which reads the deck's `split:` mode.
 *
 * ESM for the same reason as `./heading-split-core.js`: the Studio's slide index imports it,
 * and the docs dev server serves only require-free CommonJS.
 */
module.exports = require('./resolve-split.mjs');
