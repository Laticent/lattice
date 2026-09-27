/**
 * The plugin conformance harness: runs every in-tree plugin's `<name>.fixtures.md` against the
 * engine, and holds every plugin to the promises the host makes on its behalf
 * (engineering/decisions/2026-09-27-plugin-system.md §4.12).
 *
 * A plugin author writes CASES, never a harness. Each `##` heading in the fixtures file is one
 * case: a ```markdown fence as the input and bullets as assertions — `renders \`x\``,
 * `omits \`x\``, `detect true|false`. On every case the harness also checks, with no bullet
 * needed:
 *
 *   - the render does not throw;
 *   - `detect` is a SUPERSET of the parser: if the plugin's own rules turned the input into
 *     one of its tokens, `detect(input)` is true. It may say true more often (math's pre-scan
 *     over-matches on purpose); it may never miss, because a miss ships unrendered content;
 *   - with the plugin disabled, none of its rules or renderers are installed, and the render
 *     still does not throw.
 *
 * And across the registry: the fixtures file exists and has cases, every syntax token the
 * manifest declares is exercised by at least one case, and the host's fail-soft wrapper turns a
 * throwing or non-string renderer into the declared degradation.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const { createEngine } = require('../../../lib/engine');
const { PLUGINS, failSoft, installPlugins } = require('../../../lib/plugins/host');

const PLUGINS_DIR = path.join(__dirname, '../../../lib/plugins');

/** Parse a fixtures file into cases: `{ title, input, assertions: [{ op, value }] }`. */
function parseFixtures(text) {
  const cases = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const title = block.slice(0, block.indexOf('\n')).trim();
    const fence = block.match(/^```markdown\n([\s\S]*?)^```$/m);
    assert.ok(fence, `fixture case "${title}" has no \`\`\`markdown input fence`);
    const assertions = [];
    for (const line of block.slice(fence.index + fence[0].length).split('\n')) {
      const m = line.match(/^- (renders|omits) `(.+)`\s*$/) || line.match(/^- (detect) (true|false)\s*$/);
      if (m) assertions.push({ op: m[1], value: m[2] });
      else if (/^- /.test(line)) assert.fail(`fixture case "${title}": unreadable assertion ${JSON.stringify(line)}`);
    }
    assert.ok(assertions.length, `fixture case "${title}" asserts nothing`);
    cases.push({ title, input: fence[1], assertions });
  }
  return cases;
}

/** Every token type the plugin's own rules emit for `src` (children included). */
function pluginTokens(plugin, src) {
  const md = new MarkdownIt('commonmark');
  const { installGrammar } = requireGrammarHost();
  installGrammar(md, { grammar: [plugin] });
  const found = new Set();
  const walk = (tokens) => {
    for (const t of tokens) {
      if (plugin.syntax[t.type]) found.add(t.type);
      if (t.children) walk(t.children);
    }
  };
  walk(md.parse(src, {}));
  return found;
}

let grammarHost;
function requireGrammarHost() {
  grammarHost ??= require('../../../lib/plugins/host-grammar.mjs');
  return grammarHost;
}

describe('plugin conformance — every in-tree plugin, from its own fixtures', () => {
  assert.ok(PLUGINS.length > 0, 'the registry lists no plugins');
  const engine = createEngine();

  for (const plugin of PLUGINS) {
    const file = path.join(PLUGINS_DIR, plugin.name, `${plugin.name}.fixtures.md`);

    describe(`${plugin.name}`, () => {
      test('ships a fixtures file with cases', () => {
        assert.ok(fs.existsSync(file), `${path.relative(process.cwd(), file)} is missing — every plugin ships fixtures`);
        assert.ok(parseFixtures(fs.readFileSync(file, 'utf8')).length > 0);
      });
      if (!fs.existsSync(file)) return;
      const cases = parseFixtures(fs.readFileSync(file, 'utf8'));
      const disabledEngine = createEngine({ plugins: { disabled: [plugin.name] } });

      test('disabled, none of its rules or renderers are installed', () => {
        const md = new MarkdownIt('commonmark');
        installPlugins(md, { disabled: [plugin.name] });
        const names = [...md.inline.ruler.__rules__, ...md.block.ruler.__rules__].map((r) => r.name);
        for (const token of Object.keys(plugin.syntax)) {
          assert.ok(!names.includes(token), `rule "${token}" installed although ${plugin.name} is disabled`);
          assert.equal(md.renderer.rules[token], undefined, `renderer "${token}" installed although ${plugin.name} is disabled`);
        }
      });

      test('every declared syntax token is exercised by a case', () => {
        const exercised = new Set(cases.flatMap((c) => [...pluginTokens(plugin, c.input)]));
        for (const token of Object.keys(plugin.syntax)) {
          assert.ok(exercised.has(token), `no fixture case produces "${token}"`);
        }
      });

      for (const c of cases) {
        test(c.title, () => {
          const { html } = engine.render(c.input);
          const tokens = pluginTokens(plugin, c.input);
          for (const { op, value } of c.assertions) {
            if (op === 'renders') assert.ok(html.includes(value), `expected the render to contain ${JSON.stringify(value)}`);
            if (op === 'omits') assert.ok(!html.includes(value), `expected the render NOT to contain ${JSON.stringify(value)}`);
            if (op === 'detect') assert.equal(plugin.detect(c.input), value === 'true', 'detect(source)');
          }
          if (tokens.size && plugin.detect) {
            assert.equal(plugin.detect(c.input), true, `the parser emitted ${[...tokens].join(', ')} but detect() missed it`);
          }
          assert.doesNotThrow(() => disabledEngine.render(c.input), 'the render with the plugin disabled threw');
        });
      }
    });
  }
});

describe('plugin host — fail-soft at the render step', () => {
  const token = { content: 'a < b & c' };
  const tokens = [token];
  test('a throwing renderer degrades to escaped source', () => {
    const rule = failSoft(() => { throw new Error('boom'); }, {}, 'source', 'inline');
    assert.equal(rule(tokens, 0, {}, {}), 'a &lt; b &amp; c');
  });
  test('a non-string result degrades too; a block keeps its paragraph', () => {
    const rule = failSoft(() => 42, {}, 'source', 'block');
    assert.equal(rule(tokens, 0, {}, {}), '<p>a &lt; b &amp; c</p>\n');
  });
  test('code-block and hidden degradations', () => {
    assert.equal(failSoft(() => null, {}, 'code-block', 'block')(tokens, 0, {}, {}), '<pre><code>a &lt; b &amp; c</code></pre>\n');
    assert.equal(failSoft(() => null, {}, 'hidden', 'inline')(tokens, 0, {}, {}), '');
  });
  test('a string result passes through untouched', () => {
    assert.equal(failSoft(() => '<b>ok</b>', {}, 'source', 'inline')(tokens, 0, {}, {}), '<b>ok</b>');
  });
  test('the renderer receives the frozen ctx and the per-render env', () => {
    const ctx = Object.freeze({ name: 'x', options: Object.freeze({ a: 1 }), family: 'tall' });
    const env = { page: 3 };
    let seen;
    failSoft((t, c, e) => { seen = [t, c, e]; return ''; }, ctx, 'source', 'inline')(tokens, 0, {}, env);
    assert.deepEqual(seen, [token, ctx, env]);
  });
});
