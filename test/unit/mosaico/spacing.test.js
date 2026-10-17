// @laticent/mosaico's spacing and placement: padding, separate column and row gaps, align,
// container units, and the `frame` / `placed` output.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pack, toGrid } = require('@laticent/mosaico');

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);
const right = (r) => r.x + r.w;
const bottom = (r) => r.y + r.h;

test('tree without the new options: placed is the layout scaled to the box and centered', () => {
  const r = pack([3 / 2, 2 / 3, 1], { aspect: 16 / 9 }, { gap: 0.012 });
  const k = Math.min(1, (16 / 9) / r.aspect);
  near(r.frame.w, r.aspect * k, 'frame width');
  near(r.frame.x, (16 / 9 - r.frame.w) / 2, 'centered across');
  r.placed.forEach((p, i) => {
    near(p.w, r.rects[i].w * k, `box ${i} width`);
    near(p.x, r.frame.x + r.rects[i].x * k, `box ${i} left`);
  });
  assert.equal(r.columnGap, 0.012);
  assert.equal(r.rowGap, 0.012);
  assert.equal(r.gap, 0.012);
});

test('tree in pixels: padding insets the frame and every gutter is exactly its size', () => {
  // Two squares fit the height of 960 × 360 (inside 20 px of padding), so they stand 360 tall.
  const r = pack([1, 1], { width: 1000, height: 400 }, { padding: 20, gap: 30 });
  const [a, b] = [...r.placed].sort((p, q) => p.x - q.x);
  near(a.h, 360, 'full inner height');
  near(a.w, 360, 'square');
  near(b.x - right(a), 30, 'column gap');
  near(r.frame.y, 20, 'top padding');
  near(r.frame.x, 20 + (960 - 750) / 2, 'centered in the space left');
});

test('tree: a layout wider than the box keeps exact gutters when it shrinks to the width', () => {
  const r = pack([1, 1], { width: 500, height: 400 }, { padding: 20, gap: 30 });
  const [a, b] = [...r.placed].sort((p, q) => p.x - q.x);
  near(a.w, 215, 'width-limited square');
  near(a.h, 215, 'still square');
  near(b.x - right(a), 30, 'column gap still 30');
  near(r.frame.x, 20);
  near(r.frame.w, 460, 'spans the inner width');
  near(r.frame.y, 20 + (360 - 215) / 2, 'centered down');
});

test('tree: column and row gaps are separate', () => {
  const r = pack([1, 1], { width: 400, height: 1000 }, { columnGap: 5, rowGap: 50, order: 'ordered' });
  const [a, b] = [...r.placed].sort((p, q) => p.y - q.y);
  assert.equal(r.arrangement, 'H(0,1)');
  near(b.y - bottom(a), 50, 'row gap');
  near(a.w / a.h, 1, 'square');
  // And toGrid rebuilds the rects with the matching gap on each axis.
  const g = toGrid(r);
  near(g.rows.reduce((s, v) => s + v, 0) + (g.rows.length - 1) * r.rowGap, 1, 'rows plus row gaps span the layout');
});

test('tree: every box keeps its item\'s shape, under any padding and gaps', () => {
  const items = [1.5, 0.67, 1, 1.78, 0.75];
  const r = pack(items, { width: 1280, height: 720 }, { padding: { top: 40, right: 10, bottom: 0, left: 90 }, columnGap: 12, rowGap: 24 });
  r.placed.forEach((p, i) => {
    near(p.w / p.h, items[i], `box ${i}`, 1e-9);
  });
  for (const p of r.placed) {
    assert.ok(p.x >= 90 - 1e-9 && right(p) <= 1270 + 1e-9, 'inside the padding across');
    assert.ok(p.y >= 40 - 1e-9 && bottom(p) <= 720 + 1e-9, 'inside the padding down');
  }
});

test('tree: align puts the frame at the start, center or end of the space left', () => {
  const at = (align) => pack([1], { width: 300, height: 100 }, { align }).frame.x;
  near(at('start'), 0);
  near(at('center'), 100);
  near(at('end'), 200);
});

test('tree: units are only a scale, so pixels and fractions give the same layout', () => {
  const frac = pack([1.5, 0.67, 1], { aspect: 2 }, { gap: 0.02, padding: 0.05 });
  const px = pack([1.5, 0.67, 1], { width: 1000, height: 500 }, { gap: 10, padding: 25 });
  assert.equal(px.arrangement, frac.arrangement);
  px.placed.forEach((p, i) => {
    near(p.x, frac.placed[i].x * 500, 'x', 1e-7);
    near(p.w, frac.placed[i].w * 500, 'w', 1e-7);
  });
});

test('tree: fill stretches the frame to close the margin, by at most stretch', () => {
  const r = pack([1, 1], { aspect: 2.1 }, { fit: 'fill', stretch: 0.08 });
  near(r.frame.w, 2.1, 'fills the width');
  near(r.frame.h, 1, 'and the height');
});

test('tree: a bad align or padding is a caller error', () => {
  assert.throws(() => pack([1], { aspect: 1 }, { align: 'justify' }), RangeError);
  assert.throws(() => pack([1], { aspect: 1 }, { align: 'middle' }), RangeError);
  assert.throws(() => pack([1], { aspect: 1 }, { padding: 0.5 }), RangeError);
  assert.throws(() => pack([1], { width: 100 }, {}), RangeError, 'a width alone has no shape');
  near(pack([1], { aspect: 2, height: 50 }, {}).frame.h, 50, 'aspect and height make a size');
});

test('rows in pixels: the same wall as in fractions of the width, inset by the padding', () => {
  const marks = [4, 1, 0.5, 3, 3, 1];
  const o = { strategy: 'rows', maxPerRow: 4 };
  const frac = pack(marks, {}, { ...o, gap: 0.05, heightCap: 0.1 });
  const px = pack(marks, { width: 1100 }, { ...o, gap: 50, heightCap: 100, padding: 50 });
  assert.equal(px.arrangement, frac.arrangement);
  px.placed.forEach((p, i) => {
    near(p.x, 50 + frac.rects[i].x * 1000, 'x', 1e-7);
    near(p.h, frac.rects[i].h * 1000, 'h', 1e-7);
  });
  near(px.heightCap, frac.heightCap * 1000, 'heightCap in pixels', 1e-9);
  near(px.frame.h, 1000 / frac.aspect, 'frame height', 1e-7);
});

test('rows: align and justify place each row; the last row of a justified wall starts at the left', () => {
  const marks = [1, 1, 1, 1, 1, 1];
  const o = { strategy: 'rows', gap: 0.05, heightCap: 0.1, maxPerRow: 4 };
  const just = pack(marks, {}, { ...o, align: 'justify' });
  const [first, last] = [just.rows[0], just.rows.at(-1)];
  assert.ok(first.length >= 2);
  near(just.cells[first[0]].x, 0, 'justified row starts at the edge');
  near(right(just.cells[first.at(-1)]), 1, 'and ends at the edge');
  near(just.cells[last[0]].x, 0, 'last row starts at the left');
  const end = pack(marks, {}, { ...o, align: 'end' });
  for (const row of end.rows) near(right(end.cells[row.at(-1)]), 1, 'end: every row ends at the edge');
  const lastCenter = pack(marks, {}, { ...o, align: 'justify', lastRow: 'center' });
  const lr = lastCenter.rows.at(-1);
  near(lastCenter.cells[lr[0]].x, 1 - right(lastCenter.cells[lr.at(-1)]), 'lastRow center');
});

test('rows: column and row gaps are separate, and the container height caps the wall', () => {
  const marks = new Array(8).fill(2);
  const r = pack(marks, { width: 1000 }, { strategy: 'rows', columnGap: 10, rowGap: 80, heightCap: 100, maxPerRow: 4 });
  const [r0, r1] = r.rows;
  near(r.placed[r0[1]].x - right(r.placed[r0[0]]), 10, 'column gap');
  near(r.cells[r1[0]].y * 1000 - bottom(r.cells[r0[0]]) * 1000, 80, 'row gap', 1e-7);
  const capped = pack(marks, { width: 1000, height: 200 }, { strategy: 'rows', gap: 10, heightCap: 100, maxPerRow: 4, padding: 20 });
  assert.ok(capped.frame.h <= 160 + 1e-7, `fits inside the padded height: ${capped.frame.h}`);
});
