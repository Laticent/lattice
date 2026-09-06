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
 *   6. ORDER: a column of labels never reads against the marks it names, and
 *      the pass buys that with a POSITION rather than by dropping a name.
 *   7. The leader: drawn only when the label had to travel, springing from the
 *      mark's rim and stopping short of the box.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  wrapSvgLabel,
  measureLabel,
  charBudget,
  deCollideLabels,
  placeLabels,
  leaderLine,
  segmentEntersBox,
  columnShare,
  LINE_HEIGHT,
  LEADER_MIN_GAP,
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
  // scored. The FIXTURE has to make that discriminating: an earlier version of
  // this test used one whose least-bad candidate was on ring 0 anyway, so the
  // bug was a no-op inside it, and asserted a one-sided `<=` bound that a
  // SMALLER reach also satisfied. Both holes are closed here — ring 0 and ring 1
  // are fully walled off, and the assertion pins the reach to ring 2's exactly.
  test('the no-clear-position fallback emits the position it actually scored', () => {
    const step = 8.5 * LINE_HEIGHT;
    const r = 4, gap = 4;
    const ring = (k) => r + gap + k * step;
    const box = (l, rt, t, b) => ({ left: l, right: rt, top: t, bottom: b });
    // Rings 0 and 1 fully enclosed, ring 2 clipped: NOTHING clears, so the
    // fallback runs, and its least-bad candidate is NOT on ring 0 — which is
    // what makes this discriminating. (An earlier fixture's least-bad was ring
    // 0, so rebuilding at ring 0 was a no-op inside it and it proved nothing.)
    const inner = ring(1) + 2;
    const obstacles = [
      box(100 - inner, 100 + inner, 100 - inner, 100 - 1),
      box(100 - inner, 100 + inner, 100 + 1, 100 + inner),
      box(100 - inner, 100 - 1, 100 - inner, 100 + inner),
      box(100 + 1, 100 + inner, 100 - inner, 100 + inner),
      box(0, 400, 100 - ring(2) - 40, 100 - ring(2) + 3),
      box(0, 400, 100 + ring(2) - 3, 100 + ring(2) + 40),
      box(-300, 100 - ring(2) + 3, 0, 400),
      box(100 + ring(2) - 3, 500, 0, 400),
    ];
    const [p] = placeLabels([at(100, 100)], { obstacles });
    assert.equal(p.fallback, true, 'the fixture must actually reach the fallback');
    assert.ok(p.ring >= 1, `the fixture must force a non-zero ring, got ring ${p.ring}`);
    // The pass reports the ring it scored; the emitted label must be built at
    // THAT ring's reach, not rebuilt at ring 0's.
    assert.ok(Math.abs(p.reach - ring(p.ring)) < 0.01,
      `emitted at reach ${p.reach.toFixed(2)} but scored ring ${p.ring} is ${ring(p.ring).toFixed(2)}`);
  });

  // Some sets cannot be laid out at all — five three-line names in one quadrant
  // is ~76% of that quadrant in label. No choice of position fixes an AREA
  // problem, and painting them through each other loses BOTH names without
  // telling the reader. A label that still collides after every position and the
  // nudge is dropped instead; the name still rides `data-label`, the popover and
  // the speaker note.
  test('a label that cannot be placed clear is dropped, not overprinted', () => {
    const wall = (top, bottom) => ({ left: 0, right: 300, top, bottom });
    const [p] = placeLabels([at(100, 100)], { obstacles: [wall(0, 99), wall(101, 300)] });
    assert.equal(p.hidden, true);
    assert.equal(p.svg, '');
  });

  test('a label that CAN be placed is never dropped', () => {
    const res = placeLabels([at(100, 100), at(160, 100), at(100, 160)]);
    assert.ok(res.every((p) => !p.hidden && p.svg), 'a sparse scatter keeps every label');
  });

  test('placement is deterministic', () => {
    const items = [at(100, 100, 'Alpha'), at(103, 101, 'Bravo')];
    const a = placeLabels(items).map((p) => p.svg).join('');
    const b = placeLabels(items).map((p) => p.svg).join('');
    assert.equal(a, b);
  });
});

describe('placeLabels — a column never reads against its marks', () => {
  const spec = { width: 60, fontSize: 8.5, maxLines: 1, className: 'x', emitFontSize: false };
  const at = (cx, cy, text = 'Name', r = 4) => ({ text, cx, cy, r, spec });
  const mid = (b) => (b.top + b.bottom) / 2;

  // Every pair of placed labels that share a column, scored against the marks
  // they name. Returns the inverted pairs, so a fix that merely moves an
  // inversion elsewhere in the set still shows up here.
  const inversions = (items, placed) => {
    const bad = [];
    for (let i = 0; i < items.length; i++) {
      if (placed[i].hidden) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (placed[j].hidden) continue;
        if (columnShare(placed[i].box, placed[j].box) < 0.5) continue;
        const label = Math.sign(mid(placed[i].box) - mid(placed[j].box));
        if (label === 0) continue;
        if (label !== Math.sign(items[i].cy - items[j].cy)) bad.push(`${items[i].text}/${items[j].text}`);
      }
    }
    return bad;
  };

  // THE FIXTURES ARE CALIBRATED, and that is the whole point of them. Two marks
  // in a column resolve themselves — each mark is an obstacle for every label,
  // so the upper one's mark blocks the lower one's `above` and the order falls
  // out. It takes THREE marks inside a label-height for the greedy pass to
  // paint a column that reads backwards, and both fixtures below were picked by
  // running the search with the order term switched off: at 4-unit spacing the
  // three-mark set inverts and at 3-unit spacing the four-mark set does. A
  // fixture that stays clean either way tests nothing, which is what an earlier
  // pair of them did.
  test('three marks inside a label-height keep their names in the marks order', () => {
    const items = [at(100, 100, 'Alpha'), at(100, 104, 'Bravo'), at(100, 108, 'Charlie')];
    const placed = placeLabels(items);
    assert.deepEqual(inversions(items, placed), []);
    // Stated twice on purpose: the scored property above, and the reading a
    // human takes off the slide.
    const byPaint = items
      .map((it, i) => ({ name: it.text, y: mid(placed[i].box) }))
      .sort((a, b) => a.y - b.y).map((q) => q.name);
    assert.deepEqual(byPaint, ['Alpha', 'Bravo', 'Charlie']);
  });

  test('order is bought with a POSITION, never by dropping or overprinting a name', () => {
    const items = [
      at(100, 100, 'Alpha'), at(100, 103, 'Bravo'),
      at(100, 106, 'Charlie'), at(100, 109, 'Delta'),
    ];
    const placed = placeLabels(items);
    assert.deepEqual(inversions(items, placed), []);
    assert.ok(placed.every((p) => !p.hidden && p.svg), 'no name was dropped to buy the order');
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i].box;
        const b = placed[j].box;
        const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        assert.equal(hit, false, `${items[i].text} and ${items[j].text} overprint`);
      }
    }
  });

  test('an inverted position is still CLEAN — order loses to a collision, never wins', () => {
    // Everything above the pair is walled off, so the only clear positions read
    // backwards. Order is worth an anchor, never a name: the pass takes the
    // inversion rather than overprinting or hiding.
    const wall = { left: 40, right: 160, top: 0, bottom: 99 };
    const items = [at(100, 100, 'Alpha'), at(100, 104, 'Bravo'), at(100, 108, 'Charlie')];
    const placed = placeLabels(items, { obstacles: [wall] });
    assert.ok(placed.every((p) => !p.hidden && p.svg), 'every name is still painted');
  });

  test('labels that do not share a column carry no order claim', () => {
    // A three-line name 300 units away sits LOWER than this one-line name even
    // though its mark is higher — an inversion, if the two counted as one
    // column. They do not, so the short name must keep its preferred position
    // rather than climb a ring to fix a reading nobody can make. (Without the
    // column test this label jumps ~10 units up the plot.)
    const three = { width: 26, fontSize: 8.5, maxLines: 3, className: 'x', emitFontSize: false };
    const placed = placeLabels([
      { text: 'Tall name over here', cx: 400, cy: 100, r: 4, spec: three },
      at(100, 96, 'Short'),
    ]);
    assert.equal(placed[1].anchorKey, 'above');
    assert.equal(placed[1].ring, 0, 'it stayed on the nearest ring');
  });

  test('two marks at the same height carry no order claim either', () => {
    // Nothing to contradict, so no candidate may be billed for it. Without this
    // escape every position for the second label costs the same phantom penalty
    // and the cheap one stops being cheapest: the label takes `above-right`
    // (cost 6) over the `below` (cost 1) it should have, for no reason a reader
    // could name.
    const tall = { width: 26, fontSize: 8.5, maxLines: 3, className: 'x', emitFontSize: false };
    const placed = placeLabels([
      { text: 'Tall name here', cx: 100, cy: 100, r: 4, spec: tall },
      at(108, 100, 'Level'),
    ]);
    assert.ok(columnShare(placed[0].box, placed[1].box) >= 0.5, 'the fixture must put them in one column');
    assert.equal(placed[1].anchorKey, 'below');
  });

  // COLUMN_SHARE ITSELF, not just its formula. Deleting the guard already fails
  // an arm above, but NEUTERING it did not: at 0.01 every grazing pair counts as
  // a column, at 0.99 almost none does, and both survived the suite this change
  // first shipped. These two arms hold the constant from both sides.
  test('a pair that barely grazes is NOT a column — the threshold is not near zero', () => {
    // ~17% overlap: below the half the docblock claims, so no order claim is
    // made and both labels keep their preferred anchor. At COLUMN_SHARE = 0.01
    // the second one is billed a penalty and moves.
    const three = { width: 26, fontSize: 8.5, maxLines: 3, className: 'x', emitFontSize: false };
    const placed = placeLabels([
      { text: 'Tall name here', cx: 100, cy: 100, r: 4, spec: three },
      at(118, 96, 'Level'),
    ]);
    const share = columnShare(placed[0].box, placed[1].box);
    assert.ok(share > 0 && share < 0.5, `fixture must graze, not stack: got ${share.toFixed(2)}`);
    // No order claim binds at this overlap, so the label keeps the seat the
    // collision geometry gives it. Drop the threshold to 0.01 and a phantom
    // penalty sends it to `above-right` instead.
    assert.equal(placed[1].anchorKey, 'below');
    assert.equal(placed[1].ring, 0);
  });

  test('a partly-overlapping stack IS a column — the threshold is not near one', () => {
    // Three marks offset horizontally as well as vertically, so the pairs share
    // most of a box but not all of it — the band a 0.99 threshold would stop
    // counting. Found by diffing 4,000 randomized layouts against that mutant;
    // it changes 1,500 of them, and this is one of the smallest.
    const spec = { width: 54, fontSize: 7.5, maxLines: 3, className: 'x', emitFontSize: false };
    const mk = (cx, cy, text) => ({ text, cx, cy, r: 3.8, spec });
    const items = [mk(131.21, 90.65, 'Alpha'), mk(128.53, 104.12, 'Bravo'), mk(123.09, 98.74, 'Charlie')];
    const placed = placeLabels(items, { bounds: { x0: 36, y0: 2, x1: 318, y1: 156 }, gap: 2.4, minGap: 1.2 });
    const share = columnShare(placed[0].box, placed[1].box);
    assert.ok(share >= 0.5 && share < 0.99, `fixture must sit in the band, got ${share.toFixed(3)}`);
    // The order claim binds here, so Charlie takes an adjacent diagonal. At 0.99
    // it stops binding and Charlie climbs two rings instead.
    assert.equal(placed[2].anchorKey, 'above-left');
    assert.equal(placed[2].ring, 0);
  });

  test('columnShare is the overlap as a fraction of the NARROWER box', () => {
    // The narrower box is the denominator, so a short name fully covered by a
    // wide one counts as a column — which is how a reader sees it.
    const wide = { left: 0, right: 100, top: 0, bottom: 10 };
    const narrow = { left: 40, right: 60, top: 0, bottom: 10 };
    assert.equal(columnShare(wide, narrow), 1);
    assert.equal(columnShare(narrow, wide), 1);
    assert.equal(columnShare(wide, { left: 200, right: 300, top: 0, bottom: 10 }), 0);
    assert.equal(columnShare(wide, { left: 90, right: 110, top: 0, bottom: 10 }), 0.5);
    // Fails CLOSED, not open: an uncomputable overlap is not a column.
    assert.equal(columnShare(wide, { left: NaN, right: NaN, top: 0, bottom: 10 }), 0);
  });
});

describe('leaderLine', () => {
  const box = (left, right, top, bottom) => ({ svg: '<text/>', box: { left, right, top, bottom } });
  const mark = { cx: 100, cy: 100, r: 4 };

  test('a label already touching its mark gets no leader', () => {
    // Just inside the threshold: a stub between two things that are visibly
    // together reads as a speck of dirt, not as a pointer.
    const near = 100 - mark.r - LEADER_MIN_GAP + 0.5;
    assert.equal(leaderLine(mark, box(90, 110, near - 10, near)), '');
  });

  test('a label that travelled gets one, springing from the rim of its own mark', () => {
    const far = 100 - mark.r - LEADER_MIN_GAP - 5;
    const line = leaderLine(mark, box(90, 110, far - 10, far));
    assert.match(line, /^<line class="chart-leader" /);
    const y1 = Number(/y1="([-\d.]+)"/.exec(line)[1]);
    const y2 = Number(/y2="([-\d.]+)"/.exec(line)[1]);
    // It starts just outside the mark and stops just short of the box, so it
    // touches neither — a pointer, not a tether.
    assert.ok(y1 < mark.cy && y1 > mark.cy - mark.r - 2, `y1 ${y1} is not on the mark's rim`);
    assert.ok(y2 > far - 1 && y2 < far + 2, `y2 ${y2} does not stop at the box`);
  });

  test('a hidden label gets no leader — there is nothing to lead to', () => {
    const far = 100 - mark.r - LEADER_MIN_GAP - 5;
    assert.equal(leaderLine(mark, { svg: '', box: { left: 90, right: 110, top: far - 10, bottom: far } }), '');
  });

  test('a blocked corridor re-routes to the nearest point that is clear', () => {
    // The head-on line would pass through a neighbor's name. The leader is not
    // abandoned — it lands on the nearest reachable point of its own box
    // instead, so the label keeps its pointer and the neighbor keeps its ink.
    const far = 100 - mark.r - LEADER_MIN_GAP - 20;
    const target = box(80, 130, far - 10, far);
    const wall = { left: 96, right: 104, top: far - 4, bottom: far + 4 };
    const direct = leaderLine(mark, target);
    const routed = leaderLine(mark, target, { avoid: [wall] });
    assert.notEqual(direct, '', 'the fixture must want a leader');
    assert.notEqual(routed, '', 'a re-route was available and should have been taken');
    assert.notEqual(routed, direct, 'it must not be the blocked line');
    const x2 = Number(/x2="([-\d.]+)"/.exec(routed)[1]);
    assert.ok(x2 <= wall.left || x2 >= wall.right, `re-routed line still lands inside the wall at x=${x2}`);
  });

  test('a label reachable at no clear point gets no leader at all', () => {
    // An honestly missing pointer beats a confidently wrong one: a line through
    // a neighbor's letterforms sends the reader to the wrong name.
    const far = 100 - mark.r - LEADER_MIN_GAP - 20;
    const target = box(80, 130, far - 10, far);
    const wall = { left: 0, right: 300, top: far + 1, bottom: far + 3 };
    assert.notEqual(leaderLine(mark, target), '', 'the fixture must want a leader');
    assert.equal(leaderLine(mark, target, { avoid: [wall] }), '');
  });

  test('a box that merely touches the corridor does not refuse the leader', () => {
    // Liang-Barsky on the INTERIOR: a segment ending on an edge, or running
    // alongside one, is not passing through it.
    const far = 100 - mark.r - LEADER_MIN_GAP - 20;
    const target = box(80, 130, far - 10, far);
    const touching = { left: 100, right: 140, top: far - 30, bottom: far - 25 };
    assert.notEqual(leaderLine(mark, target, { avoid: [touching] }), '');
  });

  // The boundary cases, pinned directly, because the leader arms above cannot
  // see them: `segmentEntersBox` answers about the INTERIOR, and a mutation
  // that merely reclassifies a touch as a crossing changes no visible leader on
  // any fixture — it just quietly refuses lines that were fine.
  test('segmentEntersBox is about the interior, not the boundary', () => {
    const b = { left: 10, right: 20, top: 10, bottom: 20 };
    assert.equal(segmentEntersBox(15, 0, 15, 30, b), true, 'straight through');
    assert.equal(segmentEntersBox(12, 12, 18, 18, b), true, 'starts and ends inside');
    assert.equal(segmentEntersBox(5, 0, 5, 30, b), false, 'passes well to the side');
    assert.equal(segmentEntersBox(15, 0, 15, 10, b), false, 'stops ON the top edge');
    assert.equal(segmentEntersBox(0, 0, 0, 0, b), false, 'zero length, outside');
    // A degenerate point INSIDE is inside, and answering `true` is the safe
    // side: it refuses a leader rather than drawing one into a neighbor. It is
    // unreachable from `leaderLine`, which skips a zero-length candidate.
    assert.equal(segmentEntersBox(15, 15, 15, 15, b), true, 'zero length, inside');
  });

  test('the class comes from the caller, so one emitter serves the whole family', () => {
    const far = 100 - mark.r - LEADER_MIN_GAP - 5;
    const line = leaderLine(mark, box(90, 110, far - 10, far), { className: 'other-leader' });
    assert.match(line, /class="other-leader"/);
  });
});
