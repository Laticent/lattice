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
  // getComputedStyle is only consulted for the inline-flow tests. Restored by the
  // caller — it is a GLOBAL, and leaving it installed leaks into every later test
  // file in the same process.
  window.getComputedStyle = (el) => el.__style
    || { display: 'block', flexDirection: 'row', gridTemplateColumns: 'none' };
  const priorGCS = global.getComputedStyle;
  global.getComputedStyle = window.getComputedStyle;
  restoreGCS = () => { global.getComputedStyle = priorGCS; };
  return s;
}

/** Set by `slide()`; the suite restores the global after every test. */
let restoreGCS = () => {};

const probes = ({ over = false, vOver = false, scrollH = 1000, clientH = 1000, leg = null }) => ({
  probeSectionOverflow: () => ({ over, vOver, scrollH, clientH }),
  probeFigureLegibility: () => leg,
});

test('buildSplitVerdict', async (t) => {
  // `slide()` installs a getComputedStyle stub on the GLOBAL, because the function
  // under test calls it as a page global (that is the contract — it is
  // `.toString()`-injected into a browser). Restore it after every subtest so it
  // cannot leak into another file sharing this process.
  t.afterEach(() => restoreGCS());

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
      // `display: flex; flex-direction: row` DELIBERATELY, so the only thing that
      // can refuse this table is the `tagName === 'TABLE'` carve-out itself. The
      // first version of this fixture left `display` unset, which made
      // `inlineFlow` false by fall-through — it asserted the right answer while
      // never reaching the guard it names, and deleting the carve-out kept it
      // green.
      { clientH: 1000, geom: { table: { scrollH: 300, rectH: 300, scrollW: 2700, clientW: 900, display: 'flex', dir: 'row' } } });
    assert.equal(
      buildSplitVerdict(table, probes({ over: true, vOver: false, scrollH: 1000 }), OPTS).canSplit,
      false, 'a wide table is the counter-case the inline-flow rule exists to exclude');
  });

  await t.test('the ENVELOPE HOIST buys headroom back, or the slide is wrongly vetoed', () => {
    // The 33 lines this pins are the correction with the sharpest recorded defect
    // behind them, and they had no coverage at all: the headroom must be measured
    // against the page the split will EMIT, not the one on screen. The envelope
    // hoists the framing lede to the cover and the trailing note off every body
    // page, so counting them as immovable under-reports the room a body page has.
    //
    // Here: a 1000 box, a slide wanting 1900, a list of 900, and 1000 of lede +
    // trailing note. Without the hoist, headroom = 1000 - (1900 - 900) = 0 and the
    // slide is VETOED — the measured failure, where the author's only apparent fix
    // was to delete the very content the envelope relocates. With it, headroom =
    // 1000 - (1900 - 900 - 1000) = 1000 and the slide splits.
    const withEnvelope = slide(
      '<section class="checklist"><div class="cell-stage">'
      + '<p class="lede">A long framing sentence that the envelope hoists to the cover.</p>'
      + '<ul></ul>'
      + '<div class="below-note">A trailing note the envelope keeps off every page but the last.</div>'
      + '</div></section>',
      { clientH: 1000, geom: {
        ul: { scrollH: 900, rectH: 900 },
        'p.lede': { scrollH: 500, rectH: 500 },
        '.below-note': { scrollH: 500, rectH: 500 },
      } });
    const v = buildSplitVerdict(withEnvelope, probes({ over: true, vOver: true, scrollH: 1900 }), OPTS);
    assert.equal(v.canSplit, true, 'the hoisted lede and note must not count against the headroom');

    // The eyebrow is a code-only <p> and is NOT hoisted, so it does not buy
    // headroom — the discrimination the lede loop makes by hand.
    const eyebrowOnly = slide(
      '<section class="checklist"><div class="cell-stage">'
      + '<p><code>eyebrow</code></p><ul></ul></div></section>',
      { clientH: 1000, geom: { ul: { scrollH: 900, rectH: 900 }, p: { scrollH: 500, rectH: 500 } } });
    assert.equal(
      buildSplitVerdict(eyebrowOnly, probes({ over: true, vOver: true, scrollH: 1900 }), OPTS).canSplit,
      false, 'a code-only eyebrow is not hoisted, so it cannot buy headroom back');
  });

  await t.test('the horizontal cut has the same two-page floor as the vertical one', () => {
    // The vertical floor was pinned; this one was not, and the only horizontal
    // fixture sat at 3× — comfortably above it — so dropping `Math.max(2, …)` from
    // the horizontal arm was invisible.
    const s = slide(
      '<section class="list-steps"><div class="cell-stage"><ol></ol></div></section>',
      { clientH: 1000, geom: { ol: { scrollH: 300, rectH: 300, scrollW: 1080, clientW: 900, display: 'flex', dir: 'row' } } });
    const v = buildSplitVerdict(s, probes({ over: true, vOver: false, scrollH: 1000 }), OPTS);
    assert.equal(v.splitRatio, 2, 'the floor holds where the raw width ratio is 1.2');
  });

  await t.test('`tol` is the caller\'s, at BOTH sites it is used', () => {
    // It arrives as one option and is spent twice — the probe call and the width
    // comparison. Nothing pinned the second, so a hard-coded 12 (or a 0) there
    // would have passed. A 400px-wide spill is under a tol of 500 and over one of 12.
    const s = slide(
      '<section class="list-steps"><div class="cell-stage"><ol></ol></div></section>',
      { clientH: 1000, geom: { ol: { scrollH: 300, rectH: 300, scrollW: 1300, clientW: 900, display: 'flex', dir: 'row' } } });
    const p = probes({ over: true, vOver: false, scrollH: 1000 });
    assert.equal(buildSplitVerdict(s, p, OPTS).canSplit, true, 'a 400px spill is over a tol of 12');
    assert.equal(buildSplitVerdict(s, p, { ...OPTS, tol: 500 }).canSplit, false,
      'the same spill is under a tol of 500 — so the width test reads the caller\'s tol');
  });

  await t.test('inline flow means a ROW flex or a MULTI-column grid, and nothing else', () => {
    const geom = (extra) => ({ clientH: 1000, geom: { ol: {
      scrollH: 300, rectH: 300, scrollW: 2700, clientW: 900, ...extra } } });
    const mk = (extra) => slide(
      '<section class="list-steps"><div class="cell-stage"><ol></ol></div></section>', geom(extra));
    const can = (el) => buildSplitVerdict(el, probes({ over: true, vOver: false, scrollH: 1000 }), OPTS).canSplit;
    assert.equal(can(mk({ display: 'flex', dir: 'column' })), false, 'a COLUMN flex is not inline flow');
    assert.equal(can(mk({ display: 'grid', cols: '1fr' })), false, 'a single-column grid is not inline flow');
    assert.equal(can(mk({ display: 'grid', cols: '1fr 1fr 1fr' })), true, 'a multi-column grid is');
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
