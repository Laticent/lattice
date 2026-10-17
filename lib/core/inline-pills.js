/**
 * INLINE PILLS — moved. The kernel is the embedded pills plugin's now: lib/plugins/pills/pills.inline.js
 * (engineering/decisions/2026-10-17-pills-plugin.md). This file re-exports it so the files that still
 * `require` the old path keep working while they move; it is deleted when the last one has.
 */
module.exports = require('../plugins/pills/pills.inline.js');
