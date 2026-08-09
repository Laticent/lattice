/**
 * The published emulator bundle must not carry the repo manifest.
 *
 * `dist/lattice-emulator.js` is the package `bin`/`main`, built by esbuild from
 * the repo-root source. esbuild inlines the local relative graph, so a
 * `require('./package.json')` anywhere in that graph embeds the WHOLE manifest
 * — dependency ranges and all — into the committed artifact.
 *
 * That is not merely untidy. It couples the bundle's bytes to every declared
 * dependency range, so any Dependabot bump leaves the committed bundle stale,
 * `build:check` fails, and the PR is unmergeable by a bot that cannot run
 * `npm run build`. Both routine bump groups sat red on exactly this.
 *
 * The version — the only field the CLI ever wanted — is read at runtime from
 * PKG_ROOT instead (`pkgVersion()` in lattice-emulator.js), which resolves to
 * the installed package's own manifest for an npm consumer.
 */

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT   = path.resolve(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice-emulator.js');
const SOURCE = path.join(ROOT, 'lattice-emulator.js');

test('the emulator source never `require`s the manifest', () => {
  // Comments are stripped first — the note above `pkgVersion()` explains the
  // banned call by quoting it, and a scan that can't tell code from prose would
  // fail on its own documentation.
  const src = fs.readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.equal(
    /require\(\s*['"]\.\/package\.json['"]\s*\)/.test(src),
    false,
    'lattice-emulator.js must read the version from PKG_ROOT at runtime, not ' +
    "`require('./package.json')` — the require inlines the whole manifest into " +
    'dist/lattice-emulator.js and makes the bundle stale on every dependency bump.',
  );
});

test('the built bundle carries no dependency ranges', () => {
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  for (const field of ['devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.equal(
      bundle.includes(`"${field}"`) || bundle.includes(`${field}:`),
      false,
      `dist/lattice-emulator.js contains the manifest's ${field} — something in ` +
      'the bundled graph is requiring package.json again.',
    );
  }

  // The declared ranges themselves, spot-checked against the live manifest so
  // this keeps biting as dependencies change rather than pinning one name.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
    assert.equal(
      bundle.includes(`${name}: "${range}"`),
      false,
      `dist/lattice-emulator.js embeds the declared range for ${name} (${range}); ` +
      'the bundle must not move when a dependency is bumped.',
    );
  }
});

test('--version still reports the package version from the bundle', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  // Both layouts: the loose source (__dirname IS the root) and the built bundle
  // (__dirname is <root>/dist). PKG_ROOT's walk has to land on the same manifest.
  for (const entry of [SOURCE, BUNDLE]) {
    const out = execFileSync(process.execPath, [entry, '--version'], { encoding: 'utf8' }).trim();
    assert.equal(
      out,
      `lattice-emulator ${pkg.version}`,
      `${path.relative(ROOT, entry)} --version must report the manifest version`,
    );
  }
});
