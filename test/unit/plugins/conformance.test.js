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
 *     one of its tokens, or wrote one of its fences, `detect(input)` is true (the host's
 *     `usesPlugin`: the plugin's own `detect`, or the probe it derives from the fence names). It may say true more often (math's pre-scan
 *     over-matches on purpose); it may never miss, because a miss ships unrendered content.
 *     "The parser" is BOTH a bare commonmark instance with only this plugin's grammar AND the
 *     engine's own parser (`_tokens`), unioned — see `pluginTokens` for why neither alone does;
 *   - with the plugin disabled, none of its rules or renderers are installed, and the render
 *     still does not throw.
 *
 * And across the registry: every rule declines every character it does not declare as a trigger,
 * the fixtures file exists and has cases, every syntax token, fence and
 * fence alias the manifest declares is exercised by at least one case, a disabled plugin's fences
 * fall back to ordinary code blocks, and the host's fail-soft wrapper turns a
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

/**
 * Parse a fixtures file into cases: `{ title, input, assertions: [{ op, value }] }`.
 *
 * Strict on purpose, because a fixture that silently asserts less than it reads is worse than
 * none: a `## ` line splits cases only OUTSIDE a fence (so an input may hold slide headings), and
 * any line that looks like an assertion — a bullet or a `renders` / `omits` / `detect` word at
 * the start — must parse exactly, or the file fails.
 */
function parseFixtures(text) {
  const cases = [];
  let current = null;
  let fence = null; // the opening fence's backticks while inside one
  let input = null;
  for (const line of text.split('\n')) {
    if (fence) {
      if (line.trim() === fence) {
        fence = null;
        if (input) {
          current.input = input.join('\n');
          input = null;
        }
      } else if (input) input.push(line);
      continue;
    }
    const open = line.match(/^(`{3,})(\S*)\s*$/);
    if (open) {
      fence = open[1];
      if (current && open[2] === 'markdown' && current.input === undefined) input = [];
      continue;
    }
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), input: undefined, assertions: [] };
      cases.push(current);
      continue;
    }
    if (!current) continue;
    const m = line.match(/^- (renders|omits) `(.+)`\s*$/) || line.match(/^- (detect) (true|false)\s*$/);
    if (m) current.assertions.push({ op: m[1], value: m[2] });
    else if (/^\s*[-*+]\s|^\s*(renders|omits|detect)\b/.test(line)) {
      assert.fail(`fixture case "${current.title}": unreadable assertion ${JSON.stringify(line)} — write "- renders \`…\`", "- omits \`…\`" or "- detect true|false"`);
    }
  }
  assert.equal(fence, null, 'a fixtures file ends inside an unclosed fence');
  for (const c of cases) {
    assert.ok(c.input !== undefined, `fixture case "${c.title}" has no \`\`\`markdown input fence`);
    assert.ok(c.assertions.length, `fixture case "${c.title}" asserts nothing`);
  }
  return cases;
}

/** Every name a plugin's fences answer to — `fence:<name>`, the alias's own name for an alias. */
function fenceClaims(plugin) {
  return Object.entries(plugin.fences || {}).flatMap(([name, decl]) => [name, ...decl.aliases.map((a) => a.name)]);
}

/**
 * Every token type the plugin's own rules emit for `src` (children included), and `fence:<name>`
 * for every fence the plugin's fence table would take — over TWO parses, unioned:
 *
 *   - a bare CommonMark instance with only this plugin's grammar, which sees what the plugin's
 *     rules do on their own; and
 *   - the ENGINE's own parser (`createEngine()._tokens`, the memoized markdown-it `render` uses,
 *     with `html: true`, every other plugin and every LATTICE_PLUGINS rule), which sees what a
 *     render sees.
 *
 * Neither alone is enough, and both directions were measured. The engine's parse can HIDE a token
 * a render still typesets: a glossary slide's core rule rebuilds its cells, so `$b$` in a glossary
 * definition renders as math and is absent from the token stream. A bare parse can see a token
 * the engine never makes (a table header row, front matter). `detect` must cover every token
 * EITHER finds — it may over-match, never miss — so the arm checks the union. (Until phase C this
 * read the bare parse alone, a known limit recorded in the plugin-system note §11.)
 * @param {object} plugin
 * @param {string} src
 * @param {(src: string) => object[]} [engineParse]  injectable, so the arm itself can be tested
 */
function pluginTokens(plugin, src, engineParse = (s) => sharedEngine()._tokens(s)) {
  const md = new MarkdownIt('commonmark');
  const { installGrammar } = requireGrammarHost();
  installGrammar(md, { grammar: [plugin] });
  const claims = new Set(fenceClaims(plugin));
  const found = new Set();
  const walk = (tokens) => {
    for (const t of tokens) {
      if (plugin.syntax[t.type]) found.add(t.type);
      const name = (t.info || '').trim().split(/\s+/, 1)[0];
      if (t.type === 'fence' && claims.has(name)) found.add(`fence:${name}`);
      if (t.children) walk(t.children);
    }
  };
  walk(md.parse(src, {}));
  walk(engineParse(src));
  return found;
}

let engineInstance;
const sharedEngine = () => (engineInstance ??= createEngine());

let grammarHost;
function requireGrammarHost() {
  grammarHost ??= require('../../../lib/plugins/host-grammar.mjs');
  return grammarHost;
}
const usesPlugin = (plugin, src) => requireGrammarHost().usesPlugin(plugin, src);

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

      test('every declared syntax token, fence and fence alias is exercised by a case', () => {
        const exercised = new Set(cases.flatMap((c) => [...pluginTokens(plugin, c.input)]));
        for (const token of Object.keys(plugin.syntax)) {
          assert.ok(exercised.has(token), `no fixture case produces "${token}"`);
        }
        for (const name of fenceClaims(plugin)) {
          assert.ok(exercised.has(`fence:${name}`), `no fixture case writes a \`\`\`${name} fence`);
        }
      });

      test('disabled, its fences render as ordinary code blocks', () => {
        for (const name of fenceClaims(plugin)) {
          const { html } = disabledEngine.render(`\`\`\`${name}\n{}\n\`\`\`\n`);
          assert.match(html, /<pre[^>]*><code/, `a \`\`\`${name} fence did not fall back to a code block with ${plugin.name} disabled`);
          assert.ok(!html.includes(`data-lattice-hydrate="${plugin.name}"`), `${plugin.name}'s placeholder rendered although it is disabled`);
        }
      });

      for (const c of cases) {
        test(c.title, () => {
          const { html } = engine.render(c.input);
          const tokens = pluginTokens(plugin, c.input);
          for (const { op, value } of c.assertions) {
            if (op === 'renders') assert.ok(html.includes(value), `expected the render to contain ${JSON.stringify(value)}`);
            if (op === 'omits') assert.ok(!html.includes(value), `expected the render NOT to contain ${JSON.stringify(value)}`);
            if (op === 'detect') assert.equal(usesPlugin(plugin, c.input), value === 'true', 'detect(source)');
          }
          if (tokens.size) {
            assert.equal(usesPlugin(plugin, c.input), true, `the parser emitted ${[...tokens].join(', ')} but detect() missed it`);
          }
          assert.doesNotThrow(() => disabledEngine.render(c.input), 'the render with the plugin disabled threw');
        });
      }
    });
  }
});

/**
 * THE TRIGGER-HONESTY ARM. The resolver refuses two plugins that DECLARE one trigger character —
 * but nothing proved a rule fires only on the characters it declares, so a rule that also claimed
 * `#` would collide with a heading, or with another plugin's rule, and pass every check
 * (plugin-system note §11, known limit 2). Here every rule of every plugin is fed each printable
 * ASCII character it does NOT declare, at the position it is asked about, in both silent and
 * non-silent mode, and must decline without moving the parser.
 */
describe('plugin rules fire only on their declared triggers', () => {
  const md = new MarkdownIt('commonmark');
  const ascii = [];
  for (let c = 0x20; c < 0x7f; c++) ascii.push(String.fromCharCode(c));

  for (const plugin of PLUGINS) {
    for (const [token, rule] of Object.entries(plugin.syntax)) {
      test(`${plugin.name}: ${token} declines every character but ${rule.triggers.join(' ')}`, () => {
        const claimed = [];
        for (const ch of ascii) {
          if (rule.triggers.includes(ch)) continue;
          // A BLOCK rule reads a line after its indentation (`bMarks + tShift`), so a leading space
          // is not the character at the rule's start — the `$` behind it is, and that one is declared.
          if (rule.kind === 'block' && ch === ' ') continue;
          // The undeclared character at the start, in shapes a rule that wrongly opened on it would
          // go on to CLOSE: the character as its own closer, a real `$` closer, and a real `$$`
          // block after it. (A first cut used only the last shape; a mutated inline rule that
          // opened on `#` then saw `$$`, declined for its own reason, and passed — measured.)
          for (const src of [`${ch}a${ch} tail`, `${ch}a$ tail`, `${ch}a b\n`, `${ch}$$x$$ $a$\n$$\nb\n$$\n`])
          for (const silent of [true, false]) {
            if (rule.kind === 'inline') {
              const state = new md.inline.State(src, md, {}, []);
              if (rule.run(state, silent) || state.pos !== 0 || state.tokens.length) claimed.push(`${JSON.stringify(ch)} (silent=${silent})`);
            } else {
              const state = new md.block.State(src, md, {}, []);
              if (rule.run(state, 0, state.lineMax, silent) || state.line !== 0 || state.tokens.length) claimed.push(`${JSON.stringify(ch)} (silent=${silent})`);
            }
          }
        }
        assert.deepEqual(claimed, [], `${token} claimed characters it does not declare as triggers`);
      });
    }
  }
});

describe('the detect-superset arm reads the engine\'s parse too', () => {
  // The arm itself, on an injected "engine" that tokenizes something the bare parse does not:
  // the union must carry it, so a `detect` that misses it fails the arm.
  test('a token only the engine parse produces is in the set detect must cover', () => {
    const math = PLUGINS.find((p) => p.name === 'math');
    const src = 'plain words, nothing a bare parse calls math';
    assert.equal(pluginTokens(math, src, () => []).size, 0);
    const fakeEngine = () => [{ type: 'paragraph_open' }, { type: 'inline', children: [{ type: 'math_inline', content: 'x' }] }];
    assert.deepEqual([...pluginTokens(math, src, fakeEngine)], ['math_inline']);
  });
  test('the default engine parse is the real one: a math fixture tokenizes through it', () => {
    const math = PLUGINS.find((p) => p.name === 'math');
    const onlyEngine = pluginTokens(math, 'The area is $\\pi r^2$.', (s) => sharedEngine()._tokens(s));
    assert.ok(onlyEngine.has('math_inline'));
  });
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
