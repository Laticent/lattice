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

describe('review findings (checker, 2026-10-22)', () => {
  const fixes = (src) => lintCore.applyAllFixes(src, vocab);
  test('the fix carries the text as written, so it applies (double space, bold, underscore, trailing text)', () => {
    for (const bad of ['net  revenue `{2}`', 'Net **Revenu** `{2}`', 'net_ref `{2}`', 'Sale `{2}` EMEA']) {
      const good = bad.startsWith('Net') ? 'Net **Revenue** `{1}`' : bad.startsWith('net_') ? 'netref `{1}`' : bad.startsWith('Sale') ? 'Sales `{1}`' : 'net revenue `{1}`';
      const src = deck('bar', `- A\n  - ${good}\n- B\n  - ${bad}`);
      const fixed = fixes(src);
      assert.equal(found(fixed).length, 0, bad);
    }
  });
  test('Fix all does not stall: a second slide still gets fixed', () => {
    const two = [deck('bar', '- A\n  - Net Revenue `{1}`\n- B\n  - net  revenue `{2}`'), deck('bar', '- A\n  - Licenses `{1}`\n- B\n  - Licences `{2}`').replace(/^---\nmarp: true\n---\n\n/, '')].join('\n---\n\n');
    assert.equal(found(fixes(two)).length, 0);
  });
  test('a note row (no number last) is not a series name', () => {
    assert.equal(found(deck('line', '- Q1 `{4}`\n  - New hire\n- Q2 `{5}`\n  - New hires')).length, 0);
  });
  test('series missing from some groups are not merged', () => {
    assert.equal(found(deck('bar', '- Phase 1\n  - Plan A `{3}`\n  - Baseline `{2}`\n- Phase 2\n  - Plan B `{4}`\n  - Baseline `{2}`')).length, 0);
    assert.equal(found(deck('bar', '- 2023\n  - UK `{3}`\n- 2024\n  - US `{1}`')).length, 0);
    assert.equal(found(deck('stacked-bar', '- Phase 1\n  - A `{3}`\n- Phase 2\n  - B `{4}`')).length, 0);
  });
  test('only the first list of the slide is read', () => {
    const src = deck('bar', '- A\n  - Sales `{1}`\n- B\n  - Sales `{2}`\n\nSource notes:\n\n- Method\n  - Sale `{1}`');
    assert.equal(found(src).length, 0);
  });
  test('many similar names neither explode nor crash', () => {
    const rows = Array.from({ length: 800 }, (_, i) => `- G${i}\n  - Series${'x'.repeat(i % 7)}${i} \`{1}\``).join('\n');
    assert.equal(found(deck('bar', rows)).length, 0); // past the name cap the pair scan is skipped, and the findings are linear in rows either way
  });
  test('one misspelled row gets one finding', () => {
    const f = found(deck('bar', '- A\n  - Licenses `{1}`\n- B\n  - Licenses `{2}`\n- C\n  - Licences `{3}`\n- D\n  - Lisences `{4}`'));
    assert.equal(f.filter((x) => x.line.startsWith('- Lisences')).length, 1);
    assert.equal(f.filter((x) => x.line.startsWith('- Lisences'))[0].replace.to, 'Licenses');
  });
  test('a longer fence around a shorter one does not break the scan', () => {
    const src = deck('bar', '- A\n  - Licenses `{1}`\n- B\n  - Licences `{2}`\n\n````\n```\n````');
    assert.equal(found(src).length, 1);
  });
});
