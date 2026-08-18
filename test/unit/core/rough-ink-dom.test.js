/**
 * Unit: the rough-ink DOM half (lib/core/rough-ink-dom.js) — measure and paint.
 *
 * jsdom has no layout engine, so every rect here is STUBBED from a geometry map
 * keyed by a `data-geom` attribute. That is a real limitation and worth being
 * honest about: this file proves the LOGIC around the measurement (which
 * structures enroll, which boundaries are chosen, how the preview's scale
 * transform is undone, what markup gets written), not that Chromium lays a
 * table out where we think it does. The real geometry is verified by rendering
 * `examples/sketch.md` and looking at it — HARD RULE #23, and there is no
 * substitute for it here.
 *
 * The two behaviors most worth pinning, because neither shows up as a test
 * failure anywhere else:
 *
 *   · THE ENROLLMENT GATE. A structure is inked only if the cascade gave it a
 *     `--rough-ink-stroke`. That is what keeps `rule-none` from sprouting a
 *     heading rule and what stops every agenda row from inking when only the
 *     active one should.
 *   · THE MARKUP SHAPE. `paintRoughInk` is a runtime markup sink (HARD RULE
 *     #22). It must build nodes, never assign a markup string.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  measureRoughInk,
  paintRoughInk,
  roughInkFingerprint,
} = require('../../../lib/core/rough-ink-dom');

/**
 * Build a jsdom window whose rects come from `data-geom="x,y,w,h"` (viewport
 * coordinates), and install it as the globals the two functions read. They are
 * written to be injected into a page, so they reference bare `document` /
 * `getComputedStyle` rather than taking a window — which is exactly why they
 * can be `.toString()`-ed into the export page, and why the test has to set
 * those globals rather than pass one in.
 */
function mount(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { window } = dom;
  const rect = (el) => {
    const [x, y, w, h] = (el.getAttribute('data-geom') || '0,0,0,0').split(',').map(Number);
    return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h };
  };
  window.Element.prototype.getBoundingClientRect = function () { return rect(this); };
  window.Element.prototype.getClientRects = function () {
    return rect(this).width || rect(this).height ? [rect(this)] : [];
  };
  // jsdom reports 0 for every offset dimension; the scale correction divides by
  // `srect.width / section.offsetWidth`, so a section needs a real one.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() { return Number(this.getAttribute('data-offset-w') || rect(this).width); },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return Number(this.getAttribute('data-offset-h') || rect(this).height); },
  });
  global.document = window.document;
  global.getComputedStyle = window.getComputedStyle.bind(window);
  return window;
}

const INK = '--rough-ink-stroke: rgb(20,20,20); --rough-ink-width: 2';
const SECTION = 'class="sketch compare-table" data-geom="0,0,1000,600"';

describe('measureRoughInk — enrollment', () => {
  test('a matching structure with no --rough-ink-stroke is skipped', () => {
    mount(`<section ${SECTION}><table data-geom="0,0,800,400"><tr data-geom="0,0,800,100"><td>a</td></tr></table></section>`);
    assert.deepEqual(measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }]), []);
  });

  test('a structure the cascade enrolled is measured', () => {
    mount(`<section ${SECTION}><table style="${INK}" data-geom="0,0,800,400"><tr data-geom="0,0,800,100"><td>a</td></tr></table></section>`);
    const [plan] = measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }]);
    assert.equal(plan.stroke, 'rgb(20,20,20)');
    assert.equal(plan.strokeWidth, 2);
    assert.equal(plan.kind, 'grid');
  });

  test('an element absent from layout is skipped even when enrolled', () => {
    // The `rule-full` case: `.masthead-rule` exists in the DOM but is
    // `display:none`, so it has no client rects. Inking it would draw a
    // second heading rule on top of the band's own.
    mount(`<section ${SECTION}><hr class="masthead-rule" style="${INK}" data-geom="0,0,0,0"></section>`);
    assert.deepEqual(
      measureRoughInk([{ id: 'masthead-rule', kind: 'underline', sel: 'section.sketch hr' }]),
      [],
    );
  });

  test('a missing --rough-ink-width falls back to 2 rather than 0', () => {
    mount(`<section ${SECTION}><hr style="--rough-ink-stroke: rgb(1,1,1)" data-geom="0,0,800,7"></section>`);
    const [plan] = measureRoughInk([{ id: 'divider', kind: 'mid', sel: 'section.sketch hr' }]);
    assert.equal(plan.strokeWidth, 2);
  });
});

describe('measureRoughInk — boundaries per kind', () => {
  const table = (rows) =>
    `<section ${SECTION}><table style="${INK}" data-geom="100,50,800,400">${rows}</table></section>`;

  test('grid takes INTERIOR row boundaries only — never the last edge', () => {
    mount(table(
      '<tr data-geom="100,50,800,100"><td data-geom="100,50,400,100">a</td><td data-geom="500,50,400,100">b</td></tr>' +
      '<tr data-geom="100,150,800,100"><td data-geom="100,150,400,100">c</td><td data-geom="500,150,400,100">d</td></tr>' +
      '<tr data-geom="100,250,800,200"><td data-geom="100,250,400,200">e</td><td data-geom="500,250,400,200">f</td></tr>',
    ));
    const [plan] = measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }]);
    // Two boundaries for three rows, in table-relative coordinates.
    assert.deepEqual(plan.hLines, [100, 200]);
    assert.deepEqual(plan.vLines, []);
    // …and the structure's own offset within the section is carried separately.
    assert.deepEqual([plan.x, plan.y, plan.w, plan.h], [100, 50, 800, 400]);
  });

  test('columns stay off unless --rough-ink-cols is 1', () => {
    const rows =
      '<tr data-geom="100,50,800,100"><td data-geom="100,50,400,100">a</td><td data-geom="500,50,400,100">b</td></tr>' +
      '<tr data-geom="100,150,800,100"><td data-geom="100,150,400,100">c</td><td data-geom="500,150,400,100">d</td></tr>';
    mount(table(rows));
    assert.deepEqual(
      measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }])[0].vLines,
      [],
    );

    mount(`<section ${SECTION}><table style="${INK}; --rough-ink-cols: 1" data-geom="100,50,800,400">${rows}</table></section>`);
    assert.deepEqual(
      measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }])[0].vLines,
      [400],
    );
  });

  test('columns come from the widest row, so a full-width header does not erase them', () => {
    mount(`<section ${SECTION}><table style="${INK}; --rough-ink-cols: 1" data-geom="0,0,900,300">` +
      '<tr data-geom="0,0,900,100"><td data-geom="0,0,900,100">spanning header</td></tr>' +
      '<tr data-geom="0,100,900,100"><td data-geom="0,100,300,100">a</td><td data-geom="300,100,300,100">b</td><td data-geom="600,100,300,100">c</td></tr>' +
      '</table></section>');
    assert.deepEqual(
      measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }])[0].vLines,
      [300, 600],
    );
  });

  test('ledger reads its rows from direct-child li, not from every descendant li', () => {
    mount(`<section class="sketch list-tabular" data-geom="0,0,1000,600"><ol style="${INK}" data-geom="0,0,800,300">` +
      '<li data-geom="0,0,800,100">a<ul><li data-geom="0,0,100,20">nested</li></ul></li>' +
      '<li data-geom="0,100,800,100">b</li>' +
      '<li data-geom="0,200,800,100">c</li>' +
      '</ol></section>');
    const [plan] = measureRoughInk([{ id: 'tabular', kind: 'ledger', sel: 'section.sketch.list-tabular > ol' }]);
    assert.deepEqual(plan.hLines, [100, 200]);
  });

  test('mid inks the centerline of its box; underline inks the bottom edge', () => {
    mount(`<section ${SECTION}><hr style="${INK}" data-geom="0,300,800,7"></section>`);
    assert.deepEqual(
      measureRoughInk([{ id: 'divider', kind: 'mid', sel: 'section.sketch hr' }])[0].hLines,
      [3.5],
    );

    mount(`<section ${SECTION}><div class="cell-masthead" style="${INK}" data-geom="0,0,800,120"></div></section>`);
    assert.deepEqual(
      measureRoughInk([{ id: 'masthead', kind: 'underline', sel: 'section.sketch .cell-masthead' }])[0].hLines,
      [120],
    );
  });
});

describe('measureRoughInk — the preview scale transform', () => {
  test('a scaled section is measured back into its own unscaled coordinates', () => {
    // The Playground scales whole slides with a CSS transform, so
    // getBoundingClientRect reports scaled pixels while the overlay — a child
    // of the section — is laid out unscaled. Half scale here: the rects are
    // half size, the plan must come back full size.
    mount('<section class="sketch compare-table" data-geom="0,0,500,300" data-offset-w="1000" data-offset-h="600">' +
      `<table style="${INK}" data-geom="50,25,400,200">` +
      '<tr data-geom="50,25,400,100"><td data-geom="50,25,400,100">a</td></tr>' +
      '<tr data-geom="50,125,400,100"><td data-geom="50,125,400,100">b</td></tr>' +
      '</table></section>');
    const [plan] = measureRoughInk([{ id: 'table', kind: 'grid', sel: 'section.sketch.compare-table table' }]);
    assert.deepEqual([plan.x, plan.y, plan.w, plan.h], [100, 50, 800, 400]);
    assert.deepEqual(plan.hLines, [200]);
  });
});

describe('paintRoughInk — markup', () => {
  const paint = (window, paths) => {
    paintRoughInk([{ sectionIndex: 0, paths }]);
    return window.document.querySelector('svg[data-lattice-rough-ink]');
  };

  test('appends one overlay per section, with a path per stroke', () => {
    const window = mount(`<section ${SECTION}></section>`);
    const svg = paint(window, [
      { d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 },
      { d: 'M0 9 C1 9, 2 9, 3 9', stroke: 'rgb(1,1,1)', strokeWidth: 1.4 },
    ]);
    assert.ok(svg);
    assert.equal(svg.parentElement.tagName.toLowerCase(), 'section');
    assert.equal(svg.querySelectorAll('path').length, 2);
    assert.equal(svg.querySelector('path').getAttribute('stroke-width'), '2');
    assert.equal(svg.getAttribute('viewBox'), '0 0 1000 600');
  });

  test('the overlay is hidden from assistive tech and from hit testing', () => {
    const window = mount(`<section ${SECTION}></section>`);
    const svg = paint(window, [{ d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 }]);
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
  });

  test('repainting replaces the previous overlay rather than stacking one', () => {
    const window = mount(`<section ${SECTION}></section>`);
    paint(window, [{ d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 }]);
    paint(window, [{ d: 'M0 0 C1 1, 2 2, 4 4', stroke: 'rgb(1,1,1)', strokeWidth: 2 }]);
    assert.equal(window.document.querySelectorAll('svg[data-lattice-rough-ink]').length, 1);
  });

  test('a section that lost its ink loses its overlay too', () => {
    const window = mount(`<section ${SECTION}></section>`);
    paint(window, [{ d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 }]);
    paintRoughInk([]);
    assert.equal(window.document.querySelectorAll('svg[data-lattice-rough-ink]').length, 0);
  });

  test('sets NO handover flag — the overlay itself is the gate', () => {
    // base.sketch.css switches its fallback off with
    // `:has(> svg[data-lattice-rough-ink])` on the section, not with a class.
    // A `rough-inked` class on <html> was tried and reverted: the `--player`
    // export bakes the DECK's DOM, so overlays survived and the root class did
    // not, and player-prune then removed the now-unmatched `:root.rough-inked`
    // rules — leaving 14 overlays with 19 fallback wave strips on top.
    // Keying on the artifact means the gate travels with the ink.
    const window = mount(`<section ${SECTION}></section>`);
    paintRoughInk([{ sectionIndex: 0, paths: [{ d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 }] }]);
    assert.ok(!window.document.documentElement.classList.contains('rough-inked'));
    assert.ok(window.document.querySelector('section > svg[data-lattice-rough-ink]'));
  });

  test('builds nodes and never assigns a markup string (HARD RULE #22)', () => {
    // The census in tools/check-ownership.js only sees sinks it can name in
    // source. This asserts the behavior: if a future edit reaches for
    // innerHTML here, this fails before the gate has to.
    const window = mount(`<section ${SECTION}></section>`);
    let assigned = false;
    const proto = window.Element.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    Object.defineProperty(proto, 'innerHTML', {
      configurable: true,
      get: original.get,
      set(v) { assigned = true; original.set.call(this, v); },
    });
    try {
      paint(window, [{ d: 'M0 0 C1 1, 2 2, 3 3', stroke: 'rgb(1,1,1)', strokeWidth: 2 }]);
    } finally {
      Object.defineProperty(proto, 'innerHTML', original);
    }
    assert.equal(assigned, false);
  });
});

describe('roughInkFingerprint — the repaint guard', () => {
  const plan = (over = {}) => ({
    key: 'table:0:0', kind: 'grid', x: 0, y: 0, w: 800, h: 400,
    hLines: [100], vLines: [], stroke: 'rgb(1,1,1)', strokeWidth: 2, ...over,
  });

  test('sub-pixel jitter in an unchanged layout does not read as a change', () => {
    // The live path drives re-measures from a MutationObserver and painting
    // mutates the DOM, so a fingerprint that moved on float noise would spin a
    // permanent requestAnimationFrame loop.
    assert.equal(
      roughInkFingerprint([plan()]),
      roughInkFingerprint([plan({ w: 800.3, hLines: [100.2] })]),
    );
  });

  test('a real geometry change does read as a change', () => {
    assert.notEqual(roughInkFingerprint([plan()]), roughInkFingerprint([plan({ hLines: [140] })]));
    assert.notEqual(roughInkFingerprint([plan()]), roughInkFingerprint([plan({ w: 900 })]));
  });

  test('a recolored rule reads as a change even at identical geometry', () => {
    // Swapping the palette in the Playground moves no box at all.
    assert.notEqual(roughInkFingerprint([plan()]), roughInkFingerprint([plan({ stroke: 'rgb(9,9,9)' })]));
  });

  test('losing a structure reads as a change', () => {
    assert.notEqual(roughInkFingerprint([plan(), plan({ key: 'table:0:1' })]), roughInkFingerprint([plan()]));
  });
});
