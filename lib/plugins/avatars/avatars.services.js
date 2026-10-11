/**
 * The avatars plugin's services (contributes.services), for code that needs to know about an avatar
 * without importing this plugin — today team-profile, which takes a drawn avatar as a portrait and
 * must tell an avatar that is merely NOT DRAWN YET from one that is broken. A caller asks the host
 * (lib/plugins/services.js `service('avatars', 'reads')`) and, with the plugin off, gets null.
 *
 *   reads(text)    true when `!{…}` is a valid avatar (whether or not its drawings are here)
 *   pending()      true while the drawings may still arrive on this surface (lib/plugins/plugin-data.js)
 */
const { read } = require('./avatars.inline.js');
const { dataPending } = require('../plugin-data.js');

const services = Object.freeze({
  reads: (text) => read(text) !== null,
  pending: () => dataPending('avatars'),
});

module.exports = { services };
