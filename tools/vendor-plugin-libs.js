#!/usr/bin/env node
/**
 * Refresh the third-party libraries plugins OWN a copy of (`payload.<key>.vendored` and
 * `vendor.<key>` in a plugin manifest), from the installed package.
 *
 *   npm run vendor:plugins            copy each library in, and rewrite its manifest's version + sha256
 *   npm run vendor:plugins -- --check exit 1 if an installed package differs from the copy it vendors
 *
 * WHY A COPY. We host third-party libraries ourselves: the plugin's copy is what every surface ships
 * (the browser pages, the CLI export and bake, the Marp kit, the Export-to-Marp bundle), so a user
 * never fetches a library and an `npm install` cannot change it. `node_modules` is only the source,
 * read here when WE decide to upgrade: bump the exact version in package.json, `npm install`, run
 * this, look at the galleries that library draws, commit. The build (lib/plugins/resolve.js) fails
 * when a copy stops matching its record, so the copy and the record can only change together. See
 * lib/plugins/payload-path.js for the three shapes a copy takes (a file, a directory, `/*.<ext>`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { copiesOf, walk, treeSha, sha } = require('../lib/plugins/payload-path.js');

const ROOT = path.join(__dirname, '..');
const PLUGINS = path.join(ROOT, 'lib', 'plugins');
const check = process.argv.includes('--check');

/**
 * Where npm installed a package, found the way Node looks (`require.resolve.paths`) rather than by
 * resolving a file in it: a package's `exports` map can hide every path but its entry
 * (mermaid-cli publishes only its ESM entry, so its `dist/` cannot be `require.resolve`d).
 */
function packageDir(pkgName) {
  for (const base of require.resolve.paths(pkgName) || []) {
    const dir = path.join(base, pkgName);
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  throw new Error(`${pkgName} is not installed — npm install`);
}

/** The source a record names: its package, version, and the files to copy (`[relative, absolute]`). */
function sourceOf(from) {
  const spec = from.replace(/^npm:/, '');
  const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  const pkgDir = packageDir(pkgName);
  const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
  const inPkg = path.join(pkgDir, spec.slice(pkgName.length + 1));
  const glob = /\/\*(\.[a-z0-9]+)$/.exec(spec);
  if (glob) {
    const dir = inPkg.slice(0, -(glob[1].length + 2));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(glob[1]) && fs.statSync(path.join(dir, f)).isFile()).sort();
    return { pkgName, version, dir, files, digest: treeSha(dir, files) };
  }
  if (spec.endsWith('/')) {
    const files = walk(inPkg);
    return { pkgName, version, dir: inPkg, files, digest: treeSha(inPkg, files) };
  }
  return { pkgName, version, file: inPkg, digest: sha(fs.readFileSync(inPkg)) };
}

let failed = 0;
for (const dir of fs.readdirSync(PLUGINS, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
  const manifestFile = path.join(PLUGINS, dir.name, `${dir.name}.manifest.json`);
  if (!fs.existsSync(manifestFile)) continue;
  let text = fs.readFileSync(manifestFile, 'utf8');
  for (const { key, entry } of copiesOf(JSON.parse(text))) {
    const src = sourceOf(entry.from);
    const label = `${dir.name}: ${entry.file} (${key})`;
    if (check) {
      if (src.digest !== entry.sha256) {
        failed++;
        console.error(`✗ ${label}: the installed ${src.pkgName}@${src.version} differs from the vendored ${entry.version}. Run npm run vendor:plugins to adopt it, or reinstall the pinned version.`);
      } else console.log(`✓ ${label} = ${src.pkgName}@${src.version}`);
      continue;
    }
    const target = path.join(PLUGINS, dir.name, entry.file);
    if (src.file) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, fs.readFileSync(src.file));
    } else {
      // A directory copy is replaced whole, so a file the new version dropped does not linger.
      fs.rmSync(target, { recursive: true, force: true });
      for (const f of src.files) {
        fs.mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
        fs.writeFileSync(path.join(target, f), fs.readFileSync(path.join(src.dir, f)));
      }
    }
    // Rewrite only this record's two values, found after its `file` (unique in a manifest), so the
    // manifest's own formatting survives and two records sharing a version do not collide.
    const at = text.indexOf(`"file": "${entry.file}"`);
    const end = text.indexOf('}', at);
    if (at < 0 || end < 0) throw new Error(`${manifestFile}: cannot find the record for ${entry.file}`);
    const record = text.slice(at, end)
      .replace(`"version": "${entry.version}"`, `"version": "${src.version}"`)
      .replace(`"sha256": "${entry.sha256}"`, `"sha256": "${src.digest}"`);
    text = text.slice(0, at) + record + text.slice(end);
    console.log(`${src.digest === entry.sha256 ? '=' : '↑'} ${label} ← ${src.pkgName}@${src.version}`);
  }
  if (!check) fs.writeFileSync(manifestFile, text);
}
process.exit(failed ? 1 : 0);
