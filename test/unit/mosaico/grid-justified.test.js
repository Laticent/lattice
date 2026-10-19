// The `grid` strategy and the `justified` goal of `rows` (design note §4.4, §8.7).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pack, toGrid } = require('@laticent/mosaico');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const J = (aspects, container, extra = {}) => pack(aspects, container, { strategy: 'rows', goal: 'justified', ...extra });
const G = (aspects, container, extra = {}) => pack(aspects, container, { strategy: 'grid', ...extra });

describe('rows with the justified goal', () => {
  test('every row but the last fills the width exactly, its items at one height', () => {
    const r = J([1.5, 1, 0.67, 1.78, 1, 1.33, 0.75, 2, 1, 1.5], { width: 1000 }, { gap: 8, rowGap: 8, targetRowHeight: 200 });
    assert.equal(r.ok, true);
    r.rows.slice(0, -1).forEach((row) => {
      const first = r.placed[row[0]];
      const last = r.placed[row[row.length - 1]];
      near(last.x + last.w - first.x, 1000);
      for (const i of row) near(r.placed[i].h, first.h);
    });
    r.placed.forEach((p, i) => {
      near(p.w / p.h, [1.5, 1, 0.67, 1.78, 1, 1.33, 0.75, 2, 1, 1.5][i]);
    });
  });

  test('breaks keep rows near the target: one wide strip becomes one row, a tall tile stays alone', () => {
    const wide = J([4, 4, 4], { width: 1200 }, { targetRowHeight: 100 });
    assert.deepEqual(wide.rows, [[0, 1, 2]]);
    near(wide.placed[0].h, 100);
    const mixed = J([4, 4, 0.5], { width: 600 }, { targetRowHeight: 150 });
    assert.ok(mixed.rows.length >= 2);
  });

  test('the last row is not stretched: it keeps the target height, left-aligned by default, or centered on request', () => {
    const a = J([1, 1, 1, 1, 1], { width: 1000 }, { targetRowHeight: 250 });
    assert.deepEqual(a.rows, [[0, 1, 2, 3], [4]]);
    near(a.placed[4].h, 250);
    near(a.placed[4].x, 0);
    const c = J([1, 1, 1, 1, 1], { width: 1000 }, { targetRowHeight: 250, lastRow: 'center' });
    near(c.placed[4].x, 375);
    assert.throws(() => J([1], { width: 100 }, { lastRow: 'justify' }), /start, center or end/);
  });

  test('the height is an output: frame.h is the rows and row gaps, and padding and units are respected', () => {
    const r = J([1, 1, 1, 1], { width: 440 }, { targetRowHeight: 100, gap: 10, rowGap: 10, padding: 20 });
    assert.equal(r.ok, true);
    near(r.frame.w, 400);
    near(r.placed[0].x, 20);
    near(r.placed[0].y, 20);
    const bottom = Math.max(...r.placed.map((p) => p.y + p.h));
    near(r.frame.y + r.frame.h, bottom);
  });

  test('maxPerRow caps a row, and an empty list is refused; determinism', () => {
    const r = J([1, 1, 1, 1, 1, 1], { width: 1000 }, { targetRowHeight: 100, maxPerRow: 2 });
    assert.ok(r.rows.every((row) => row.length <= 2));
    assert.deepEqual(J([], { width: 1 }), { ok: false, reason: 'empty' });
    assert.equal(JSON.stringify(J([1, 2, 3], { width: 500 })), JSON.stringify(J([1, 2, 3], { width: 500 })));
  });

  test('property: random lists give full rows, one height per row, exact shapes, no overlap, rows stacked with the gap', () => {
    const rand = rng(21);
    for (let n = 0; n < 200; n++) {
      const count = 1 + Math.floor(rand() * 25);
      const aspects = Array.from({ length: count }, () => 0.4 + rand() * 2.4);
      const W = 300 + rand() * 1500;
      const gap = rand() * 20;
      const rowGap = rand() * 20;
      const r = J(aspects, { width: W }, { gap, rowGap, targetRowHeight: 80 + rand() * 250 });
      assert.equal(r.ok, true);
      const flat = r.rows.flat();
      assert.deepEqual(flat, aspects.map((_, i) => i), 'every item once, in order');
      let y = 0;
      r.rows.forEach((row, ri) => {
        const h = r.placed[row[0]].h;
        row.forEach((i) => { near(r.placed[i].h, h, 1e-9); near(r.placed[i].w / r.placed[i].h, aspects[i], 1e-9); near(r.placed[i].y, y, 1e-9); });
        if (ri < r.rows.length - 1) {
          const lastItem = r.placed[row[row.length - 1]];
          near(lastItem.x + lastItem.w, W, 1e-9);
        }
        row.slice(1).forEach((i, k) => {
          near(r.placed[i].x, r.placed[row[k]].x + r.placed[row[k]].w + gap, 1e-9);
        });
        y += h + rowGap;
      });
    }
  });
});

describe('the grid strategy', () => {
  test('four squares in a 400 x 400 box make a 2 x 2 grid with exact gutters', () => {
    const r = G([1, 1, 1, 1], { width: 400, height: 400 }, { gap: 20 });
    assert.equal(r.ok, true);
    assert.equal(r.arrangement, '2x2');
    assert.deepEqual(r.placed.map((p) => [p.x, p.y, p.w, p.h]), [[0, 0, 190, 190], [210, 0, 190, 190], [0, 210, 190, 190], [210, 210, 190, 190]]);
    assert.deepEqual(r.rows, [[0, 1], [2, 3]]);
  });

  test('it chooses the column count that makes the items biggest: wide items stack, tall items go side by side', () => {
    const wide = G([3, 3, 3], { width: 600, height: 600 });
    assert.equal(wide.arrangement, '1x3');
    const tall = G([0.4, 0.4, 0.4], { width: 600, height: 300 });
    assert.equal(tall.arrangement, '3x1');
  });

  test('each item is contained in its cell: its own shape, centered', () => {
    const r = G([2, 0.5], { width: 400, height: 200 }, { columns: 2 });
    near(r.fitted[0].w / r.fitted[0].h, 2);
    near(r.fitted[1].w / r.fitted[1].h, 0.5);
    for (let i = 0; i < 2; i++) {
      const c = r.placed[i];
      const f = r.fitted[i];
      assert.ok(f.x >= c.x - 1e-9 && f.y >= c.y - 1e-9 && f.x + f.w <= c.x + c.w + 1e-9 && f.y + f.h <= c.y + c.h + 1e-9);
      near(f.x + f.w / 2, c.x + c.w / 2);
    }
  });

  test('a partial last row starts at the left, or centers on request, and toGrid reads the clean tracks', () => {
    const r = G([1, 1, 1, 1, 1], { width: 300, height: 200 }, { columns: 3, gap: 0 });
    assert.deepEqual(r.rows, [[0, 1, 2], [3, 4]]);
    near(r.placed[3].x, 0);
    const g = toGrid(r);
    assert.equal(g.cols.length, 3);
    assert.equal(g.rows.length, 2);
    const c = G([1, 1, 1, 1, 1], { width: 300, height: 200 }, { columns: 3, lastRow: 'center' });
    near(c.placed[3].x, 50);
  });

  test('a container with a width only needs columns, and the height is an output sized by cellAspect', () => {
    assert.throws(() => G([1, 1], { width: 400 }), /needs options.columns/);
    const r = G([1, 1, 1, 1], { width: 420 }, { columns: 2, gap: 20, cellAspect: 2 });
    near(r.placed[0].w, 200);
    near(r.placed[0].h, 100);
    near(r.frame.h, 220);
  });

  test('padding, a container too small for the gaps, and an empty list', () => {
    const r = G([1], { width: 100, height: 100 }, { padding: 10 });
    near(r.placed[0].x, 10);
    near(r.placed[0].w, 80);
    assert.deepEqual(G([1, 1], { width: 10, height: 10 }, { gap: 50, columns: 2 }), { ok: false, reason: 'does-not-fit' });
    assert.deepEqual(G([], { width: 1, height: 1 }), { ok: false, reason: 'empty' });
    assert.throws(() => G([1], { width: 1, height: 1 }, { goal: 'fill' }), /no goal/);
  });

  test('property: cells are uniform, never overlap, stay inside the container, and every item is inside its cell', () => {
    const rand = rng(33);
    for (let n = 0; n < 200; n++) {
      const count = 1 + Math.floor(rand() * 20);
      const aspects = Array.from({ length: count }, () => 0.3 + rand() * 2.7);
      const W = 200 + rand() * 1000;
      const H = 150 + rand() * 800;
      const r = G(aspects, { width: W, height: H }, { gap: rand() * 12, lastRow: ['start', 'center', 'end'][Math.floor(rand() * 3)] });
      if (!r.ok) continue;
      const { w, h } = r.placed[0];
      r.placed.forEach((c, i) => {
        near(c.w, w, 1e-9);
        near(c.h, h, 1e-9);
        assert.ok(c.x >= -1e-9 && c.y >= -1e-9 && c.x + c.w <= W + 1e-6 && c.y + c.h <= H + 1e-6);
        const f = r.fitted[i];
        near(f.w / f.h, aspects[i], 1e-9);
        assert.ok(f.x >= c.x - 1e-6 && f.y >= c.y - 1e-6 && f.x + f.w <= c.x + c.w + 1e-6 && f.y + f.h <= c.y + c.h + 1e-6);
      });
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const a = r.placed[i];
        const b = r.placed[j];
        assert.ok(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6);
      }
    }
  });
});
