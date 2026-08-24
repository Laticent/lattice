/**
 * Unit: lib/word-cloud.js — word-cloud spiral-packer engine.
 *
 * The engine has four layers tested separately and then end-to-end:
 *   1. Source parsing: clampWeight, parseItem, parseItems, findFirstUl
 *   2. Visual assignment: sizeFromWeight, rotatedForRank, colorForWord
 *      — pure functions of (rank, weight, variant options), deterministic.
 *   3. Geometry: bboxFor, rectsCollide, packCloud — the spiral packer.
 *   4. Section dispatch: transformWordCloudSection, applyToRenderedHtml
 *      — idempotent HTML-string rewrite.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyToRenderedHtml,
  transformWordCloudSection,
  buildCanvas,
  packCloud,
  bboxFor,
  rectsCollide,
  sizeFromWeight,
  rotatedForRank,
  colorForWord,
  pickVariant,
  clampWeight,
  normalizeWeights,
  parseItem,
  parseItems,
  VARIANT_OPTS,
  CANVAS_W,
  CANVAS_H,
} = require('../../../lib/components/chart/word-cloud/word-cloud.transform');

describe('word-cloud', () => {
  // ── clampWeight ─────────────────────────────────────────────────────────

  test('clampWeight: passes valid 1-5 through (continuous)', () => {
    assert.equal(clampWeight(1), 1);
    assert.equal(clampWeight(3), 3);
    assert.equal(clampWeight(5), 5);
    assert.equal(clampWeight('4.3'), 4.3);
    assert.equal(clampWeight(3.5), 3.5);
  });

  test('clampWeight: clamps out-of-range to 1 or 5', () => {
    assert.equal(clampWeight(0), 1);
    assert.equal(clampWeight(-2), 1);
    assert.equal(clampWeight(9), 5);
    assert.equal(clampWeight(5.01), 5);
  });

  test('clampWeight: defaults garbage to 3', () => {
    assert.equal(clampWeight('not a number'), 3);
    assert.equal(clampWeight(NaN), 3);
    assert.equal(clampWeight(undefined), 3);
  });

  // ── parseItem ───────────────────────────────────────────────────────────

  test('parseItem: extracts trailing <code> as weight', () => {
    assert.deepEqual(parseItem('Execution <code>5</code>'), { text: 'Execution', weight: 5 });
  });

  test('parseItem: accepts continuous floats', () => {
    assert.deepEqual(parseItem('Velocity <code>4.3</code>'), { text: 'Velocity', weight: 4.3 });
  });

  test('parseItem: weight is NaN (unspecified) when no <code>', () => {
    const item = parseItem('Strategy');
    assert.equal(item.text, 'Strategy');
    assert.ok(Number.isNaN(item.weight), 'no pill → NaN, normalized to mid downstream');
  });

  test('parseItem: keeps the raw weight (no clamp)', () => {
    assert.equal(parseItem('Velocity <code>124</code>').weight, 124);
  });

  // ── normalizeWeights ────────────────────────────────────────────────────

  test('normalizeWeights: min-max scales any range onto 1-5', () => {
    const [a, b, c] = normalizeWeights([9, 78, 124]);
    assert.equal(a, 1);   // min → 1
    assert.equal(c, 5);   // max → 5
    assert.ok(b > 1 && b < 5);
  });

  test('normalizeWeights: a full-range 1-5 set is a fixed point', () => {
    assert.deepEqual(normalizeWeights([5, 4, 3, 2, 1]), [5, 4, 3, 2, 1]);
  });

  test('normalizeWeights: skeleton-style counts spread across the scale', () => {
    const [w12, w9, w7, w6] = normalizeWeights([12, 9, 7, 6]);
    assert.equal(w12, 5);
    assert.equal(w6, 1);
    assert.ok(w9 > w7 && w7 > w6);
  });

  test('normalizeWeights: single word and all-equal map to mid', () => {
    assert.deepEqual(normalizeWeights([7]), [3]);
    assert.deepEqual(normalizeWeights([4, 4, 4]), [3, 3, 3]);
  });

  test('normalizeWeights: NaN entries map to mid without skewing min/max', () => {
    // raws [10, NaN, 2] → 10→5, 2→1, NaN→3 (not anchoring the range)
    assert.deepEqual(normalizeWeights([10, NaN, 2]), [5, 3, 1]);
  });

  test('parseItem: ignores non-trailing <code> elements', () => {
    const item = parseItem('Use <code>regex</code> wisely <code>4</code>');
    assert.equal(item.text, 'Use <code>regex</code> wisely');
    assert.equal(item.weight, 4);
  });

  // ── parseItems ──────────────────────────────────────────────────────────

  const UL_HTML = (
    '<ul>' +
      '<li>Execution <code>5</code></li>' +
      '<li>Discipline <code>4.5</code></li>' +
      '<li>Velocity <code>4</code></li>' +
      '<li>Talent</li>' +
      '<li>Risk <code>2</code></li>' +
    '</ul>'
  );

  test('parseItems: returns one entry per <li> in source order', () => {
    const items = parseItems(UL_HTML);
    assert.equal(items.length, 5);
    assert.equal(items[1].text, 'Discipline');
    assert.equal(items[1].weight, 4.5);
  });

  test('parseItems: skips empty list items', () => {
    const ul = '<ul><li>One <code>4</code></li><li></li><li>Two <code>3</code></li></ul>';
    const items = parseItems(ul);
    assert.equal(items.length, 2);
  });

  // ── sizeFromWeight ──────────────────────────────────────────────────────

  test('sizeFromWeight: weight 1 maps to spread minimum', () => {
    const size = sizeFromWeight(1, VARIANT_OPTS.default);
    assert.equal(size, VARIANT_OPTS.default.sizeSpread[0]);
  });

  test('sizeFromWeight: weight 5 maps to spread maximum', () => {
    const size = sizeFromWeight(5, VARIANT_OPTS.default);
    assert.equal(size, VARIANT_OPTS.default.sizeSpread[1]);
  });

  test('sizeFromWeight: intermediate weight produces interpolated size', () => {
    const [min, max] = VARIANT_OPTS.default.sizeSpread;
    const s3 = sizeFromWeight(3, VARIANT_OPTS.default);
    assert.ok(s3 > min && s3 < max, '3 should be between min and max');
    // Ease-in curve means weight 3 lands below the linear midpoint
    assert.ok(s3 < (min + max) / 2, 'curve is ease-in, so midpoint is below linear');
  });

  test('sizeFromWeight: focal has the widest spread', () => {
    const dflt = VARIANT_OPTS.default.sizeSpread[1];
    const focal = VARIANT_OPTS.focal.sizeSpread[1];
    assert.ok(focal > dflt, 'focal top size should exceed default');
  });

  // ── rotatedForRank ──────────────────────────────────────────────────────

  test('rotatedForRank: zero chance → never rotated', () => {
    const opts = VARIANT_OPTS.constellation;  // chance = 0
    for (let r = 1; r <= 30; r++) {
      assert.equal(rotatedForRank(r, 3, opts), false);
    }
  });

  test('rotatedForRank: high-weight words never rotate', () => {
    const opts = VARIANT_OPTS.default;
    // weight 5 is above maxWeight (3.5), so never rotated.
    for (let r = 1; r <= 30; r++) {
      assert.equal(rotatedForRank(r, 5, opts), false);
    }
  });

  test('rotatedForRank: deterministic — same rank yields same decision', () => {
    const opts = VARIANT_OPTS.default;
    assert.equal(rotatedForRank(7, 3, opts), rotatedForRank(7, 3, opts));
    assert.equal(rotatedForRank(7, 3, opts), rotatedForRank(7, 3, opts));
  });

  test('rotatedForRank: roughly matches the chance rate over 100 ranks', () => {
    const opts = VARIANT_OPTS.dense;  // chance = 0.32
    let rotated = 0;
    for (let r = 1; r <= 100; r++) {
      if (rotatedForRank(r, 3, opts)) rotated++;
    }
    // Hash uses (rank * 7 + 3) % 100 — bijective over 1..100 so exact.
    assert.equal(rotated, 32, 'dense should produce 32/100 rotated at weight 3');
  });

  // ── colorForWord ────────────────────────────────────────────────────────

  test('colorForWord: top tier always accent (default, dense, focal)', () => {
    for (const v of ['default', 'dense', 'focal']) {
      assert.equal(colorForWord(1, 5, VARIANT_OPTS[v]), 'var(--accent)');
    }
  });

  test('colorForWord: bottom tier always muted (default, dense, focal)', () => {
    for (const v of ['default', 'dense', 'focal']) {
      assert.equal(colorForWord(1, 1, VARIANT_OPTS[v]), 'var(--text-muted)');
    }
  });

  test('colorForWord: mid tier rotates through 6 categorical tokens', () => {
    const opts = VARIANT_OPTS.default;
    const colors = new Set();
    for (let r = 1; r <= 6; r++) {
      colors.add(colorForWord(r, 3, opts));
    }
    assert.equal(colors.size, 6, 'six consecutive ranks at weight 3 should yield 6 distinct hues');
  });

  test('colorForWord: heat-ramp maps weight bands to seq-N', () => {
    const opts = VARIANT_OPTS.spectrum;
    // Tiers 5-2 are ramp stops, so the encoding is ordered by construction; only
    // the quiet floor sits off the ramp. A `var(--accent)` here would be the
    // pre-#1697 map, whose top tier was a brand hue of arbitrary lightness.
    assert.equal(colorForWord(1, 5, opts),   'var(--seq-900)');
    assert.equal(colorForWord(1, 4, opts),   'var(--seq-700)');
    // The ramp FLOOR is --seq-500, not --seq-400: the >=1.5 tier can render below
    // the 18.66px large-text threshold, so it owes 4.5:1 as ordinary text, and
    // --seq-400 (a 22% mix toward the canvas) measured 3.17:1 there.
    assert.equal(colorForWord(1, 3, opts),   'var(--seq-600)');
    assert.equal(colorForWord(1, 2, opts),   'var(--seq-500)');
    assert.equal(colorForWord(1, 1, opts),   'var(--text-muted)');
  });

  test('colorForWord: constellation pairs accent with one supporting cat', () => {
    const opts = VARIANT_OPTS.constellation;
    // Top stays accent, mid uses one cat color (cat-mauve), low muted.
    // The set of colors across the full weight spread is just 3 values.
    const colors = new Set();
    for (let w = 1; w <= 5; w += 0.5) {
      for (let r = 1; r <= 6; r++) colors.add(colorForWord(r, w, opts));
    }
    assert.equal(colors.size, 3, 'constellation uses a 3-color palette total');
  });

  // ── bboxFor ─────────────────────────────────────────────────────────────

  test('bboxFor: width scales with text length', () => {
    const small = bboxFor('Hi', 24);
    const large = bboxFor('Reliability', 24);
    assert.ok(large.w > small.w, 'longer text → wider bbox');
  });

  test('bboxFor: width scales with font size', () => {
    const tiny  = bboxFor('Velocity', 14);
    const huge  = bboxFor('Velocity', 96);
    assert.ok(huge.w > tiny.w * 5, 'larger size → much wider bbox');
  });

  test('bboxFor: empty text still produces a positive bbox', () => {
    const b = bboxFor('', 24);
    assert.ok(b.w > 0 && b.h > 0);
  });

  // ── rectsCollide ────────────────────────────────────────────────────────

  test('rectsCollide: detects overlap', () => {
    assert.equal(
      rectsCollide({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
      true,
    );
  });

  test('rectsCollide: returns false for disjoint rects', () => {
    assert.equal(
      rectsCollide({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }),
      false,
    );
  });

  test('rectsCollide: edge-touching rects do not collide', () => {
    assert.equal(
      rectsCollide({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }),
      false,
    );
  });

  // ── packCloud ───────────────────────────────────────────────────────────

  function makeWord(text, weight, rank, opts) {
    const size = sizeFromWeight(weight, opts);
    return {
      text, weight, rank, size,
      rotated: rotatedForRank(rank, weight, opts),
      color: colorForWord(rank, weight, opts),
      bbox: bboxFor(text, size),
    };
  }

  test('packCloud: places all words for a reasonable input', () => {
    const opts = VARIANT_OPTS.default;
    const words = [
      makeWord('Execution', 5, 1, opts),
      makeWord('Velocity',  4, 2, opts),
      makeWord('Trust',     3, 3, opts),
      makeWord('Risk',      3, 4, opts),
      makeWord('Capital',   2, 5, opts),
      makeWord('Cadence',   1, 6, opts),
    ];
    const placed = packCloud(words, { w: CANVAS_W, h: CANVAS_H }, opts.spiral);
    assert.equal(placed.length, 6);
    for (const w of placed) {
      assert.ok(w.x >= 0 && w.x <= CANVAS_W, `${w.text} x in bounds`);
      assert.ok(w.y >= 0 && w.y <= CANVAS_H, `${w.text} y in bounds`);
    }
  });

  test('packCloud: placed words do not overlap', () => {
    const opts = VARIANT_OPTS.default;
    const words = [];
    for (let i = 0; i < 12; i++) {
      words.push(makeWord(`Word${i}`, 3 + (i % 3) * 0.5, i + 1, opts));
    }
    const placed = packCloud(words, { w: CANVAS_W, h: CANVAS_H }, opts.spiral);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const aw = a.rotated ? a.bbox.h : a.bbox.w;
        const ah = a.rotated ? a.bbox.w : a.bbox.h;
        const bw = b.rotated ? b.bbox.h : b.bbox.w;
        const bh = b.rotated ? b.bbox.w : b.bbox.h;
        const ra = { x: a.x - aw / 2, y: a.y - ah / 2, w: aw, h: ah };
        const rb = { x: b.x - bw / 2, y: b.y - bh / 2, w: bw, h: bh };
        assert.equal(rectsCollide(ra, rb), false, `${a.text} and ${b.text} overlap`);
      }
    }
  });

  test('packCloud: deterministic across runs', () => {
    const opts = VARIANT_OPTS.default;
    const mk = () => {
      const words = [];
      for (let i = 0; i < 10; i++) words.push(makeWord(`W${i}`, 4 - i * 0.3, i + 1, opts));
      return packCloud(words, { w: CANVAS_W, h: CANVAS_H }, opts.spiral);
    };
    const a = mk();
    const b = mk();
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].x, b[i].x, `x stable for ${a[i].text}`);
      assert.equal(a[i].y, b[i].y, `y stable for ${a[i].text}`);
    }
  });

  // ── pickVariant ─────────────────────────────────────────────────────────

  test('pickVariant: returns "default" for plain word-cloud', () => {
    assert.equal(pickVariant('word-cloud'), 'default');
  });

  test('pickVariant: extracts modifier from class list', () => {
    assert.equal(pickVariant('word-cloud constellation'), 'constellation');
    assert.equal(pickVariant('word-cloud dense'),         'dense');
    assert.equal(pickVariant('word-cloud spectrum'),      'spectrum');
    assert.equal(pickVariant('word-cloud focal'),         'focal');
  });

  // ── buildCanvas (emission) ──────────────────────────────────────────────

  test('buildCanvas: emits .word-cloud-canvas wrapper around a viewBox SVG', () => {
    const items = parseItems(UL_HTML);
    const out = buildCanvas(items, 'default');
    assert.match(out, /<div class="word-cloud-canvas"/);
    assert.match(out, /<svg class="wc-svg" viewBox="0 0 1100 320"/);
    assert.match(out, /data-variant="default"/);
  });

  test('buildCanvas: emits one <text> per packed word with position + size attrs', () => {
    const items = parseItems(UL_HTML);
    const out = buildCanvas(items, 'default');
    const texts = out.match(/<text class="wc-word"/g) || [];
    assert.equal(texts.length, items.length);
    assert.match(out, /<text class="wc-word" x="[\d.]+" y="[\d.]+" font-size="[\d.]+"/);
    assert.match(out, /--wc-color:var\(--/);
  });

  test('buildCanvas: top tier gets the accent color', () => {
    const items = parseItems(UL_HTML);
    const out = buildCanvas(items, 'default');
    // Discipline is weight 4.5, rank 2 — it doesn't get accent; Execution is 5, rank 1 → accent
    // Match the rank-1 <text> specifically
    const rank1 = out.match(/<text class="wc-word"[^>]*data-weight="5" data-rank="1"[^>]*>/);
    assert.ok(rank1, 'rank 1 text present');
    assert.match(rank1[0], /--wc-color:var\(--accent\)/);
  });

  test('buildCanvas: spectrum variant uses heat-ramp colors', () => {
    const items = parseItems(UL_HTML);
    const out = buildCanvas(items, 'spectrum');
    assert.match(out, /--wc-color:var\(--seq-/);
  });

  // ── transformWordCloudSection ───────────────────────────────────────────

  test('transform: rewrites <ul> into canvas on word-cloud class', () => {
    const inner = '<h2>Q1 retro</h2>' + UL_HTML;
    const out = transformWordCloudSection(inner, 'word-cloud');
    assert.match(out, /<div class="word-cloud-canvas"/);
    assert.ok(!out.includes('<ul>'), '<ul> should be removed');
    assert.match(out, /<h2>Q1 retro<\/h2>/);
  });

  test('transform: variant-aware — focal uses focal opts', () => {
    const inner = '<h2>Q1</h2>' + UL_HTML;
    const out = transformWordCloudSection(inner, 'word-cloud focal');
    assert.match(out, /data-variant="focal"/);
  });

  test('transform: leaves non-word-cloud sections untouched', () => {
    const inner = '<h2>Q1</h2>' + UL_HTML;
    assert.equal(transformWordCloudSection(inner, 'roadmap'), inner);
  });

  test('transform: idempotent on re-application', () => {
    const inner = '<h2>Q1</h2>' + UL_HTML;
    const once  = transformWordCloudSection(inner, 'word-cloud');
    const twice = transformWordCloudSection(once, 'word-cloud');
    assert.equal(once, twice);
  });

  test('transform: no-op on section without a <ul>', () => {
    const inner = '<h2>Q1</h2><p>no list.</p>';
    assert.equal(transformWordCloudSection(inner, 'word-cloud'), inner);
  });

  // ── applyToRenderedHtml — section dispatch ──────────────────────────────

  const WC_SECTION = (
    '<section id="1" class="word-cloud" data-lattice-slide="1"><h2>Q1</h2>' + UL_HTML + '</section>'
  );
  const WC_FOCAL_SECTION = (
    '<section id="2" class="word-cloud focal" data-lattice-slide="2"><h2>Q1</h2>' + UL_HTML + '</section>'
  );
  const NON_WC_SECTION = (
    '<section id="3" class="roadmap" data-lattice-slide="3"><h2>Q1</h2>' + UL_HTML + '</section>'
  );

  test('dispatch: transforms default word-cloud sections', () => {
    assert.match(applyToRenderedHtml(WC_SECTION), /<div class="word-cloud-canvas"/);
  });

  test('dispatch: transforms modifier-variant sections', () => {
    const out = applyToRenderedHtml(WC_FOCAL_SECTION);
    assert.match(out, /data-variant="focal"/);
    assert.match(out, /class="word-cloud focal"/);
  });

  test('dispatch: leaves non-word-cloud sections untouched', () => {
    assert.equal(applyToRenderedHtml(NON_WC_SECTION), NON_WC_SECTION);
  });

  test('dispatch: idempotent on re-application', () => {
    const once  = applyToRenderedHtml(WC_SECTION);
    const twice = applyToRenderedHtml(once);
    assert.equal(once, twice);
  });

  test('dispatch: handles multiple sections in the same document', () => {
    const doc = WC_SECTION + WC_FOCAL_SECTION + NON_WC_SECTION;
    const out = applyToRenderedHtml(doc);
    const canvases = out.match(/word-cloud-canvas/g) || [];
    assert.equal(canvases.length, 2);
    assert.match(out, /<section id="3" class="roadmap"[\s\S]*<ul>/);
  });
});
