/**
 * tools/trial-publish.js: the parts that decide what is published and what blocks an install.
 * The registry, publish, install and render half runs in .github/workflows/trial-publish.yml;
 * these pin the check that runs before it, against fixture repositories, because the real tree's
 * answer changes as libraries become publishable.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishSet, blockers, upstreamMiss, pinnedOverrides } = require('../../../tools/trial-publish.js');

/** A fixture repository: a root naming `workspaces`, each with the package.json given. */
function fixture(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-publish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, workspaces: Object.keys(packages) }));
  for (const [dir, pkg] of Object.entries(packages)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(pkg));
  }
  return root;
}

const engine = (deps) => ({ name: '@laticent/lattice', dependencies: { jszip: '^3', ...deps } });

test('publishSet is every non-private library under docs/src/lib/, and nothing else', (t) => {
  const root = fixture(t, {
    'packages/lattice': engine({}),
    'docs/src/lib/segno': { name: '@laticent/segno' },
    'docs/src/lib/cenno': { name: '@laticent/cenno', private: true },
    'docs/src/lib/ltt': { name: '@laticent/ltt' },
    'tools/elsewhere': { name: '@laticent/elsewhere' },
  });
  assert.deepEqual(publishSet(root), ['@laticent/ltt', '@laticent/segno']);
});

test('blockers is empty when every @laticent package the engine needs can be published', (t) => {
  const root = fixture(t, {
    'packages/lattice': engine({ '@laticent/segno': '^0.1.0' }),
    'docs/src/lib/segno': { name: '@laticent/segno', dependencies: { '@laticent/ltt': '^0.1.0' } },
    'docs/src/lib/ltt': { name: '@laticent/ltt' },
    'docs/src/lib/cenno': { name: '@laticent/cenno', private: true }, // private, but nothing needs it
  });
  assert.deepEqual(blockers(root), []);
});

test('blockers names a private dependency, a private one reached through another, and a missing one', (t) => {
  const root = fixture(t, {
    'packages/lattice': engine({ '@laticent/markup': '^0.1.0', '@laticent/segno': '^0.1.0', '@laticent/gone': '^1.0.0' }),
    'docs/src/lib/markup': { name: '@laticent/markup', private: true },
    'docs/src/lib/segno': { name: '@laticent/segno', optionalDependencies: { '@laticent/lastra': '^0.1.0' } },
    'docs/src/lib/lastra': { name: '@laticent/lastra', private: true },
  });
  const found = blockers(root);
  assert.equal(found.length, 3, found.join('\n'));
  assert.match(found.join('\n'), /@laticent\/markup \(needed by @laticent\/lattice\) is "private": true in docs\/src\/lib\/markup\/package\.json/);
  assert.match(found.join('\n'), /@laticent\/lastra \(needed by @laticent\/segno\) is "private": true/);
  assert.match(found.join('\n'), /@laticent\/gone \(needed by @laticent\/lattice\) is not a workspace/);
});

test("the engine's own private flag is not a blocker: the root is never what installs", (t) => {
  const root = fixture(t, { 'packages/lattice': { ...engine({}), private: true } });
  assert.deepEqual(blockers(root), []);
});

// The install retries once, and only when npmjs had not finished serving a third-party package
// (#3471's trial met @bramus/specificity 2.4.4 404ing for minutes after its release). A miss on an
// @laticent package is the trial's own and must fail at once, and so must any other error.
test('upstreamMiss names a third-party package npmjs could not serve, and nothing else', () => {
  const miss = (s) => upstreamMiss(s);
  assert.equal(miss('npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@bramus%2fspecificity/-/specificity-2.4.4.tgz - Not found'), '@bramus/specificity');
  assert.equal(miss('npm error 404 Not Found - GET https://registry.npmjs.org/@bramus/specificity'), '@bramus/specificity');
  assert.equal(miss('npm error 404 Not Found - GET https://registry.npmjs.org/jszip/-/jszip-3.10.1.tgz'), 'jszip');
  assert.equal(miss('npm error code ETARGET\nnpm error notarget No matching version found for left-pad@^9.0.0.'), 'left-pad');
  assert.equal(miss('npm error code E404\nnpm error 404 Not Found - GET http://127.0.0.1:4873/@laticent%2flastra - no such package available'), null);
  assert.equal(miss('npm error code ETARGET\nnpm error notarget No matching version found for @laticent/segno@^0.1.0.'), null);
  assert.equal(miss('npm error code ECONNRESET\nnpm error network aborted'), null);
  assert.equal(miss('`lattice --version` printed "lattice 0.9.0"'), null);
});

// The clean install pins its third-party packages to the repository lockfile's versions, so a
// release npmjs published a minute ago cannot be chosen. A name held at several versions cannot be
// forced to one without breaking a dependent, and @laticent packages are the trial's own.
test('pinnedOverrides pins single-version third-party names and leaves ours and multi-version ones alone', () => {
  const lock = {
    packages: {
      '': { name: 'root' },
      'node_modules/jszip': { version: '3.10.1' },
      'node_modules/@bramus/specificity': { version: '2.4.3' },
      'node_modules/ansi-regex': { version: '6.1.0' },
      'node_modules/cliui/node_modules/ansi-regex': { version: '5.0.1' },
      'node_modules/@laticent/segno': { version: '0.1.0', link: true },
      'node_modules/@laticent/markup': { version: '0.1.0' },
      'docs/src/lib/segno': { version: '0.1.0' },
    },
  };
  const { overrides, floating } = pinnedOverrides(lock);
  assert.deepEqual(overrides, { '@bramus/specificity': '2.4.3', jszip: '3.10.1' });
  assert.deepEqual(floating, ['ansi-regex']);
});
