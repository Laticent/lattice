/**
 * Every package the published tarball loads must be one an install provides.
 *
 * `npm i @laticent/lattice` installs `dependencies` and `optionalDependencies`, nothing
 * else. A bare `require('x')` in shipped code that names a devDependency, or a workspace
 * library the root never declared, works in this repo (where everything is installed or
 * symlinked) and breaks for every consumer. That is exactly how the installed CLI shipped
 * crashing on `Cannot find module '@laticent/segno/read'` (followup 2577-p1), and how the
 * engine silently skipped its jsdom-backed transforms outside the repo.
 *
 * The scan reads the files `package.json` `files` ships that can load code: `lib/` (minus
 * plugin `vendor/` copies, which are pre-built browser bundles with no bare imports of
 * their own), the root `lattice-emulator.js`, and the top-level `dist/*.js` bundles.
 * A package an install does NOT provide is admitted only through SANCTIONED_UNINSTALLED,
 * with its reason; an entry nothing still loads fails too, so the list cannot rot.
 */

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const { builtinModules } = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PKG  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Loaded by shipped code, deliberately NOT installed with the package. Each loader
// must survive the absence; the reason says how.
const SANCTIONED_UNINSTALLED = Object.freeze({
  '@breezystack/lamejs': 'opt-in MP3 encoder: lib/core/narration-encode.mjs catches the failed import and reports the encoder unavailable',
  'kokoro-js': 'opt-in on-device voice: lib/export/narrate-kokoro.mjs turns the missing module into an install hint',
  esbuild: 'build-time only: lib/packages/code-bundle.js freezes code packages for tools/, never on a consumer render',
  'iconv-lite': "not a load: the text of an error message (\"require('iconv-lite')…\") inside the bundled dist/lattice-pdf-compose-min.js",
});

// A specifier that could name a package: lower-case scope/name, no spaces. Prose
// inside a string literal ("from the section") never matches this.
const SPEC = /(?:\brequire\(|\bimport\(|\bfrom)\s*["']((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w./-]*)?)["']/g;

function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function shippedCodeFiles() {
  const out = [path.join(ROOT, 'lattice-emulator.js')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'vendor' || e.name === 'node_modules') continue;
        walk(p);
      } else if (/\.(?:c|m)?js$/.test(e.name) && !/\.test\.(?:c|m)?js$/.test(e.name)) {
        out.push(p);
      }
    }
  };
  walk(path.join(ROOT, 'lib'));
  for (const f of fs.readdirSync(path.join(ROOT, 'dist'))) {
    if (/\.js$/.test(f)) out.push(path.join(ROOT, 'dist', f));
  }
  return out;
}

/**
 * The packages shipped code loads that an install of a manifest with `provided` would not
 * resolve, as { name: [files] }. Pure over its inputs so the failing arm below can call it.
 */
function unresolvable(files, provided) {
  const builtins = new Set(builtinModules);
  const missing = {};
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      const name = packageOf(spec);
      if (builtins.has(name) || provided.has(name)) continue;
      (missing[name] ??= new Set()).add(path.relative(ROOT, file));
    }
  }
  return Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v].sort()]));
}

const installed = () => new Set([
  PKG.name,
  ...Object.keys(PKG.dependencies ?? {}),
  ...Object.keys(PKG.optionalDependencies ?? {}),
  ...Object.keys(PKG.peerDependencies ?? {}),
]);

test('every package shipped code loads is installed with it, or sanctioned with a reason', () => {
  const missing = unresolvable(shippedCodeFiles(), installed());
  const unsanctioned = Object.keys(missing).filter((n) => !(n in SANCTIONED_UNINSTALLED));
  assert.deepEqual(
    unsanctioned.map((n) => `${n} ← ${missing[n].slice(0, 3).join(', ')}`),
    [],
    'shipped code loads packages `npm i @laticent/lattice` does not install. Add each to ' +
    '`dependencies` (or bundle it), or, if the loader survives its absence, sanction it in ' +
    'SANCTIONED_UNINSTALLED with the reason.',
  );
});

test('no sanction is stale', () => {
  const missing = unresolvable(shippedCodeFiles(), installed());
  const stale = Object.keys(SANCTIONED_UNINSTALLED).filter((n) => !(n in missing));
  assert.deepEqual(stale, [], 'these SANCTIONED_UNINSTALLED entries no longer match any load; delete them');
});

test('the scan fails when a workspace library leaves dependencies (failing arm)', () => {
  const provided = installed();
  provided.delete('@laticent/segno');
  const missing = unresolvable(shippedCodeFiles(), provided);
  assert.ok(missing['@laticent/segno']?.length > 0, 'the scan must name @laticent/segno once it is undeclared');
});
