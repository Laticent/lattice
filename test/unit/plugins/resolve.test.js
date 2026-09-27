/**
 * The plugin resolver (lib/plugins/resolve.js) and the host's install order
 * (lib/plugins/host-grammar.mjs), proven on SYNTHETIC plugins.
 *
 * The in-tree set has no dependency edge yet — math and function-plot are independent, and the
 * first real `requires` edges are the chart kernels on the family — so the failure arms are
 * proven here, where fixtures are exactly the right tool: each test builds the smallest plugin
 * set that must fail one way and checks the build names the plugin that caused it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const { resolvePlugins, HOST_ANCHORS, TEXT_TERMINATORS } = require('../../../lib/plugins/resolve');

let host;
const grammarHost = () => (host ??= require('../../../lib/plugins/host-grammar.mjs'));

/** A minimal valid plugin: one inline rule on `trigger`, modules exporting exactly it. */
function plugin(name, { requires, optional, token = `${name}_tok`, trigger = '@', kind = 'inline', anchor, diagnostics, exports } = {}) {
  const syntax = { [token]: { kind, anchor: anchor || (kind === 'inline' ? { after: 'escape' } : { before: 'fence' }), triggers: [trigger] } };
  return {
    folder: name,
    manifest: {
      type: 'plugin', format: 1, name, api: 1, title: name, description: name,
      ...(requires ? { requires } : {}), ...(optional ? { optional } : {}),
      contributes: { syntax, ...(diagnostics ? { diagnostics } : {}) },
    },
    exports: exports || { rules: [token], renderers: [token], detect: true },
  };
}

const expectError = (plugins, pattern, context) => {
  const { errors, order } = resolvePlugins(plugins, context);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
  assert.deepEqual(order, [], 'a failed resolve must return no order');
};

describe('resolvePlugins — dependencies', () => {
  test('order is dependencies first, ties broken by name, optional counted when present', () => {
    const { errors, order } = resolvePlugins([
      plugin('zeta', { trigger: '%' }),
      plugin('beta', { requires: ['zeta'], trigger: '&' }),
      plugin('alpha', { optional: ['beta', 'absent'], trigger: '~' }),
    ]);
    assert.deepEqual(errors, []);
    assert.deepEqual(order, ['zeta', 'beta', 'alpha']);
  });
  test('a missing requirement fails by name; a missing optional one does not', () => {
    expectError([plugin('a', { requires: ['ghost'] })], /"a" requires "ghost", which is not installed/);
    assert.deepEqual(resolvePlugins([plugin('a', { optional: ['ghost'] })]).errors, []);
  });
  test('a cycle fails and names the path', () => {
    expectError([
      plugin('a', { requires: ['b'], trigger: '%' }),
      plugin('b', { optional: ['c'], trigger: '&' }),
      plugin('c', { requires: ['a'], trigger: '~' }),
    ], /cycle among: a → b → c → a/);
  });
  test('self-dependency and required-and-optional both fail', () => {
    expectError([plugin('a', { optional: ['a'] })], /"a" depends on itself/);
    expectError([plugin('a', { trigger: '%' }), plugin('b', { requires: ['a'], optional: ['a'] })], /both required and optional/);
  });
  test('a duplicate name, a folder that disagrees, an unknown api', () => {
    expectError([plugin('a'), plugin('a')], /"a" is declared twice/);
    expectError([{ ...plugin('a'), folder: 'b' }], /lives in folder "b"/);
    const future = plugin('a');
    future.manifest.api = 2;
    expectError([future], /host api 2/);
  });
});

describe('resolvePlugins — the manifest and the modules agree one-to-one', () => {
  test('a declared token with no rule, or no renderer, fails', () => {
    expectError([plugin('a', { exports: { rules: [], renderers: ['a_tok'], detect: true } })], /declares syntax "a_tok" but its syntax rule exports none/);
    expectError([plugin('a', { exports: { rules: ['a_tok'], renderers: [], detect: true } })], /declares syntax "a_tok" but its renderer exports none/);
  });
  test('an exported rule the manifest does not declare fails', () => {
    expectError([plugin('a', { exports: { rules: ['a_tok', 'stray'], renderers: ['a_tok'], detect: true } })], /exports syntax rule "stray" that its manifest does not declare/);
  });
  test('syntax with no detect() fails', () => {
    expectError([plugin('a', { exports: { rules: ['a_tok'], renderers: ['a_tok'], detect: false } })], /exports no detect/);
  });
});

describe('resolvePlugins — syntax claims', () => {
  test('an anchor must be a host rule, never another plugin\'s', () => {
    expectError([plugin('a', { anchor: { after: 'b_tok' } }), plugin('b', { trigger: '%' })], /anchors syntax "a_tok" after "b_tok", which is not a host inline rule/);
  });
  test('two plugins on one trigger in one ruler fail, naming both', () => {
    expectError([plugin('a', { trigger: '@' }), plugin('b', { trigger: '@' })], /"a" and "b" both claim the inline trigger "@"/);
  });
  test('one trigger in DIFFERENT rulers is fine', () => {
    const { errors } = resolvePlugins([plugin('a', { trigger: '@' }), plugin('b', { trigger: '@', kind: 'block' })]);
    assert.deepEqual(errors, []);
  });
  test('two plugins emitting one token type fail', () => {
    expectError([plugin('a', { token: 'shared', trigger: '%' }), plugin('b', { token: 'shared', trigger: '&' })], /both emit token "shared"/);
  });
  test('an inline trigger the text rule swallows is refused', () => {
    expectError([plugin('a', { trigger: 'x' })], /on "x", which markdown-it's text rule consumes/);
  });
  test('only a block may be opaque', () => {
    const p = plugin('a');
    p.manifest.contributes.syntax.a_tok.opaque = true;
    expectError([p], /marks inline syntax "a_tok" opaque/);
  });
});

describe('resolvePlugins — components that depend on plugins, and diagnostics', () => {
  test('a component\'s required plugin must exist', () => {
    // The dependency points from the component to the plugin.
    expectError([plugin('a')], /component "slide" requires plugin "ghost", which is not installed/, { components: [{ name: 'slide', requires: ['ghost'] }] });
    assert.deepEqual(resolvePlugins([plugin('a')], { components: [{ name: 'slide', requires: ['a'], uses: ['a'] }] }).errors, []);
  });
  test('a component whose gallery uses a plugin must declare it — required or optional', () => {
    expectError([plugin('a')], /component "slide"'s gallery uses the "a" plugin, but its manifest does not declare it/, { components: [{ name: 'slide', uses: ['a'] }] });
    assert.deepEqual(resolvePlugins([plugin('a')], { components: [{ name: 'slide', optional: ['a'], uses: ['a'] }] }).errors, []);
    // An optional dependency on a plugin that is not installed is allowed, as between plugins.
    assert.deepEqual(resolvePlugins([plugin('a')], { components: [{ name: 'slide', optional: ['ghost'] }] }).errors, []);
  });
  test('diagnostics are namespaced to their plugin', () => {
    expectError([plugin('a', { diagnostics: { 'b/oops': 'x' } })], /outside its own namespace "a\/"/);
  });
});

describe('host constants match the installed markdown-it', () => {
  test('HOST_ANCHORS are exactly markdown-it\'s own rule names', () => {
    const md = new MarkdownIt('commonmark');
    assert.deepEqual([...HOST_ANCHORS.inline], md.inline.ruler.__rules__.map((r) => r.name));
    assert.deepEqual([...HOST_ANCHORS.block], md.block.ruler.__rules__.map((r) => r.name));
  });
  test('TEXT_TERMINATORS are exactly the characters the text rule stops at', () => {
    const md = new MarkdownIt('commonmark');
    const stops = [];
    for (let c = 1; c < 128; c++) {
      const ch = String.fromCharCode(c);
      const state = new md.inline.State(`a${ch}b`, md, {}, []);
      state.pos = 0;
      md.inline.ruler.getRules('')[0](state, false); // the `text` rule
      if (state.pos === 1) stops.push(ch);
    }
    assert.deepEqual(stops.sort(), [...TEXT_TERMINATORS].sort());
  });
});

describe('host-grammar — install order and disabling', () => {
  // Grammar entries in the generated shape: dependency order, each rule's `run` a real rule.
  const rule = (name) => (state, silent) => {
    if (state.src[state.pos] !== '%') return false;
    if (!silent) state.push(name, '', 0);
    state.pos += 1;
    return true;
  };
  const entry = (name, requires = []) => ({
    name, requires, optional: [], degradesTo: 'source', diagnostics: {}, detect: () => true,
    syntax: { [`${name}_tok`]: { kind: 'inline', anchor: { after: 'escape' }, triggers: ['%'], opaque: false, run: rule(name) } },
  });

  test('rules anchored AFTER one host rule run in dependency order (markdown-it reverses same-anchor inserts)', () => {
    const md = new MarkdownIt('commonmark');
    grammarHost().installGrammar(md, { grammar: [entry('base'), entry('dependent', ['base'])] });
    const names = md.inline.ruler.__rules__.map((r) => r.name);
    assert.deepEqual(names.slice(names.indexOf('escape'), names.indexOf('escape') + 3), ['escape', 'base_tok', 'dependent_tok']);
    // …so the dependency's rule is the one that claims the input.
    const tokens = md.parseInline('%', {})[0].children;
    assert.equal(tokens[0].type, 'base');
  });
  test('rules anchored BEFORE one host rule keep dependency order', () => {
    const md = new MarkdownIt('commonmark');
    const before = (name, requires) => {
      const e = entry(name, requires);
      e.syntax[`${name}_tok`] = { ...e.syntax[`${name}_tok`], kind: 'block', anchor: { before: 'fence' } };
      return e;
    };
    grammarHost().installGrammar(md, { grammar: [before('base'), before('dependent', ['base'])], kinds: ['block'] });
    const names = md.block.ruler.__rules__.map((r) => r.name);
    assert.deepEqual(names.slice(names.indexOf('base_tok'), names.indexOf('fence') + 1), ['base_tok', 'dependent_tok', 'fence']);
  });
  test('disabling a plugin disables what requires it, transitively; optional users keep running', () => {
    const grammar = [entry('a'), entry('b', ['a']), entry('c', ['b']), { ...entry('d'), optional: ['a'] }];
    assert.deepEqual(grammarHost().activePlugins(['a'], grammar).map((p) => p.name), ['d']);
    assert.deepEqual(grammarHost().activePlugins([], grammar).map((p) => p.name), ['a', 'b', 'c', 'd']);
  });
});

describe('the boundary parser\'s generated block installer agrees with the host', () => {
  // blocks.generated.mjs is a straight-line copy of the host's block install order, written by
  // the build so the Studio's startup bundle carries no generic host. If the two ever disagree,
  // the render and the source-side slide splitter disagree about where a slide starts.
  test('same rules, same order, same functions, same opaque set', async () => {
    const blocks = await import('../../../lib/plugins/blocks.generated.mjs');
    const viaHost = new MarkdownIt('commonmark');
    grammarHost().installGrammar(viaHost, { kinds: ['block'] });
    const viaGenerated = new MarkdownIt('commonmark');
    blocks.installPluginBlocks(viaGenerated);
    const rules = (md) => md.block.ruler.__rules__.map((r) => [r.name, r.fn]);
    assert.deepEqual(rules(viaGenerated), rules(viaHost));
    const { PLUGIN_GRAMMAR } = await import('../../../lib/plugins/grammar.generated.mjs');
    const opaque = PLUGIN_GRAMMAR.flatMap((p) => Object.entries(p.syntax).filter(([, r]) => r.kind === 'block' && r.opaque).map(([t]) => t));
    assert.deepEqual([...blocks.OPAQUE_BLOCK_TOKENS], opaque);
  });
});
