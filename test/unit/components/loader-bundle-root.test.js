/**
 * `loadAll()` with no folder finds the full catalog when it runs from a bundle.
 *
 * The CLI `bin` is an esbuild bundle in `dist/`, where `__dirname` is `dist/`, not
 * `lib/components/`. A loader that defaulted to `__dirname` walked `dist/`, read
 * `dist/styles/manifest.json` (the CSS-module index) as a component manifest and threw
 * (followup 2779-p3). Had that file sat anywhere else, the same walk would have found no
 * components at all and lint every class against an empty catalog, with no error.
 *
 * The installed-package integration test catches the crash, but nothing a CLI prints
 * shows a silently empty catalog: every class only the manifests know is also in the
 * build's reserved-class list, so the linter is never asked about one. So this test
 * bundles the loader the way `tools/build-cli.js` does, into a package laid out like an
 * install (`package.json`, `lib/`, `dist/`), puts a decoy `dist/styles/manifest.json`
 * beside it, and asks the bundle for its catalog.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..', '..');

test('a bundled loadAll() reads lib/components/ from the package root, not dist/', async (t) => {
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-loader-bundle-'));
  t.after(() => fs.rmSync(pkg, { recursive: true, force: true }));
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'loader-probe', private: true }));
  fs.symlinkSync(path.join(ROOT, 'lib'), path.join(pkg, 'lib'), 'dir');
  // The bundle keeps npm packages external, as the CLI build does, so it resolves them here.
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(pkg, 'node_modules'), 'dir');
  // The decoy: the shape tools/build-css.js writes, which is not a component manifest.
  fs.mkdirSync(path.join(pkg, 'dist', 'styles'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'dist', 'styles', 'manifest.json'), JSON.stringify({ modules: {} }));

  const out = path.join(pkg, 'dist', 'loader.js');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'lib', 'components', 'index.js')],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  });

  const expected = require(path.join(ROOT, 'lib', 'components')).loadAll().map((m) => m.name);
  const bundled = require(out).loadAll().map((m) => m.name);
  assert.ok(expected.length > 0, 'the source catalog is empty, so this test proves nothing');
  assert.deepEqual(bundled, expected, 'the bundled loader did not find the same components as the source');
});
