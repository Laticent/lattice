/**
 * lib/export/marp-directives.js — the CJS door onto `marp-directives.mjs`, for the CLI export (tools/export-marp.js).
 * Read the `.mjs` for what it does. CJS wraps ESM, never the reverse.
 */

module.exports = require('./marp-directives.mjs');
