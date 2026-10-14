// A value pill shaped like a number but not one (`--5`, `(5`, `1,2,3`, `1.2.3.4x`): the shared
// number reader refuses it, every chart reads it as no value, the narrator says it as typed, and
// lint names it (`chart-value-malformed`). Before, each became a DIFFERENT number with no warning
// (followups.d/2609-p2). The picture, the voice and the lint are pinned together because the three
// must agree (HARD RULE #1).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const { isValuePill, parseValue, signedValue, spokenValue } = require('../../../lib/core/chart-values.js');

const vocab = buildVocab(loadAll(path.join(__dirname, '../../../lib/components')));
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const deck = (...slides) => `---\nmarp: true\n---\n\n${slides.join('\n---\n\n')}`;
const findings = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-value-malformed');
const html = (src) => { const o = engine.render(src, {}); return typeof o === 'string' ? o : o.html; };
const values = (h) => [...h.matchAll(/data-label="([^"]*)" data-value="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`);

const MALFORMED = ['--5', '+-5', '(-5)', '(5', '5)', '5M)', '1,2,3', '1.2.3.4x', '12.5.3', '1,234,5678', '5.'];

describe('chart-values reads a malformed number as no number', () => {
  for (const s of MALFORMED) {
    test(JSON.stringify(s), () => {
      assert.equal(isValuePill(s), false);
      assert.ok(Number.isNaN(parseValue(s)), `parseValue(${s})`);
      assert.ok(Number.isNaN(signedValue(s).value), `signedValue(${s})`);
      // Said as typed: the spoken-text reader would turn `1,2,3` into "one hundred twenty-three".
      assert.equal(spokenValue(s, () => 'CONVERTED'), s);
    });
  }
  test('U+2212 behind a currency is a minus on the lenient path too (#2287)', () => {
    assert.equal(parseValue('$\u22120.8M approx'), -800000);
    assert.equal(signedValue('$\u22120.8M approx').negative, true);
  });
  test('the lenient read of prose with a figure in it is unchanged', () => {
    assert.equal(parseValue('grew 3.5%, margin 12%'), 3.5);
    assert.equal(parseValue('240,000 views'), 240000);
    assert.equal(parseValue('((5))'), -5);
  });
});

describe('a chart draws no value for it, and the narrator says it as typed', () => {
  const src = deck(slide('bar', '- North `--5`\n- South `12`\n- East `1,2,3`\n- West `40`'));
  test('the bar chart draws only the readable rows', () => {
    assert.deepEqual(values(html(src)), ['South=12', 'West=40']);
  });
  test('the narration states no figure the picture does not draw', () => {
    const said = narrateChart(slide('bar', '- North `--5`\n- South `12`\n- East `1,2,3`\n- West `40`'));
    assert.match(said, /North, --5\./);
    assert.match(said, /East, 1,2,3\./);
    assert.doesNotMatch(said, /negative five|one hundred twenty-three/);
  });
});

describe('bullet keeps a malformed actual in its slot', () => {
  const src = deck(slide('bullet', '- Revenue `(5` `10`\n- Margin `7` `10`'));
  test('the target is not promoted to the actual, and no NaN is printed', () => {
    const h = html(src);
    assert.deepEqual(values(h), ['Margin=7']);
    assert.doesNotMatch(h, /NaN/);
    assert.match(h, /<desc[^>]*>Revenue \(5;/);
  });
});

describe('lint: chart-value-malformed', () => {
  test('names each malformed value in a chart\'s rows, with the reason', () => {
    const f = findings(deck(slide('bar', '- North `--5`\n- South `12`\n- East `1,2,3`'), slide('piechart', '- A `(5`\n- B `12`')));
    assert.deepEqual(f.map((x) => [x.slide, x.line]), [[1, '`--5`'], [1, '`1,2,3`'], [2, '`(5`']]);
    assert.match(f[0].message, /two signs/);
    assert.match(f[1].message, /digits are not one number/);
    assert.match(f[2].message, /parentheses do not pair/);
    assert.equal(f[0].severity, 'warning');
  });
  test('reads a table chart\'s cells', () => {
    const f = findings(deck(slide('heatmap', '| | Q1 | Q2 |\n| --- | --- | --- |\n| North | `5` | `1.2.3` |')));
    assert.deepEqual(f.map((x) => x.line), ['`1.2.3`']);
  });
  test('stays quiet on a chart that reads its pills as text: a dotted date, a version', () => {
    assert.deepEqual(findings(deck(
      slide('timeline-list', '1. `15.03.2026` Launch\n2. `01.06.2026` Scale'),
      slide('kanban', '- Doing\n  - Ship `1.2.0`'),
    )), []);
  });
  test('stays quiet on a kicker, prose code, a non-chart slide and well-formed values', () => {
    assert.deepEqual(findings(deck(
      slide('bar', '`v1.2.3 · 127.0.0.1`\n\n- North `1,234.5`\n- South `1.234,5`\n- East `(12)`\n- West `12 000`\n\nSee `1,2,3` below.'),
      slide('bullets', '- Version `1.2.3`'),
    )), []);
  });
});
