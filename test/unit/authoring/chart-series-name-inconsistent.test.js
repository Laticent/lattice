// `chart-series-name-inconsistent`: a nested chart list repeats each series name under every group, so a
// name spelled two ways draws two series with no error (followups.d/2746-p2). The rule warns on the
// deviating row, names the intended spelling, and fixes it; it stays silent on different series.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');

const vocab = buildVocab(loadAll(path.join(__dirname, '../../../lib/components')));
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const found = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-series-name-inconsistent');

const CHARTS = ['bar', 'line', 'stacked-bar', 'slope', 'radar'];
const typo = (cls) => deck(cls, '- FY23\n  - Licenses `{18}`\n  - Services `{6}`\n- FY24\n  - Licences `{19}`\n  - Services `{7}`');

describe('a series name spelled two ways across groups', () => {
  for (const cls of CHARTS) {
    test(`${cls}: warns on the deviating row and names the intended spelling`, () => {
      const [f, ...rest] = found(typo(cls));
      assert.equal(rest.length, 0);
      assert.equal(f.severity, 'warning');
      assert.equal(f.classToken, cls);
      assert.equal(f.line, '- Licences `{19}`');
      assert.match(f.message, /`Licences` is spelled `Licenses`/);
      assert.deepEqual(f.replace, { from: 'Licences', to: 'Licenses' });
      assert.equal(f.autofixable, true);
    });
    test(`${cls}: the fix rewrites the name and keeps the record`, () => {
      const fixed = lintCore.applyAllFixes(typo(cls), vocab);
      assert.match(fixed, /- Licenses `\{19\}`/);
      assert.equal(found(fixed).length, 0);
    });
  }
  test('case and spacing alone are drift', () => {
    const f = found(deck('bar', '- A\n  - Net Revenue `{1}`\n- B\n  - net  revenue `{2}`'));
    assert.equal(f.length, 1);
    assert.equal(f[0].replace.to, 'Net Revenue');
  });
  test('the spelling under more groups wins, not the first', () => {
    const f = found(deck('line', '- A\n  - Licences `{1}`\n- B\n  - Licenses `{2}`\n- C\n  - Licenses `{3}`'));
    assert.deepEqual(f.map((x) => x.replace), [{ from: 'Licences', to: 'Licenses' }]);
  });
  test('the old pill form is covered too', () => {
    assert.equal(found(deck('bar', '- A\n  - Sales `1`\n- B\n  - Sale `2`')).length, 1);
  });
});

describe('silent on genuinely different series', () => {
  test('two series that sit side by side in every group', () => {
    assert.equal(found(deck('bar', '- A\n  - Plan A `{1}`\n  - Plan B `{2}`\n- B\n  - Plan A `{3}`\n  - Plan B `{4}`')).length, 0);
  });
  test('names that differ only in digits', () => {
    assert.equal(found(deck('line', '- A\n  - Q1 `{1}`\n- B\n  - Q2 `{2}`\n- C\n  - Q1 `{3}`')).length, 0);
  });
  test('unrelated names', () => {
    assert.equal(found(deck('bar', '- A\n  - Alpha `{1}`\n- B\n  - Zebra `{2}`')).length, 0);
  });
  test('a flat list, and a chart that is not a series chart', () => {
    assert.equal(found(deck('bar', '- Licenses `{1}`\n- Licences `{2}`')).length, 0);
    assert.equal(found(deck('piechart', '- A\n  - Licenses `{1}`\n- B\n  - Licences `{2}`')).length, 0);
  });
  test('a series table is not read', () => {
    assert.equal(found(deck('bar', '| | Licenses | Licences |\n|---|---|---|\n| A | 1 | 2 |')).length, 0);
  });
  test('detail below the series rows is not a series name', () => {
    assert.equal(found(deck('bar', '- A\n  - Sales `{1}`\n    - Licenses note\n- B\n  - Sales `{2}`\n    - Licences note')).length, 0);
  });
});
