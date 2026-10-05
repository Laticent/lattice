/**
 * What loads a plugin (engineering/decisions/2026-09-27-plugin-system.md §9 decision 6): the
 * default set, the deck's front-matter `plugins:` import list, and the plugins a slide class the
 * deck uses requires — and nothing else. lib/plugins/host-grammar.mjs `admitPlugins` decides it;
 * lib/plugins/deck-plugins.mjs reads and writes the list.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { admitPlugins, DEFAULT_PLUGINS } = require('../../../lib/plugins/host-grammar.mjs');
const { deckPluginList, writeDeckPlugins, deckClassTokens } = require('../../../lib/plugins/deck-plugins.mjs');
const { createEngine } = require('../../../lib/engine');
const { bakeDeck } = require('../../../lib/plugins/host-bake.js');

const names = (admission) => admission.active.map((g) => g.name);

describe('the plugins: import list — reader', () => {
  for (const [label, fm] of [
    ['a flow sequence', 'plugins: [math, mermaid]'],
    ['a comma scalar', 'plugins: math, mermaid'],
    ['a space scalar', 'plugins: math mermaid'],
    ['quoted items and a comment', `plugins: ["math", 'mermaid']  # the two I use`],
    ['a block sequence', 'plugins:\n  - math\n  - mermaid'],
    ['a column-0 block sequence', 'plugins:\n- math\n- mermaid'],
  ]) {
    it(`reads ${label}`, () => {
      assert.deepEqual(deckPluginList(`---\ntheme: indaco\n${fm}\nsize: 4:3\n---\n\n# Hi\n`), ['math', 'mermaid']);
    });
  }

  it('reads nothing from a deck with no list, a nested key, or the body', () => {
    assert.deepEqual(deckPluginList('# Hi\n\nplugins: [math]\n'), []);
    assert.deepEqual(deckPluginList('---\nmeta:\n  plugins: [math]\n---\n# Hi\n'), []);
    assert.deepEqual(deckPluginList('---\nplugins:\n---\n# Hi\n'), []);
  });

  it('reads a CRLF deck', () => {
    assert.deepEqual(deckPluginList('---\r\nplugins: [math]\r\n---\r\n# Hi\r\n'), ['math']);
  });
});

describe('the plugins: import list — writer', () => {
  it('adds the key to existing front matter, and front matter to a deck with none', () => {
    assert.equal(writeDeckPlugins('---\ntheme: indaco\n---\n\n# Hi\n', ['math']), '---\ntheme: indaco\nplugins: [math]\n---\n\n# Hi\n');
    assert.equal(writeDeckPlugins('# Hi\n', ['math', 'mermaid']), '---\nplugins: [math, mermaid]\n---\n\n# Hi\n');
  });

  it('replaces any spelling with one line, block-sequence items included', () => {
    const src = '---\nplugins:\n  - math\n  - anima\n\ntheme: indaco\n---\n# Hi\n';
    assert.equal(writeDeckPlugins(src, ['math']), '---\nplugins: [math]\n\ntheme: indaco\n---\n# Hi\n');
  });

  it('removes the key — and the front matter when nothing else is in it', () => {
    assert.equal(writeDeckPlugins('---\ntheme: indaco\nplugins: [math]\n---\n# Hi\n', []), '---\ntheme: indaco\n---\n# Hi\n');
    assert.equal(writeDeckPlugins('---\nplugins: [math]\ntheme: indaco\n---\n# Hi\n', []), '---\ntheme: indaco\n---\n# Hi\n');
    assert.equal(writeDeckPlugins('---\nplugins: [math]\n---\n# Hi\n', []), '# Hi\n');
    assert.equal(writeDeckPlugins('# Hi\n', []), '# Hi\n');
  });

  it("keeps a CRLF deck's line endings", () => {
    assert.equal(writeDeckPlugins('---\r\ntheme: indaco\r\n---\r\n# Hi\r\n', ['math']), '---\r\ntheme: indaco\r\nplugins: [math]\r\n---\r\n# Hi\r\n');
  });

  it('round-trips through the reader', () => {
    for (const list of [['math'], ['anima', 'function-plot', 'math', 'mermaid'], []]) {
      assert.deepEqual(deckPluginList(writeDeckPlugins('---\ntheme: indaco\n---\n# Hi\n', list)), list);
    }
  });
});

describe('the plugins: register — every YAML spelling, and no orphaned lines (HARD RULE #25 red team, E0)', () => {
  for (const [label, fm, list] of [
    ['a multi-line flow list', 'plugins: [math,\n  mermaid]', ['math', 'mermaid']],
    ['a commented block sequence', 'plugins:\n  # the two I use\n  - math\n  - mermaid', ['math', 'mermaid']],
    ['a quoted scalar', 'plugins: "math, mermaid"', ['math', 'mermaid']],
    ['a block scalar', 'plugins: >\n  math mermaid', ['math', 'mermaid']],
    ['a null', 'plugins: ~', []],
  ]) {
    it(`reads ${label}, and the writer replaces every line of it`, () => {
      const src = `---\ntheme: cuoio\n${fm}\ntitle: x\n---\n\n# Hi\n`;
      assert.deepEqual(deckPluginList(src), list);
      assert.equal(writeDeckPlugins(src, ['anima']), '---\ntheme: cuoio\nplugins: [anima]\ntitle: x\n---\n\n# Hi\n');
      assert.equal(writeDeckPlugins(src, []), '---\ntheme: cuoio\ntitle: x\n---\n\n# Hi\n');
    });
  }

  it("reads the engine's front matter, BOM included, and writes after the BOM", () => {
    assert.deepEqual(deckPluginList('\uFEFF---\nplugins: [math]\n---\n# Hi\n'), ['math']);
    assert.equal(writeDeckPlugins('\uFEFF# Hi\n', ['math']), '\uFEFF---\nplugins: [math]\n---\n\n# Hi\n');
    // A `--- ` opener (trailing space) is not front matter to the engine, so it is not to the writer.
    assert.deepEqual(deckPluginList('--- \nplugins: [math]\n---\n# Hi\n'), []);
  });

  it('stays linear on hostile input (each shape was quadratic or cubic in the first cut)', () => {
    const time = (fn, input) => {
      const t = performance.now();
      fn(input);
      return performance.now() - t;
    };
    const budget = 250; // ms; the first cut took 5,099 / 1,289 / 20,800 ms on these
    assert.ok(time(deckPluginList, `---\nplugins:\n${'\n'.repeat(40000)}  - x\n---\n`) < budget, 'blank lines in a block sequence');
    assert.ok(time(deckPluginList, `---\nplugins:\n  - a${' '.repeat(80000)}b\n---\n`) < budget, 'a long run of spaces in an item');
    assert.ok(time(deckClassTokens, `<!-- class: ${' '.repeat(4000)}x\n`) < budget, 'an unclosed class directive');
    assert.ok(time(deckClassTokens, `<!-- class:${' '.repeat(50)}`.repeat(400)) < budget, 'many unclosed class directives');
  });
});

describe('admitPlugins — the three routes', () => {
  it('the default set is every shipped plugin, and a deck that lists nothing loads all of it', () => {
    assert.deepEqual([...DEFAULT_PLUGINS].sort(), ['anima', 'chart-family', 'function-plot', 'icons', 'math', 'mermaid']);
    const a = admitPlugins('# Hi\n');
    assert.deepEqual(a.off, []);
    assert.deepEqual(names(a).sort(), [...DEFAULT_PLUGINS].sort());
  });

  it('with an empty default set, a plugin loads only when listed or required by a class', () => {
    assert.deepEqual(names(admitPlugins('# Hi $x$\n', { defaults: [] })), []);
    assert.deepEqual(names(admitPlugins('---\nplugins: [math]\n---\n# Hi\n', { defaults: [] })), ['math']);
    assert.deepEqual(names(admitPlugins('<!-- _class: diagram -->\n# Flow\n', { defaults: [] })), ['mermaid']);
    assert.deepEqual(names(admitPlugins('---\nclass: scene\n---\n# Flow\n', { defaults: [] })), ['anima']);
    // A pane renders as its component's class, so a pane marker is the component route too.
    assert.deepEqual(names(admitPlugins('<!-- _pane: math -->\n$$x^2$$\n', { defaults: [] })), ['math']);
    // A chart FILLS the chart family's `kernel` slot, and filling it is requiring it (phase F): no
    // chart manifest carries a `plugins` block, and the class still loads the family.
    assert.deepEqual(names(admitPlugins('<!-- _class: bar -->\n## Revenue\n', { defaults: [] })), ['chart-family']);
    assert.deepEqual(names(admitPlugins('<!-- _pane: gantt -->\n- A `Q1`\n', { defaults: [] })), ['chart-family']);
    // A stray `<!--` quoted earlier (a code span, a fence) must not swallow a later directive: it
    // used to pair with the directive's `-->`, so the chart class was never read (red team).
    assert.deepEqual(names(admitPlugins('# Intro\n\nWrite `<!--` to open one.\n\n---\n\n<!-- _class: bar -->\n\n## G\n', { defaults: [] })), ['chart-family']);
    assert.deepEqual(names(admitPlugins('```html\n<!--\n```\n\n---\n\n<!-- _class: math -->\n', { defaults: [] })), ['math']);
  });

  it('the usage probe admits nothing: a deck that USES a plugin it never loads keeps it off', () => {
    const a = admitPlugins('# Hi\n\n```mermaid\ngraph LR; A-->B\n```\n', { defaults: [] });
    assert.deepEqual(a.off, ['anima', 'chart-family', 'function-plot', 'icons', 'math', 'mermaid']);
  });

  it('a loaded plugin loads what it requires, transitively; optional loads nothing', () => {
    const g = (name, requires = [], optional = []) => ({ name, requires, optional, syntax: {}, fences: {} });
    const grammar = [g('a'), g('b', ['a']), g('c', ['b'], ['d']), g('d')];
    const a = admitPlugins('---\nplugins: [c]\n---\n', { defaults: [], grammar, componentPlugins: {}, explain: true });
    assert.deepEqual(names(a), ['a', 'b', 'c']);
    assert.deepEqual(a.reasons.a, [{ kind: 'required', by: 'b' }]);
    assert.deepEqual(a.off, ['d']);
  });

  it("the host's switch wins over every route", () => {
    const a = admitPlugins('---\nplugins: [math]\n---\n<!-- _class: math -->\n', { disabled: ['math'] });
    assert.ok(!names(a).includes('math'));
    assert.ok(a.off.includes('math'));
  });

  it("the host's switch cascades to what requires it, even when that is listed", () => {
    const g = (name, requires = []) => ({ name, requires, optional: [], syntax: {}, fences: {} });
    const grammar = [g('a'), g('b', ['a']), g('c')];
    const a = admitPlugins('---\nplugins: [b]\n---\n', { disabled: ['a'], grammar, componentPlugins: {} });
    assert.deepEqual(names(a), ['c']);
    assert.deepEqual(a.off, ['a', 'b']);
  });

  it('warns — never admits — when a deck uses a plugin nothing loaded', () => {
    const deck = '# Hi $x$\n\n```mermaid\ngraph LR; A-->B\n```\n';
    assert.deepEqual(admitPlugins(deck).unloaded, [], 'the default set loads everything; the probe has nothing to say');
    const a = admitPlugins(deck, { defaults: [] });
    assert.deepEqual(a.unloaded.sort(), ['math', 'mermaid']);
    assert.deepEqual(names(a), []);
    assert.deepEqual(admitPlugins(deck, { disabled: ['math'] }).unloaded, [], "the host's own switch is not reported");
    assert.deepEqual(admitPlugins(deck, { defaults: [], disabled: ['math'] }).unloaded, ['mermaid'], 'listing cannot beat the switch, so it is not advised');
  });

  it('explains every route that admitted a plugin', () => {
    const { reasons } = admitPlugins('---\nplugins: [math]\n---\n<!-- _class: math -->\n', { explain: true });
    assert.deepEqual(reasons.math, [{ kind: 'default' }, { kind: 'listed' }, { kind: 'component', component: 'math' }]);
  });

  it('reports a listed name no plugin has, and marks one that is not name-shaped', () => {
    const a = admitPlugins('---\nplugins: [math, mermiad, $x]\n---\n');
    assert.deepEqual(a.unknown, [{ name: 'mermiad', malformed: false }, { name: '$x', malformed: true }]);
  });

  it('reads class directives in every form, from the source', () => {
    assert.deepEqual(deckClassTokens('---\nclass: dark wide\n---\n<!-- _class: math -->\n<!-- class: diagram -->\n'), ['dark', 'wide', 'math', 'diagram']);
    assert.deepEqual(deckClassTokens('---\nclass: [dark, wide]\n---\n<!-- _class: "math" -->\n'), ['dark', 'wide', 'math']);
  });
});

describe('admission on the render paths', () => {
  const MATH = '# Area\n\nThe area is $\\pi r^2$.\n';

  it('a deck that lists a default plugin renders byte-identical to one that does not', () => {
    const e = createEngine();
    const plain = e.render(`---\ntheme: indaco\n---\n\n${MATH}`);
    const listed = e.render(`---\ntheme: indaco\nplugins: [math, mermaid]\n---\n\n${MATH}`);
    assert.equal(listed.html, plain.html);
    assert.equal(listed.css, plain.css);
    assert.equal(listed.diagnostics, undefined);
  });

  it('the engine installs a plugin by each route, and only by a route', () => {
    const e = createEngine({ plugins: { defaults: [] } });
    assert.ok(!e.render(MATH).html.includes('katex'), 'not loaded: not default, not listed, no class');
    assert.ok(e.render(`---\nplugins: [math]\n---\n${MATH}`).html.includes('katex'), 'listed');
    assert.ok(e.render(`<!-- _class: math -->\n${MATH}`).html.includes('katex'), 'required by the math class');
    assert.ok(!e.render(MATH).html.includes('katex'), 'the memoized parser does not leak the last deck\'s set');
  });

  it('a used plugin nothing loaded is a render diagnostic, so a narrowed default set is never silent', () => {
    const r = createEngine({ plugins: { defaults: [] } }).render(MATH);
    assert.ok(!r.html.includes('katex'));
    assert.deepEqual(r.diagnostics.map((d) => [d.id, d.plugin]), [['plugin/used-not-loaded', 'math']]);
    assert.equal(createEngine().render(MATH).diagnostics, undefined);
  });

  it('a listed name no plugin has is a render diagnostic, and the deck still renders', () => {
    const r = createEngine().render(`---\nplugins: [mermiad]\n---\n${MATH}`);
    assert.ok(r.html.includes('katex'));
    assert.deepEqual(r.diagnostics.map((d) => [d.id, d.plugin]), [['plugin/unknown-plugin', 'mermiad']]);
  });

  it('the CLI bake runs only for an admitted plugin', () => {
    const ran = [];
    const bakers = [{ name: 'mermaid', load: () => ({ bake: (s) => { ran.push('mermaid'); return s; } }) }];
    const deck = '```mermaid\ngraph LR; A-->B\n```\n';
    bakeDeck(deck, {}, { bakers, defaults: [] });
    assert.deepEqual(ran, [], 'not admitted: used, but never loaded');
    bakeDeck(`---\nplugins: [mermaid]\n---\n${deck}`, {}, { bakers, defaults: [] });
    assert.deepEqual(ran, ['mermaid'], 'listed');
    bakeDeck(deck, {}, { bakers });
    assert.deepEqual(ran, ['mermaid', 'mermaid'], 'the default set');
  });
});
