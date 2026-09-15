/**
 * Unit: `ensureRunFooterCell` (lib/core/auto-split.js) — every page of a run carries a
 * footer Cell, whatever its Frame.
 *
 * A sovereign Frame suppresses the footer Cell because a STANDALONE slide needs no
 * furniture. A split RUN is not standalone, and every piece of its wayfinding docks INTO
 * that Cell — `footer-dock.js` the forward pointer, `progress.transform.js` the rail,
 * `buildFooterCell` the page number. Without it all three degrade to section level
 * (`footer-dock.js:32` is literally `if (at < 0) return html + mark`), which is how the
 * pointer became a third COLUMN of `split-panel`'s panel flex row.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { ensureRunFooterCell } = require('../../../lib/core/auto-split');

const sec = (attrs, inner) => `<section data-lattice-slide="1" ${attrs}>${inner}</section>`;
const CELLS = (html) => (html.match(/<div class="cell-footer"/g) || []).length;
const PAGES = (html) => (html.match(/<span class="lat-pagination">/g) || []).length;

describe('ensureRunFooterCell', () => {
  test('a run page with no Cell gets one', () => {
    const out = ensureRunFooterCell(sec('data-split-run="r1" data-lattice-pagination="2.3"', '<p>body</p>'));
    assert.equal(CELLS(out), 1);
    assert.match(out, /<div class="cell-footer"><span class="lat-pagination">2\.3<\/span><\/div>/);
  });

  test('a page NOT in a run is untouched — byte-identical', () => {
    const src = sec('data-lattice-pagination="2"', '<p>body</p>');
    assert.equal(ensureRunFooterCell(src), src);
  });

  test('a run page that ALREADY has a Cell is left alone — no second Cell', () => {
    const src = sec('data-split-run="r1" data-lattice-pagination="2"',
      '<p>body</p><div class="cell-footer"><span class="lat-pagination">2</span></div>');
    assert.equal(ensureRunFooterCell(src), src);
    assert.equal(CELLS(ensureRunFooterCell(src)), 1);
  });

  test('THE PAGE NUMBER IS NEVER DRAWN TWICE — a section-level span is moved, not duplicated', () => {
    // Since #2206 the pagination Tile mints a section-level span on any paginated frame
    // without one, so on these pages it is already a sibling. Building the Cell around a
    // fresh span would draw the number once in the corner and once in the band, and the
    // Tile's own idempotence guard cannot repair it — that guard is a descendant query, so
    // a span inside the Cell still counts as present and the Tile no-ops.
    const out = ensureRunFooterCell(sec('data-split-run="r1" data-lattice-pagination="4"',
      '<p>body</p><span class="lat-pagination">4</span>'));
    assert.equal(PAGES(out), 1, 'exactly one page number');
    assert.match(out, /<div class="cell-footer"><span class="lat-pagination">4<\/span><\/div>/);
    assert.doesNotMatch(out, /<\/p><span class="lat-pagination">/, 'the section-level span is gone');
  });

  test('`paginate: false` still gets a Cell — the rail needs somewhere to dock', () => {
    // `buildFooterCell` returns '' with neither text nor a number, so the fallback matters:
    // without it a run with no page numbers would have no Cell and the rail would degrade
    // back to section level, which is the whole defect.
    const out = ensureRunFooterCell(sec('data-split-run="r1"', '<p>body</p>'));
    assert.equal(CELLS(out), 1);
    assert.equal(PAGES(out), 0);
  });

  test('idempotent — a second pass adds nothing', () => {
    const once = ensureRunFooterCell(sec('data-split-run="r1" data-lattice-pagination="2"', '<p>b</p>'));
    assert.equal(ensureRunFooterCell(once), once);
  });

  test('a document with no sections passes through', () => {
    assert.equal(ensureRunFooterCell('<html><body></body></html>'), '<html><body></body></html>');
  });

  test('every page of a multi-page run gets its OWN Cell, with its own number', () => {
    const doc = sec('data-split-run="r1" data-lattice-pagination="2"', '<p>a</p>')
      + '<section data-lattice-slide="2.2" data-split-run="r1" data-lattice-pagination="2.2"><p>b</p></section>';
    const out = ensureRunFooterCell(doc);
    assert.equal(CELLS(out), 2);
    assert.match(out, />2<\/span>/);
    assert.match(out, />2\.2<\/span>/);
  });
});
