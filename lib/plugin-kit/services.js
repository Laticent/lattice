/**
 * lib/plugin-kit/services.js — the plugin kit's service lookup: what one plugin offers another by
 * name (a pill's `icon=` asks the icons plugin), through the host's table (lib/core/plugin-services.js),
 * never by importing the other plugin.
 */

const { service } = require('../core/plugin-services.js');

module.exports = { service };
