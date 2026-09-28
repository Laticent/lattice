/**
 * Plugin-system phase D: a fence rendered `as: "code"`, the `bake` contribution, a plugin the
 * runtime draws — each resolver arm proven on the smallest synthetic plugin that must fail one
 * way — and the Node host that runs the bakes (lib/plugins/host-bake.js), on synthetic bakers and
 * on the real registry.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { resolvePlugins } = require('../../../lib/plugins/resolve');
const { installPlugins, PLUGINS } = require('../../../lib/plugins/host');
const { bakeDeck } = require('../../../lib/plugins/host-bake');
const { BAKERS } = require('../../../lib/plugins/bake.generated.js');

/** A Mermaid-shaped plugin: a code fence, a bake, drawn by the runtime. `patch` edits the manifest. */
function bakingPlugin(name, { patch = (m) => m, exports = {} } = {}) {
  const manifest = patch({
    type: 'plugin', format: 1, name, api: 1, title: name, description: name,
    contributes: { fences: { [`${name}fence`]: { body: 'text', as: 'code' } }, bake: true },
    render: { exec: { hydrate: 'runtime', bake: 'subprocess' }, parity: 'progressive', degradesTo: 'code-block' },
  });
  return { folder: name, manifest, exports: { fences: [], hasBake: true, ...exports } };
}

const errorsOf = (plugins) => resolvePlugins(plugins).errors;
const expectError = (plugins, pattern) => {
  const errors = errorsOf(plugins);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
};

describe('resolvePlugins — code fences, bake, runtime-drawn', () => {
  test('a Mermaid-shaped plugin resolves', () => {
    assert.deepEqual(errorsOf([bakingPlugin('a')]), []);
  });
  test('a code fence has no renderer and takes no aliases', () => {
    expectError([bakingPlugin('a', { exports: { fences: ['afence'] } })], /exports a renderer for fence "afence", which its manifest renders as code/);
    expectError([bakingPlugin('a', { patch: (m) => { m.contributes.fences.afence.aliases = [{ name: 'b' }]; return m; } })], /gives code fence "afence" aliases/);
  });
  test('a code fence is still claimed: a second plugin cannot take its name', () => {
    const other = bakingPlugin('b', { patch: (m) => { m.contributes.fences = { afence: { body: 'text', as: 'code' } }; return m; } });
    expectError([bakingPlugin('a'), other], /plugins "a" and "b" both claim fence "afence"/);
  });
  test('bake ⇔ a bake module, and it says where it runs', () => {
    expectError([bakingPlugin('a', { exports: { hasBake: false } })], /declares bake but has no a\.bake\.js/);
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.bake; m.render.exec = { bake: 'subprocess' }; return m; } })], /ships a\.bake\.js but its manifest declares no bake/);
    expectError([bakingPlugin('a', { patch: (m) => { m.render.exec = { hydrate: 'runtime' }; return m; } })], /declares bake but not where it runs/);
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.bake; m.render.exec = { bake: 'subprocess' }; return m; }, exports: { hasBake: false } })], /says where its bake runs but declares no bake/);
  });
  test('a plugin the runtime draws must bake, and ships no hydrate module', () => {
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.bake; m.render.exec = { hydrate: 'runtime' }; return m; }, exports: { hasBake: false } })], /drawn by the runtime but declares no bake/);
    expectError([bakingPlugin('a', { patch: (m) => { m.contributes.hydrate = {}; return m; }, exports: { hasHydrate: true } })], /drawn by the runtime .* also declares a hydrate module/);
  });
});

describe('the host fence table leaves a code fence to the code renderer', () => {
  test('```mermaid reaches the renderer installed before the table, and the plugin is installed', () => {
    const md = new MarkdownIt('commonmark');
    md.renderer.rules.fence = (tokens, idx) => `PREVIOUS:${tokens[idx].info}`;
    const installed = installPlugins(md);
    assert.ok(installed.includes('mermaid'));
    assert.equal(md.render('```mermaid\nflowchart LR\n```\n'), 'PREVIOUS:mermaid');
  });
  test('the registry records the fence as code, drawn by the runtime, with no renderer', () => {
    const mermaid = PLUGINS.find((p) => p.name === 'mermaid');
    assert.equal(mermaid.fences.mermaid.as, 'code');
    assert.equal(mermaid.runtimeDrawn, true);
    assert.equal(mermaid.hydrate, false);
    assert.equal(mermaid.fenceRenderers.mermaid, undefined);
  });
});

describe('bakeDeck — the Node host', () => {
  const grammar = [
    { name: 'first', requires: [], optional: [], fences: { one: { aliases: [] } }, detect: null },
    { name: 'second', requires: ['first'], optional: [], fences: { two: { aliases: [] } }, detect: null },
  ];
  const baker = (name, bake) => ({ name, load: () => ({ bake }) });
  const quiet = { warn: () => {} };

  test('runs only for a deck that uses the plugin, in registry order, each on the last one\'s output', () => {
    const seen = [];
    const bakers = [
      baker('first', (src, ctx) => { seen.push(ctx.name); return `${src}[first]`; }),
      baker('second', (src, ctx) => { seen.push(ctx.name); return `${src}[second]`; }),
    ];
    assert.equal(bakeDeck('plain prose\n', {}, { bakers, grammar, ...quiet }).source, 'plain prose\n');
    assert.deepEqual(seen, []);
    const out = bakeDeck('```one\nx\n```\n```two\ny\n```\n', {}, { bakers, grammar, ...quiet });
    assert.equal(out.source, '```one\nx\n```\n```two\ny\n```\n[first][second]');
    assert.deepEqual(seen, ['first', 'second']);
  });
  test('a disabled plugin does not bake, and neither does one that requires it', () => {
    const ran = [];
    const bakers = [baker('first', (s) => { ran.push('first'); return s; }), baker('second', (s) => { ran.push('second'); return s; })];
    bakeDeck('```one\n```\n```two\n```\n', {}, { bakers, grammar, disabled: ['first'], ...quiet });
    assert.deepEqual(ran, []);
  });
  test('ctx carries the services, the name and a fresh state the caller reads back; it is frozen', () => {
    const bakers = [baker('first', (s, ctx) => { ctx.state.count = 3; assert.ok(Object.isFrozen(ctx)); return s; })];
    const { contexts } = bakeDeck('```one\n```\n', { pkgRoot: '/root' }, { bakers, grammar, ...quiet });
    assert.equal(contexts.get('first').pkgRoot, '/root');
    assert.equal(contexts.get('first').name, 'first');
    assert.equal(contexts.get('first').state.count, 3);
  });
  test('fail-soft: a bake that throws or returns no text leaves the source, warns naming the plugin, and records no context', () => {
    const warnings = [];
    const warn = (m) => warnings.push(m);
    const src = '```one\n```\n';
    let r = bakeDeck(src, {}, { bakers: [baker('first', () => { throw new Error('boom\nstack'); })], grammar, warn });
    assert.equal(r.source, src);
    assert.equal(r.contexts.size, 0);
    assert.match(warnings[0], /plugin "first": its bake failed \(boom\)/);
    r = bakeDeck(src, {}, { bakers: [baker('first', () => undefined)], grammar, warn });
    assert.equal(r.source, src);
    assert.match(warnings[1], /plugin "first": its bake returned no text/);
  });
  test('the real registry bakes Mermaid, lazily, and skips a deck with no diagram without loading it', () => {
    assert.deepEqual(BAKERS.map((b) => [b.name, b.exec]), [['mermaid', 'subprocess']]);
    let loaded = false;
    const bakers = BAKERS.map((b) => ({ ...b, load: () => { loaded = true; return b.load(); } }));
    const { source, contexts } = bakeDeck('# No diagram\n\n```js\nx\n```\n', {}, { bakers });
    assert.equal(source, '# No diagram\n\n```js\nx\n```\n');
    assert.equal(contexts.size, 0);
    assert.equal(loaded, false);
  });
});
