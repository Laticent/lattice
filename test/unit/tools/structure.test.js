/**
 * tools/structure.js — the part map and the three rules build:check holds (no part loop, no upward
 * import, the plugin boundary), fed synthetic dependency-cruiser graphs so each rule is shown to
 * FAIL on the shape it exists to catch. The live tree is checked by build:check itself
 * (tools/check-structure.js); engineering/decisions/2026-10-11-codebase-structure.md.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyze, partOf, isSeam, structureProblems, SANCTIONED_PLUGIN_REACH, SANCTIONED_PLUGIN_ENTRY } = require('../../../tools/structure.js');

// Synthetic graphs carry none of the live tree's sanctions, so a run starts with an empty list.
const run = (g, opts = {}) => analyze(g, { pluginSanctioned: {}, entrySanctioned: {}, requires: new Map(), hostApi: new Map(), ...opts });

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
  const r = run(graph([
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
  const r = run(graph([
    ['lib/core/a.js', ['lib/engine/index.js']],
    ['lib/engine/index.js', []],
  ]));
  assert.equal(r.upward.length, 1);
  assert.match(r.upward[0], /lib\/core\/a\.js \(lib\/core, layer 1\) -> lib\/engine\/index\.js \(lib\/engine, layer 5\)/);
});

test('a loop between two parts on one layer fails, though neither import points up', () => {
  const r = run(graph([
    ['lib/components/x.js', ['lib/forms/y.js']],
    ['lib/forms/y.js', ['lib/components/x.js']],
  ]));
  assert.equal(r.upward.length, 0);
  assert.deepEqual(r.loops.map((l) => l.members), [['lib/components', 'lib/forms']]);
  assert.equal(structureProblems(r).length, 1);
});

test('a seam carries no edge: a lower layer may read a generated table the build writes from above', () => {
  const r = run(graph([
    ['lib/core/coda.js', ['lib/forms/cell/coda/coda-catalog.generated.js']],
    ['lib/forms/cell/coda/coda-catalog.generated.js', ['lib/forms/cell/coda/coda.js']],
    ['lib/forms/cell/coda/coda.js', ['lib/core/coda.js']],
  ]));
  assert.deepEqual(structureProblems(r), []);
});

test('the plugin boundary fails both ways: a plugin past the kit, and code into a plugin', () => {
  const r = run(graph([
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
  assert.deepEqual(run(g, { sanctioned: { 'lib/core -> lib/engine': 'reason' } }).upward, []);
  const stale = run(graph([['lib/core/a.js', []]]), { sanctioned: { 'lib/core -> lib/engine': 'reason' } });
  assert.deepEqual(stale.staleSanctions, ['lib/core -> lib/engine']);
  assert.equal(structureProblems(stale).length, 1);
});

test('a file in no part is a problem, so a new folder cannot slip past the map', () => {
  const r = run(graph([['lib/brand-new/x.js', []]]));
  assert.deepEqual(r.unmapped, ['lib/brand-new/x.js']);
  assert.match(structureProblems(r)[0], /belongs to no part/);
});

test('a file NAMED generated is not a seam: no generator writes it, so it bypasses nothing', () => {
  // The bypass the red team built: route an upward import, and a loop, through a shim.
  assert.equal(isSeam('lib/core/shim.generated.js'), false);
  const r = run(graph([
    ['lib/core/a.js', ['lib/core/shim.generated.js']],
    ['lib/core/shim.generated.js', ['lib/engine/index.js']],
    ['lib/engine/index.js', ['lib/core/a.js']],
  ]));
  assert.equal(r.upward.length, 1);
});

test('a generated JSON file is a seam (pure data), and a real generated module names its generator', () => {
  assert.equal(isSeam('lib/plugins/extension-points.generated.json'), true);
  assert.equal(isSeam('lib/plugins/dispatch.generated.js'), true);
  // Named through a folder constant: `path.join(PLUGINS_DIR, 'bake.generated.js')`.
  assert.equal(isSeam('lib/plugins/bake.generated.js'), true);
  // Named as `path.join(ROOT, 'lib', 'packages', 'chrome.generated.js')`.
  assert.equal(isSeam('lib/packages/chrome.generated.js'), true);
});

test('a seam is proved by its whole path: a borrowed base name, or a substring of one, is not a seam (#2997)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../../..');
  const planted = {
    // The plugin registry's tool writes lib/plugins/dispatch.generated.js, not this one.
    'lib/core/rt-borrow/dispatch.generated.js': '// tools/build-plugin-registry.js\n',
    // `registry.generated.js` is a substring of `chart-registry.generated.js`.
    'lib/core/rt-borrow/registry.generated.js': '// tools/build-chart-registry.js\n',
  };
  try {
    for (const [f, src] of Object.entries(planted)) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), src);
      assert.equal(isSeam(f), false, f);
    }
  } finally {
    fs.rmSync(path.join(root, 'lib/core/rt-borrow'), { recursive: true, force: true });
  }
});

test('a seam inside a plugin folder does not exempt the plugin: its reach needs a sanction', () => {
  const g = graph([
    ['lib/plugins/math/shared/table.generated.js', ['lib/components/x.js']],
    ['lib/components/x.js', []],
  ]);
  assert.equal(run(g, { pluginSanctioned: {} }).pluginOut.length, 1);
  const one = { 'lib/plugins/math -> lib/components': { imports: 1, why: 'reason' } };
  assert.deepEqual(run(g, { pluginSanctioned: one }).pluginOut, []);
  assert.deepEqual(structureProblems(run(g, { pluginSanctioned: one })), []);
  const stale = run(graph([['lib/core/a.js', []]]), { pluginSanctioned: one });
  assert.match(structureProblems(stale)[0], /stale .*SANCTIONED_PLUGIN_REACH/);
});

test('a sanction admits an exact count of imports: more fail as growth, fewer fail until the count is lowered', () => {
  const g = graph([
    ['lib/plugins/math/a.js', ['lib/core/x.js', 'lib/core/y.js']],
    ['lib/core/x.js', []],
    ['lib/core/y.js', []],
  ]);
  const at = (n) => structureProblems(run(g, { pluginSanctioned: { 'lib/plugins/math -> lib/core': { imports: n, why: 'reason' } } }));
  assert.deepEqual(at(2), []);
  assert.match(at(1).join('\n'), /sanctioned debt grew: lib\/plugins\/math -> lib\/core has 2 imports, over the 1 SANCTIONED_PLUGIN_REACH admits/);
  assert.match(at(3).join('\n'), /sanctioned debt shrank: .* lower its `imports` in SANCTIONED_PLUGIN_REACH .* from 3 to 2/);
  const entry = graph([
    ['lib/transformers/t.js', ['lib/plugins/math/m.js']],
    ['lib/plugins/math/m.js', []],
  ]);
  const inAt = (n) => structureProblems(run(entry, { entrySanctioned: { 'lib/transformers -> lib/plugins/math': { imports: n, why: 'reason' } } }));
  assert.deepEqual(inAt(1), []);
  assert.match(inAt(2).join('\n'), /sanctioned debt shrank: .* SANCTIONED_PLUGIN_ENTRY .* from 2 to 1/);
});

test('every committed sanction names the follow-up that removes it, with a positive count', () => {
  for (const list of [SANCTIONED_PLUGIN_REACH, SANCTIONED_PLUGIN_ENTRY]) {
    for (const [key, v] of Object.entries(list)) {
      assert.ok(Number.isInteger(v.imports) && v.imports > 0, `${key}: imports must be a positive count`);
      assert.match(v.why, /followups\.d\/[\w-]+\.md/, `${key}: name the follow-up that removes it`);
      assert.ok(fs.existsSync(path.join(__dirname, '../../..', v.why.match(/followups\.d\/[\w-]+\.md/)[0])), `${key}: the follow-up exists`);
    }
  }
});

test('a file dependency-cruiser could not read is a problem, not a pass', () => {
  const g = graph([['lib/core/a.js', []]]);
  g.unread = ['lib/core/a.js'];
  assert.match(structureProblems(run(g)).join('\n'), /read no imports from a file that has some/);
});

test('a new folder under docs/src belongs to no part until it is placed on a layer', () => {
  assert.equal(partOf('docs/src/brand-new/x.ts'), null);
  assert.equal(partOf('docs/src/pages/index.astro').name, 'site/pages');
  assert.equal(partOf('lib/plugins/math/math.schema.json').name, 'lib/plugins/math');
});

test('an import that resolves to no file is a problem: a module moved and its importer did not', () => {
  const g = { modules: [{ source: 'lib/plugins/math/x.js', dependencies: [{ module: '../plugin-data.js', resolved: '../plugin-data.js', couldNotResolve: true }] }] };
  assert.match(structureProblems(run(g)).join('\n'), /resolves to no file .*x\.js -> \.\.\/plugin-data\.js/);
  // A path into node_modules is a dependency question (a CI job may skip that install), not this rule's.
  const dep = { modules: [{ source: 'tools/v.mjs', dependencies: [{ module: '../docs/node_modules/x/index.mjs', resolved: '', couldNotResolve: true }] }] };
  assert.deepEqual(run(dep).unresolved, []);
});

test('a plugin may import a workspace library, as it would any package; core-only code is still past the kit', () => {
  const r = run(graph([
    ['lib/plugins/pills/pills.inline.js', ['docs/src/lib/segno/read.ts', 'lib/core/segno-spec.js']],
    ['docs/src/lib/segno/read.ts', []],
    ['lib/core/segno-spec.js', []],
  ]), { requires: new Map() });
  assert.equal(partOf('docs/src/lib/segno/read.ts').library, true);
  assert.deepEqual(r.pluginOut.map((e) => e.split(' ')[0]), ['lib/plugins/pills/pills.inline.js']);
  assert.match(r.pluginOut[0], /lib\/core\/segno-spec\.js/);
});

test('a plugin may import a plugin its manifest requires, and no other', () => {
  const g = graph([
    ['lib/plugins/checks/checks.inline.js', ['lib/plugins/pills/pills.inline.js']],
    ['lib/plugins/video/video.inline.js', ['lib/plugins/pills/pills.inline.js']],
    ['lib/plugins/pills/pills.inline.js', []],
  ]);
  const r = run(g, { requires: new Map([['lib/plugins/checks', new Set(['lib/plugins/pills'])]]) });
  assert.equal(r.pluginOut.length, 1);
  assert.match(r.pluginOut[0], /^lib\/plugins\/video\/video\.inline\.js/);
  assert.equal(r.pluginIn.length, 1);
  assert.match(r.pluginIn[0], /^lib\/plugins\/video\/video\.inline\.js/);
});

test('the live manifests: checks requires pills, and the reader maps names to parts', () => {
  const { pluginRequires } = require('../../../tools/structure.js');
  assert.ok(pluginRequires().get('lib/plugins/checks').has('lib/plugins/pills'));
});

test('hostApi: a host tool above the plugins may import a listed file; an unlisted file, or code below, may not', () => {
  const hostApi = new Map([['lib/plugins/pills', new Set(['lib/plugins/pills/pills.inline.js'])]]);
  const r = run(graph([
    ['lib/authoring/lint-core.js', ['lib/plugins/pills/pills.inline.js', 'lib/plugins/pills/shared/x.js']],
    ['lib/core/glossary-slide.js', ['lib/plugins/pills/pills.inline.js']],
    ['lib/plugins/pills/pills.inline.js', []],
    ['lib/plugins/pills/shared/x.js', []],
  ]), { hostApi });
  assert.deepEqual(r.pluginIn.sort(), [
    'lib/authoring/lint-core.js -> lib/plugins/pills/shared/x.js',
    'lib/core/glossary-slide.js -> lib/plugins/pills/pills.inline.js',
  ]);
  assert.deepEqual(r.staleHostApi, []);
});

test('hostApi is for host tools: the engine, one layer above the plugins, may not use it (#2997)', () => {
  const hostApi = new Map([['lib/plugins/pills', new Set(['lib/plugins/pills/pills.inline.js'])]]);
  const r = run(graph([
    ['lib/engine/index.js', ['lib/plugins/pills/pills.inline.js']],
    ['lib/plugins/pills/pills.inline.js', []],
  ]), { hostApi });
  assert.deepEqual(r.pluginIn, ['lib/engine/index.js -> lib/plugins/pills/pills.inline.js']);
});

test('hostApi only shrinks: more files than the ceiling fail, and fewer ask for the ceiling to come down', () => {
  const hostApi = new Map([['lib/plugins/pills', new Set(['lib/plugins/pills/a.js', 'lib/plugins/pills/b.js'])]]);
  const g = graph([
    ['lib/authoring/lint-core.js', ['lib/plugins/pills/a.js', 'lib/plugins/pills/b.js']],
    ['lib/plugins/pills/a.js', []],
    ['lib/plugins/pills/b.js', []],
  ]);
  assert.deepEqual(structureProblems(run(g, { hostApi, hostApiCeiling: 2 })), []);
  assert.match(structureProblems(run(g, { hostApi, hostApiCeiling: 1 })).join('\n'), /hostApi grew: .* 2 files, over HOST_API_CEILING \(1\)/);
  assert.match(structureProblems(run(g, { hostApi, hostApiCeiling: 3 })).join('\n'), /lower HOST_API_CEILING .* from 3 to 2/);
});

test('the live manifests: the hostApi ceiling matches the lists', () => {
  const { pluginManifests, HOST_API_CEILING } = require('../../../tools/structure.js');
  const count = [...pluginManifests().hostApi.values()].reduce((n, set) => n + set.size, 0);
  assert.equal(count, HOST_API_CEILING);
});

test('an import into an excluded tree (tests, examples) is a problem below tools/, which may use test helpers (#2997)', () => {
  const g = graph([['lib/core/a.js', []]]);
  g.excludedImports = ['lib/core/a.js -> test/helpers/x.js'];
  assert.match(structureProblems(run(g)).join('\n'), /imports a file the gate does not read \(.*\): lib\/core\/a\.js -> test\/helpers\/x\.js/);
});

test('importing the repository by its own package name is a problem: Node resolves it, the graph does not (#2997)', () => {
  const g = { modules: [{ source: 'lib/core/a.js', dependencies: [{ module: '@laticent/lattice', resolved: '@laticent/lattice', couldNotResolve: true }] }] };
  assert.match(structureProblems(run(g)).join('\n'), /by its package name.*lib\/core\/a\.js -> @laticent\/lattice/);
  const sub = { modules: [{ source: 'lib/core/a.js', dependencies: [{ module: '@laticent/lattice/runtime', resolved: '', couldNotResolve: true }] }] };
  assert.equal(run(sub).selfImports.length, 1);
});

test('lib/core may not grow a single-consumer file past its ceiling; fewer pass', () => {
  // lib/core needs 50+ files to be measured: 50 used inside core, plus one file only the engine uses.
  const pairs = [['lib/core/hub.js', Array.from({ length: 50 }, (_, i) => `lib/core/f${i}.js`)]];
  for (let i = 0; i < 50; i++) pairs.push([`lib/core/f${i}.js`, []]);
  pairs.push(['lib/core/single.js', []], ['lib/engine/index.js', ['lib/core/single.js']]);
  const g = graph(pairs);
  assert.equal(run(g).coreSingleConsumer, 1);
  assert.deepEqual(structureProblems(run(g, { coreSingleConsumerCeiling: 1 })), []);
  assert.deepEqual(structureProblems(run(g, { coreSingleConsumerCeiling: 5 })), []);
  assert.match(structureProblems(run(g, { coreSingleConsumerCeiling: 0 })).join('\n'), /lib\/core grew a single-consumer file: 1 files .* CORE_SINGLE_CONSUMER_CEILING \(0\)/);
});

test('hostApi only shrinks: an entry nothing outside imports is stale', () => {
  const hostApi = new Map([['lib/plugins/pills', new Set(['lib/plugins/pills/pills.inline.js'])]]);
  const r = run(graph([['lib/plugins/pills/pills.inline.js', []]]), { hostApi });
  assert.deepEqual(r.staleHostApi, ['lib/plugins/pills/pills.inline.js']);
  assert.ok(structureProblems(r).some((p) => /stale hostApi entry/.test(p)));
});

test('the live manifests: every hostApi entry is a file in its plugin folder', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { pluginManifests } = require('../../../tools/structure.js');
  for (const files of pluginManifests().hostApi.values()) for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '../../..', f)), `${f} is listed in hostApi but does not exist`);
});
