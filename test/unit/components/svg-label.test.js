/**
 * Unit: lib/components/chart/_chart-family/svg-label.js — the shared wrapping
 * `<text>` emitter for in-diagram chart labels.
 *
 * Native SVG text does not wrap, so every diagram label used to run off its
 * viewBox (the funnel clipped long stage names) or through its neighbor
 * (quadrant dot labels overprinted). This module breaks a label to a width in
 * VIEWBOX USER UNITS and emits one `<tspan>` per line inside a single `<text>`,
 * which keeps it one motion target and one popover target.
 *
 * Covered here:
 *   1. Budget: a label that fits stays one line; a long one splits; a single
 *      over-long token hard-breaks rather than overrunning.
 *   2. Shape: one <text>, N <tspan>, absolute x/y per line, escaped content.
 *   3. vAlign: 'baseline' leaves a single-line label exactly where it was (the
 *      byte-identical guarantee for short labels); 'middle' keeps a growing
 *      block centered on y; 'hanging' puts y at the top edge.
 *   4. maxLines ellipsizes the last line instead of dropping text.
 *   5. Everything scales with fontSize — the resolution-independence property.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  wrapSvgLabel,
  measureLabel,
  charBudget,
} = require('../../../lib/components/chart/_chart-family/svg-label');

const tspans = (svg) => [...svg.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map((m) => m[1]);
const attr = (svg, name) => {
  const m = svg.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const tspanY = (svg) => [...svg.matchAll(/<tspan[^>]*\by="([-\d.]+)"/g)].map((m) => Number(m[1]));

describe('charBudget', () => {
  test('divides the width by the conservative average advance', () => {
    // 60 user units at font-size 10 → advance 6 → 10 characters.
    assert.equal(charBudget(60, 10), 10);
  });

  test('never returns zero — a 0-char budget would hang the line-breaker', () => {
    assert.equal(charBudget(0.1, 100), 1);
    assert.equal(charBudget(0, 10), 1);
    assert.equal(charBudget(50, 0), 1);
  });
});

describe('measureLabel', () => {
  test('a label inside the budget stays on one line', () => {
    const m = measureLabel('Signed', { width: 76, fontSize: 8.5 });
    assert.deepEqual(m.lines, ['Signed']);
    assert.equal(m.height, 8.5);
  });

  test('a long label splits on word boundaries', () => {
    const m = measureLabel('Enterprise Procurement Qualification Review', { width: 76, fontSize: 8.5 });
    assert.ok(m.lines.length > 1, 'expected a multi-line break');
    // No line may exceed the character budget the width allows.
    const budget = charBudget(76, 8.5);
    for (const line of m.lines) assert.ok(line.length <= budget, `line over budget: ${line}`);
    // Nothing is lost: the words come back in order.
    assert.equal(m.lines.join(' '), 'Enterprise Procurement Qualification Review');
  });

  test('height grows with the line count — the box gets taller, never wider', () => {
    const one = measureLabel('Short', { width: 76, fontSize: 10 });
    const many = measureLabel('Enterprise Procurement Qualification Review', { width: 76, fontSize: 10 });
    assert.ok(many.height > one.height);
    assert.equal(many.height, (many.lines.length - 1) * 11.6 + 10);
  });

  test('a single over-long token hard-breaks instead of overrunning', () => {
    const m = measureLabel('Supercalifragilisticexpialidocious', { width: 24, fontSize: 8 });
    const budget = charBudget(24, 8);
    assert.ok(m.lines.length > 1);
    for (const line of m.lines) assert.ok(line.length <= budget);
  });

  test('maxLines ellipsizes the last line rather than dropping text silently', () => {
    const m = measureLabel('Enterprise Procurement Qualification Review Board', {
      width: 40, fontSize: 8, maxLines: 2,
    });
    assert.equal(m.lines.length, 2);
    assert.ok(m.lines[1].endsWith('…'), `expected an ellipsis, got: ${m.lines[1]}`);
  });

  test('empty text yields one empty line, not a crash', () => {
    assert.deepEqual(measureLabel('', { width: 50, fontSize: 9 }).lines, ['']);
    assert.deepEqual(measureLabel(null, { width: 50, fontSize: 9 }).lines, ['']);
  });
});

describe('wrapSvgLabel — emitted shape', () => {
  test('emits ONE <text> with one <tspan> per line', () => {
    const r = wrapSvgLabel('Enterprise Procurement Qualification Review', {
      x: 76, y: 40, width: 76, fontSize: 8.5, anchor: 'end',
    });
    assert.equal((r.svg.match(/<text\b/g) || []).length, 1, 'exactly one <text>');
    assert.equal(tspans(r.svg).length, r.lines.length);
    assert.equal(attr(r.svg, 'text-anchor'), 'end');
  });

  test('every line carries an absolute x, so text-anchor re-anchors each line', () => {
    const r = wrapSvgLabel('Enterprise Procurement Qualification Review', {
      x: 76, y: 40, width: 76, fontSize: 8.5, anchor: 'end',
    });
    const xs = [...r.svg.matchAll(/<tspan[^>]*\bx="([-\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(xs.length > 1);
    assert.ok(xs.every((v) => v === 76), 'all lines anchor at the same x');
  });

  test('lines step down by exactly one line height', () => {
    const r = wrapSvgLabel('Enterprise Procurement Qualification Review', {
      x: 0, y: 40, width: 40, fontSize: 10,
    });
    const ys = tspanY(r.svg);
    for (let i = 1; i < ys.length; i++) {
      assert.ok(Math.abs((ys[i] - ys[i - 1]) - 11.6) < 0.01, 'uniform 1.16em leading');
    }
  });

  test('markup in the label is escaped, never injected', () => {
    const r = wrapSvgLabel('A & B <script>x</script>', { x: 0, y: 0, width: 400, fontSize: 9 });
    assert.ok(!r.svg.includes('<script>'));
    assert.ok(r.svg.includes('&amp;'));
    assert.ok(r.svg.includes('&lt;script&gt;'));
  });

  test('class + extra attributes pass through', () => {
    const r = wrapSvgLabel('Stage', {
      x: 0, y: 0, width: 100, fontSize: 9,
      className: 'funnel-label', attrs: ' data-mark="2" data-anima-role="label"',
    });
    assert.ok(r.svg.includes('class="funnel-label"'));
    assert.ok(r.svg.includes('data-mark="2"'));
    assert.ok(r.svg.includes('data-anima-role="label"'));
  });

  test('the kernel emits the font size it wrapped to, so math and glyphs cannot desync', () => {
    const r = wrapSvgLabel('Stage', { x: 0, y: 0, width: 100, fontSize: 8.5 });
    assert.equal(attr(r.svg, 'font-size'), '8.5');
  });
});

describe('wrapSvgLabel — vertical alignment', () => {
  test("vAlign 'baseline' puts a single line at exactly the y it was given", () => {
    // The byte-compatibility guarantee: a short label does not move when a
    // chart migrates from plain <text y> to the wrapping emitter.
    const r = wrapSvgLabel('Signed', { x: 0, y: 87.5, width: 76, fontSize: 8.5 });
    assert.deepEqual(tspanY(r.svg), [87.5]);
  });

  test("vAlign 'middle' keeps the block centered as it grows lines", () => {
    const one = wrapSvgLabel('Short', { x: 0, y: 100, width: 76, fontSize: 10, vAlign: 'middle' });
    const many = wrapSvgLabel('Enterprise Procurement Qualification Review', {
      x: 0, y: 100, width: 76, fontSize: 10, vAlign: 'middle',
    });
    const center = (r) => { const ys = tspanY(r.svg); return (ys[0] + ys[ys.length - 1]) / 2; };
    assert.equal(center(one), 100);
    assert.ok(Math.abs(center(many) - 100) < 0.01, 'a 3-line label stays centered on y');
  });

  test("vAlign 'hanging' treats y as the top edge — the block grows downward", () => {
    const r = wrapSvgLabel('Enterprise Procurement Qualification', {
      x: 0, y: 50, width: 60, fontSize: 10, vAlign: 'hanging',
    });
    const ys = tspanY(r.svg);
    assert.equal(ys[0], 60, 'first baseline sits one font-size below the top edge');
    assert.ok(ys.every((v) => v >= 50));
  });

  test('top/bottom bracket the painted block for the de-collision pass', () => {
    const r = wrapSvgLabel('Enterprise Procurement Qualification Review', {
      x: 0, y: 100, width: 60, fontSize: 10, vAlign: 'middle',
    });
    const ys = tspanY(r.svg);
    assert.ok(r.top < ys[0], 'top is above the first baseline');
    assert.ok(r.bottom > ys[ys.length - 1], 'bottom is below the last baseline');
    assert.ok(r.bottom - r.top >= r.height);
  });
});

describe('resolution independence', () => {
  test('the break is a function of the width:fontSize RATIO, not absolute size', () => {
    // The same chart authored in a viewBox twice as large must break its labels
    // identically — that is what keeps a chart proportionate from SD to 8K.
    const small = measureLabel('Enterprise Procurement Qualification Review', { width: 76, fontSize: 8.5 });
    const large = measureLabel('Enterprise Procurement Qualification Review', { width: 760, fontSize: 85 });
    assert.deepEqual(small.lines, large.lines);
  });

  test('geometry scales linearly with the font size', () => {
    const a = wrapSvgLabel('Enterprise Procurement Qualification Review', { x: 10, y: 20, width: 76, fontSize: 8.5 });
    const b = wrapSvgLabel('Enterprise Procurement Qualification Review', { x: 100, y: 200, width: 760, fontSize: 85 });
    assert.equal(a.lines.length, b.lines.length);
    assert.ok(Math.abs(b.height - a.height * 10) < 0.01);
  });
});
