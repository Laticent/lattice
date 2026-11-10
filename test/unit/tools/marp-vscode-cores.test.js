/**
 * The Marp versions tools/build-marp-vscode-css.js models (`VSCODE_CORES`), and the pin they exist for.
 *
 * WHY. A user's VS Code preview runs the marp-core and marpit THEIR Marp for VS Code release bundles, and Marp's own earlier rules
 * differ between them: marpit before 3.2.2 writes its `h1` reset as `section :is(h1, marp-h1)`, one type selector stronger than
 * 3.2.2's `:where(…)`. The linked stylesheet's rules are one type selector weaker than the registered theme's, so against the old
 * reset a plain `section h1 { margin: 0 }` lost, and a title slide's paragraphs moved 43 px in Marp for VS Code 3.0.0-3.5.1
 * (measured in the real VS Code, 2026-11-10). The build now checks ties against every bundled pair, which pins that declaration
 * into the stub, where the preview's own marp-core packs it at full strength.
 *
 * Two guards. (1) Each modeled pair is what its row says: the alias resolves to that marp-core, and that marp-core resolves to
 * that marpit. The marpit is held by package.json `overrides`; without them npm shares the repo's newest marpit with every alias,
 * and the build would silently model a Marp no release ships. (2) The pin itself, on a one-rule theme: `margin` ties the old
 * reset and is pinned, `color` ties nothing and stays in the link. Under 4.4.0 alone neither would be pinned.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { VSCODE_CORES, pinnedRules, stubOf } = require('../../../tools/build-marp-vscode-css.js');

const versionOf = (pkg, from) => require(require.resolve(`${pkg}/package.json`, { paths: [from] })).version;

test('each modeled Marp is the marp-core and marpit its Marp for VS Code release bundles', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const manifest = require(path.join(root, 'package.json'));
  for (const row of VSCODE_CORES) {
    const alias = `marp-core-${row.core}`;
    const coreDir = path.dirname(require.resolve(`${alias}/package.json`, { paths: [root] }));
    assert.equal(versionOf(alias, root), row.core, `${alias} resolves to marp-core ${row.core}`);
    assert.equal(versionOf('@marp-team/marpit', coreDir), row.marpit, `marp-core ${row.core} runs marpit ${row.marpit} (Marp for VS Code ${row.vscode})`);
    assert.equal(manifest.devDependencies[alias], `npm:@marp-team/marp-core@${row.core}`, `${alias} is an exact devDependency`);
    assert.deepEqual(manifest.overrides[alias], { '@marp-team/marpit': row.marpit }, `${alias}'s marpit is pinned by overrides`);
  }
  assert.ok(VSCODE_CORES.some((r) => r.marpit < '3.2.2'), 'at least one modeled release writes the older, stronger h1 reset');
});

test('a declaration that ties an older Marp\'s h1 reset is pinned; one that ties nothing stays linked', () => {
  const engine = '/* @theme lattice */\nsection h1{margin:0;color:red}\n';
  const { pins } = pinnedRules(engine, stubOf(engine));
  assert.deepEqual([...pins.keys()], [0], 'the one rule is pinned');
  assert.deepEqual([...pins.get(0)], ['margin'], 'only margin: color stays in the link, where the author still wins');
});
