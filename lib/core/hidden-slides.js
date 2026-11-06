/**
 * lib/core/hidden-slides.js — the CommonJS door to lib/core/hidden-slides.mjs (the one test for "is this rendered slide
 * hidden?"). The code lives in the ES module so the docs app can import it without a require.
 */
module.exports = require('./hidden-slides.mjs');
