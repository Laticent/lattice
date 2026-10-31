/**
 * lib/plugin-kit/video-migrate.js — the plugin kit's one-step migration of the old video fence
 * (lib/core/video-migrate.js), which the linter's fix uses too. Its own module so the video inline
 * kernel, which every render bundle carries, does not carry the migration (route budget, #2630).
 */

const { fenceStep } = require('../core/video-migrate.js');

module.exports = { fenceStep };
