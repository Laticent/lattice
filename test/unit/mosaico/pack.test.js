// @laticent/mosaico's public contract, through its built CommonJS entry (the one Lattice's lib/
// requires). The collage's own behavior, and the byte-identical pin against the old packer, live
// in test/unit/components/collage-pack.test.js and collage-golden.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mosaico = require('@laticent/mosaico');

const { pack, toGrid, itemAspect, MAX_TREE_ITEMS, DEFAULT_TREE_WEIGHTS } = mosaico;
const PHOTOS = [1.5, 0.67, 1, 1.78, 0.75, 2];
const GAP = 0.02;

// mulberry32, so a failure reproduces.
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

test('refuses with a reason instead of throwing for an empty or oversized set', () => {
  assert.deepEqual(pack([], { aspect: 1 }), { ok: false, reason: 'empty' });
  assert.deepEqual(pack(new Array(MAX_TREE_ITEMS + 1).fill(1), { aspect: 1 }), { ok: false, reason: 'too-many' });
  assert.equal(MAX_TREE_ITEMS, 6);
});

test('a container with no usable shape is a caller error', () => {
  for (const aspect of [0, -1, NaN, Infinity, undefined]) {
    assert.throws(() => pack([1, 1], { aspect }), RangeError, String(aspect));
  }
});

test('an item with no usable shape is read as 1:1; numbers and { aspect } are the same item', () => {
  for (const bad of [0, -2, NaN, Infinity, 0.05, 20, 50, undefined, null]) assert.equal(itemAspect(bad), 1, String(bad));
  assert.equal(itemAspect({ aspect: 1.5 }), 1.5);
  assert.equal(itemAspect({}), 1);
  const a = pack([1.5, 0.67, 1], { aspect: 1.41 }, { gap: GAP });
  const b = pack([{ aspect: 1.5 }, { aspect: 0.67 }, { aspect: 1 }], { aspect: 1.41 }, { gap: GAP });
  assert.deepEqual(a, b);
});

test('tight: every rect keeps its item\'s exact shape, inside the layout, with no overlap', () => {
  const r = rng(7);
  for (let k = 0; k < 120; k++) {
    const n = 1 + (k % 6);
    const items = Array.from({ length: n }, () => 0.3 + r() * 3);
    const order = k % 2 ? 'ordered' : 'free';
    const res = pack(items, { aspect: 0.5 + r() * 3 }, { gap: GAP, order });
    assert.equal(res.ok, true);
    assert.equal(res.crop, 0);
    assert.equal(res.rects.length, n);
    res.rects.forEach((t, i) => {
      assert.ok(Math.abs(t.w / t.h - items[i]) < 1e-9, `case ${k} item ${i}`);
      assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= res.aspect + 1e-9 && t.y + t.h <= 1 + 1e-9, `case ${k} item ${i} outside`);
    });
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = res.rects[i], B = res.rects[j];
        const apartX = A.x + A.w + GAP - 1e-9 <= B.x || B.x + B.w + GAP - 1e-9 <= A.x;
        const apartY = A.y + A.h + GAP - 1e-9 <= B.y || B.y + B.h + GAP - 1e-9 <= A.y;
        assert.ok(apartX || apartY, `case ${k}: items ${i} and ${j} are closer than one gutter`);
      }
    }
  }
});

test('toGrid rebuilds every rect from its tracks, gutters included', () => {
  const res = pack(PHOTOS, { aspect: 1.41 }, { gap: GAP });
  const { cols, rows, areas } = toGrid(res);
  const span = (arr, a, b) => arr.slice(a, b).reduce((x, y) => x + y, 0) + (b - a - 1) * GAP;
  const start = (arr, a) => span(arr, 0, a) + (a > 0 ? GAP : 0);
  areas.forEach(([r1, c1, r2, c2], i) => {
    const t = res.rects[i];
    assert.ok(Math.abs(span(cols, c1 - 1, c2 - 1) - t.w) < 1e-9, `w ${i}`);
    assert.ok(Math.abs(span(rows, r1 - 1, r2 - 1) - t.h) < 1e-9, `h ${i}`);
    assert.ok(Math.abs((c1 > 1 ? start(cols, c1 - 1) : 0) - t.x) < 1e-9, `x ${i}`);
    assert.ok(Math.abs((r1 > 1 ? start(rows, r1 - 1) : 0) - t.y) < 1e-9, `y ${i}`);
  });
  assert.ok(cols.every((c) => c > 0) && rows.every((r) => r > 0));
});

test('ordered reads the items in written order; free may not', () => {
  for (let n = 2; n <= 6; n++) {
    const res = pack(PHOTOS.slice(0, n), { aspect: 1.41 }, { order: 'ordered', gap: GAP });
    assert.deepEqual(res.arrangement.match(/\d/g).map(Number), [...Array(n).keys()], `n=${n}`);
  }
  assert.notDeepEqual(pack(PHOTOS, { aspect: 1.41 }, { gap: GAP }).arrangement.match(/\d/g).map(Number), [0, 1, 2, 3, 4, 5]);
});

test('the hero holds the largest tile when an arrangement allows it', () => {
  for (let hero = 0; hero < PHOTOS.length; hero++) {
    const res = pack(PHOTOS, { aspect: 1.41 }, { gap: GAP, hero });
    const areas = res.rects.map((t) => t.w * t.h);
    assert.ok(areas[hero] >= Math.max(...areas) - 1e-9, `hero ${hero}`);
  }
});

test('fill may stretch by at most `stretch`, and the stretch is the crop', () => {
  for (const stretch of [0, 0.04, 0.08, 0.2]) {
    const res = pack(PHOTOS.slice(0, 4), { aspect: 3.4 }, { fit: 'fill', stretch, gap: GAP });
    assert.ok(res.crop <= stretch / (1 + stretch) + 1e-9, `stretch ${stretch}: crop ${res.crop}`);
  }
  assert.equal(pack(PHOTOS.slice(0, 4), { aspect: 3.4 }, { fit: 'fill', stretch: 0 }).crop, 0);
});

test('weights steer the goal: a heavier empty-space weight never leaves more empty space', () => {
  const r = rng(11);
  for (let k = 0; k < 40; k++) {
    const items = Array.from({ length: 4 + (k % 3) }, () => 0.4 + r() * 2.5);
    const container = { aspect: 0.6 + r() * 2.5 };
    const plain = pack(items, container, { gap: GAP });
    const heavy = pack(items, container, { gap: GAP, weights: { empty: 50, smallTile: 0 } });
    assert.ok(heavy.empty <= plain.empty + 1e-9, `case ${k}: ${heavy.empty} > ${plain.empty}`);
  }
  assert.deepEqual(DEFAULT_TREE_WEIGHTS, { empty: 1, smallTile: 1.5, smallTileFloor: 0.4, hero: 0.5 });
  assert.ok(Object.isFrozen(DEFAULT_TREE_WEIGHTS));
});

test('deterministic, and the work it reports is deterministic too', () => {
  const a = pack(PHOTOS, { aspect: 1.41 }, { gap: GAP });
  const b = pack([...PHOTOS], { aspect: 1.41 }, { gap: GAP });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.work.arrangements > a.work.scored && a.work.scored > 0);
  // ordered searches far fewer arrangements than free
  assert.ok(pack(PHOTOS, { aspect: 1.41 }, { gap: GAP, order: 'ordered' }).work.arrangements < a.work.arrangements / 5);
});

test('the ESM entry is the same library as the CommonJS one', async () => {
  const pkg = path.dirname(require.resolve('@laticent/mosaico/package.json'));
  const esm = await import(pathToFileURL(path.join(pkg, 'dist', 'index.mjs')).href);
  assert.equal(JSON.stringify(esm.pack(PHOTOS, { aspect: 1.41 }, { gap: GAP })), JSON.stringify(pack(PHOTOS, { aspect: 1.41 }, { gap: GAP })));
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(mosaico).filter((k) => k !== 'default').sort());
});

test('weights must be finite and non-negative: the search prunes on a bound that needs it', () => {
  for (const bad of [-0.5, NaN, Infinity]) {
    assert.throws(() => pack(PHOTOS.slice(0, 2), { aspect: 1.41 }, { weights: { hero: bad } }), RangeError, String(bad));
  }
  assert.equal(pack(PHOTOS.slice(0, 2), { aspect: 1.41 }, { weights: { hero: 0, smallTile: 0 } }).ok, true);
});

test('a key term on a rounding boundary keeps the mirror the old search kept (3:2 beside 16:9)', () => {
  // The two photos' area ratio is exactly 0.84375, so the balance term is 8437.5.
  assert.equal(pack([1.5, 16 / 9], { aspect: 1.41 }, { gap: 0.012 }).arrangement, 'H(0,1)');
});
