/**
 * Unit: lib/core/resolve-chart-finish.js — the `chart-finish:` register
 * (engineering/chart-styling.md §3). Pins the vocabulary, the one thing that makes this a look
 * rather than a layer (a finish is ALWAYS on: no `off`, an absent or unknown value wears the
 * default), both render paths' wiring, the per-slide override through the real engine, and the
 * lint rule for a typo. The runtime path itself runs in
 * test/integration/parity/runtime-chart-finish.test.js, against the real bundle.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHART_FINISH_NAMES, CHART_FINISHES, CHART_FINISH_DEFAULT, CHART_FINISH_TOKENS,
  chartFinishClass, chartFinishClassFromSource, isKnownChartFinish, isChartFinishToken, readFrontMatterChartFinish,
} = require('../../../lib/core/resolve-chart-finish');
const engine = require('../../../lib/engine');
const { lintText } = require('../../../lib/authoring/lint');
const lint = (md) => ({ findings: lintText(md) });

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
// A linear scan of each <section> opening tag, since a regex spanning the whole tag is
// polynomial. `class=` anchored on whitespace, so `data-class=` never matches it.
const classesOf = (md) => String(engine.render(md).html).split('<section ').slice(1)
  .map((t) => t.slice(0, t.indexOf('>'))).map((t) => (/(?:^|\s)class="([^"]*)"/.exec(t)?.[1] ?? '').split(/\s+/));
const finishesOn = (classes) => classes.filter(isChartFinishToken);

describe('chart-finish: the vocabulary', () => {
  test('three finishes, no off, and the default is one of them', () => {
    assert.deepEqual([...CHART_FINISH_NAMES], ['pigment', 'etch', 'tone']);
    assert.deepEqual([...CHART_FINISHES], ['pigment', 'etch', 'tone']);
    assert.equal(CHART_FINISH_DEFAULT, 'pigment');
    assert.ok(CHART_FINISH_NAMES.includes(CHART_FINISH_DEFAULT));
  });

  test('a finish is always on: empty, absent, unknown and the retired `off` all wear the default', () => {
    for (const v of [undefined, null, '', '  ', 'off', 'tonal', 'etching']) {
      assert.equal(chartFinishClass(v), 'chart-finish-pigment', JSON.stringify(v));
    }
    assert.equal(chartFinishClass('Tone '), 'chart-finish-tone');
    assert.equal(chartFinishClass('ETCH'), 'chart-finish-etch');
  });

  test('every token carries the chart-finish- prefix, so none collides with the backdrop `finish-*`', () => {
    assert.deepEqual([...CHART_FINISH_TOKENS], ['chart-finish-pigment', 'chart-finish-etch', 'chart-finish-tone']);
    for (const t of CHART_FINISH_TOKENS) assert.ok(isChartFinishToken(t));
    assert.ok(!isChartFinishToken('finish-atrium'));
    assert.ok(!isChartFinishToken('chart-finish-off'), '`chart-finish-off` is not a finish token any more');
  });

  test('the front-matter read strips a trailing comment and quotes', () => {
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: tone  # restrained\n---\n'), 'tone');
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: "etch"\n---\n'), 'etch');
    assert.equal(readFrontMatterChartFinish('---\ntheme: indaco\n---\n'), null);
    assert.equal(chartFinishClassFromSource('---\nchart-finish: etch\n---\n'), 'chart-finish-etch');
    assert.equal(chartFinishClassFromSource('---\ntheme: indaco\n---\n'), 'chart-finish-pigment');
    assert.equal(chartFinishClassFromSource('no front matter at all'), 'chart-finish-pigment');
    assert.ok(isKnownChartFinish('TONE') && !isKnownChartFinish('off') && !isKnownChartFinish('matte'));
  });
});

describe('chart-finish: both render paths', () => {
  test('the markdown-it plugin and the runtime stamp through the kernel, in a pass of their own', () => {
    // HARD RULE #1: each path stamps its own sections, so a register wired into one renders
    // two decks from one source. Both resolve through the kernel and both leave a slide's own
    // token alone.
    const plugins = read('lib/integrations/markdown-it/plugins.js');
    assert.match(plugins, /chartFinishClassFromSource\(/, 'plugins.js resolves the register through the kernel');
    assert.match(plugins, /ruler\.push\('chart_finish_stamp'/, 'plugins.js stamps in a pass that runs for every deck');
    assert.match(plugins, /cur\.some\(isChartFinishToken\)/, 'plugins.js keeps a slide that names its own');
    const runtime = read('lib/runtime/index.js');
    assert.match(runtime, /chartFinishClass\(/, 'the runtime resolves the register through the kernel');
    assert.match(runtime, /function stampChartFinish\(/, 'the runtime stamps every section');
    assert.match(runtime, /isChartFinishToken/, 'the runtime keeps a slide that names its own');
    for (const [rel, src] of [['plugins.js', plugins], ['runtime/index.js', runtime]]) {
      assert.doesNotMatch(src, /chartFinishTokens/, `${rel} no longer rides the deck-token pass, which returns early for a deck with no tokens`);
    }
  });

  const deck = (fm) => `---\nmarp: true\n${fm}---\n\n<!-- _class: bar -->\n\n## A\n\n- A \`3\`\n\n---\n\n` +
    '<!-- _class: bar chart-finish-etch -->\n\n## B\n\n- A `3`\n\n---\n\n<!-- _class: bar chart-finish-pigment -->\n\n## C\n\n- A `3`\n';

  test('the deck stamps every slide; a slide token overrides, and may ask for the default', () => {
    const [a, b, c] = classesOf(deck('chart-finish: tone\n'));
    assert.deepEqual(finishesOn(a), ['chart-finish-tone']);
    assert.deepEqual(finishesOn(b), ['chart-finish-etch']);
    assert.deepEqual(finishesOn(c), ['chart-finish-pigment']);
  });

  test('a deck that names none wears the default on every slide, front matter or not', () => {
    for (const fm of ['', 'theme: indaco\n']) {
      for (const s of classesOf(deck(fm))) assert.ok(finishesOn(s).length === 1, `${JSON.stringify(fm)}: ${s.join(' ')}`);
      assert.deepEqual(finishesOn(classesOf(deck(fm))[0]), ['chart-finish-pigment']);
    }
    const noFrontMatter = '<!-- _class: bar -->\n\n## A\n\n- A `3`\n\n---\n\n<!-- _class: bar -->\n\n## B\n\n- A `3`\n';
    for (const s of classesOf(noFrontMatter)) assert.deepEqual(finishesOn(s), ['chart-finish-pigment']);
  });

  test('the retired `off` and an unknown value wear the default, and never stamp two finishes', () => {
    for (const v of ['off', 'tonal', 'etching']) {
      const [a] = classesOf(deck(`chart-finish: ${v}\n`));
      assert.deepEqual(finishesOn(a), ['chart-finish-pigment'], v);
    }
  });

  test('a chart in a pane of a layout slide is finished like a full-slide one: the SECTION carries the finish', () => {
    // The section of a `columns` slide never names the chart inside its pane, so a stamp that waited
    // for a chart class on the section would miss it.
    const md = '---\nmarp: true\nchart-finish: etch\n---\n\n<!-- _class: columns -->\n\n## Split\n\n- Left `1`\n\n<!-- _pane: bar -->\n\n- A `3`\n- B `4`\n';
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['chart-finish-etch'], s.join(' '));
  });

  test('`chart-finish-off` is just an unknown class now: it lints, and the deck finish still lands', () => {
    const md = `---\nmarp: true\nchart-finish: tone\n---\n\n<!-- _class: bar chart-finish-off -->\n\n## A\n\n- A \`3\`\n`;
    const [s] = classesOf(md);
    assert.deepEqual(finishesOn(s), ['chart-finish-tone'], 'exactly one real finish: the deck\'s');
    assert.ok(s.includes('chart-finish-off'), 'the author\'s own class is left in place');
    const stale = lint(md).findings.find((f) => f.rule === 'unknown-class');
    assert.ok(stale, 'the stale token is reported');
    assert.match(stale.message, /retired/, 'and said to be retired, not renamed or merely unknown');
    assert.match(stale.fix, /chart-finish-pigment/);
  });

  test('a per-slide token lints clean', () => {
    const r = lint(deck('chart-finish: tone\n'));
    assert.deepEqual(r.findings.filter((f) => f.rule === 'unknown-class'), []);
  });
});

describe('chart-finish: lint', () => {
  test('an unknown value warns and names the choices', () => {
    const r = lint('---\nmarp: true\nchart-finish: tonal\n---\n\n## A\n');
    const f = r.findings.find((x) => x.rule === 'unknown-chart-finish');
    assert.ok(f, 'unknown-chart-finish fired');
    assert.equal(f.severity, 'warning');
    assert.match(f.fix, /pigment, etch, tone/);
    assert.doesNotMatch(f.fix, /\boff\b/);
  });

  test('the retired `off` and `etching` are reported like any other unknown value', () => {
    for (const v of ['off', 'etching']) {
      const r = lint(`---\nmarp: true\nchart-finish: ${v}\n---\n\n## A\n`);
      assert.ok(r.findings.some((x) => x.rule === 'unknown-chart-finish'), v);
    }
  });

  test('a known value, a commented value and no value are silent', () => {
    for (const fm of ['chart-finish: tone\n', 'chart-finish: etch # line\n', 'chart-finish: pigment\n', '']) {
      const r = lint(`---\nmarp: true\n${fm}---\n\n## A\n`);
      assert.equal(r.findings.filter((x) => x.rule === 'unknown-chart-finish').length, 0, fm);
    }
  });
});
