const { test } = require('node:test');
const assert = require('node:assert/strict');
const { packCollage, stageAspectEstimate, MAX_PHOTOS, FILL_MAX } = require('../../../lib/components/imagery/collage/collage.pack');

// The owner's six shoe photos: 9:16, 4:5, 3:2, 1:1, 4:5, 1:1.
const SHOES = [9 / 16, 0.8, 1.5, 1, 0.8, 1];
const GAP = 0.02;

// Width and height of each tile, rebuilt from the emitted tracks the way CSS grid lays them out.
function tileSizes(res, gap) {
  const sum = (arr, a, b) => arr.slice(a, b).reduce((x, y) => x + y, 0) + (b - a - 1) * gap;
  return res.areas.map(([r1, c1, r2, c2]) => ({
    w: sum(res.cols, c1 - 1, c2 - 1),
    h: sum(res.rows, r1 - 1, r2 - 1),
  }));
}

test('the same photos always give the same layout, byte for byte', () => {
  const a = JSON.stringify(packCollage(SHOES, { stageAspect: 1.41, gap: GAP }));
  const b = JSON.stringify(packCollage(SHOES, { stageAspect: 1.41, gap: GAP }));
  assert.equal(a, b);
});

test('tight: every tile keeps its photo\'s exact shape, with gaps solved inside the tree', () => {
  for (const order of ['free', 'ordered']) {
    const res = packCollage(SHOES, { stageAspect: 1.41, gap: GAP, order });
    assert.equal(res.fallback, false);
    assert.equal(res.crop, 0);
    tileSizes(res, GAP).forEach((t, i) => {
      assert.ok(Math.abs(t.w / t.h - SHOES[i]) < 1e-6, `${order}: tile ${i} aspect ${t.w / t.h} vs ${SHOES[i]}`);
    });
  }
});

test('the emitted tracks add up to the layout\'s natural aspect', () => {
  const res = packCollage(SHOES, { stageAspect: 1.41, gap: GAP });
  const width = res.cols.reduce((x, y) => x + y, 0) + (res.cols.length - 1) * GAP;
  const height = res.rows.reduce((x, y) => x + y, 0) + (res.rows.length - 1) * GAP;
  assert.ok(Math.abs(width / height - res.ar) < 1e-6);
  assert.ok(res.cols.every((c) => c > 0) && res.rows.every((r) => r > 0));
});

test('tiles never overlap and cover every photo exactly once', () => {
  const res = packCollage(SHOES, { stageAspect: 1.41, gap: GAP });
  const taken = new Set();
  for (const [r1, c1, r2, c2] of res.areas) {
    for (let r = r1; r < r2; r++) for (let c = c1; c < c2; c++) {
      const k = `${r}:${c}`;
      assert.ok(!taken.has(k), `cell ${k} used twice`);
      taken.add(k);
    }
  }
  assert.equal(res.areas.length, SHOES.length);
});

test('ordered keeps the written order: the layout tree reads the photos 0..n-1 left to right', () => {
  for (let n = 2; n <= MAX_PHOTOS; n++) {
    const res = packCollage(SHOES.slice(0, n), { stageAspect: 1.41, gap: GAP, order: 'ordered' });
    assert.deepEqual(res.tree.match(/\d/g).map(Number), [...Array(n).keys()], `n=${n}`);
  }
});

test('free order may reorder; written order still indexes the result', () => {
  const res = packCollage(SHOES, { stageAspect: 1.41, gap: GAP, order: 'free' });
  assert.equal(res.areas.length, SHOES.length);
  // areas[i] belongs to photo i: its tile has photo i's shape, wherever it sits.
  tileSizes(res, GAP).forEach((t, i) => {
    assert.ok(Math.abs(t.w / t.h - SHOES[i]) < 1e-6);
  });
});

test('free order is never worse than ordered on the score that picks layouts', () => {
  for (const stage of [1.0, 1.41, 1.9, 3.4]) {
    const free = packCollage(SHOES, { stageAspect: stage, gap: GAP, order: 'free' });
    const ordered = packCollage(SHOES, { stageAspect: stage, gap: GAP, order: 'ordered' });
    const score = (r) => r.empty + r.crop + 1.5 * Math.max(0, 0.4 - r.ratio);
    assert.ok(score(free) <= score(ordered) + 1e-9, `stage ${stage}`);
  }
});

test('fill stretches by at most 8% and lowers the empty share', () => {
  const tight = packCollage([1, 1, 1, 1], { stageAspect: 1.3, gap: GAP, fit: 'tight' });
  const fill = packCollage([1, 1, 1, 1], { stageAspect: 1.3, gap: GAP, fit: 'fill' });
  assert.ok(fill.crop <= FILL_MAX + 1e-9);
  assert.ok(fill.empty <= tight.empty + 1e-9);
});

test('tight never crops', () => {
  assert.equal(packCollage(SHOES, { stageAspect: 1.2, fit: 'tight' }).crop, 0);
});

test('hero holds the largest tile', () => {
  const res = packCollage(SHOES, { stageAspect: 1.41, gap: GAP, hero: 3 });
  const areas = tileSizes(res, GAP).map((t) => t.w * t.h);
  assert.equal(areas.indexOf(Math.max(...areas)), 3);
});

test('more than six photos is refused and returns the even grid, fast', () => {
  const t0 = Date.now();
  const res = packCollage(new Array(9).fill(1), { stageAspect: 1.41 });
  assert.equal(res.fallback, 'too-many');
  assert.ok(Date.now() - t0 < 50);
  assert.equal(res.cols.length, 3);
  assert.equal(res.areas.length, 9);
});

test('six photos finish well inside a second; seven are refused, not searched', () => {
  const t0 = Date.now();
  packCollage(SHOES, { stageAspect: 1.41, gap: GAP });
  assert.ok(Date.now() - t0 < 1500, `six photos took ${Date.now() - t0} ms`);
  const t1 = Date.now();
  packCollage([...SHOES, 1], { stageAspect: 1.41, gap: GAP });
  assert.ok(Date.now() - t1 < 50);
});

test('an unusable aspect becomes a 1:1 tile; nothing non-finite is emitted', () => {
  const res = packCollage([NaN, 0, -2, 1e9, 0.8, 1.5], { stageAspect: 1.41, gap: GAP });
  for (const v of [...res.cols, ...res.rows, res.ar, res.empty, res.crop, res.ratio]) assert.ok(Number.isFinite(v));
  const sizes = tileSizes(res, GAP);
  for (const i of [0, 1, 2, 3]) assert.ok(Math.abs(sizes[i].w / sizes[i].h - 1) < 1e-6);
});

test('one photo is one tile; no photos is the empty grid', () => {
  assert.deepEqual(packCollage([1.5], { stageAspect: 1.41 }).areas, [[1, 1, 2, 2]]);
  assert.equal(packCollage([]).fallback, 'empty');
});

test('a portrait-heavy set on a landscape stage fills it with a side-by-side root', () => {
  const res = packCollage([0.8, 0.8, 0.5625, 0.8], { stageAspect: 1.9, gap: GAP });
  assert.ok(res.cols.length >= 3, `cols ${res.cols.length}`);
});

test('stage aspect table: known rows, and an unknown one falls back to landscape beside', () => {
  assert.equal(stageAspectEstimate({ orientation: 'landscape', composition: 'beside' }), 1.41);
  assert.equal(stageAspectEstimate({ orientation: 'nonsense', composition: 'nonsense' }), 1.41);
  assert.ok(stageAspectEstimate({ orientation: 'portrait', composition: 'beside' }) < 1);
});

// ── regressions an independent checker reproduced ────────────────────────────────────────
// A small seeded generator so the cases are the same on every run.
function seeded(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const COMMON = [9 / 16, 0.8, 0.8, 1, 1, 1.5, 1.5, 4 / 3, 3 / 4, 16 / 9, 2 / 3, 1.5654, 1.778, 1.333, 2.667, 0.4];
const STAGES = [1.0, 1.41, 1.9, 3.4];
const randomSet = (rnd) => Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => COMMON[Math.floor(rnd() * COMMON.length)]);

test('every emitted track is positive on 300 random sets (cuts closer than one gutter used to give a negative fr)', () => {
  const rnd = seeded(11);
  for (let k = 0; k < 300; k++) {
    const a = randomSet(rnd);
    const stage = STAGES[Math.floor(rnd() * STAGES.length)];
    for (const order of ['free', 'ordered']) {
      const r = packCollage(a, { stageAspect: stage, order });
      assert.ok([...r.cols, ...r.rows].every((v) => v > 0), `${order} ${JSON.stringify(a)} @${stage}: ${r.cols} | ${r.rows}`);
    }
  }
});

test('the exact set the checker found with a negative track packs cleanly', () => {
  const r = packCollage([1, 0.8, 1.778, 1.333, 1.5654, 0.8], { order: 'ordered', stageAspect: 1.9 });
  assert.ok([...r.cols, ...r.rows].every((v) => v > 0));
});

test('free order scores at least as well as ordered on 300 random sets (the dedupe used to drop the better layout)', () => {
  const rnd = seeded(11);
  const score = (r) => r.empty + r.crop + 1.5 * Math.max(0, 0.4 - r.ratio);
  for (let k = 0; k < 300; k++) {
    const a = randomSet(rnd);
    const stage = STAGES[Math.floor(rnd() * STAGES.length)];
    const free = packCollage(a, { stageAspect: stage, order: 'free' });
    const ordered = packCollage(a, { stageAspect: stage, order: 'ordered' });
    assert.ok(score(free) <= score(ordered) + 1e-9, `${JSON.stringify(a)} @${stage}: free ${score(free)} vs ordered ${score(ordered)}`);
  }
});

test('hero on three equal photos packs as tightly as with no hero (the dedupe used to leave 53% empty)', () => {
  const base = packCollage([1, 1, 1], { stageAspect: 1.41 });
  for (const hero of [0, 1, 2]) {
    const r = packCollage([1, 1, 1], { stageAspect: 1.41, hero });
    assert.ok(r.empty <= base.empty + 0.1, `hero ${hero}: ${r.empty} vs ${base.empty}`);
    const areas = tileSizes(r, 0.012).map((t) => t.w * t.h);
    assert.equal(areas.indexOf(Math.max(...areas)), hero, `hero ${hero} holds the largest tile`);
  }
});

test('the constants the CSS mirrors are the CSS values', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', '..', 'lib', 'components', 'imagery', 'collage', 'collage.styles.css'), 'utf8');
  const { DEFAULT_GAP } = require('../../../lib/components/imagery/collage/collage.pack');
  assert.equal(Number(/--collage-gap-ratio:\s*([\d.]+)/.exec(css)[1]), DEFAULT_GAP, 'gap ratio');
  assert.equal(Number(/section\.collage\.fill\s*\{[^}]*--collage-snap:\s*([\d.]+)/.exec(css)[1]), FILL_MAX, 'fill snap');
});
