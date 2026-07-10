/**
 * Unit: lib/core/overflow-probe.js — the cell-aware overflow probe.
 *
 * The probe is the ONE source of truth behind every overflow-measurement site
 * (preview watcher, export watcher, autosplit's measureOverflow). It must report
 * overflow when EITHER the section's own box overflows OR a bounded content cell
 * (overflow:clip) overflows internally — because a clipping cell hides its
 * overflow from `section.scrollHeight`. These tests drive it with plain fake
 * DOM nodes (the probe only reads scroll/client dims + querySelectorAll).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { CLIP_CELL_SELECTOR, probeSectionOverflow, PROBE_SRC } = require('../../../lib/core/overflow-probe');

// Minimal fake <section>: its own box dims + a list of "clip cell" children
// returned from querySelectorAll(selector). The selector is ignored by the fake
// (the test supplies the cells directly), which is fine — the probe's contract is
// "probe whatever querySelectorAll returns".
function fakeSection({ scrollHeight, clientHeight, scrollWidth = 0, clientWidth = 0, cells = [] }) {
  return {
    scrollHeight, clientHeight,
    scrollWidth: scrollWidth || clientWidth,
    clientWidth,
    querySelectorAll: () => cells,
  };
}
const cell = (sh, ch, sw = 0, cw = 0) => ({ scrollHeight: sh, clientHeight: ch, scrollWidth: sw || cw, clientWidth: cw });

const TOL = 12;

describe('overflow-probe', () => {
  test('no overflow → over=false', () => {
    const s = fakeSection({ scrollHeight: 700, clientHeight: 700 });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.over, false);
    assert.equal(r.vOver, false);
  });

  test('section itself overflows vertically → over=true (legacy path unchanged)', () => {
    const s = fakeSection({ scrollHeight: 830, clientHeight: 700 });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.over, true);
    assert.equal(r.vOver, true);
    assert.equal(r.scrollH, 830);
  });

  test('a clipping CELL overflows while the section reports zero → over=true', () => {
    // The regression the probe fixes: section box is exactly full (clip contains
    // the body), but the bounded cell is 110px over. Must still be detected.
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700,
      cells: [cell(828, 718)], // +110 internal overflow
    });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.over, true);
    assert.equal(r.vOver, true);
    // effective extent folds the cell overflow back in for the autosplit ratio
    assert.equal(r.scrollH, 700 + (828 - 718));
    assert.equal(r.clientH, 700);
    // overCells names the culprit by INDEX (never an element ref — PROBE_SRC
    // also runs across the emulator's page.evaluate serialization boundary).
    assert.deepEqual(r.overCells, [{ index: 0, dy: 110, dx: 0 }]);
  });

  test('overCells omits a cell whose spill sits at/under TOL — jitter, not a provable cause', () => {
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700,
      cells: [cell(706, 700)], // +6, under the 12px tolerance
    });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.overCells.length, 0);
  });

  test('overCells lists EVERY cell past TOL, each independently a genuine culprit', () => {
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700,
      cells: [cell(740, 700), cell(900, 700), cell(706, 700)], // +40, +200, +6(jitter)
    });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.deepEqual(r.overCells, [
      { index: 0, dy: 40, dx: 0 },
      { index: 1, dy: 200, dx: 0 },
    ]);
  });

  test('a sub-TOL cell jitter does NOT trip the ring', () => {
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700,
      cells: [cell(706, 700)], // +6, under the 12px tolerance
    });
    assert.equal(probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over, false);
  });

  test('horizontal cell overflow flags over but NOT vOver (autosplit can\'t fix width)', () => {
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700, clientWidth: 1280,
      cells: [cell(700, 700, 1500, 1280)], // +220 wide
    });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.over, true);
    assert.equal(r.vOver, false);
  });

  test('the largest cell overflow wins when several clip', () => {
    const s = fakeSection({
      scrollHeight: 700, clientHeight: 700,
      cells: [cell(740, 700), cell(900, 700)],
    });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.scrollH, 700 + 200);
  });

  test('a CENTERED cell whose scrollHeight under-reports is caught via child layout boxes', () => {
    // The blind spot: `justify-content:center` content that overflows spills off BOTH
    // edges; scrollHeight counts only the bottom half (here +6, under TOL), so the
    // legacy test reads clean while the head is clipped. The child-box spill (60 above
    // + 60 below the cell box) reveals the true 120px overflow.
    const r0 = { width: 1280, height: 360 };
    const centered = {
      scrollHeight: 706, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 100, bottom: 800, left: 0, right: 1280 }),
      children: [
        { getBoundingClientRect: () => ({ top: 40, bottom: 400, left: 0, right: 1280, ...r0 }) },   // spills 60 above
        { getBoundingClientRect: () => ({ top: 400, bottom: 860, left: 0, right: 1280, ...r0 }) },   // spills 60 below
      ],
    };
    const s = fakeSection({ scrollHeight: 700, clientHeight: 700, clientWidth: 1280, cells: [centered] });
    const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
    assert.equal(r.over, true, 'centered overflow must be detected');
    assert.equal(r.vOver, true);
    assert.equal(r.scrollH, 700 + 120, 'effective extent folds in the true 120px spill');
  });

  test('a CENTERED cell that genuinely fits (children within the box) → no overflow', () => {
    const fits = {
      scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 100, bottom: 800, left: 0, right: 1280 }),
      children: [
        { getBoundingClientRect: () => ({ top: 150, bottom: 450, left: 0, right: 1280, width: 1280, height: 300 }) },
        { getBoundingClientRect: () => ({ top: 460, bottom: 760, left: 0, right: 1280, width: 1280, height: 300 }) },
      ],
    };
    const s = fakeSection({ scrollHeight: 700, clientHeight: 700, clientWidth: 1280, cells: [fits] });
    assert.equal(probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over, false);
  });

  test('an OUT-OF-FLOW child (position:absolute) that spills is NOT counted — placement, not overflow', () => {
    // The #198 4K false-positive: a full-width <footer> docked INSIDE a half-width
    // `.panel-right` is position:absolute, so its layout box sits ~a panel-width to the
    // left of the cell — counting it as content spill tripped the ring on a clean slide.
    // The probe consults getComputedStyle (browser-only) to skip out-of-flow children.
    const prevGCS = global.getComputedStyle;
    global.getComputedStyle = (el) => ({ position: el._position || 'static' });
    try {
      const cell = {
        scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
        getBoundingClientRect: () => ({ top: 0, bottom: 700, left: 0, right: 1280 }),
        children: [
          // absolutely-positioned footer spilling 600px LEFT — must be ignored
          { _position: 'absolute', getBoundingClientRect: () => ({ top: 650, bottom: 690, left: -600, right: 1280, width: 1880, height: 40 }) },
          // the real in-flow body, fits cleanly
          { getBoundingClientRect: () => ({ top: 10, bottom: 690, left: 0, right: 1280, width: 1280, height: 680 }) },
        ],
      };
      const s = fakeSection({ scrollHeight: 700, clientHeight: 700, clientWidth: 1280, cells: [cell] });
      assert.equal(probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over, false, 'absolute child must not trip the ring');
      // …but a STATIC (in-flow) child spilling the same amount IS still caught.
      cell.children[0]._position = 'static';
      assert.equal(probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over, true, 'in-flow spill still caught');
    } finally {
      global.getComputedStyle = prevGCS;
    }
  });

  test('section base: an OUT-OF-FLOW decorative child that bleeds is NOT counted (moved logo / finish mark)', () => {
    // A finish mark (::before, not even a child) or a moved/scaled deck-logo bleeds past
    // the slide edge; raw scrollHeight/scrollWidth count it, false-tripping the ring. The
    // section base now measures FLOWED children only, so the decorative bleed is ignored
    // even though the raw dims are inflated.
    const prev = global.getComputedStyle;
    global.getComputedStyle = (el) => ({ position: el._position || 'static' });
    try {
      const s = {
        scrollHeight: 900, clientHeight: 700, scrollWidth: 1500, clientWidth: 1280, // raw INFLATED by the bleed
        getBoundingClientRect: () => ({ top: 0, bottom: 700, left: 0, right: 1280 }),
        children: [
          { _position: 'absolute', getBoundingClientRect: () => ({ top: -40, bottom: 900, left: 1100, right: 1500, width: 400, height: 940 }) }, // bleeding decorative layer
          { getBoundingClientRect: () => ({ top: 20, bottom: 680, left: 0, right: 1280, width: 1280, height: 660 }) }, // real content, fits
        ],
        querySelectorAll: () => [],
      };
      assert.equal(probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over, false, 'decorative bleed must not trip the ring');
    } finally {
      global.getComputedStyle = prev;
    }
  });

  test('section base: a real IN-FLOW spill IS still counted', () => {
    const prev = global.getComputedStyle;
    global.getComputedStyle = (el) => ({ position: el._position || 'static' });
    try {
      const s = {
        scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
        getBoundingClientRect: () => ({ top: 0, bottom: 700, left: 0, right: 1280 }),
        children: [
          { getBoundingClientRect: () => ({ top: 20, bottom: 820, left: 0, right: 1280, width: 1280, height: 800 }) }, // spills 120 below
        ],
        querySelectorAll: () => [],
      };
      const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
      assert.equal(r.over, true);
      assert.equal(r.vOver, true);
      assert.equal(r.scrollH, 700 + 120);
    } finally {
      global.getComputedStyle = prev;
    }
  });

  test('section base: a flowed child whose BOX fits but whose CONTENT overflows internally IS caught', () => {
    // The regression guard: a height-constrained body (flex:1 / min-height:0, overflow
    // visible) — e.g. a STAGE_DEFERRED chart/gantt body with no clip cell — keeps its box
    // inside the section while its descendant content spills. Child LAYOUT rects alone
    // would miss it; folding in the child's own scrollHeight−clientHeight restores it.
    const prev = global.getComputedStyle;
    global.getComputedStyle = (el) => ({ position: el._position || 'static' });
    try {
      const s = {
        scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
        getBoundingClientRect: () => ({ top: 0, bottom: 700, left: 0, right: 1280 }),
        children: [
          // box fits the section (bottom 690 < 700) BUT its content is 900 tall → +210 internal
          { scrollHeight: 900, clientHeight: 690, scrollWidth: 1280, clientWidth: 1280, getBoundingClientRect: () => ({ top: 10, bottom: 690, left: 0, right: 1280, width: 1280, height: 680 }) },
        ],
        querySelectorAll: () => [],
      };
      const r = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
      assert.equal(r.over, true, 'internal descendant overflow of a fitting child must be caught');
      assert.equal(r.vOver, true);
      assert.equal(r.scrollH, 700 + 200, 'content bottom 690+210=900 → spill 200 past the section');
    } finally {
      global.getComputedStyle = prev;
    }
  });

  test('CLIP_CELL_SELECTOR names the current bounded content cells', () => {
    assert.match(CLIP_CELL_SELECTOR, /\.cell-stage/);
    assert.match(CLIP_CELL_SELECTOR, /\.panel-right/);
    assert.match(CLIP_CELL_SELECTOR, /\.compare-right/);
  });

  test('PROBE_SRC is the function source, for verbatim browser injection', () => {
    assert.equal(typeof PROBE_SRC, 'string');
    // reconstituting it yields a working probe (the emulator does exactly this)
    const reified = new Function('return (' + PROBE_SRC + ')')();
    const s = fakeSection({ scrollHeight: 700, clientHeight: 700, cells: [cell(828, 718)] });
    assert.equal(reified(s, CLIP_CELL_SELECTOR, TOL).over, true);
  });
});
