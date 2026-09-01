/**
 * buildSplitVerdict — extent + legibility → the verdict `resplitDoc` eats.
 *
 * These are the branch tests the logic never had while it lived inside
 * `lattice-emulator.js`'s `page.evaluate`, where nothing could call it. The
 * end-to-end evidence that the extraction changed nothing is the emulator
 * comparison in the PR (splitting decks render byte-identically); this file is
 * what keeps each BRANCH honest from here on.
 *
 * jsdom does no layout, so geometry is stubbed per element — the same shape
 * overflow-probe.test.js uses for its own pure-dims fakes. The probes are
 * injected (that is the contract), so a test supplies them directly rather than
 * reproducing what they measure.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildSplitVerdict, SPLIT_VERDICT_SRC } = require('../../../lib/core/split-verdict');

const OPTS = {
  clipSel: '.cell-stage',
  ignoreSel: '.decor',
  tol: 12,
  floorRatio: 0.5,
  structuralCarousel: ['compare-code'],
  paginatorCarousel: ['compare-table'],
};

/** A slide whose geometry is dictated rather than laid out. */
function slide(html, { clientH = 1000, geom = {} } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const { window } = dom;
  const s = window.document.querySelector('section');
  const size = (el, { scrollH = 0, rectH = 0, scrollW = 0, clientW = 0, display, dir, cols } = {}) => {
    Object.defineProperty(el, 'scrollHeight', { value: scrollH, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: scrollW, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: clientW, configurable: true });
    el.getBoundingClientRect = () => ({ height: rectH, width: clientW, top: 0, bottom: rectH, left: 0, right: clientW });
    if (display) el.__style = { display, flexDirection: dir || 'row', gridTemplateColumns: cols || 'none' };
  };
  Object.defineProperty(s, 'clientHeight', { value: clientH, configurable: true });
  for (const [sel, dims] of Object.entries(geom)) {
    for (const el of s.querySelectorAll(sel)) size(el, dims);
  }
  // getComputedStyle is only consulted for the inline-flow test.
  window.getComputedStyle = (el) => el.__style
    || { display: 'block', flexDirection: 'row', gridTemplateColumns: 'none' };
  global.getComputedStyle = window.getComputedStyle;
  return s;
}

const probes = ({ over = false, vOver = false, scrollH = 1000, clientH = 1000, leg = null }) => ({
  probeSectionOverflow: () => ({ over, vOver, scrollH, clientH }),
  probeFigureLegibility: () => leg,
});

test('buildSplitVerdict', async (t) => {
  await t.test('a slide that fits and is legible yields no verdict at all', () => {
    const s = slide('<section class="checklist"><ul><li>a</li></ul></section>');
    assert.equal(buildSplitVerdict(s, probes({ over: false }), OPTS), null);
  });

  await t.test('illegible while its box FITS is reported, and is never splittable', () => {
    // A viewBox figure shrinks its own labels rather than overflowing, so the
    // extent probe is structurally blind to it — and a figure has no seam.
    const s = slide('<section class="radar"><svg></svg></section>');
    const v = buildSplitVerdict(s, probes({ over: false, leg: { under: true, count: 3 } }), OPTS);
    assert.equal(v.canSplit, false);
    assert.equal(v.ratio, 1);
    assert.ok(v.illegible, 'the legibility finding rides on the record');
  });

  await t.test('a structural carousel is splittable on ANY overflow, including sideways', () => {
    // cover-code re-authors two panels into one-per-page, so a purely HORIZONTAL
    // overflow is still actionable.
    const s = slide('<section class="compare-code"><pre></pre></section>');
    const v = buildSplitVerdict(s, probes({ over: true, vOver: false, scrollH: 1400 }), OPTS);
    assert.equal(v.canSplit, true, 'a width-only overflow must still split a structural carousel');
  });

  await t.test('a paginator carousel splits on vertical overflow only', () => {
    const s = slide('<section class="compare-table"><table></table></section>');
    const wide = buildSplitVerdict(s, probes({ over: true, vOver: false, scrollH: 1400 }), OPTS);
    assert.equal(wide.canSplit, false,
      'row-splitting a too-WIDE table narrows nothing and balloons the deck');
    const tall = buildSplitVerdict(s, probes({ over: true, vOver: true, scrollH: 1400 }), OPTS);
    assert.equal(tall.canSplit, true);
  });

  await t.test('the ordinary vertical case splits, and sizes the cut from the COLLECTION', () => {
    // The slide wants 2000 in a 1000 box; the list is 1800 of that, so the
    // non-collection content is 200 and a body page has 800 of headroom.
    // splitRatio is the COLLECTION against its own headroom — not the slide's
    // ratio — which is what makes the loop converge instead of re-cutting a
    // slide that a tall non-list block keeps over the box.
    const s = slide(
      '<section class="checklist"><div class="cell-stage"><ul></ul></div></section>',
      { clientH: 1000, geom: { ul: { scrollH: 1800, rectH: 1800 } } });
    const v = buildSplitVerdict(s, probes({ over: true, vOver: true, scrollH: 2000 }), OPTS);
    assert.equal(v.canSplit, true);
    assert.equal(v.ratio, 2, 'ratio is the whole slide');
    assert.equal(v.splitRatio, 1800 / 800, 'splitRatio is the collection against its headroom');
  });

  await t.test('the cut never asks for fewer than two pages', () => {
    // A slide that overflows by a hair still has to become at least two pages;
    // `Math.max(2, …)` is the floor, and without it the kernel would be handed a
    // ratio below 1 and told to split into one.
    const s = slide(
      '<section class="checklist"><div class="cell-stage"><ul></ul></div></section>',
      { clientH: 1000, geom: { ul: { scrollH: 1020, rectH: 1020 } } });
    const v = buildSplitVerdict(s, probes({ over: true, vOver: true, scrollH: 1040 }), OPTS);
    assert.equal(v.splitRatio, 2, 'the floor holds where the raw ratio is 1.05');
  });

  await t.test('a slide the split cannot rescue is VETOED, not cut', () => {
    // A tall non-collection block with an incidental list: splitting copies the
    // block onto every piece and never fits, so it belongs to the ring.
    const s = slide(
      '<section class="checklist"><div class="cell-stage"><ul></ul></div></section>',
      { clientH: 1000, geom: { ul: { scrollH: 60, rectH: 60 } } });
    const v = buildSplitVerdict(s, probes({ over: true, vOver: true, scrollH: 2400 }), OPTS);
    assert.equal(v.canSplit, false, 'headroom is negative — the list is not the driver');
  });

  await t.test('an INLINE-flow collection splits on horizontal overflow; a table does not', () => {
    // list-steps lays its <ol> out as a row, so fewer members per page IS a
    // narrower row. A <table>'s width comes from its columns, so it is excluded
    // by construction.
    const row = slide(
      '<section class="list-steps"><div class="cell-stage"><ol></ol></div></section>',
      { clientH: 1000, geom: { ol: { scrollH: 300, rectH: 300, scrollW: 2700, clientW: 900, display: 'flex', dir: 'row' } } });
    const v = buildSplitVerdict(row, probes({ over: true, vOver: false, scrollH: 1000 }), OPTS);
    assert.equal(v.canSplit, true, 'a row-flowed collection that overflows sideways is splittable');
    assert.equal(v.splitRatio, 3, 'the cut is sized from the WIDTH ratio (2700/900), not the height');

    const table = slide(
      '<section class="list-tabular"><div class="cell-stage"><table></table></div></section>',
      { clientH: 1000, geom: { table: { scrollH: 300, rectH: 300, scrollW: 2700, clientW: 900 } } });
    assert.equal(
      buildSplitVerdict(table, probes({ over: true, vOver: false, scrollH: 1000 }), OPTS).canSplit,
      false, 'a wide table is the counter-case the inline-flow test exists to exclude');
  });

  await t.test('the injectable source is self-contained', () => {
    // It is `.toString()`-injected into page.evaluate and (next) the runtime, so
    // a module-scope reference would throw only in the browser, at render time.
    assert.match(SPLIT_VERDICT_SRC, /^function buildSplitVerdict\(/);
    assert.ok(!/\brequire\s*\(/.test(SPLIT_VERDICT_SRC), 'no require() survives injection');
    const rebuilt = new Function(`return (${SPLIT_VERDICT_SRC})`)();
    const s = slide('<section class="checklist"><ul><li>a</li></ul></section>');
    assert.equal(rebuilt(s, probes({ over: false }), OPTS), null,
      'the injected copy behaves like the imported one');
  });
});
