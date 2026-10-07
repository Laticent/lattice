/**
 * lib/plugins/payload-path.js — WHERE a plugin's third-party libraries live on disk (Node only).
 *
 * We host third-party libraries ourselves: a plugin OWNS a committed, pinned, hashed copy of each
 * library it needs (`lib/plugins/<name>/vendor/…`), and every surface reads that copy — the browser
 * pages (staged by docs/scripts/sync-playground-assets.mjs), the CLI export page
 * (lib/plugins/hydrate-script.js), the CLI bake, the Marp kit and the Export-to-Marp bundle. So no
 * user ever fetches a library, and an `npm install` cannot change what ships: `node_modules` is only
 * the source `npm run vendor:plugins` refreshes the copies from.
 *
 * A manifest records a copy in one of two places:
 *   - `payload.<key>.vendored` — the library a BROWSER surface loads beside the runtime (Mermaid,
 *     function-plot). `payloadPath` reads it.
 *   - `vendor.<key>` — every other library the plugin owns: a renderer's (KaTeX, with its stylesheet
 *     and fonts) or the bake's (ZenUML, mermaid-cli's render page). `vendorPath` reads it.
 * Both have the same record — `from` (the npm source), `file` (the copy), `version`, `sha256` — and
 * a copy is one FILE, a whole DIRECTORY (`from` and `file` end in `/`), or one directory's files of
 * one extension (`from` ends in `/*.<ext>`, `file` in `/`). A directory's `sha256` is `treeSha`.
 *
 * Not for a browser bundle: it reads the manifest from disk. Browser code names the file by the
 * basename the generated registries carry, and the hosts stage it beside the runtime.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { pkgRootFrom } = require('../core/pkg-root.js');

// The PACKAGE root, walked to, not counted: the installed CLI runs `dist/lattice-emulator.js`, an
// esbuild bundle that inlines this file, where `__dirname` is `<pkg>/dist` and `../..` is the folder
// ABOVE the package — every copy then "missing", and the CLI export silently dropped KaTeX's faces
// and every function plot (tier 1 checker). lib/core/pkg-root.js is the walk the bundle-era callers share.
const ROOT = pkgRootFrom(__dirname);

function manifestOf(pluginName, root) {
  const file = path.join(root, 'lib', 'plugins', pluginName, `${pluginName}.manifest.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The plugin's manifest `payload` entry (a plugin ships at most one library in api 1), or null. */
function payloadOf(pluginName, root = ROOT) {
  const [payload] = Object.values(manifestOf(pluginName, root).payload || {});
  return payload || null;
}

/**
 * The absolute path of a plugin's browser library: its own committed copy when the payload is
 * vendored, else the installed package's file. '' when the plugin ships no library.
 * @param {string} pluginName
 * @param {string} [root]
 */
function payloadPath(pluginName, root = ROOT) {
  const payload = payloadOf(pluginName, root);
  if (!payload) return '';
  if (payload.vendored) return path.join(root, 'lib', 'plugins', pluginName, payload.vendored.file);
  return require.resolve(payload.from.replace(/^npm:/, ''), { paths: [root] });
}

/**
 * The absolute path of one of a plugin's other owned copies (`vendor.<key>`): a file, or a
 * directory with a trailing separator. Throws when the manifest declares no such copy — a reader
 * naming a library its plugin does not own is a bug, not a fallback to node_modules.
 * @param {string} pluginName
 * @param {string} key
 * @param {string} [root]
 */
function vendorPath(pluginName, key, root = ROOT) {
  const entry = manifestOf(pluginName, root).vendor?.[key];
  if (!entry) throw new Error(`plugin "${pluginName}" vendors no "${key}" (its manifest's \`vendor\`)`);
  const abs = path.join(root, 'lib', 'plugins', pluginName, entry.file);
  return entry.file.endsWith('/') ? `${abs}${path.sep}` : abs;
}

/**
 * Every copy a manifest records, as `{ key, entry }` with `entry` = { from, file, version, sha256 }:
 * the vendored payloads first, then `vendor`. The refresh tool and the registry build read it; the
 * resolver keeps a pure twin (lib/plugins/resolve.js `copiesOf`).
 */
function copiesOf(manifest) {
  const out = [];
  for (const [key, payload] of Object.entries(manifest.payload || {})) {
    if (payload.vendored) out.push({ key, entry: { from: payload.from, ...payload.vendored } });
  }
  for (const [key, entry] of Object.entries(manifest.vendor || {})) out.push({ key, entry });
  return out;
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

/**
 * A directory's hash: SHA-256 over one `<relative path> <file sha256>\n` line per file, sorted by
 * path. So a renamed, added, removed or edited file each changes it, and the order files were
 * written in does not. `files` narrows the set (an extension-filtered copy).
 */
function treeSha(dir, files = walk(dir)) {
  return sha(files.map((f) => `${f} ${sha(fs.readFileSync(path.join(dir, f)))}\n`).join(''));
}

/** A copy's hash as it sits on disk ('' when missing): a file's SHA-256, or a directory's treeSha. */
function copySha(abs, isDir) {
  if (!fs.existsSync(abs)) return '';
  return isDir ? treeSha(abs) : sha(fs.readFileSync(abs));
}

module.exports = { payloadOf, payloadPath, vendorPath, copiesOf, walk, treeSha, copySha, sha };
