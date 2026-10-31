/**
 * lib/plugin-kit/video.js — the plugin kit's video provider lookup: which provider a link names
 * (lib/core/video-providers.mjs). The video inline kernel reads it on every render, so it carries
 * nothing else; the one-step fence migration is lib/plugin-kit/video-migrate.js.
 */

const { detectProvider } = require('../core/video-providers.mjs');

module.exports = { detectProvider };
