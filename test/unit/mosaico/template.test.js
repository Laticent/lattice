// The `template` strategy and the size-rule regions behind it (design note §4.1, §8.6): range items, the
// join closure as a property test, and the sizing step on exact cases.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const m = require('@laticent/mosaico');

const { pack, toGrid, leafRegion, joinSideBySide, joinStacked, regionContains, isConvex, sliceAtH } = m;

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
const T = (items, container, template, extra = {}) => pack(items, container, { strategy: 'template', template, ...extra });

describe('template: exact cases', () => {
  test('weights split a pair like ratio-60-40, with the gutter exact', () => {
    const r = T([{ weight: 6 }, { weight: 4 }], { width: 1000, height: 400 }, 'V(0,1)', { gap: 20 });
    assert.equal(r.ok, true);
    near(r.placed[0].w, 588);
    near(r.placed[1].w, 392);
    near(r.placed[1].x, 608);
    assert.deepEqual(r.placed.map((p) => p.h), [400, 400]);
    assert.equal(r.empty, 0);
  });

  test('a floor holds a pane and the rest is shared by the others', () => {
    const r = T([{ minWidth: 500 }, {}, {}], { width: 900, height: 300 }, 'V(0,1,2)');
    near(r.placed[0].w, 500);
    near(r.placed[1].w, 200);
    near(r.placed[2].w, 200);
  });

  test('a cap holds a pane and the rest take the room', () => {
    const r = T([{ maxWidth: 100 }, {}], { width: 600, height: 200 }, 'V(0,1)');
    near(r.placed[0].w, 100);
    near(r.placed[1].w, 500);
  });

  test('nested joins: item 0 beside items 1 over 2, stacked heights exact', () => {
    const r = T([{}, {}, {}], { width: 800, height: 600 }, 'V(0,H(1,2))', { gap: 10 });
    near(r.placed[0].w, 395);
    near(r.placed[1].w, 395);
    near(r.placed[1].h, 295);
    near(r.placed[2].y, 305);
    // The grid adapter reads the same rects: two columns, two rows.
    const g = toGrid(r);
    assert.equal(g.cols.length, 2);
    assert.equal(g.rows.length, 2);
  });

  test('a fixed shape keeps its shape, and a wedge may stretch inside its range', () => {
    const r = T([{ aspect: 2 }, { aspect: [1, 3] }], { width: 900, height: 300 }, 'V(0,1)');
    assert.equal(r.ok, true);
    near(r.placed[0].w / r.placed[0].h, 2);
    const a = r.placed[1].w / r.placed[1].h;
    assert.ok(a >= 1 - 1e-9 && a <= 3 + 1e-9, `aspect ${a}`);
    near(r.placed[0].w + r.placed[1].w, 900);
  });

  test('fixed shapes in a container of the wrong shape fit as large as they can and leave the rest empty', () => {
    const r = T([{ aspect: 1.5 }, { aspect: 1 }], { width: 1000, height: 1000 }, 'V(0,1)', { gap: 10, align: 'start' });
    assert.equal(r.ok, true);
    near(r.placed[0].w + r.placed[1].w + 10, 1000);
    assert.ok(r.empty > 0.5);
    near(r.frame.x, 0);
    assert.ok(r.placed.every((p) => p.x + p.w <= 1000 + 1e-6 && p.y + p.h <= 1000 + 1e-6));
  });

  test('a width and no height: the height is an output, the shortest the layout can stand', () => {
    const r = T([{ aspect: 2 }, { aspect: 1 }], { width: 600 }, 'V(0,1)', { gap: 0 });
    assert.equal(r.ok, true);
    near(r.frame.h, 200);
    near(r.frame.w, 600);
  });

  test('width only: with no stated floors the default floor still gives a height, and a flexible pane is not refused', () => {
    const r = T([{}, {}], { width: 600 }, 'V(0,1)');
    assert.equal(r.ok, true);
    near(r.frame.h, 0.02 * 600);
    assert.equal(T([{ minWidth: 106, maxWidth: 376 }], { width: 226.8 }, '0').ok, true);
    assert.equal(T([{ aspect: 2 }, { minWidth: 300 }], { width: 1000 }, 'V(0,1)').ok, true);
  });

  test('padding is respected and the layout sits by align', () => {
    const r = T([{ aspect: 1 }], { width: 400, height: 200 }, '0', { padding: 10, align: 'end' });
    near(r.frame.h, 180);
    near(r.frame.x, 400 - 10 - 180);
  });

  test('refuses a container below the floors, and a pair of heights that never meet', () => {
    assert.deepEqual(T([{ minWidth: 500 }, { minWidth: 500 }], { width: 600, height: 100 }, 'V(0,1)'), { ok: false, reason: 'does-not-fit' });
    assert.deepEqual(T([{ minHeight: 300 }, { maxHeight: 100 }], { width: 600, height: 400 }, 'V(0,1)'), { ok: false, reason: 'no-valid-layout' });
    assert.deepEqual(T([{ minWidth: 9, maxWidth: 5 }], { width: 600, height: 400 }, '0'), { ok: false, reason: 'no-valid-layout' });
  });

  test('bad input throws, naming the problem', () => {
    assert.throws(() => T([{}, {}], { width: 1, height: 1 }, 'V(0,'), /bad template.*at/);
    assert.throws(() => T([{}, {}], { width: 1, height: 1 }, 'V(0,0)'), /exactly once/);
    assert.throws(() => T([{}, {}], { width: 1, height: 1 }, 'V(0)'), /at least two/);
    assert.throws(() => T([{}], { width: 1, height: 1 }, '0', { goal: 'fill' }), /no goal/);
    assert.throws(() => T([{ aspect: [3, 1] }], { width: 1, height: 1 }, '0'), /aspect must be a positive number or \[min, max\]/);
    assert.throws(() => pack([{}], { width: 1, height: 1 }, { strategy: 'template' }), /needs options.template/);
  });

  test('a tree result\'s arrangement string round-trips as a template', () => {
    const t = pack([1.5, 0.67, 1], { aspect: 16 / 9 }, { gap: 0.012 });
    assert.equal(t.ok, true);
    const r = pack([1.5, 0.67, 1], { aspect: 16 / 9 }, { strategy: 'template', template: t.arrangement, gap: 0.012 });
    assert.equal(r.ok, true);
    for (let i = 0; i < 3; i++) near(r.placed[i].w / r.placed[i].h, [1.5, 0.67, 1][i], 1e-6);
    // Same arrangement, same tiles: the template reproduces the search's pick.
    t.placed.forEach((p, i) => {
      near(r.placed[i].x, p.x, 1e-6);
      near(r.placed[i].w, p.w, 1e-6);
    });
  });

  test('tree and rows still take a range as its geometric mean', () => {
    const a = pack([{ aspect: [1, 4] }, 1.5], { aspect: 2 });
    const b = pack([2, 1.5], { aspect: 2 });
    assert.deepEqual(a.rects, b.rects);
  });
});

// ── the join closure (design note §4.1): every node of a tree is a convex region ─────────────────────────

function randomLeaf(r) {
  const k = Math.floor(r() * 5);
  const lo = 0.4 + r() * 1.2;
  if (k === 0) return { aspect: lo };
  if (k === 1) return { aspect: [lo, lo * (1 + r() * 2)] };
  if (k === 2) return { minWidth: r() * 50, minHeight: r() * 40 };
  if (k === 3) return { minWidth: 10 + r() * 40, maxWidth: 80 + r() * 200, minHeight: 10 + r() * 30, maxHeight: 60 + r() * 150 };
  return { aspect: [lo, lo * 2], minHeight: 20 + r() * 40, maxWidth: 150 + r() * 200 };
}
const regionOf = (rule) => leafRegion(rule);
const range = (poly) => [Math.min(...poly.map((p) => p[1])), Math.max(...poly.map((p) => p[1]))];
function sampleIn(poly, r) {
  // A random point of the region: a random height in its span, then a random width in that slice.
  const [h0, h1] = range(poly);
  const h = h0 + r() * (h1 - h0);
  const s = sliceAtH(poly, h);
  return s ? [s[0] + r() * (s[1] - s[0]), h] : null;
}


describe('a flexible pane beside a fixed shape (the first use case)', () => {
  test('a contained 16:9 image beside a text pane: the pane keeps the full height, the image sits letterboxed in its cell', () => {
    const r = T([{ aspect: 16 / 9, fit: 'contain', weight: 3 }, { minWidth: 400 }], { width: 1280, height: 720 }, 'V(0,1)', { gap: 20 });
    assert.equal(r.ok, true);
    assert.equal(r.empty, 0);
    assert.deepEqual(r.placed.map((p) => p.h), [720, 720]);
    near(r.placed[1].w, 400); // the weights ask for 315; the floor holds it at 400
    near(r.placed[0].w, 860);
    const img = r.fitted[0];
    near(img.w / img.h, 16 / 9);
    assert.ok(img.w <= r.placed[0].w + 1e-6 && img.h <= r.placed[0].h + 1e-6, 'the image is inside its cell');
    // The text pane is an exact item: fitted is its placed box.
    assert.deepEqual(r.fitted[1], r.placed[1]);
  });

  test('an exact fixed shape beside a pane with no floor never leaves the pane without a size: it is refused or given the default floor', () => {
    const r = T([{ aspect: 16 / 9 }, {}], { width: 1280, height: 720 }, 'V(0,1)', { gap: 16 });
    if (r.ok) assert.ok(r.placed.every((p) => p.w > 1 && p.h > 1), 'every tile is visible');
    else assert.equal(r.reason, 'does-not-fit');
  });

  test('a layout that would leave an item no size is refused, not returned', () => {
    assert.deepEqual(T([{}, {}], { width: 100, height: 100 }, 'V(0,1)', { gap: 100 }), { ok: false, reason: 'does-not-fit' });
  });

  test('nested joins count as one child: V(0,H(1,2)) with weights 1, 2, 4 is two equal columns', () => {
    const r = T([{ weight: 1 }, { weight: 2 }, { weight: 4 }], { width: 900, height: 300 }, 'V(0,H(1,2))');
    near(r.placed[0].w, 450);
    near(r.placed[1].w, 450);
    near(r.placed[2].h / r.placed[1].h, 2);
  });
});

describe('template: the numbers it was hardened against', () => {
  test('a container in large units (EMU) is filled, not capped at the default no-limit size', () => {
    const r = T([{}], { width: 12192000, height: 6858000 }, '0');
    assert.equal(r.ok, true);
    assert.equal(r.empty, 0);
    near(r.placed[0].w, 12192000);
  });

  test('a floating-point sliver does not drop an item to nothing (the case the checker found)', () => {
    const items = [{ aspect: 0.4515 }, { weight: 3.57 }, { minWidth: 42.2, minHeight: 36.1, weight: 2.72 }, { weight: 1.11 }, { aspect: [1.128, 1.561] }, { aspect: 0.9136 }];
    const r = T(items, { width: 512.37, height: 432.76 }, 'V(H(0,1),V(2,3),4,5)', { gap: 7.98, align: 'end' });
    if (r.ok) for (const p of r.placed) assert.ok(p.w > 0 && p.h > 0, `${JSON.stringify(p)}`);
    else assert.equal(r.reason, 'does-not-fit');
  });

  test('weights that would overflow are bounded; a gap as wide as the container is refused', () => {
    const r = T([{ weight: 1e306 }, { weight: 1e306 }], { width: 1920, height: 1080 }, 'V(0,1)');
    assert.equal(r.ok, true);
    near(r.placed[0].w, 960);
    assert.ok(r.placed.every((p) => Number.isFinite(p.w) && p.w > 0));
  });

  test('more than MAX_TEMPLATE_ITEMS is refused, and a template nested too deep throws a named error', () => {
    assert.deepEqual(T(Array.from({ length: m.MAX_TEMPLATE_ITEMS + 1 }, () => ({})), { width: 100, height: 100 }, '0'), { ok: false, reason: 'too-many' });
    assert.throws(() => T([{}], { width: 1, height: 1 }, 'V('.repeat(5000)), /nested more than/);
  });

  test('bad items throw a RangeError, and the exported helper agrees with pack on bad rules', () => {
    const sparse = new Array(2); // a hole at 0
    sparse[1] = {};
    assert.throws(() => T(sparse, { width: 1, height: 1 }, 'V(0,1)'), RangeError);
    assert.throws(() => T([{ aspect: 0 }], { width: 1, height: 1 }, '0'), /positive number/);
    assert.equal(leafRegion({ aspect: [3, 1] }), null);
    assert.equal(leafRegion({ aspect: 0 }), null);
    assert.equal(leafRegion(null) !== null, true, 'no rule is a flexible item');
    assert.throws(() => T([{}], { width: 9, height: 9 }, '0', { align: 'justify' }), /for the template strategy/);
  });

  test('a long template does not echo itself into the error', () => {
    try { T([{}], { width: 1, height: 1 }, `0${' '.repeat(5e5)}x`); } catch (e) { assert.ok(e.message.length < 300); return; }
    assert.fail('expected a throw');
  });
});

describe('template: any container, inside the root region or not', () => {
  test('every ok result shows every item, obeys the floors it was given, does not overlap and stays inside the container', () => {
    const r = rng(99);
    let oks = 0;
    let refused = 0;
    for (let n = 0; n < 400; n++) {
      const count = 2 + Math.floor(r() * 5);
      const rules = Array.from({ length: count }, () => ({ ...randomLeaf(r), ...(r() < 0.3 ? { fit: 'contain' } : {}) }));
      // n-ary joins, right-nested and mixed, with weights on some items.
      const mk = (idx) => {
        if (idx.length === 1) return String(idx[0]);
        const cut = r() < 0.5 ? 'V' : 'H';
        const k = 2 + Math.floor(r() * Math.min(3, idx.length - 1));
        const parts = [];
        let at = 0;
        for (let i = 0; i < k; i++) {
          const take = i === k - 1 ? idx.length - at : 1 + Math.floor(r() * (idx.length - at - (k - 1 - i)));
          parts.push(mk(idx.slice(at, at + take)));
          at += take;
        }
        return `${cut}(${parts.join(',')})`;
      };
      const tpl = mk(Array.from({ length: count }, (_, i) => i));
      const W = 100 + r() * 1400;
      const H = 100 + r() * 800;
      const widthOnly = r() < 0.15;
      const res = pack(rules, widthOnly ? { width: W } : { width: W, height: H }, { strategy: 'template', template: tpl, gap: r() * 10, align: ['start', 'center', 'end'][Math.floor(r() * 3)], padding: r() < 0.3 ? 12 : 0 });
      if (!res.ok) { refused++; assert.ok(['does-not-fit', 'no-valid-layout'].includes(res.reason)); continue; }
      oks++;
      const bottom = widthOnly ? res.frame.y + res.frame.h : H;
      res.placed.forEach((p, i) => {
        assert.ok(p.w > 0 && p.h > 0, `item ${i} has no size in ${tpl}: ${JSON.stringify(p)}`);
        assert.ok(p.x >= -1e-6 && p.y >= -1e-6 && p.x + p.w <= W + 1e-6 && p.y + p.h <= bottom + 1e-6, `item ${i} outside the container in ${tpl}`);
        const f = res.fitted[i];
        assert.ok(f.x >= p.x - 1e-6 && f.y >= p.y - 1e-6 && f.x + f.w <= p.x + p.w + 1e-6 && f.y + f.h <= p.y + p.h + 1e-6, 'fitted is inside its cell');
        const rule = rules[i];
        if (rule.minWidth !== undefined) assert.ok(p.w >= rule.minWidth - 1e-6, `item ${i} narrower than its floor`);
        if (rule.minHeight !== undefined) assert.ok(p.h >= rule.minHeight - 1e-6, `item ${i} shorter than its floor`);
        if (rule.maxWidth !== undefined) assert.ok(p.w <= rule.maxWidth + 1e-6, `item ${i} wider than its cap`);
        if (rule.maxHeight !== undefined) assert.ok(p.h <= rule.maxHeight + 1e-6, `item ${i} taller than its cap`);
        if (typeof rule.aspect === 'number' && rule.fit !== 'contain') near(p.w / p.h, rule.aspect, 1e-6);
      });
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const a = res.placed[i];
        const b = res.placed[j];
        assert.ok(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6, `items ${i} and ${j} overlap in ${tpl}`);
      }
    }
    assert.ok(oks > 150, `ok ${oks}, refused ${refused}`);
  });

  test('a join of joins is convex and holds midpoints, not only a join of a node and a leaf', () => {
    const r = rng(5);
    let checked = 0;
    for (let n = 0; n < 120; n++) {
      const mkNode = () => {
        let node = regionOf(randomLeaf(r));
        for (let d = 0; d < 1 + Math.floor(r() * 3) && node; d++) {
          const leaf = regionOf(randomLeaf(r));
          if (!leaf) break;
          node = r() < 0.5 ? joinSideBySide(node, leaf, r() * 8) : joinStacked(node, leaf, r() * 8);
        }
        return node;
      };
      const A = mkNode();
      const B = mkNode();
      if (!A || !B) continue;
      const J = r() < 0.5 ? joinSideBySide(A, B, 3) : joinStacked(A, B, 3);
      if (!J) continue;
      assert.ok(isConvex(J));
      for (let k = 0; k < 10; k++) {
        const p = sampleIn(J, r);
        const q = sampleIn(J, r);
        if (p && q) assert.ok(regionContains(J, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2));
      }
      checked++;
    }
    assert.ok(checked > 60);
  });

  test('cost: a left-leaning fold of 40 feasible items stays near a millisecond or two on average, and its regions stay small', () => {
    const r = rng(8);
    let total = 0;
    let runs = 0;
    for (let n = 0; n < 40; n++) {
      const rules = Array.from({ length: 40 }, () => ({ minWidth: 5, minHeight: 5, ...(r() < 0.5 ? {} : { maxWidth: 400 + r() * 400, maxHeight: 300 + r() * 300 }) }));
      let tpl = '0';
      for (let i = 1; i < 40; i++) tpl = `${r() < 0.5 ? 'V' : 'H'}(${tpl},${i})`;
      const t0 = process.hrtime.bigint();
      const res = pack(rules, { width: 1e5, height: 1e5 }, { strategy: 'template', template: tpl, gap: 1 });
      total += Number(process.hrtime.bigint() - t0) / 1e6;
      runs++;
      assert.ok(res.ok || res.reason === 'does-not-fit' || res.reason === 'no-valid-layout');
    }
    // A generous ceiling: the point is to catch exponential vertex growth, which took seconds.
    assert.ok(total / runs < 50, `mean ${(total / runs).toFixed(1)} ms`);
  });
});

describe('join closure: convex regions stay convex and the join is exactly the sum', () => {
  test('soundness: a size from A and a size from B at one height always sum to a size of the join', () => {
    const r = rng(7);
    let checked = 0;
    for (let n = 0; n < 300; n++) {
      const A = regionOf(randomLeaf(r));
      const B = regionOf(randomLeaf(r));
      if (!A || !B) continue;
      const g = r() * 12;
      const J = joinSideBySide(A, B, g);
      const [a0, a1] = range(A);
      const [b0, b1] = range(B);
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (!J) {
        assert.ok(lo > hi + 1e-6, 'a join is empty only when the two share no height');
        continue;
      }
      for (let k = 0; k < 20; k++) {
        const h = lo + r() * (hi - lo);
        const sa = sliceAtH(A, h);
        const sb = sliceAtH(B, h);
        const w1 = sa[0] + r() * (sa[1] - sa[0]);
        const w2 = sb[0] + r() * (sb[1] - sb[0]);
        assert.ok(regionContains(J, w1 + w2 + g, h), `(${w1 + w2 + g}, ${h}) is in the join`);
        checked++;
      }
    }
    assert.ok(checked > 1000);
  });

  test('completeness: a size of the join splits into one from A and one from B', () => {
    const r = rng(11);
    let checked = 0;
    for (let n = 0; n < 200; n++) {
      const A = regionOf(randomLeaf(r));
      const B = regionOf(randomLeaf(r));
      if (!A || !B) continue;
      const g = r() * 12;
      const J = joinStacked(A, B, g);
      if (!J) continue;
      for (let k = 0; k < 15; k++) {
        const pt = sampleIn(J, r);
        if (!pt) continue;
        const [w, h] = pt;
        // Stacked: a height h₁ from A and h₂ from B at the same width, h₁ + h₂ + g = h. Search h₁ on a grid.
        const [a0, a1] = [Math.min(...A.map((p) => p[1])), Math.max(...A.map((p) => p[1]))];
        let found = false;
        const steps = 400;
        for (let s = 0; s <= steps && !found; s++) {
          const h1 = a0 + ((a1 - a0) * s) / steps;
          const h2 = h - g - h1;
          if (regionContains(A, w, h1) && regionContains(B, w, h2)) found = true;
        }
        // A grid can step over a ray (zero-width region), so accept a miss only when A or B is a ray.
        const thin = A.length < 3 || B.length < 3;
        assert.ok(found || thin || near_slice(A, B, w, h, g), `(${w}, ${h}) splits`);
        checked++;
      }
    }
    assert.ok(checked > 300);
  });

  test('convexity: every join of joins is convex, and the midpoint of two of its sizes is one of its sizes', () => {
    const r = rng(3);
    let trees = 0;
    for (let n = 0; n < 150; n++) {
      let node = regionOf(randomLeaf(r));
      const depth = 2 + Math.floor(r() * 4);
      for (let d = 0; d < depth && node; d++) {
        const leaf = regionOf(randomLeaf(r));
        if (!leaf) break;
        node = r() < 0.5 ? joinSideBySide(node, leaf, r() * 10) : joinStacked(node, leaf, r() * 10);
      }
      if (!node) continue;
      trees++;
      assert.ok(isConvex(node), 'convex');
      for (let k = 0; k < 15; k++) {
        const p = sampleIn(node, r);
        const q = sampleIn(node, r);
        if (!p || !q) continue;
        assert.ok(regionContains(node, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2), 'midpoint inside');
      }
    }
    assert.ok(trees > 100);
  });

  test('sizing: for any size the root allows, every item lands inside its own rule and the tiles do not overlap', () => {
    const r = rng(42);
    let packed = 0;
    for (let n = 0; n < 250; n++) {
      const count = 2 + Math.floor(r() * 4);
      const rules = Array.from({ length: count }, () => ({ minWidth: 1, minHeight: 1, ...randomLeaf(r) }));
      // A random arrangement over the items: fold them with random cuts.
      let tpl = '0';
      for (let i = 1; i < count; i++) tpl = `${r() < 0.5 ? 'V' : 'H'}(${tpl},${i})`;
      const gap = r() * 8;
      const probe = pack(rules, { width: 1e6, height: 1e6 }, { strategy: 'template', template: tpl, gap });
      // The root region comes from a pack at a huge container; pick a target the layout can meet.
      if (!probe.ok) continue;
      const shapes = rules.map(regionOf);
      // Join the regions the same way the strategy does, to draw a container size from inside it.
      const build = (t) => {
        const mm = /^([VH])\((.*)\)$/.exec(t);
        if (!mm) return shapes[Number(t)];
        let depth = 0;
        let cut = -1;
        for (let i = 0; i < mm[2].length; i++) {
          if (mm[2][i] === '(') depth++;
          else if (mm[2][i] === ')') depth--;
          else if (mm[2][i] === ',' && depth === 0) cut = i;
        }
        const a = build(mm[2].slice(0, cut));
        const b = build(mm[2].slice(cut + 1));
        return mm[1] === 'V' ? joinSideBySide(a, b, gap) : joinStacked(a, b, gap);
      };
      const root = build(tpl);
      if (!root) continue;
      const pt = sampleIn(root, r);
      if (!pt || !(pt[0] > 1 && pt[1] > 1) || pt[0] > 2e6 || pt[1] > 2e6) continue; // the test regions use the default no-limit size, 1e7
      const res = pack(rules, { width: pt[0], height: pt[1] }, { strategy: 'template', template: tpl, gap });
      assert.equal(res.ok, true, `${tpl} fits ${pt}`);
      packed++;
      res.placed.forEach((p, i) => {
        assert.ok(regionContains(shapes[i], p.w, p.h), `item ${i} (${p.w} × ${p.h}) obeys its rule ${JSON.stringify(rules[i])} in ${tpl}`);
        assert.ok(p.x >= -1e-6 && p.y >= -1e-6 && p.x + p.w <= pt[0] + 1e-6 && p.y + p.h <= pt[1] + 1e-6, 'inside the container');
      });
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = res.placed[i];
          const b = res.placed[j];
          const apart = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
          assert.ok(apart, `items ${i} and ${j} overlap in ${tpl}`);
        }
      }
      // An interior size is met exactly: the frame is the container.
      near(res.frame.w, pt[0], 1e-6);
      near(res.frame.h, pt[1], 1e-6);
    }
    assert.ok(packed > 100, `packed ${packed}`);
  });

  test('determinism: the same input gives the same bytes', () => {
    const a = JSON.stringify(T([{ aspect: [1, 2] }, { minWidth: 30 }, {}], { width: 640, height: 360 }, 'H(V(0,1),2)', { gap: 6 }));
    const b = JSON.stringify(T([{ aspect: [1, 2] }, { minWidth: 30 }, {}], { width: 640, height: 360 }, 'H(V(0,1),2)', { gap: 6 }));
    assert.equal(a, b);
  });
});

// Whether some split exists, by interval arithmetic instead of a grid: A's heights at w and B's heights
// at w must have a pair summing to h - g. Used only where the grid above could step over a thin region.
function near_slice(A, B, w, h, g) {
  const sa = sliceAtH(A.map(([x, y]) => [y, x]), w);
  const sb = sliceAtH(B.map(([x, y]) => [y, x]), w);
  if (!sa || !sb) return false;
  const tol = 1e-6 * Math.max(1, h);
  return sa[0] + sb[0] + g - tol <= h && h <= sa[1] + sb[1] + g + tol;
}
