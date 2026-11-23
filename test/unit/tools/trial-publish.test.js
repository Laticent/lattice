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
const { publishSet, blockers } = require('../../../tools/trial-publish.js');

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
