/**
 * lib/plugins/payload-path.js — WHERE a plugin's third-party library lives on disk (Node only).
 *
 * A plugin declares its library in its manifest's `payload`. When the payload is `vendored`, the
 * plugin OWNS a committed copy (`lib/plugins/<name>/vendor/…`) and every surface reads that copy:
 * the browser pages (staged by docs/scripts/sync-playground-assets.mjs), the CLI export page
 * (lib/plugins/hydrate-script.js), the CLI bake, the Marp kit and the Export-to-Marp bundle. So no
 * user ever fetches the library, and an `npm install` cannot change what ships: `node_modules` is
 * only the source `npm run vendor:plugins` refreshes the copy from. A payload without `vendored`
 * still resolves from the installed package.
 *
 * Not for a browser bundle: it reads the manifest from disk. Browser code names the file by the
 * basename the generated registries carry, and the hosts stage it beside the runtime.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/** The plugin's manifest `payload` entry (a plugin ships at most one library in api 1), or null. */
function payloadOf(pluginName, root = ROOT) {
  const file = path.join(root, 'lib', 'plugins', pluginName, `${pluginName}.manifest.json`);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [payload] = Object.values(manifest.payload || {});
  return payload || null;
}

/**
 * The absolute path of a plugin's library: its own committed copy when the payload is vendored,
 * else the installed package's file. '' when the plugin ships no library.
 * @param {string} pluginName
 * @param {string} [root]
 */
function payloadPath(pluginName, root = ROOT) {
  const payload = payloadOf(pluginName, root);
  if (!payload) return '';
  if (payload.vendored) return path.join(root, 'lib', 'plugins', pluginName, payload.vendored.file);
  return require.resolve(payload.from.replace(/^npm:/, ''), { paths: [root] });
}

module.exports = { payloadOf, payloadPath };
