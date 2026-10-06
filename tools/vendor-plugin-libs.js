#!/usr/bin/env node
/**
 * Refresh the third-party libraries plugins OWN a copy of (`payload.vendored` in a plugin
 * manifest), from the installed package.
 *
 *   npm run vendor:plugins            copy each library in, and rewrite its manifest's version + sha256
 *   npm run vendor:plugins -- --check exit 1 if an installed package differs from the copy it vendors
 *
 * WHY A COPY. We host third-party libraries ourselves: the plugin's copy is what every surface ships
 * (the browser pages, the CLI bake, the Marp kit, the Export-to-Marp bundle), so a user never fetches
 * the library and an `npm install` cannot change it. `node_modules` is only the source, read here
 * when WE decide to upgrade: bump the pinned version in package.json, `npm install`, run this, look
 * at the diagram gallery, commit. The build (lib/plugins/resolve.js) fails when a copy stops
 * matching its record, so the copy and the record can only change together. See
 * lib/plugins/payload-path.js.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGINS = path.join(ROOT, 'lib', 'plugins');
const check = process.argv.includes('--check');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
let failed = 0;
for (const dir of fs.readdirSync(PLUGINS, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
  const manifestFile = path.join(PLUGINS, dir.name, `${dir.name}.manifest.json`);
  if (!fs.existsSync(manifestFile)) continue;
  const text = fs.readFileSync(manifestFile, 'utf8');
  const manifest = JSON.parse(text);
  for (const [key, payload] of Object.entries(manifest.payload || {})) {
    if (!payload.vendored) continue;
    const spec = payload.from.replace(/^npm:/, '');
    const source = require.resolve(spec, { paths: [ROOT] });
    const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    const version = require(require.resolve(`${pkgName}/package.json`, { paths: [ROOT] })).version;
    const bytes = fs.readFileSync(source);
    const digest = sha(bytes);
    const target = path.join(PLUGINS, dir.name, payload.vendored.file);
    const label = `${dir.name}: ${payload.vendored.file} (${key})`;
    if (check) {
      if (digest !== payload.vendored.sha256) {
        failed++;
        console.error(`✗ ${label}: the installed ${pkgName}@${version} differs from the vendored ${payload.vendored.version}. Run npm run vendor:plugins to adopt it, or reinstall the pinned version.`);
      } else console.log(`✓ ${label} = ${pkgName}@${version}`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    // Rewrite only the two recorded values, so the manifest's own formatting survives.
    const next = text
      .replace(`"version": "${payload.vendored.version}"`, `"version": "${version}"`)
      .replace(`"sha256": "${payload.vendored.sha256}"`, `"sha256": "${digest}"`);
    fs.writeFileSync(manifestFile, next);
    console.log(`${digest === payload.vendored.sha256 ? '=' : '↑'} ${label} ← ${pkgName}@${version}`);
  }
}
process.exit(failed ? 1 : 0);
