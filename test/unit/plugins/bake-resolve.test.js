/**
 * Plugin-system phase D: a fence rendered `as: "code"`, the `bake` contribution, a plugin whose
 * browser half is a document pass (`render.exec.hydrate: "pass"`) — each resolver arm proven on the smallest synthetic plugin that must fail one
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

/** A Mermaid-shaped plugin: a code fence, a bake, a browser pass. `patch` edits the manifest. */
function bakingPlugin(name, { patch = (m) => m, exports = {} } = {}) {
  const manifest = patch({
    type: 'plugin', format: 1, name, api: 1, title: name, description: name,
    contributes: { fences: { [`${name}fence`]: { body: 'text', as: 'code' } }, hydrate: {}, bake: true },
    render: { exec: { hydrate: 'pass', bake: 'subprocess' }, parity: 'progressive', degradesTo: 'code-block' },
  });
  return { folder: name, manifest, exports: { fences: [], hasBake: true, hasPass: true, ...exports } };
}

const errorsOf = (plugins) => resolvePlugins(plugins).errors;
const expectError = (plugins, pattern) => {
  const errors = errorsOf(plugins);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
};

describe('resolvePlugins — code fences, bake, a hydrate pass', () => {
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
    expectError([bakingPlugin('a', { patch: (m) => { m.render.exec = { hydrate: 'pass' }; return m; } })], /declares bake but not where it runs/);
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.bake; m.render.exec = { bake: 'subprocess' }; return m; }, exports: { hasBake: false } })], /says where its bake runs but declares no bake/);
  });
  test('a hydrate pass must bake, and its module exports createPass — never hydrate', () => {
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.bake; m.render.exec = { hydrate: 'pass' }; return m; }, exports: { hasBake: false } })], /drawn by a runtime pass but declares no bake/);
    expectError([bakingPlugin('a', { exports: { hasPass: false } })], /declares a hydrate pass but has no a\.hydrate\.js exporting createPass/);
    expectError([bakingPlugin('a', { exports: { hasHydrate: true } })], /exports hydrate\(el, ctx\), but its manifest says its hydrate is a pass/);
    expectError([bakingPlugin('a', { patch: (m) => { delete m.contributes.hydrate; return m; } })], /says its hydrate is a pass \(render\.exec\.hydrate "pass"\) but declares no hydrate/);
    expectError([bakingPlugin('a', { patch: (m) => { m.render.exec = { hydrate: 'browser', bake: 'subprocess' }; return m; } })], /exports createPass\(ctx\), but its manifest does not say its hydrate is a pass/);
  });
  test('highlight ⇔ a highlight module, and a code fence to register it under', () => {
    assert.deepEqual(errorsOf([bakingPlugin('a', { patch: (m) => { m.contributes.highlight = true; return m; }, exports: { hasHighlight: true } })]), []);
    expectError([bakingPlugin('a', { patch: (m) => { m.contributes.highlight = true; return m; } })], /declares highlight but has no a\.highlight\.js/);
    expectError([bakingPlugin('a', { exports: { hasHighlight: true } })], /ships a\.highlight\.js but its manifest declares no highlight/);
    expectError([bakingPlugin('a', { patch: (m) => { m.contributes.highlight = true; m.contributes.fences.afence = { body: 'text' }; return m; }, exports: { hasHighlight: true, fences: ['afence'] } })], /declares highlight but no fence rendered as code/);
  });
  test('the host registers a plugin grammar under its code fence, even with the plugin switched off', () => {
    const hljs = require('highlight.js');
    for (const disabled of [[], ['mermaid']]) {
      const md = new MarkdownIt('commonmark');
      md.highlightjs = hljs.newInstance();
      installPlugins(md, { disabled });
      assert.ok(md.highlightjs.getLanguage('mermaid'), `the mermaid grammar is registered (disabled: ${JSON.stringify(disabled)})`);
      assert.match(md.highlightjs.highlight('flowchart LR\n  A --> B', { language: 'mermaid' }).value, /hljs-keyword/);
    }
  });
  test('a pass may require: it is bundled, never serialized', () => {
    assert.deepEqual(errorsOf([bakingPlugin('a', { exports: { hydrateSource: "const k = require('../../core/x');\nfunction createPass() {}\nmodule.exports = { createPass };" } })]), []);
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
  test('the registry records the fence as code, drawn by a hydrate pass, with no renderer', () => {
    const mermaid = PLUGINS.find((p) => p.name === 'mermaid');
    assert.equal(mermaid.fences.mermaid.as, 'code');
    assert.equal(mermaid.runtimeDrawn, true);
    assert.equal(mermaid.hydrate, true);
    assert.equal(mermaid.fenceRenderers.mermaid, undefined);
  });
});

describe('the host\'s "uses mermaid" probe is a superset of the fence matcher the bake runs', () => {
  // A probe that misses a fence the matcher finds skips the deck's bake, and the export prints the
  // source the preview draws. Found by the HARD RULE #25 red team: a no-break space before the name.
  test('every whitespace isMermaidInfo trims, and every opener shape, is found by both', async () => {
    const { usesPlugin } = await import('../../../lib/plugins/host-grammar.mjs');
    const { matchMermaidFences } = require('../../../lib/core/mermaid-fences');
    const mermaid = PLUGINS.find((p) => p.name === 'mermaid');
    const gaps = [' ', '\t', '\u00a0', '\f', '\v', '\u3000', '\ufeff', '\u2002', '\u2009', '  '];
    const shapes = gaps.flatMap((ws) => [`\`\`\`${ws}mermaid\nflowchart LR\n  A --> B\n\`\`\`\n`, `~~~${ws}mermaid\nflowchart LR\n~~~\n`]);
    shapes.push('```mermaid{x}\nflowchart LR\n```\n', '   ```mermaid\r\nflowchart LR\r\n```\r\n', '- item\n\n  ```mermaid\n  flowchart LR\n  ```\n');
    for (const src of shapes) {
      const found = matchMermaidFences(src).length > 0;
      if (found) assert.equal(usesPlugin(mermaid, src), true, `the probe misses a fence the bake draws: ${JSON.stringify(src)}`);
    }
    assert.ok(shapes.filter((src) => matchMermaidFences(src).length).length >= 20, 'the matcher found the shapes, so the arm checked something');
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
  test('strict (the CLI): a bake that throws or returns no text fails the export, naming the plugin', () => {
    const src = '```one\n```\n';
    assert.throws(() => bakeDeck(src, {}, { bakers: [baker('first', () => { throw new Error('boom'); })], grammar, strict: true }), /plugin "first": its bake failed: boom/);
    assert.throws(() => bakeDeck(src, {}, { bakers: [baker('first', () => 7)], grammar, strict: true }), /plugin "first": its bake returned no text/);
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
