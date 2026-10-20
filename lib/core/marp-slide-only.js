/**
 * lib/core/marp-slide-only.js — the CJS door onto `marp-slide-only.mjs`, for the CLI export (tools/export-marp.js).
 * Read the `.mjs` for what it does and why it is not in the engine bundle. CJS wraps ESM, never the reverse.
 */

module.exports = require('./marp-slide-only.mjs');
