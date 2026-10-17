// @laticent/mosaico's `rows` strategy with the `equal-weight` goal.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pack, DEFAULT_HEIGHT_CAP } = require('@laticent/mosaico');

const rows = (items, o = {}) => pack(items, {}, { strategy: 'rows', ...o });
const areas = (r) => r.rects.map((x) => x.w * x.h);

test('every item gets the same area while the cap allows it', () => {
  const r = rows([4, 1, 0.5, 3], { heightCap: 0.12, gap: 0.05 });
  assert.equal(r.ok, true);
  const a = areas(r);
  assert.ok(Math.max(...a) / Math.min(...a) < 1 + 1e-9, String(a));
  assert.ok(r.rects.every((x) => x.h <= 0.12 + 1e-12));
  assert.equal(r.ratio, Math.min(...a) / Math.max(...a));
});

test('an item narrower than the aspect floor is held at the cap instead of shrinking the rest', () => {
  const r = rows([1, 1, 0.2], { heightCap: 0.1, aspectFloor: 0.5 });
  const [a, b, c] = areas(r);
  assert.ok(Math.abs(a - b) < 1e-12);
  assert.ok(Math.abs(r.rects[2].h - 0.1) < 1e-12, 'the narrow item stands at the cap');
  assert.ok(c < a, 'and gets less area');
  assert.equal(DEFAULT_HEIGHT_CAP, 0.1);
});

test('rows never overflow the width or the per-row limit, and are balanced', () => {
  const r = rows(new Array(10).fill(1), { heightCap: 0.2, gap: 0.02, maxPerRow: 4, minCell: 0.2 });
  assert.deepEqual(r.rows.map((x) => x.length), [4, 3, 3]);
  for (const row of r.rows) {
    const used = row.reduce((s, i) => s + r.cells[i].w, 0) + (row.length - 1) * 0.02;
    assert.ok(used <= 1 + 1e-12);
  }
  assert.equal(r.arrangement, '0 1 2 3 | 4 5 6 | 7 8 9');
});

test('maxRows and maxHeight shrink the cap first, then the area', () => {
  const free = rows([1, 1, 1, 0.5], { heightCap: 0.3, gap: 0.02, maxPerRow: 2 });
  assert.equal(free.rows.length, 2);
  const capped = rows([1, 1, 1, 0.5], { heightCap: 0.3, minHeightCap: 0.2, gap: 0.02, maxPerRow: 2, maxHeight: 0.42 });
  assert.ok(1 / capped.aspect <= 0.42 + 1e-9);
  assert.ok(capped.heightCap < 0.3 && capped.heightCap >= 0.2);
  assert.equal(capped.area, free.area, 'the cap gave way, the area held');
  const shrunk = rows([1, 1, 1, 0.5], { heightCap: 0.3, minHeightCap: 0.2, gap: 0.02, maxPerRow: 2, maxHeight: 0.3 });
  assert.ok(shrunk.area < free.area && 1 / shrunk.aspect <= 0.3 + 1e-9);
  const one = rows([1, 1, 1, 1], { heightCap: 0.3, gap: 0.02, maxRows: 1 });
  assert.equal(one.rows.length, 1);
});

test('refuses when nothing fits; items are centered in cells and rows', () => {
  assert.deepEqual(rows([1, 1], { minCell: 0.6 , maxRows: 1 }), { ok: false, reason: 'too-wide' });
  const r = rows([2], { heightCap: 0.1, minCell: 0.5 });
  assert.ok(Math.abs(r.cells[0].x - 0.25) < 1e-12 && Math.abs(r.rects[0].x - (0.5 - r.rects[0].w / 2)) < 1e-12);
});

test('a layout that fits only at no size at all is refused, not returned', () => {
  assert.deepEqual(rows([1, 2], { heightCap: 1e-300 }), { ok: false, reason: 'too-wide' });
  assert.deepEqual(rows([1, 2], { heightCap: 0.1, maxHeight: 0 }), { ok: false, reason: 'too-wide' });
});

test('areaCap sizes the items from a higher cap than heightCap holds them to', () => {
  // Wide items keep the size the higher cap gives them; only the items the lower cap stops lose area.
  const high = rows([3, 3, 1], { heightCap: 0.3 });
  const held = rows([3, 3, 1], { heightCap: 0.2, areaCap: 0.3 });
  const plain = rows([3, 3, 1], { heightCap: 0.2 });
  assert.equal(held.area, high.area);
  assert.ok(Math.abs(held.rects[0].w - high.rects[0].w) < 1e-12, 'the wide item keeps its size');
  assert.ok(held.rects[2].h <= 0.2 + 1e-12 && held.rects[2].w * held.rects[2].h < held.area, 'the square stops at the lower cap');
  assert.ok(plain.rects[0].w < held.rects[0].w, 'without areaCap the wide items shrink too');
});

test('goals belong to their strategy', () => {
  assert.throws(() => rows([1], { goal: 'fill' }), RangeError);
  assert.throws(() => pack([1], { aspect: 1 }, { goal: 'equal-weight' }), RangeError);
});

test('rows takes any number of items, deterministically', () => {
  const items = Array.from({ length: 40 }, (_, i) => 0.5 + (i % 7) * 0.5);
  const a = rows(items, { heightCap: 0.08, gap: 0.03, maxPerRow: 6, minCell: 0.12 });
  assert.equal(a.ok, true);
  assert.equal(JSON.stringify(a), JSON.stringify(rows([...items], { heightCap: 0.08, gap: 0.03, maxPerRow: 6, minCell: 0.12 })));
});
