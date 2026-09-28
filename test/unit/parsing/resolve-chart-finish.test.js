/**
 * Unit: lib/core/resolve-chart-finish.js — the `chart-finish:` register
 * (engineering/chart-styling.md §3). Pins the vocabulary, the opt-in default (no key and
 * `off` stamp nothing, so no existing deck changes), both render paths' wiring, the
 * per-slide override and opt-out through the real engine, and the lint rule for a typo.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHART_FINISH_NAMES, CHART_FINISHES, CHART_FINISH_TOKENS,
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

describe('chart-finish: the vocabulary', () => {
  test('three finishes plus off; off is classless', () => {
    assert.deepEqual([...CHART_FINISH_NAMES], ['off', 'pigment', 'etching', 'tone']);
    assert.deepEqual([...CHART_FINISHES], ['pigment', 'etching', 'tone']);
    assert.equal(chartFinishClass('off'), '');
    assert.equal(chartFinishClass('Tone '), 'chart-finish-tone');
    assert.equal(chartFinishClass('tonal'), '');
    assert.equal(chartFinishClass(undefined), '');
  });

  test('every token carries the chart-finish- prefix, so none collides with the backdrop `finish-*`', () => {
    assert.deepEqual([...CHART_FINISH_TOKENS], ['chart-finish-pigment', 'chart-finish-etching', 'chart-finish-tone', 'chart-finish-off']);
    for (const t of CHART_FINISH_TOKENS) assert.ok(isChartFinishToken(t));
    assert.ok(!isChartFinishToken('finish-atrium'));
  });

  test('the front-matter read strips a trailing comment and quotes', () => {
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: tone  # restrained\n---\n'), 'tone');
    assert.equal(readFrontMatterChartFinish('---\nchart-finish: "etching"\n---\n'), 'etching');
    assert.equal(readFrontMatterChartFinish('---\ntheme: indaco\n---\n'), null);
    assert.equal(chartFinishClassFromSource('---\nchart-finish: pigment\n---\n'), 'chart-finish-pigment');
    assert.ok(isKnownChartFinish('OFF') && !isKnownChartFinish('matte'));
  });
});

describe('chart-finish: both render paths', () => {
  test('the markdown-it plugin and the runtime stamp and evict through the kernel', () => {
    // HARD RULE #1: each path builds its own deck-token list, so a register wired into one
    // renders two decks from one source.
    for (const rel of ['lib/integrations/markdown-it/plugins.js', 'lib/runtime/index.js']) {
      const src = read(rel);
      assert.match(src, /chartFinishClass\(/, `${rel} resolves the register through the kernel`);
      assert.match(src, /\.\.\.chartFinishTokens/, `${rel} appends the token to the deck list`);
      assert.match(src, /isChartFinishToken\(t\)/, `${rel} evicts the deck token when a slide names its own`);
    }
  });

  const deck = (fm) => `---\nmarp: true\n${fm}---\n\n<!-- _class: bar -->\n\n## A\n\n- A \`3\`\n\n---\n\n` +
    '<!-- _class: bar chart-finish-etching -->\n\n## B\n\n- A `3`\n\n---\n\n<!-- _class: bar chart-finish-off -->\n\n## C\n\n- A `3`\n';

  test('the deck stamps every slide; a slide token overrides; chart-finish-off opts one out', () => {
    const [a, b, c] = classesOf(deck('chart-finish: tone\n'));
    assert.ok(a.includes('chart-finish-tone'));
    assert.ok(b.includes('chart-finish-etching') && !b.includes('chart-finish-tone'));
    assert.ok(c.includes('chart-finish-off') && !c.includes('chart-finish-tone'));
  });

  test('no key and `off` stamp nothing — an existing deck is untouched', () => {
    for (const fm of ['', 'chart-finish: off\n']) {
      const [a] = classesOf(deck(fm));
      assert.ok(!a.some((t) => t.startsWith('chart-finish')), `${JSON.stringify(fm)} stamped ${a.join(' ')}`);
    }
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
    assert.match(f.fix, /off, pigment, etching, tone/);
  });

  test('a known value, a commented value and no value are silent', () => {
    for (const fm of ['chart-finish: tone\n', 'chart-finish: etching # line\n', '']) {
      const r = lint(`---\nmarp: true\n${fm}---\n\n## A\n`);
      assert.equal(r.findings.filter((x) => x.rule === 'unknown-chart-finish').length, 0, fm);
    }
  });
});
