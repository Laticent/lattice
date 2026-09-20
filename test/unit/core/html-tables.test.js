// HTML table walkers — the table twin of html-lists.js.
//
// These are the walkers `roadmap` grew privately and `heatmap` now needs for the
// cell VALUES rather than the markup. The arms hold the two properties a caller
// depends on: the splice is faithful (it replaces the table and nothing around
// it), and the head/body split works whether or not the source wrapped its rows.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');

const {
  extractFirstTable, spliceFirstTable, parseRowCells, parseRows, parseTable,
} = require('../../../lib/core/html-tables');

const md = new MarkdownIt({ html: true });
const TABLE = md.render([
  '|  | M0 | M1 |',
  '| --- | --: | --: |',
  '| Jan | 100 | 62 |',
  '| Feb | 100 |  |',
].join('\n')).trim();   // markdown-it ends the block with a newline; it is not part of the table

describe('extracting a table', () => {
  test('finds the table and reports where it sits', () => {
    const ext = extractFirstTable(`<p>before</p>${TABLE}<p>after</p>`);
    assert.ok(ext.full.startsWith('<table'));
    assert.ok(ext.full.endsWith('</table>'));
    assert.doesNotMatch(ext.inner, /<\/?table/, 'inner must exclude the table tags');
  });

  test('no table is null, not a throw', () => {
    assert.equal(extractFirstTable('<p>nothing here</p>'), null);
    assert.equal(extractFirstTable(''), null);
    assert.equal(extractFirstTable(null), null);
  });
});

describe('splicing a table', () => {
  test('replaces the table and leaves its neighbours untouched', () => {
    const out = spliceFirstTable(`<p>before</p>${TABLE}<p>after</p>`, () => '<figure/>');
    assert.equal(out, '<p>before</p><figure/><p>after</p>');
  });

  test('a null build leaves the markup exactly as it was — the family contract', () => {
    // This is how a component declines data it cannot draw: the author gets the
    // table they wrote, not an error and not an empty figure.
    const src = `<p>before</p>${TABLE}`;
    assert.equal(spliceFirstTable(src, () => null), src);
  });

  test('no table at all is a pass-through', () => {
    assert.equal(spliceFirstTable('<p>x</p>', () => '<figure/>'), '<p>x</p>');
  });
});

describe('walking rows and cells', () => {
  test('reads every cell in document order, attributes and all', () => {
    const cells = parseRowCells('<tr><td>Jan</td><td style="text-align:right">100</td></tr>');
    assert.deepEqual(cells.map((c) => c.inner), ['Jan', '100']);
    assert.deepEqual(cells.map((c) => c.tag), ['td', 'td']);
  });

  test('keeps inline HTML inside a cell rather than flattening it', () => {
    const [cell] = parseRowCells('<tr><td>62 <code># why</code></td></tr>');
    assert.equal(cell.inner, '62 <code># why</code>');
  });

  test('an empty cell is present, not skipped', () => {
    // A blank crossing is data — "nobody measured this" — so the walker must
    // keep its position rather than closing the gap.
    const cells = parseRowCells('<tr><td>Feb</td><td>100</td><td></td></tr>');
    assert.equal(cells.length, 3);
    assert.equal(cells[2].inner, '');
  });

  test('parseRows returns one entry per row', () => {
    assert.equal(parseRows('<tr><td>a</td></tr><tr><td>b</td></tr>').length, 2);
  });
});

describe('splitting head from body', () => {
  test('uses thead/tbody when the renderer emits them', () => {
    const { head, rows } = parseTable(extractFirstTable(TABLE).full);
    assert.deepEqual(head.map((c) => c.inner), ['', 'M0', 'M1']);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].map((c) => c.inner), ['Jan', '100', '62']);
    assert.equal(rows[1][2].inner, '', 'the unmeasured crossing keeps its slot');
  });

  test('falls back to the FIRST row as the head when neither wrapper is present', () => {
    // Markdown's own contract — a table's first line is its header — so a table
    // assembled by hand or by another renderer still parses.
    const { head, rows } = parseTable(
      '<table><tr><th>x</th><th>M0</th></tr><tr><td>Jan</td><td>1</td></tr></table>',
    );
    assert.deepEqual(head.map((c) => c.inner), ['x', 'M0']);
    assert.equal(rows.length, 1);
  });

  test('an empty table yields empty head and rows rather than throwing', () => {
    const { head, rows } = parseTable('<table></table>');
    assert.deepEqual(head, []);
    assert.deepEqual(rows, []);
  });
});
