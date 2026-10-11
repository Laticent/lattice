/**
 * tools/structure.js — the part map and the three rules build:check holds (no part loop, no upward
 * import, the plugin boundary), fed synthetic dependency-cruiser graphs so each rule is shown to
 * FAIL on the shape it exists to catch. The live tree is checked by build:check itself
 * (tools/check-structure.js); engineering/decisions/2026-10-11-codebase-structure.md.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, partOf, isSeam, structureProblems } = require('../../../tools/structure.js');

/** A graph from `[from, [to…]]` pairs, in dependency-cruiser's JSON shape. */
const graph = (pairs) => ({
  modules: pairs.map(([source, deps]) => ({ source, dependencies: deps.map((resolved) => ({ resolved })) })),
});

test('the part map: folders, the plugin split, schemas, libraries and the specific-before-general rule', () => {
  assert.equal(partOf('lib/core/color.js').name, 'lib/core');
  assert.equal(partOf('lib/plugins/host.js').name, 'lib/plugins');
  assert.equal(partOf('lib/plugins/mermaid/shared/render-diagrams.js').name, 'lib/plugins/mermaid');
  assert.equal(partOf('lib/plugins/mermaid/shared/render-diagrams.js').plugin, true);
  assert.equal(partOf('lib/components/manifest.schema.json').name, 'lib/schemas');
  assert.equal(partOf('docs/src/lib/segno/read.ts').name, '@laticent/segno');
  assert.equal(partOf('docs/src/lib/front-matter.ts').name, 'site/lib');
  assert.equal(partOf('docs/src/components/studio/StudioShell.tsx').name, 'site/studio');
  assert.equal(partOf('docs/src/components/site/CommandMenu.tsx').name, 'site/components');
  assert.equal(partOf('lattice.js').name, 'lattice.js');
  assert.equal(partOf('README.md'), null);
});

test('a generated file under lib/ is a seam; a built bundle in the site is not', () => {
  assert.equal(isSeam('lib/plugins/registry.generated.js'), true);
  assert.equal(isSeam('lib/forms/cell/pane/pane-catalog.generated.js'), true);
  assert.equal(isSeam('lib/plugins/host.js'), false);
  assert.equal(isSeam('docs/src/playground/theme-core.generated.js'), false);
});

test('a layered graph passes', () => {
  const r = analyze(graph([
    ['lib/engine/index.js', ['lib/core/a.js', 'lib/plugins/host.js']],
    ['lib/plugins/host.js', ['lib/core/a.js', 'lib/plugins/registry.generated.js']],
    ['lib/plugins/registry.generated.js', ['lib/plugins/math/math.render.js']],
    ['lib/plugins/math/math.render.js', ['lib/plugin-kit/html.js']],
    ['lib/plugin-kit/html.js', ['lib/core/a.js']],
    ['lib/core/a.js', []],
  ]));
  assert.deepEqual(structureProblems(r), []);
});

test('an upward import fails, and names both ends and their layers', () => {
  const r = analyze(graph([
    ['lib/core/a.js', ['lib/engine/index.js']],
    ['lib/engine/index.js', []],
  ]));
  assert.equal(r.upward.length, 1);
  assert.match(r.upward[0], /lib\/core\/a\.js \(lib\/core, layer 1\) -> lib\/engine\/index\.js \(lib\/engine, layer 5\)/);
});

test('a loop between two parts on one layer fails, though neither import points up', () => {
  const r = analyze(graph([
    ['lib/components/x.js', ['lib/forms/y.js']],
    ['lib/forms/y.js', ['lib/components/x.js']],
  ]));
  assert.equal(r.upward.length, 0);
  assert.deepEqual(r.loops.map((l) => l.members), [['lib/components', 'lib/forms']]);
  assert.equal(structureProblems(r).length, 1);
});

test('a seam carries no edge: a lower layer may read a generated table the build writes from above', () => {
  const r = analyze(graph([
    ['lib/core/coda.js', ['lib/forms/cell/coda/coda-catalog.generated.js']],
    ['lib/forms/cell/coda/coda-catalog.generated.js', ['lib/forms/cell/coda/coda.js']],
    ['lib/forms/cell/coda/coda.js', ['lib/core/coda.js']],
  ]));
  assert.deepEqual(structureProblems(r), []);
});

test('the plugin boundary fails both ways: a plugin past the kit, and code into a plugin', () => {
  const r = analyze(graph([
    ['lib/plugins/math/math.render.js', ['lib/core/a.js']],
    ['lib/transformers/t.js', ['lib/plugins/math/math.render.js']],
    ['lib/core/a.js', []],
  ]));
  assert.deepEqual(r.pluginOut, ['lib/plugins/math/math.render.js -> lib/core/a.js']);
  assert.deepEqual(r.pluginIn, ['lib/transformers/t.js -> lib/plugins/math/math.render.js']);
});

test('a sanction admits its upward import, and a sanction nothing uses is stale', () => {
  const g = graph([
    ['lib/core/a.js', ['lib/engine/index.js']],
    ['lib/engine/index.js', []],
  ]);
  assert.deepEqual(analyze(g, { sanctioned: { 'lib/core -> lib/engine': 'reason' } }).upward, []);
  const stale = analyze(graph([['lib/core/a.js', []]]), { sanctioned: { 'lib/core -> lib/engine': 'reason' } });
  assert.deepEqual(stale.staleSanctions, ['lib/core -> lib/engine']);
  assert.equal(structureProblems(stale).length, 1);
});

test('a file in no part is a problem, so a new folder cannot slip past the map', () => {
  const r = analyze(graph([['lib/brand-new/x.js', []]]));
  assert.deepEqual(r.unmapped, ['lib/brand-new/x.js']);
  assert.match(structureProblems(r)[0], /belongs to no part/);
});
