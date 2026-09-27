/**
 * The resolver's phase-B arms (lib/plugins/resolve.js): fences, hydrate, styles and tokens, each
 * proven on the smallest synthetic plugin that must fail one way — and the host's fence table
 * (lib/plugins/host.js) proven on the real engine.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { resolvePlugins } = require('../../../lib/plugins/resolve');
const { installPlugins, fenceName } = require('../../../lib/plugins/host');

/** A fence-only plugin; `exports` overrides what its modules are read to export. */
function fencePlugin(name, { fences = { [`${name}fence`]: { body: 'json' } }, contributes = {}, top = {}, exports = {} } = {}) {
  return {
    folder: name,
    manifest: { type: 'plugin', format: 1, name, api: 1, title: name, description: name, contributes: { fences, ...contributes }, ...top },
    exports: { fences: Object.keys(fences), ...exports },
  };
}

const errorsOf = (plugins, context) => resolvePlugins(plugins, context).errors;
const expectError = (plugins, pattern, context) => {
  const errors = errorsOf(plugins, context);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
};

describe('resolvePlugins — fences', () => {
  test('a valid fence plugin resolves', () => {
    assert.deepEqual(errorsOf([fencePlugin('a')]), []);
  });
  test('a declared fence with no renderer, and a renderer with no declaration, both fail by name', () => {
    expectError([fencePlugin('a', { exports: { fences: [] } })], /"a" declares fence "afence" but its render module/);
    expectError([fencePlugin('a', { exports: { fences: ['afence', 'extra'] } })], /"a" exports a renderer for fence "extra"/);
  });
  test("two plugins claiming one fence name — or one's name as the other's alias — fail naming both", () => {
    expectError([fencePlugin('a', { fences: { plot: { body: 'json' } } }), fencePlugin('b', { fences: { plot: { body: 'json' } } })],
      /plugins "a" and "b" both claim fence "plot"/);
    expectError([
      fencePlugin('a', { fences: { plot: { body: 'json' } } }),
      fencePlugin('b', { fences: { graph2: { body: 'json', aliases: [{ name: 'plot' }] } } }),
    ], /both claim fence "plot"/);
  });
  test('a fence a code language owns is refused', () => {
    expectError([fencePlugin('a', { fences: { json: { body: 'json' } } })], /claims fence "json", which a code language already owns/, { reservedFences: new Set(['json']) });
  });
  test('a deprecated alias needs a diagnostic to report it with', () => {
    expectError([fencePlugin('a', { fences: { plot: { body: 'json', aliases: [{ name: 'oldplot', deprecated: true }] } } })],
      /deprecated fence alias "oldplot" but declares no "a\/deprecated-alias"/);
  });
});

describe('resolvePlugins — hydrate, payload, styles, tokens', () => {
  const withHydrate = (exports, extra = {}) => fencePlugin('a', { contributes: { hydrate: {} }, exports: { hasHydrate: true, hydrateSource: 'function hydrate(el, ctx) {}', ...exports }, ...extra });
  test('declared hydrate ⇔ a hydrate module', () => {
    assert.deepEqual(errorsOf([withHydrate({})]), []);
    expectError([withHydrate({ hasHydrate: false })], /declares hydrate but has no a\.hydrate\.js/);
    expectError([fencePlugin('a', { exports: { hasHydrate: true } })], /ships a\.hydrate\.js but its manifest declares no hydrate/);
  });
  test('a hydrate module that requires or imports is refused — it runs serialized', () => {
    for (const src of ["const x = require('y');\nfunction hydrate() {}", "import x from 'y';\nfunction hydrate() {}", 'async function hydrate() { await import("y"); }']) {
      expectError([withHydrate({ hydrateSource: src })], /requires or imports a module/);
    }
    // A word in a comment is not a require.
    assert.deepEqual(errorsOf([withHydrate({ hydrateSource: '// no require( here\nfunction hydrate() {}' })]), []);
  });
  test('a payload needs a hydrate to use it', () => {
    expectError([fencePlugin('a', { top: { payload: { lib: { from: 'npm:x/x.js', global: 'X', when: 'used' } } } })], /declares a payload but no hydrate/);
  });
  test('the stylesheet\'s var() reads are exactly `tokens`', () => {
    const styled = (css, tokens) => fencePlugin('a', { contributes: { styles: true }, top: { tokens }, exports: { hasStyles: true, stylesSource: css } });
    assert.deepEqual(errorsOf([styled('.x { color: var(--accent); }', ['--accent'])]), []);
    expectError([styled('.x { color: var(--accent); fill: var(--border); }', ['--accent'])], /reads --border, which its manifest's `tokens` does not list/);
    expectError([styled('.x { color: var(--accent); }', ['--accent', '--border'])], /lists token --border, which its stylesheet never reads/);
    expectError([fencePlugin('a', { contributes: { styles: true } })], /declares styles but has no a\.styles\.css/);
  });
});

describe('the host fence table, on the real registry', () => {
  test('a fence name is the info string\'s first word', () => {
    assert.equal(fenceName('  functionplot  {.wide}'), 'functionplot');
    assert.equal(fenceName(undefined), '');
  });
  test('an unclaimed fence reaches the renderer that was installed before the table', () => {
    const md = new MarkdownIt('commonmark');
    md.renderer.rules.fence = () => 'PREVIOUS';
    installPlugins(md);
    assert.equal(md.render('```js\nx\n```\n'), 'PREVIOUS');
    assert.match(md.render('```functionplot\n{}\n```\n'), /data-lattice-hydrate="function-plot"/);
  });
  test('the table is installed once, whatever the number of fence plugins', () => {
    const md = new MarkdownIt('commonmark');
    const before = md.renderer.rules.fence;
    installPlugins(md);
    const after = md.renderer.rules.fence;
    assert.notEqual(after, before);
    // Every plugin fence and alias routes through the one function.
    for (const f of ['functionplot', 'latticeplot', 'anima', 'math']) {
      assert.doesNotMatch(md.render(`\`\`\`${f}\n{}\n\`\`\`\n`), /^<pre><code class="language-/, `${f} fell through`);
    }
  });
});
