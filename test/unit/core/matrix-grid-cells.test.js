/**
 * Unit: the matrix-grid cell kernel (lib/core/matrix-grid-cells.js) and its
 * cross-path equivalence.
 *
 * The bracket marker is parsed twice — once by the markdown-it plugin on the
 * engine's render path, once by the runtime's DOM walk on the Marp-rendered
 * route. Before the kernel existed only the plugin had it, so matrix-grid cells
 * came out of any Marp render as literal `[x]` / `[-]` / `[ ]` text (#1256).
 * These tests pin the mapping and that both paths produce identical markup.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/core/matrix-grid-cells');
const latticeEngine = require('../../../lib/engine');

describe('matrix-grid cells — parse', () => {
  test('maps each marker to its shape', () => {
    assert.equal(kernel.parseCell('[x] Senior').shape, 'cell-filled');
    assert.equal(kernel.parseCell('[-]').shape, 'cell-outlined');
    assert.equal(kernel.parseCell('[ ]').shape, 'cell-empty');
  });

  test('keeps a label only on the filled cell — the others are position markers', () => {
    assert.equal(kernel.parseCell('[x] Senior').label, 'Senior');
    assert.equal(kernel.parseCell('[-] debris').label, '');
    assert.equal(kernel.parseCell('[ ] debris').label, '');
  });

  test('names the non-filled states for assistive tech, and only those', () => {
    assert.equal(kernel.parseCell('[x] Senior').stateLabel, '');
    assert.equal(kernel.parseCell('[-]').stateLabel, 'reachable');
    assert.equal(kernel.parseCell('[ ]').stateLabel, 'not applicable');
  });

  test('tolerates a padded marker gap (the bounded quantifier still matches)', () => {
    assert.equal(kernel.parseCell('[x]    Senior').label, 'Senior');
    assert.equal(kernel.parseCell('[x]Senior').label, 'Senior');
    assert.equal(kernel.parseCell('  [-]  ').shape, 'cell-outlined');
  });

  test('returns null for an ordinary label cell', () => {
    for (const t of ['Create', '', '  ', 'x', '[y] nope', 'text [x] mid']) {
      assert.equal(kernel.parseCell(t), null, `${JSON.stringify(t)} is not a marker`);
    }
  });

  test('cellHtml wraps label + hidden state name', () => {
    assert.equal(
      kernel.cellHtml(kernel.parseCell('[x] Senior')),
      '<span class="cell cell-filled">Senior</span>',
    );
    assert.equal(
      kernel.cellHtml(kernel.parseCell('[-]')),
      '<span class="cell cell-outlined"><span class="cell-sr-label">reachable</span></span>',
    );
  });
});

describe('matrix-grid cells — applyToDom', () => {
  const TABLE = '<table><tbody>'
    + '<tr><td>Create</td><td>[ ]</td><td>[-]</td><td>[x] Distinguished</td></tr>'
    + '</tbody></table>';
  const dom = (cls) => new JSDOM(`<article><section class="${cls}">${TABLE}</section></article>`).window.document;

  test('rewrites every marker cell and leaves the label column alone', () => {
    const doc = dom('matrix-grid');
    kernel.applyToDom(doc);
    const cells = [...doc.querySelectorAll('td')];
    assert.equal(cells[0].innerHTML, 'Create');
    assert.equal(cells[1].querySelector('.cell').className, 'cell cell-empty');
    assert.equal(cells[2].querySelector('.cell').className, 'cell cell-outlined');
    assert.equal(cells[3].querySelector('.cell').textContent, 'Distinguished');
  });

  test('is idempotent — the runtime re-runs it on every preview pass', () => {
    const doc = dom('matrix-grid');
    kernel.applyToDom(doc);
    const once = doc.querySelector('section').innerHTML;
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('section').innerHTML, once);
  });

  test('leaves a non-matrix-grid section alone', () => {
    const doc = dom('compare-table');
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('section').innerHTML, TABLE);
  });

  test('survives a null / non-DOM root', () => {
    assert.doesNotThrow(() => kernel.applyToDom(null));
    assert.doesNotThrow(() => kernel.applyToDom({}));
  });
});

describe('matrix-grid cells — the two render paths agree', () => {
  test("the engine's plugin output matches the DOM adapter's, cell for cell", () => {
    const deck = [
      '<!-- _class: matrix-grid -->', '',
      '## Levels', '',
      '| Verb | Self | Team |', '|---|---|---|',
      '| Create | [ ] | [x] Distinguished |', '| Apply | [-] | [ ] |', '',
    ].join('\n');
    const engineHtml = latticeEngine.createEngine().render(deck).html;
    const engineCells = [...engineHtml.matchAll(/<span class="cell ([\w-]+)">([^<]*)/g)]
      .map((m) => `${m[1]}:${m[2]}`);
    assert.ok(engineCells.length >= 4, 'the engine path emitted cells at all');

    // Same table, but as the RAW markup marp-core produces (no Lattice plugins).
    const doc = new JSDOM(
      '<article><section class="matrix-grid"><table><tbody>'
      + '<tr><td>Create</td><td>[ ]</td><td>[x] Distinguished</td></tr>'
      + '<tr><td>Apply</td><td>[-]</td><td>[ ]</td></tr>'
      + '</tbody></table></section></article>',
    ).window.document;
    kernel.applyToDom(doc);
    const domCells = [...doc.querySelectorAll('.cell')]
      .map((el) => `${el.className.replace('cell ', '')}:${el.querySelector('.cell-sr-label') ? '' : el.textContent}`);
    assert.deepEqual(domCells, engineCells);
  });
});
