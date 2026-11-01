/**
 * lib/plugins/host-export.js — the ctx a plugin's EXPORT code gets (the Export-to-Marp bundle, lib/export/marp-bundle.js):
 * the plugin's base ctx (lib/core/plugin-ctx.js) plus the engine vocabulary only an export reads.
 *
 * Its own module so the render path never carries it: the base ctx is in every engine bundle, and an export-only entry
 * there (video's old-form fence step, lib/core/video-migrate.js) would ride into each of them unused
 * (2026-11-01-plugin-contract-hollywood.md §4).
 *
 *   ctx.vocabulary.video.fenceStep   the old `video` fence's migration step, which the engine's own reader shares
 */

const { ctxFor } = require('../core/plugin-ctx.js');

/** The export ctx for one plugin. `off` is the set of plugins switched off for the call, as ctxFor takes it. */
function exportCtxFor(name, off) {
  const base = ctxFor(name, off);
  const video = Object.freeze({ ...base.vocabulary.video, fenceStep: require('../core/video-migrate.js').fenceStep });
  return Object.freeze({ ...base, vocabulary: Object.freeze({ ...base.vocabulary, video }) });
}

module.exports = { exportCtxFor };
