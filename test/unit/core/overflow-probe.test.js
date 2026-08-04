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
const {
  CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, probeSectionOverflow, PROBE_SRC,
  probeContentClipped, CONTENT_CLIPPED_SRC,
  probeFigureLegibility, LEGIBILITY_SRC, FIGURE_TEXT_FLOOR_RATIO,
} = require('../../../lib/core/overflow-probe');

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

// ── §8 rule 8 — the viewBox figure's legibility floor ───────────────────────────
// The overflow probe above is STRUCTURALLY blind to a container-responsive figure: it never
// spills its box, it shrinks its own labels instead. Driven with fake SVG nodes, since the probe
// only reads getBoundingClientRect / viewBox.baseVal / computed font-size.
describe('core: overflow-probe — probeFigureLegibility (§8 rule 8)', () => {
  // A fake <text> whose computed font-size the stubbed getComputedStyle below returns.
  const text = (fontSize, content = 'Label') => ({ textContent: content, __fs: fontSize });
  // Selector-aware, because the probe now asks two questions of a figure: which `<text>` can it
  // measure, and does the figure carry `<foreignObject>` labels it CANNOT (mermaid's htmlLabels).
  const svg = ({ vbW = 300, vbH = 300, boxW = 300, boxH = 300, texts = [], foreign = 0 }) => ({
    getBoundingClientRect: () => ({ width: boxW, height: boxH }),
    viewBox: { baseVal: { width: vbW, height: vbH } },
    querySelectorAll: (sel) => (sel === 'foreignObject' ? new Array(foreign).fill({}) : texts),
  });
  // `clientHeight` is the slide height the ratio floor resolves against — 720px (a `hd` canvas),
  // so a ratio of 1/72 reads as an 10px floor and the arithmetic in these tests stays legible.
  const SLIDE_H = 720;
  const section = (figs, clientHeight = SLIDE_H) => ({
    clientHeight,
    querySelectorAll: (sel) => (sel === 'svg[viewBox]' ? figs : []),
  });
  /** A ratio that resolves to `px` on the default 720px slide. */
  const floorAt = (px) => px / SLIDE_H;

  // The probe reads getComputedStyle(t).fontSize; the fakes carry it on `__fs`.
  const withStubbedStyle = (fn) => {
    const had = Object.hasOwn(globalThis, 'getComputedStyle');
    const prev = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (el) => ({ fontSize: `${el.__fs}px` });
    try { return fn(); } finally {
      if (had) globalThis.getComputedStyle = prev; else delete globalThis.getComputedStyle;
    }
  };

  test('scale is applied: user units × the viewBox→box ratio is the ON-PAGE size', () => {
    withStubbedStyle(() => {
      // 11 user units in a 300-unit viewBox rendered into a 600px box → 22px on the page.
      const big = probeFigureLegibility(section([svg({ boxW: 600, boxH: 600, texts: [text(11)] })]), floorAt(8));
      assert.equal(big.minPx, 22);
      assert.equal(big.under, false);
      // …the SAME figure in a 150px box → 5.5px, which is below the floor.
      const small = probeFigureLegibility(section([svg({ boxW: 150, boxH: 150, texts: [text(11)] })]), floorAt(8));
      assert.equal(small.minPx, 5.5);
      assert.equal(small.under, true);
    });
  });

  test('the SMALLEST text decides — a legible title does not rescue a 5px tick label', () => {
    withStubbedStyle(() => {
      const r = probeFigureLegibility(section([svg({ texts: [text(24), text(11), text(5)] })]), floorAt(8));
      assert.equal(r.minPx, 5);
      assert.equal(r.count, 3);
      assert.equal(r.under, true);
    });
  });

  test('a non-square box takes the SMALLER ratio (preserveAspectRatio fits, it does not stretch)', () => {
    withStubbedStyle(() => {
      const r = probeFigureLegibility(section([svg({ boxW: 600, boxH: 150, texts: [text(10)] })]), floorAt(8));
      assert.equal(r.minPx, 5, 'the height ratio (0.5) governs, not the width ratio (2)');
    });
  });

  test('reported minPx rounds DOWN, so a flagged figure never prints as equal to its floor', () => {
    withStubbedStyle(() => {
      const r = probeFigureLegibility(section([svg({ boxW: 217, texts: [text(11) ] })]), floorAt(8));
      assert.ok(r.under, 'this is a genuine miss');
      assert.ok(r.minPx < r.floorPx, `${r.minPx} must read as below ${r.floorPx}`);
    });
  });

  test('nothing to judge → null (never a false "legible")', () => {
    withStubbedStyle(() => {
      assert.equal(probeFigureLegibility(section([]), floorAt(8)), null, 'no figure');
      assert.equal(probeFigureLegibility(section([svg({ texts: [] })]), floorAt(8)), null, 'a figure with no text');
      assert.equal(probeFigureLegibility(section([svg({ texts: [text(11, '   ')] })]), floorAt(8)), null, 'whitespace-only text');
      assert.equal(probeFigureLegibility(section([svg({ texts: [text(11)] })]), 0), null, 'no floor given');
    });
  });

  test('a figure whose labels the probe CANNOT read reports "unmeasured", never silence', () => {
    // Mermaid runs with htmlLabels, so a flowchart emits `<foreignObject>` HTML instead of SVG
    // `<text>`. Three shipped `diagram` gallery pages carry 39 / 6 / 25 such labels and zero
    // `<text>`, so the probe returned null — "nothing to judge", which reads downstream as
    // "legible". A flowchart is the most common diagram there is; its labels shrinking to 4px is
    // exactly what this rule exists to catch, so the honest answer is "not measured".
    withStubbedStyle(() => {
      const r = probeFigureLegibility(section([svg({ texts: [], foreign: 39 })]), floorAt(8));
      assert.ok(r, 'must not be null — silence reads as a pass');
      assert.equal(r.count, 0);
      assert.equal(r.unmeasured, 1);
      assert.equal(r.under, false, 'unmeasured is never a failure either');
    });
  });

  test('a figure with no viewBox dims falls back to scale 1 rather than guessing', () => {
    withStubbedStyle(() => {
      const noVb = { getBoundingClientRect: () => ({ width: 600, height: 600 }), viewBox: null, querySelectorAll: () => [text(9)] };
      const r = probeFigureLegibility(section([noVb]), floorAt(8));
      assert.equal(r.minPx, 9);
      assert.equal(r.under, false);
    });
  });

  test('the floor is a FRACTION OF SLIDE HEIGHT, so one design gets one verdict on every preset', () => {
    // The same figure at the same design measures 5.2px on `square` and 23.7px on `4K`; an absolute
    // px floor therefore passed it on one preset and failed it on another. As a fraction of slide
    // height the two agree, which is what an invariant floor has to do.
    assert.equal(typeof FIGURE_TEXT_FLOOR_RATIO, 'number');
    assert.ok(FIGURE_TEXT_FLOOR_RATIO > 0.005 && FIGURE_TEXT_FLOOR_RATIO < 0.03, `implausible ratio: ${FIGURE_TEXT_FLOOR_RATIO}`);
    // One figure, one design, two canvases: the verdict must not change.
    withStubbedStyle(() => {
      const fig = (boxPx) => svg({ vbW: 300, vbH: 300, boxW: boxPx, boxH: boxPx, texts: [text(9)] });
      const short = probeFigureLegibility(section([fig(360)], 720), FIGURE_TEXT_FLOOR_RATIO);
      const tall = probeFigureLegibility(section([fig(1080)], 2160), FIGURE_TEXT_FLOOR_RATIO);
      assert.equal(short.under, tall.under, 'the same design got two verdicts on two presets');
      // Within a rounding step: `pct` is floored to two decimals, and the two scales differ in the
      // last binary place (9 × 1.2 is 10.799999…), which can land either side of a boundary.
      assert.ok(Math.abs(short.pct - tall.pct) <= 0.02, `ratio drifted: ${short.pct} vs ${tall.pct}`);
    });
  });

  test('a slide with no measurable height is not judged (never a divide-by-zero verdict)', () => {
    withStubbedStyle(() => {
      assert.equal(probeFigureLegibility(section([svg({ texts: [text(11)] })], 0), FIGURE_TEXT_FLOOR_RATIO), null);
    });
  });

  test('LEGIBILITY_SRC re-inflates and behaves identically (it is injected as a string)', () => {
    withStubbedStyle(() => {
      const reified = new Function('return (' + LEGIBILITY_SRC + ')')();
      const s = section([svg({ boxW: 150, boxH: 150, texts: [text(11)] })]);
      assert.deepEqual(reified(s, 8), probeFigureLegibility(s, 8));
    });
  });
});

describe('overflow-probe: the SQUEEZED child (a flex cell that reports it fits)', () => {
  // The third measurement blind spot. `section.checklist > .cell-stage` distributes its rows,
  // so a `<ul>` wanting more room than it gets is SHRUNK rather than allowed to spill: the
  // cell's own `scrollHeight - clientHeight` is 0, the rect walk finds no geometric spill, and
  // the rows are simply drawn on top of each other. Every level of the geometry says "fits".
  //
  // These pin the mechanism AND its two false-positive guards. Before them, deleting the whole
  // squeezed branch was invisible to 4363 unit + 571 integration tests, while a committed demo
  // deck silently lost a split — the same shape as the vacuous `col` tests §12 already caught.
  const styled = (overflowY) => ({ position: 'static', overflowY, overflowX: 'visible' });
  const withStyles = (fn) => {
    const prev = global.getComputedStyle;
    global.getComputedStyle = (el) => styled(el._ovy || 'visible');
    try { return fn(); } finally { global.getComputedStyle = prev; }
  };
  // A clip cell `h` px tall at y=0, holding one child. The cell's own dims say it fits —
  // that is the whole premise: the squeeze is invisible above the child.
  const cellWith = (child, h = 1000) => ({
    scrollHeight: h, clientHeight: h, scrollWidth: 1280, clientWidth: 1280,
    getBoundingClientRect: () => ({ top: 0, bottom: h, left: 0, right: 1280 }),
    children: [child],
  });
  const section = (c, h = 1000) => ({
    scrollHeight: h, clientHeight: h, scrollWidth: 1280, clientWidth: 1280,
    querySelectorAll: () => [c],
  });

  test('a crushed child whose content clears the cell IS overflow', () => {
    // The real case: flex shrank the `<ul>` to 700px, its content wants 1000 → the last 300px
    // of rows paint past the cell's bottom edge, where the cell clips them away.
    const child = {
      scrollHeight: 1000, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 100, bottom: 800, left: 0, right: 1280, width: 1280, height: 700 }),
    };
    const r = withStyles(() => probeSectionOverflow(section(cellWith(child)), CLIP_CELL_SELECTOR, TOL));
    assert.equal(r.over, true, 'the squeezed child must be caught — nothing else in the geometry can see it');
    assert.equal(r.scrollH, 1000 + 100, 'content bottom 800+300=1100 → 100px past the cell');
  });

  test('a crushed MIDDLE child that paints over its SIBLING is overflow, though it never reaches the cell edge', () => {
    // The case a "does it clear the cell's bottom edge" test misses, and the one that actually
    // shipped: on examples/split-relationship.md the checklist's `<ul>` was squeezed to 125px
    // with 375px of content and drew its rows straight over the closing paragraph and the key
    // insight below it — text on top of text, no warning, and three splits silently lost. The
    // limit for a non-final child is the NEXT sibling's top, not the cell's bottom.
    const crushed = {
      scrollHeight: 375, clientHeight: 125, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 300, bottom: 425, left: 0, right: 1280, width: 1280, height: 125 }),
    };
    const after = {
      scrollHeight: 300, clientHeight: 300, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 425, bottom: 725, left: 0, right: 1280, width: 1280, height: 300 }),
    };
    const cell = {
      scrollHeight: 1000, clientHeight: 1000, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 0, bottom: 1000, left: 0, right: 1280 }),
      children: [crushed, after],
    };
    const r = withStyles(() => probeSectionOverflow(section(cell), CLIP_CELL_SELECTOR, TOL));
    assert.equal(r.over, true, '250px of rows painting over the next block is overflow, cell edge or not');
  });

  test('a child hiding pixels into EMPTY space inside the cell is NOT overflow', () => {
    // The gallery `cycle` page: a `<ul>` hiding 43px in a cell with a third of its height free.
    // The content lands in blank space; nothing is lost. Summing hidden pixels called this an
    // overflow and printed "⚠ OVERFLOW … CLIPPED" on a page that plainly fits.
    const child = {
      scrollHeight: 654, clientHeight: 611, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 0, bottom: 611, left: 0, right: 1280, width: 1280, height: 611 }),
    };
    const r = withStyles(() => probeSectionOverflow(section(cellWith(child)), CLIP_CELL_SELECTOR, TOL));
    assert.equal(r.over, false, '611+43=654 is well inside a 1000px cell');
  });

  test('a child that CLIPS ITS OWN overflow is doing its job, not overflowing the slide', () => {
    // `.chart-body` wraps a container-responsive figure at `overflow: hidden` and steadily
    // reports ~43 hidden px. Counted, it produced a false CLIPPED warning on two shipped decks
    // — and fed `resplitDoc`, which cut a fitting slide into half-empty pages.
    // The measured shape from examples/portrait-gantt-statechart.md p4: cell 1423, child box
    // 1355 (fits), child content 1398.
    const child = {
      _ovy: 'hidden',
      scrollHeight: 1398, clientHeight: 1355, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 0, bottom: 1355, left: 0, right: 1280, width: 1280, height: 1355 }),
    };
    const r = withStyles(() => probeSectionOverflow(section(cellWith(child, 1423), 1423), CLIP_CELL_SELECTOR, TOL));
    assert.equal(r.over, false, "a designed clip box's hidden pixels are not the slide's overflow");
  });

  test('…and that still holds when the clip box FILLS the cell — where geometry alone cannot tell', () => {
    // The case that needs the overflow-style check and not just the edge arithmetic: a
    // `flex: 1` figure wrapper whose box ends exactly at the cell's bottom. Its hidden pixels
    // now DO compute as "past the edge", so only the fact that it clips them itself
    // distinguishes a designed clip box from a squeezed child painting over its siblings.
    const box = (ovy) => ({
      _ovy: ovy,
      scrollHeight: 1043, clientHeight: 1000, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: () => ({ top: 0, bottom: 1000, left: 0, right: 1280, width: 1280, height: 1000 }),
    });
    const clipped = withStyles(() => probeSectionOverflow(section(cellWith(box('hidden'))), CLIP_CELL_SELECTOR, TOL));
    assert.equal(clipped.over, false, 'it clips its own 43px — that is the design, not a slide overflow');
    const visible = withStyles(() => probeSectionOverflow(section(cellWith(box('visible'))), CLIP_CELL_SELECTOR, TOL));
    assert.equal(visible.over, true, 'the same 43px with visible overflow paints past the cell and IS lost');
  });
});

// ── The measurement must not depend on how the HOST scales the slide ──────────
// `getBoundingClientRect()` is the VISUAL box (a transform scales it) while
// scrollHeight/clientHeight/offsetHeight are transform-blind LAYOUT px. The probe
// mixes both, so on a scaled section the two arrive in different units. That is not
// hypothetical: the docs-site filmstrip scales every `<section>` to the preview pane
// (docs/src/playground/deck-preview.js) while the Studio scales the IFRAME instead,
// so the SAME over-stuffed slide measured 30px over in one surface and 17px over in
// the other — and with TOL at 12, that is a red ring versus silence. Each case below
// asserts the SAME verdict and the SAME magnitude at scale 1 and at scale 0.543.
describe('overflow-probe: scale invariance (the host may transform the slide)', () => {
  const styled = () => ({ position: 'static', overflowY: 'visible', overflowX: 'visible' });
  const withStyles = (fn) => {
    const prev = global.getComputedStyle;
    global.getComputedStyle = () => styled();
    try { return fn(); } finally { global.getComputedStyle = prev; }
  };
  // Build the same slide twice: `k` scales every RECT (what a CSS transform does)
  // and leaves every scroll/client/offset dim alone (what it does not). The crushed
  // child has REAL SLACK below it (bottom 425, next sibling at 525): without slack the
  // scaled terms cancel and the bug hides, which is exactly how the first version of
  // this test passed against the unfixed probe.
  const rectAt = (k) => (top, bottom) => () => ({ top: top * k, bottom: bottom * k, left: 0, right: 1280 * k, width: 1280 * k, height: (bottom - top) * k });
  const scaled = (k) => {
    const rect = rectAt(k);
    const crushed = { scrollHeight: 375, clientHeight: 125, scrollWidth: 1280, clientWidth: 1280, getBoundingClientRect: rect(300, 425) };
    const after = { scrollHeight: 300, clientHeight: 300, scrollWidth: 1280, clientWidth: 1280, getBoundingClientRect: rect(525, 825) };
    const cell = {
      scrollHeight: 1000, clientHeight: 1000, scrollWidth: 1280, clientWidth: 1280,
      getBoundingClientRect: rect(0, 1000), children: [crushed, after],
    };
    return {
      scrollHeight: 1000, clientHeight: 1000, scrollWidth: 1280, clientWidth: 1280,
      offsetHeight: 1000, getBoundingClientRect: rect(0, 1000),
      querySelectorAll: () => [cell], children: [cell],
    };
  };

  test('a squeezed child measures the same at scale 1 and scale 0.543', () => {
    const full = withStyles(() => probeSectionOverflow(scaled(1), CLIP_CELL_SELECTOR, TOL));
    const small = withStyles(() => probeSectionOverflow(scaled(0.543), CLIP_CELL_SELECTOR, TOL));
    assert.equal(full.over, true);
    assert.equal(small.over, true, 'the filmstrip must not scale a real overflow away');
    assert.ok(Math.abs(full.scrollH - small.scrollH) < 1, `scrollH ${full.scrollH} vs ${small.scrollH} — the verdict must not depend on the pane width`);
    assert.ok(Math.abs(full.overCells[0].dy - small.overCells[0].dy) < 1, 'the per-cell cause measure travels in layout px too');
  });

  test('the SECTION-level fold measures the same at either scale', () => {
    // The other half of the mix: a body whose BOX fits but whose content spills is
    // folded onto its rect bottom (layout px onto visual px). Unfixed, the same
    // fixture reports scrollH 1000 at scale 1 and 1037.1 at scale 0.543 — a slide
    // that measures as fitting in one surface and 37px over in the other, purely
    // from the pane's scale.
    const secWith = (k) => {
      const rect = rectAt(k);
      const body = { scrollHeight: 900, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280, getBoundingClientRect: rect(0, 700) };
      return {
        scrollHeight: 1000, clientHeight: 1000, scrollWidth: 1280, clientWidth: 1280,
        offsetHeight: 1000, getBoundingClientRect: rect(0, 1000),
        querySelectorAll: () => [], children: [body],
      };
    };
    const full = withStyles(() => probeSectionOverflow(secWith(1), CLIP_CELL_SELECTOR, TOL));
    const small = withStyles(() => probeSectionOverflow(secWith(0.543), CLIP_CELL_SELECTOR, TOL));
    assert.ok(Math.abs(full.scrollH - small.scrollH) < 1, `scrollH ${full.scrollH} vs ${small.scrollH}`);
  });

  test('a figure’s legibility is measured in layout px, not in the pane’s scaled px', () => {
    // Same figure, same slide, previewed at two scales. Before this, a 0.543-scaled
    // section reported every glyph at 0.543× its real size — so a perfectly legible
    // chart tripped the type-floor alarm purely for being previewed in a narrow pane.
    const fig = (k) => ({
      getBoundingClientRect: () => ({ width: 600 * k, height: 400 * k }),
      viewBox: { baseVal: { width: 600, height: 400 } },
      querySelectorAll: (sel) => (sel === 'text' ? [{ textContent: 'label' }] : []),
    });
    const section = (k) => ({
      clientHeight: 720, offsetHeight: 720,
      getBoundingClientRect: () => ({ height: 720 * k }),
      querySelectorAll: () => [fig(k)],
    });
    const prev = global.getComputedStyle;
    global.getComputedStyle = () => ({ fontSize: '12px' });
    try {
      const full = probeFigureLegibility(section(1), FIGURE_TEXT_FLOOR_RATIO);
      const small = probeFigureLegibility(section(0.543), FIGURE_TEXT_FLOOR_RATIO);
      assert.equal(full.under, false, '12px in a 1:1 viewBox clears a 7.2px floor');
      assert.equal(small.under, false, 'and it still clears it when the host scales the slide down');
      assert.ok(Math.abs(full.minPx - small.minPx) < 0.2, `minPx ${full.minPx} vs ${small.minPx}`);
    } finally {
      global.getComputedStyle = prev;
    }
  });
});

describe('probeContentClipped — did the clip actually CUT anything?', () => {
  // A REAL DOM, not element fakes. The first implementation of this probe walked
  // element leaves, and fakes shaped `{ children: [], textContent }` made that look
  // correct — while in the real engine `breaks: true` gives every wrapped paragraph
  // <br> children, so the text-owning element is not a leaf and the probe went blind
  // to most prose in the product. The fixtures could not express the bug, so they
  // could not catch it. These build actual nodes and stub only the geometry, which
  // jsdom does not compute.
  const { JSDOM } = require('jsdom');

  // Text occupies its parent element's box — enough to model "does this line cross
  // the clip edge" without a layout engine.
  function mount(html, rects, { clipBoxes = [] } = {}) {
    const dom = new JSDOM('<!doctype html><body>' + html + '</body>');
    const { window } = dom;
    const doc = window.document;
    for (const [sel, r] of Object.entries(rects)) {
      for (const el of doc.querySelectorAll(sel)) el.__rect = r;
    }
    window.Element.prototype.getBoundingClientRect = function () {
      return this.__rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    window.Range.prototype.getClientRects = function () {
      const host = this.startContainer.parentElement;
      const r = host?.__rect;
      return r ? [r] : [];
    };
    const clipSet = new Set(clipBoxes.flatMap((sel) => [...doc.querySelectorAll(sel)]));
    const prevGCS = global.getComputedStyle;
    global.getComputedStyle = (el) => ({
      overflowY: clipSet.has(el) ? 'clip' : 'visible',
      overflowX: 'visible',
      position: el.dataset?.pos || 'static',
      display: 'block',
      visibility: 'visible',
    });
    return { doc, restore: () => { global.getComputedStyle = prevGCS; } };
  }
  const rect = (top, bottom, left = 0, right = 100) => ({
    top, bottom, left, right, width: right - left, height: bottom - top,
  });
  const run = (html, rects, opts) => {
    const { doc, restore } = mount(html, rects, opts);
    try {
      return probeContentClipped(doc.querySelector('section'), IGNORED_CLIP_SELECTOR, 12);
    } finally { restore(); }
  };

  test('padding-only overflow is NOT a cut — the kpi case', () => {
    const r = run(
      '<section><p id="a">218</p><p id="b">Adults enrolled</p></section>',
      { section: rect(0, 1000), '#a': rect(100, 300), '#b': rect(300, 380) },
      { clipBoxes: ['section'] },
    );
    assert.equal(r.cut, false, 'no text crosses the clip line, so nothing was cut');
  });

  test('text past the clip line IS a cut, and it is named', () => {
    const r = run(
      '<section><p id="a">fine</p><p id="b">lost text</p></section>',
      { section: rect(0, 1000), '#a': rect(100, 300), '#b': rect(900, 1100) },
      { clipBoxes: ['section'] },
    );
    assert.equal(r.cut, true);
    assert.match(r.first, /lost text/);
  });

  test('WRAPPED prose is seen — the <br> blindness that shipped a silent PDF', () => {
    // marp-core's breaks:true turns a soft-wrapped paragraph into text + <br> + text.
    // The element walk skipped the <p> (it has children) and the <br>s (no text), so a
    // cell of ordinary prose reported zero bearers and answered "nothing was cut".
    const r = run(
      '<section><p id="a">first line<br>second line<br>third line</p></section>',
      { section: rect(0, 1000), '#a': rect(900, 1100) },
      { clipBoxes: ['section'] },
    );
    assert.equal(r.cut, true, 'a wrapped paragraph carrying <br> children must still be measured');
  });

  test('the tolerance is honored — a hair over the line is not a cut', () => {
    const r = run(
      '<section><p id="a">grazing</p></section>',
      { section: rect(0, 1000), '#a': rect(900, 1008) },
      { clipBoxes: ['section'] },
    );
    assert.equal(r.cut, false, '8px past a 12px tolerance must not fire');
  });

  test('the marker its own tab draws is never the evidence', () => {
    const r = run(
      '<section><div class="overflow-tab" id="a">Content clipped</div></section>',
      { section: rect(0, 1000), '#a': rect(980, 1040) },
      { clipBoxes: ['section'] },
    );
    assert.equal(r.cut, false, 'counting the tab would make the marker self-justifying');
  });

  test('a bounded content CELL is probed, not just the section', () => {
    const r = run(
      '<section><div class="cell-stage"><p id="a">cell text past the edge</p></div></section>',
      { section: rect(0, 1000), '.cell-stage': rect(0, 500), '#a': rect(480, 620) },
      { clipBoxes: ['.cell-stage'] },
    );
    assert.equal(r.cut, true, 'a clipping cell hides its overflow from the section');
  });

  test('a replaced element cut by the box counts, with no text involved', () => {
    const r = run(
      '<section><div class="cell-stage"><img id="a" alt=""></div></section>',
      { section: rect(0, 1000), '.cell-stage': rect(0, 500), '#a': rect(100, 900) },
      { clipBoxes: ['.cell-stage'] },
    );
    assert.equal(r.cut, true, 'a chart or image sliced in half loses plenty with no text in it');
  });

  test('CONTENT_CLIPPED_SRC is injectable — no script-terminating sequence', () => {
    // The REAL hazard for a source string embedded in a <script> element is a literal
    // `</script>` (or `<!--`), which ends the element early — the same hazard
    // lattice-emulator.js already escapes with \\x3C when it inlines the runtime.
    //
    // This test used to assert "no backtick, no dollar-brace" on the theory that either
    // would terminate the template literal the source is interpolated into. That theory
    // is wrong — interpolation is a runtime string operation — and the sibling sources
    // injected into the SAME literal disprove it outright: PROBE_SRC carries 52
    // backticks and has always worked. The old assertion certified nothing while
    // constraining how this function could be written.
    assert.equal(typeof CONTENT_CLIPPED_SRC, 'string');
    assert.ok(!/<\/script/i.test(CONTENT_CLIPPED_SRC), 'a literal </script> would end the injected element early');
    assert.ok(!CONTENT_CLIPPED_SRC.includes('<!--'), 'a literal <!-- would open a comment in the injected element');
  });
});

// ── #1299 / #1300 — the signal has to REACH every box that clips ──────────────
//
// A real DOM again, for the same reason the probeContentClipped suite uses one: the
// defects here are about which boxes get looked at, and an element fake that returns
// whatever the test hands it cannot express "the probe never found this box".
describe('overflow-probe: BLOCK-START shear, and the boxes an allowlist missed', () => {
  const { JSDOM } = require('jsdom');

  // Mount real nodes and stub only the geometry jsdom does not compute. `clipBoxes`
  // names the boxes whose computed overflow is non-visible; `scroll` supplies
  // scrollHeight/clientHeight for boxes that need them.
  function mount(html, rects, { clipBoxes = [], scroll = {}, pseudo = {}, textRects = {} } = {}) {
    const dom = new JSDOM('<!doctype html><body>' + html + '</body>');
    const { window } = dom;
    const doc = window.document;
    for (const [sel, r] of Object.entries(rects)) {
      for (const el of doc.querySelectorAll(sel)) el.__rect = r;
    }
    for (const [sel, d] of Object.entries(scroll)) {
      for (const el of doc.querySelectorAll(sel)) el.__scroll = d;
    }
    for (const [sel, r] of Object.entries(textRects)) {
      for (const el of doc.querySelectorAll(sel)) el.__textRect = r;
    }
    window.Element.prototype.getBoundingClientRect = function () {
      return this.__rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    };
    for (const prop of ['scrollHeight', 'clientHeight', 'scrollWidth', 'clientWidth']) {
      Object.defineProperty(window.Element.prototype, prop, {
        configurable: true,
        get() { return this.__scroll?.[prop] ?? 0; },
      });
    }
    Object.defineProperty(window.Element.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.__rect ? this.__rect.bottom - this.__rect.top : 0; },
    });
    // A text node's LINE BOX, which is not its parent's border box when the parent
    // clips it: a `white-space: nowrap` footer at `text-overflow: ellipsis` lays its
    // text out at full width and paints only the part that fits. `__textRect` models
    // that separately, which is the whole point of the footer case below.
    window.Range.prototype.getClientRects = function () {
      const host = this.startContainer.parentElement;
      const r = host?.__textRect || host?.__rect;
      return r ? [r] : [];
    };
    const clipSet = new Set(clipBoxes.flatMap((sel) => [...doc.querySelectorAll(sel)]));
    const prev = global.getComputedStyle;
    global.getComputedStyle = (el, pe) => {
      if (pe) return { content: pseudo[el.id] && pe === '::after' ? `"${pseudo[el.id]}"` : 'none' };
      return {
        overflowY: clipSet.has(el) ? 'clip' : 'visible',
        overflowX: 'visible',
        position: el.dataset?.pos || 'static',
        display: 'block',
        visibility: 'visible',
      };
    };
    return { doc, restore: () => { global.getComputedStyle = prev; } };
  }
  const rect = (top, bottom, left = 0, right = 100) => ({
    top, bottom, left, right, width: right - left, height: bottom - top,
  });
  const withDom = (html, rects, opts, fn) => {
    const { doc, restore } = mount(html, rects, opts);
    try { return fn(doc.querySelector('section')); } finally { restore(); }
  };

  test('#1299 — content sheared off the BLOCK-START of a clipping panel is caught', () => {
    // The exact shape that shipped silently: `.panel-left` is
    // `justify-content: flex-end; overflow: hidden`, so an over-stuffed panel throws
    // its eyebrow and heading ABOVE its own top edge. Block-start overflow does not
    // grow scrollHeight, so every scroll-dims measure reads 0 — the section's fold
    // included. Only the rect walk can see it, and only if the box is probed at all.
    const html = '<section><div class="panel-left"><p id="eyebrow">Program review</p>'
      + '<h2 id="head">Quarterly review</h2></div><div class="panel-right"><p id="ok">fine</p></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.panel-left': rect(0, 700, 0, 486),
      '#eyebrow': rect(-882, -840, 40, 440),   // sheared clean off the top
      '#head': rect(-840, 700, 40, 440),
      '.panel-right': rect(0, 700, 486, 1280),
      '#ok': rect(40, 90, 520, 1240),
    };
    const scroll = {
      section: { scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280 },
      '.panel-left': { scrollHeight: 700, clientHeight: 700, scrollWidth: 486, clientWidth: 486 },
      '.panel-right': { scrollHeight: 700, clientHeight: 700, scrollWidth: 794, clientWidth: 794 },
    };
    const r = withDom(html, rects, { clipBoxes: ['.panel-left', '.panel-right'], scroll },
      (s) => probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR));
    assert.equal(r.over, true, 'a sheared panel head must not read as fitting');
    assert.ok(r.scrollH >= 700 + 882, `the shear is measured at full size, got ${r.scrollH}`);
  });

  test('#1299 — the same shear in a box NOT on the allowlist is caught by discovery', () => {
    // The general defect behind #1299: the allowlist is silent by default, so the next
    // component to centre a clipping box inherits the same silence. Discovery means the
    // box does not have to be remembered.
    const html = '<section><div class="qr-card"><p id="head">One scan connects the room</p></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.qr-card': rect(88, 612, 0, 1280),
      '#head': rect(65, 200, 40, 1240),        // 23px above the card's top — wifi's real shape
    };
    const scroll = {
      section: { scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280 },
      '.qr-card': { scrollHeight: 524, clientHeight: 524, scrollWidth: 1280, clientWidth: 1280 },
    };
    const r = withDom(html, rects, { clipBoxes: ['.qr-card'], scroll },
      (s) => probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR));
    assert.equal(r.over, true, 'a clipping box nobody listed still has to be probed');
  });

  test('a DECORATIVE clip box still cannot manufacture overflow (doc §4c)', () => {
    // Discovery must not re-open the false positive the allowlist was protecting:
    // the split feature bleed clips a watermark that is MEANT to run past its box.
    const html = '<section><div class="split-feat-bleed"><div id="wm">7</div></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.split-feat-bleed': rect(0, 700, 0, 1280),
      '#wm': rect(-400, 900, -200, 600),        // deliberate bleed, all four edges
    };
    const scroll = { section: { scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280 } };
    const r = withDom(html, rects, { clipBoxes: ['.split-feat-bleed'], scroll },
      (s) => probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR));
    assert.equal(r.over, false, 'an intentional decorative bleed must never trip the ring');
  });

  test('a discovered box contributes GEOMETRY only — scroll dims never grow `over`', () => {
    // The `.chart-body` phantom: a container-responsive figure wrapper steadily reports
    // ~43 hidden px on a page that plainly fits. Counting that produced a false
    // "⚠ OVERFLOW … CLIPPED" AND fed resplitDoc, cutting a fitting slide into half-empty
    // pages. A discovered box is trusted for rect spill and nothing else — but it is
    // still flagged `clipSuspect`, so the content probe gets to adjudicate.
    const html = '<section><div class="chart-body"><svg id="fig"></svg></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.chart-body': rect(50, 650, 40, 1240),
      '#fig': rect(50, 650, 40, 1240),           // the figure fits its box exactly
    };
    const scroll = {
      section: { scrollHeight: 700, clientHeight: 700, scrollWidth: 1280, clientWidth: 1280 },
      '.chart-body': { scrollHeight: 643, clientHeight: 600, scrollWidth: 1200, clientWidth: 1200 },
    };
    const r = withDom(html, rects, { clipBoxes: ['.chart-body'], scroll },
      (s) => probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR));
    assert.equal(r.over, false, '43 phantom px must not reach autosplit or the author ring');
    assert.equal(r.clipSuspect, true, '…but it IS worth a content walk to find out');
  });

  test('#1300 — a cut in a box the allowlist never named is found by the content probe', () => {
    // The live corpus instance: a docked `footer` at `text-overflow: ellipsis` truncates
    // 43px of a real title with ZERO geometric spill anywhere. No measure the geometry
    // probe owns can see it; the content probe can, once it stops taking an allowlist.
    const html = '<section><div class="cell-stage"><p id="body">fits</p></div>'
      + '<div class="cell-footer"><footer id="ft">A title long enough to be truncated</footer></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.cell-stage': rect(0, 640, 0, 1280),
      '#body': rect(40, 90, 40, 1240),
      '.cell-footer': rect(640, 700, 0, 1280),
      '#ft': rect(650, 690, 40, 640),           // the BOX
    };
    // …and the TEXT laid out at its full nowrap width, 60px past the box that clips it.
    const textRects = { '#ft': rect(650, 690, 40, 700) };
    const r = withDom(html, rects, { clipBoxes: ['footer'], textRects },
      (s) => probeContentClipped(s, IGNORED_CLIP_SELECTOR, TOL));
    assert.equal(r.cut, true, 'an ellipsed footer loses real text and nothing was watching');
    assert.match(r.first, /A title long enough/);
  });

  test('#1300 — an invisible a11y mirror is not a bearer (KaTeX)', () => {
    // `.katex-mathml` is position:absolute inside a 1x1px clip box, but its inner text
    // sits under a `static` parent — so a 955px Range rect qualified as a cut bearer.
    // 23 such boxes across the corpus, every one a phantom. Harmless only while the old
    // gate kept this probe off math slides; loosening that gate without this fix would
    // have pilled every math slide in the repo.
    const html = '<section><span class="katex-mathml"><math><mi id="m">y</mi></math></span>'
      + '<span id="vis">y</span></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.katex-mathml': rect(0, 1, 0, 1),
      '#m': rect(-400, 555, 0, 900),            // the phantom 955px rect
      '#vis': rect(300, 340, 600, 680),
    };
    const r = withDom(html, rects, { clipBoxes: ['section', '.katex-mathml'] },
      (s) => probeContentClipped(s, IGNORED_CLIP_SELECTOR, TOL));
    assert.equal(r.cut, false, 'an accessibility mirror is not content a reader can lose');
  });

  test('#1300 — PSEUDO-ELEMENT author content counts as a bearer', () => {
    // `bearers()` walked SHOW_TEXT nodes and replaced elements; generated content is
    // neither, and a TreeWalker over a box whose only content is `::after { content:
    // attr(data-x) }` returns zero nodes and zero rects (measured, Chromium 131). Real
    // author copy rides on these — matrix-grid's axis labels, the --insight-label /
    // --stamp-label / --step-prefix families — so "no text node" was reading as
    // "nothing to lose" for exactly the labels most likely to be squeezed.
    const html = '<section><div class="cell-stage"><div id="axis" data-row-axis="Likelihood"></div></div></section>';
    const rects = {
      section: rect(0, 700, 0, 1280),
      '.cell-stage': rect(0, 700, 0, 300),
      '#axis': rect(100, 140, 10, 290),
    };
    const scroll = { '#axis': { scrollWidth: 460, clientWidth: 280, scrollHeight: 40, clientHeight: 40 } };
    const r = withDom(html, rects, { clipBoxes: ['.cell-stage'], scroll, pseudo: { axis: 'Likelihood' } },
      (s) => probeContentClipped(s, IGNORED_CLIP_SELECTOR, TOL));
    assert.equal(r.cut, true, 'a nowrap axis label pushed past its gutter is lost content');
    assert.match(r.first, /Likelihood/);
  });

  test('IGNORED_CLIP_SELECTOR names the boxes that are never evidence', () => {
    for (const s of ['.split-feat-bleed', '.watermark', '.katex-mathml', '[aria-hidden="true"]', '.overflow-tab']) {
      assert.ok(IGNORED_CLIP_SELECTOR.includes(s), `${s} must stay excluded`);
    }
  });

  test('CLIP_CELL_SELECTOR carries .panel-left — the omission that WAS #1299', () => {
    assert.match(CLIP_CELL_SELECTOR, /\.panel-left/);
  });

  test('both injected watchers pass the ignore selector — a missing arg is a silent regression', () => {
    // Both probes take it as an argument (they are .toString()-injected, so they cannot
    // reach a module constant). An omitted argument is not a crash — it is a probe that
    // silently counts the watermark and the KaTeX mirror. Nothing else would catch it.
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..', '..', '..');
    for (const f of ['lattice-emulator.js', path.join('lib', 'runtime', 'index.js')]) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.match(src, /probeSectionOverflow\(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR\)/,
        `${f} must pass IGNORED_CLIP_SELECTOR to the geometry probe`);
      assert.match(src, /probeContentClipped\(s, IGNORED_CLIP_SELECTOR, TOL\)/,
        `${f} must pass IGNORED_CLIP_SELECTOR to the content probe`);
    }
  });
});
