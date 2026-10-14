// tools/chart-authoring-census.mjs counts how chart slides are written today against the chart
// authoring model (engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §10, phase 1). Its
// numbers decide phase 4's codemod scope, so its classifier is pinned here on small slides whose
// right answer is known by reading them.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

let mod;
const load = async () => { mod ??= await import('../../../tools/chart-authoring-census.mjs'); return mod; };
async function slide(chart, src) {
  const { blank, countSlide } = await load();
  const s = blank();
  countSlide(chart, [chart], src, s, 'test:1');
  return s;
}

describe('chart-authoring-census', () => {
  test('span kinds: a value, a record, a description, an axis bracket, a mark, text', async () => {
    const { spanKind } = await load();
    assert.equal(spanKind('$4.2M'), 'value');
    assert.equal(spanKind('12,000'), 'value');
    assert.equal(spanKind('{$420k, 18%}'), 'record');
    assert.equal(spanKind('{> a note}'), 'description');
    assert.equal(spanKind('[Cost, Reach]'), 'bracket');
    assert.equal(spanKind('[x]'), 'mark');
    assert.equal(spanKind('on-track'), 'text');
    assert.equal(spanKind('\\{LIVE}'), 'escaped');
  });

  test('a list chart: a bare value is a wrap, a value-less sublist is detail, a comma number is a rewrite', async () => {
    const s = await slide('funnel', '## A\n\n- Visitors `12,000`\n  - Mostly inbound\n- Signups `4 800`\n');
    assert.equal(s.rows, 2);
    assert.equal(s.rewrite.wrap, 2);
    assert.equal(s.rewrite.wrapText, 1, '`4 800` is not a value today: it reads as text, and still needs its record');
    assert.equal(s.rewrite.detailToQuote, 1);
    assert.equal(s.rewrite.number, 1);
  });

  test('a nested data row is a series point; a value-less row with data below it is a group, not detail', async () => {
    const s = await slide('radar', '## A\n\n- Meridian\n  - Core\n    - Speed `9`\n    - Price `7`\n  - Edge\n    - Reach `4`\n');
    assert.equal(s.nestedGroups, 2);
    assert.equal(s.nestedDetail, 0);
    assert.equal(s.groupedSeriesSlides, 1, 'series, then group, then axis: no GFM table holds it');
    assert.equal(s.rewrite.listToTable, 0);
  });

  test('a series slide: its detail becomes a `{> …}` cell, and a span on a group row has no cell', async () => {
    const s = await slide('slope', '## A\n\n- Northwind `fail`\n  - 2023 `31%`\n  - 2026 `24%`\n  - Lost two renewals\n');
    assert.equal(s.rewrite.listToTable, 1);
    assert.equal(s.rewrite.detailToCell, 1);
    assert.equal(s.rewrite.detailToQuote, 0);
    assert.equal(s.rewrite.groupSpan, 1);
  });

  test('bullet: a named nested row folds into the record as a parameter', async () => {
    const s = await slide('bullet', '## A\n\n- New ARR `4.2M` `5.0M`\n  - Band `3.0M`\n  - Floor `1.0M`\n');
    assert.equal(s.rewrite.merge, 1);
    assert.equal(s.rewrite.namedToParam, 2);
    assert.deepEqual(s.named, { Band: 1, Floor: 1 });
  });

  test('two spans on a row are one merge, recorded by kind', async () => {
    const s = await slide('progress', '## A\n\n- Intake `92%` `on-track`\n');
    assert.equal(s.rewrite.merge, 1);
    assert.deepEqual(s.secondSpan, { 'value + text': 1 });
  });

  test('a column-0 `>` between two lists is counted; one indented under its item is a description', async () => {
    const lazy = await slide('flowchart', '## A\n\n- Start\n\n> a note\n\n- End\n');
    assert.equal(lazy.column0Quotes, 1);
    const indented = await slide('flowchart', '## A\n\n- Start\n  > a note\n- End\n');
    assert.equal(indented.column0Quotes, 0);
    assert.equal(indented.quoteDescriptions, 1);
  });

  test('spans are counted by slot: a kicker above the data is not a row', async () => {
    const s = await slide('bar', '`Revenue · FY26`\n\n## A\n\n- EMEA `4.2`\n\nSource `ERP`\n');
    assert.equal(s.slot.aboveOther, 1);
    assert.equal(s.slot.rowLead, 1);
    assert.equal(s.slot.below, 1);
  });

  test('a grid table: plain numbers, empty cells and a `note=` span', async () => {
    const s = await slide('heatmap', '## A\n\n| | M0 | M1 |\n|---|--:|--:|\n| Jan | 100 | 62 `note=dip` |\n| Feb | 100 | |\n');
    assert.equal(s.cells, 4);
    assert.equal(s.cellEmpty, 1);
    assert.equal(s.cellNoteSpan, 1);
    assert.equal(s.cellPlainNumber, 3);
  });
});
