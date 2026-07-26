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
  deCollideLabels,
  placeLabels,
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

// ── de-collision ────────────────────────────────────────────────────────────
// Wrapping narrows a label; it cannot separate two labels that land on the same
// spot. That is a placement problem and needs its own pass — verified on the
// quadrant, where two dots in one corner overprinted each other and the
// corner's own name.
describe('deCollideLabels', () => {
  const box = (top, bottom, extra = {}) => ({ left: 0, right: 100, top, bottom, ...extra });

  test('leaves non-overlapping labels exactly where they are', () => {
    const shifts = deCollideLabels([box(0, 10), box(40, 50)]);
    assert.deepEqual(shifts, [0, 0]);
  });

  test('pushes an overlapping label clear, in its own direction', () => {
    const shifts = deCollideLabels([box(0, 10), box(5, 15, { dir: 1 })], { minGap: 1 });
    assert.equal(shifts[0], 0, 'the first box holds its place');
    assert.ok(shifts[1] > 0, 'the second moves down, away from its mark');
    // And it ends up genuinely clear.
    assert.ok(5 + shifts[1] >= 10 + 1);
  });

  test("dir -1 moves a label UP — never down through the dot it names", () => {
    const shifts = deCollideLabels([box(10, 20), box(15, 25, { dir: -1 })], { minGap: 1 });
    assert.ok(shifts[1] < 0);
    assert.ok(25 + shifts[1] <= 10 - 1);
  });

  test('labels in different columns never interfere', () => {
    const shifts = deCollideLabels([
      { left: 0, right: 40, top: 0, bottom: 10 },
      { left: 60, right: 100, top: 0, bottom: 10 },
    ]);
    assert.deepEqual(shifts, [0, 0]);
  });

  test('a fixed box never moves, and others move around it', () => {
    // How a chart pins its structural labels (a quadrant corner name) and lets
    // only the data labels shift.
    const shifts = deCollideLabels([box(0, 10, { fixed: true }), box(5, 15, { dir: 1 })], { minGap: 1 });
    assert.equal(shifts[0], 0);
    assert.ok(shifts[1] > 0);
  });

  test('a chain of three stacked labels all end up mutually clear', () => {
    const boxes = [box(0, 10), box(2, 12, { dir: 1 }), box(4, 14, { dir: 1 })];
    const shifts = deCollideLabels(boxes, { minGap: 1, maxShift: 100 });
    const final = boxes.map((b, i) => ({ top: b.top + shifts[i], bottom: b.bottom + shifts[i] }));
    for (let i = 0; i < final.length; i++) {
      for (let j = i + 1; j < final.length; j++) {
        const overlap = final[i].top < final[j].bottom && final[i].bottom > final[j].top;
        assert.ok(!overlap, `boxes ${i} and ${j} still overlap`);
      }
    }
  });

  test('gives up past maxShift rather than dragging a label away from its mark', () => {
    // A label hauled halfway across the chart no longer reads as belonging to
    // its own dot — a slight overlap is the lesser defect.
    const shifts = deCollideLabels([box(0, 100, { fixed: true }), box(50, 60, { dir: 1 })], { maxShift: 5 });
    assert.equal(shifts[1], 0);
  });

  test('is deterministic — the same input yields the same output every time', () => {
    const mk = () => [box(0, 10), box(2, 12, { dir: 1 }), box(3, 13, { dir: -1 })];
    assert.deepEqual(deCollideLabels(mk()), deCollideLabels(mk()));
  });

  test('terminates on a pathological pile-up', () => {
    const many = Array.from({ length: 40 }, () => box(0, 10, { dir: 1 }));
    const shifts = deCollideLabels(many, { maxShift: 1e9 });
    assert.equal(shifts.length, 40);
    assert.ok(shifts.every((s) => Number.isFinite(s)));
  });
});

describe('deCollideLabels — direction fallback', () => {
  const box = (top, bottom, extra = {}) => ({ left: 0, right: 100, top, bottom, ...extra });

  test('falls back to the opposite direction when the preferred one cannot clear', () => {
    // The real case: a dot near the top of the plot wants its label ABOVE it,
    // but that is where the quadrant's corner name sits. Climbing would have to
    // clear the whole corner label; dropping below the dot is the better read.
    const shifts = deCollideLabels(
      [box(0, 40, { fixed: true }), box(38, 48, { dir: -1 })],
      { minGap: 1, maxShift: 15 },
    );
    assert.ok(shifts[1] > 0, 'flipped downward rather than climbing past the obstacle');
    assert.ok(38 + shifts[1] >= 41);
  });

  test('but keeps the preferred direction whenever it fits inside maxShift', () => {
    // Same geometry, a budget big enough to climb: the preferred direction wins,
    // because dir encodes "away from my own mark", not merely "whichever is nearer".
    const shifts = deCollideLabels(
      [box(0, 40, { fixed: true }), box(38, 48, { dir: -1 })],
      { minGap: 1, maxShift: 100 },
    );
    assert.ok(shifts[1] < 0, 'climbed, as its direction asked');
  });
});


// ── placeLabels: a label is placed BESIDE ITS MARK, never slid away from it ──
describe('placeLabels', () => {
  const spec = { width: 60, fontSize: 8.5, maxLines: 1, className: 'x', emitFontSize: false };
  const at = (cx, cy, text = 'Name', r = 4) => ({ text, cx, cy, r, spec });

  test('an unobstructed label goes ABOVE its mark', () => {
    const [p] = placeLabels([at(100, 100)]);
    assert.equal(p.anchorKey, 'above');
    assert.equal(attr(p.svg, 'text-anchor'), 'middle');
  });

  test('a blocked position moves to another POSITION, not further along one axis', () => {
    // Something already occupies the space directly above the mark.
    const [p] = placeLabels([at(100, 100)], {
      obstacles: [{ left: 60, right: 140, top: 78, bottom: 95 }],
    });
    assert.notEqual(p.anchorKey, 'above');
    assert.ok(p.box.top >= 95 || p.box.bottom <= 78, 'it cleared the obstacle');
  });

  test('a vertical position on a FURTHER ring beats a side position on the nearest', () => {
    // Above and below are blocked at the first ring only; left and right are
    // wide open there. Taking the first clear position found would answer
    // "right"; the preference says climb instead, because a caption over its
    // point reads correctly and one beside it does not.
    const band = (top, bottom) => ({ left: 60, right: 140, top, bottom });
    const [p] = placeLabels([at(100, 100)], {
      obstacles: [band(86, 95), band(105, 114)],
    });
    assert.equal(p.anchorKey, 'above');
  });

  test('a side position IS used when the column above and below is full', () => {
    const band = (top, bottom) => ({ left: 60, right: 140, top, bottom });
    const [p] = placeLabels([at(100, 100)], {
      obstacles: [band(40, 99), band(101, 160)],
    });
    assert.ok(['right', 'left', 'above-right', 'above-left', 'below-right', 'below-left'].includes(p.anchorKey),
      `expected a lateral fallback, got ${p.anchorKey}`);
  });

  test('every label stays adjacent to its own mark, even in a cluster', () => {
    const items = [
      at(100, 100, 'Alpha'), at(104, 102, 'Bravo'), at(98, 104, 'Charlie'),
      at(102, 97, 'Delta'), at(106, 99, 'Echo'),
    ];
    const placedBoxes = placeLabels(items).map((p) => p.box);
    placedBoxes.forEach((b, i) => {
      const it = items[i];
      const d = Math.hypot(
        Math.max(b.left - it.cx, 0, it.cx - b.right),
        Math.max(b.top - it.cy, 0, it.cy - b.bottom),
      );
      assert.ok(d <= 40, `${items[i].text} sits ${d.toFixed(1)} units from its own mark`);
    });
  });

  test('bounds keep a label inside the plot', () => {
    const bounds = { x0: 0, y0: 90, x1: 200, y1: 200 };
    const [p] = placeLabels([at(100, 100)], { bounds });
    assert.ok(p.box.top >= bounds.y0 - 0.01, 'did not escape the top of the plot');
  });

  // The fallback re-emits the least-bad candidate, which can come from ANY ring.
  // Rebuilding it at ring 0 would move the label to a position the pass never
  // scored — the emitted box has to be the box that was chosen.
  test('the no-clear-position fallback emits the position it actually scored', () => {
    // Every position overlaps something, so the fallback runs. The emitted label
    // must still sit on one of the rings, not at an unscored distance.
    const wall = (top, bottom) => ({ left: 0, right: 200, top, bottom });
    const [p] = placeLabels([at(100, 100)], { obstacles: [wall(0, 99), wall(101, 200)] });
    const step = 8.5 * 1.18;
    const dyToMark = Math.max(p.box.top - 100, 0, 100 - p.box.bottom);
    const dxToMark = Math.max(p.box.left - 100, 0, 100 - p.box.right);
    const reach = Math.max(dyToMark, dxToMark);
    assert.ok(reach <= 4 + 4 + 2 * step + 12 + 0.01,
      `emitted at reach ${reach.toFixed(1)}, past the furthest ring plus the nudge`);
  });

  test('placement is deterministic', () => {
    const items = [at(100, 100, 'Alpha'), at(103, 101, 'Bravo')];
    const a = placeLabels(items).map((p) => p.svg).join('');
    const b = placeLabels(items).map((p) => p.svg).join('');
    assert.equal(a, b);
  });
});
