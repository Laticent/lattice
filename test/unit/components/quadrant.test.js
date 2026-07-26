/**
 * Unit: lib/quadrant.js — kernel for the `quadrant` chart-family member.
 *
 * Section dispatch + chart-frame wrapping live in lib/components/chart/_chart-family/chart-family.js
 * (quadrant is one of CHART_LAYOUTS); this kernel just produces the
 * figure HTML. Tests here cover the layers chart-family delegates to:
 *
 *   1. Source parsing: parseItemPills, parseCoordPill, parseItem,
 *      parseGroup, parseQuadrant.
 *   2. Eyebrow grammar: parseEyebrow (axes + scale + targets).
 *   3. Scale resolution: niceCeil, resolveScale, matchEyebrowText.
 *   4. Geometry: plotPoint, bubbleRadius, convexHull, centroid.
 *   5. Variant emission: buildQuadrant — one default + five modifiers.
 *   6. Chart-family integration: transformChartSection wires up correctly.
 */

const { test, describe } = require('node:test');
// The emitter's own baseline→glyph-extent table, so this test measures the box
// that is actually painted rather than re-deriving one that might disagree.
const { BASELINE_EXTENT } = require('../../../lib/components/chart/_chart-family/svg-label');
const assert = require('node:assert/strict');
const {
  QUADRANT_MODIFIERS,
  GEOM,
  parseQuadrant,
  parseGroup,
  parseItem,
  parseItemPills,
  parseCoordPill,
  parseEyebrow,
  resolveScale,
  niceCeil,
  pickVariant,
  buildQuadrant,
  plotPoint,
  convexHull,
  centroid,
  bubbleRadius,
  matchEyebrowText,
} = require('../../../lib/components/chart/quadrant/quadrant.transform');

// ── Fixtures ───────────────────────────────────────────────────────────

const UL_FOUR = (
  '<ul>' +
    '<li>Strategic Bets<ul>' +
      '<li>Scoring model v2 <code>3, 70</code></li>' +
      '<li>Per-team calibration <code>7, 85</code></li>' +
    '</ul></li>' +
    '<li>Quick Wins<ul>' +
      '<li>Weekly signal brief <code>8, 40</code></li>' +
    '</ul></li>' +
    '<li>Defer<ul>' +
      '<li>Vendor scoping <code>4, 55</code></li>' +
    '</ul></li>' +
    '<li>Time Sinks<ul>' +
      '<li>Manual rotation <code>2, 20</code></li>' +
    '</ul></li>' +
  '</ul>'
);

const UL_TRAIL = (
  '<ul>' +
    '<li>Strategic Bets<ul>' +
      '<li>Acme <code>3, 60</code> <code>4, 78</code></li>' +
    '</ul></li>' +
    '<li>Quick Wins<ul>' +
      '<li>Initech <code>7, 50</code> <code>8, 78</code></li>' +
    '</ul></li>' +
  '</ul>'
);

const UL_BUBBLE = (
  '<ul>' +
    '<li>Strategic Bets<ul>' +
      '<li>Acme <code>3, 70, 8.2</code></li>' +
      '<li>Northwind <code>5, 85, 5.4</code></li>' +
    '</ul></li>' +
  '</ul>'
);

const innerOf = s => s.replace(/^<ul>|<\/ul>$/g, '');

// ── parseItemPills ─────────────────────────────────────────────────────

test('parseItemPills: extracts a single trailing <code> as the pill', () => {
  const r = parseItemPills('Acme <code>3, 70</code>');
  assert.equal(r.label, 'Acme');
  assert.deepEqual(r.pills, ['3, 70']);
});

test('parseItemPills: extracts multiple trailing pills for trail', () => {
  const r = parseItemPills('Acme <code>3, 60</code> <code>4, 78</code>');
  assert.equal(r.label, 'Acme');
  assert.deepEqual(r.pills, ['3, 60', '4, 78']);
});

test('parseItemPills: empty pills when none', () => {
  const r = parseItemPills('Acme');
  assert.equal(r.label, 'Acme');
  assert.deepEqual(r.pills, []);
});

// ── parseCoordPill ─────────────────────────────────────────────────────

test('parseCoordPill: two numeric tokens become x, y', () => {
  const r = parseCoordPill('3, 70');
  assert.equal(r.x, 3);
  assert.equal(r.y, 70);
  assert.equal(r.size, undefined);
});

test('parseCoordPill: three tokens fill x, y, size', () => {
  const r = parseCoordPill('5, 85, 5.4');
  assert.equal(r.x, 5);
  assert.equal(r.y, 85);
  assert.equal(r.size, 5.4);
});

test('parseCoordPill: missing tokens default to 0', () => {
  const r = parseCoordPill('');
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
});

// ── parseItem ──────────────────────────────────────────────────────────

test('parseItem: pulls x, y from the first pill', () => {
  const it = parseItem('Acme <code>3, 70</code>');
  assert.equal(it.label, 'Acme');
  assert.equal(it.x, 3);
  assert.equal(it.y, 70);
  assert.equal(it.to, null);
});

test('parseItem: trail — second pill becomes "to"', () => {
  const it = parseItem('Acme <code>3, 60</code> <code>4, 78</code>');
  assert.deepEqual(it.to, { x: 4, y: 78 });
});

test('parseItem: bubble — preserves the raw third-token rendition', () => {
  const it = parseItem('Acme <code>3, 70, 8.2</code>');
  assert.equal(it.size, 8.2);
  assert.equal(it.sizePill, '8.2');
});

// ── parseGroup / parseQuadrant ─────────────────────────────────────────

test('parseGroup: pulls name + items from a top-level <li>', () => {
  const g = parseGroup('Strategic Bets<ul><li>Acme <code>3, 70</code></li></ul>');
  assert.equal(g.name, 'Strategic Bets');
  assert.equal(g.items.length, 1);
  assert.equal(g.items[0].label, 'Acme');
});

test('parseQuadrant: collects four groups in source order', () => {
  const model = parseQuadrant(innerOf(UL_FOUR));
  assert.equal(model.groups.length, 4);
  assert.deepEqual(
    model.groups.map(g => g.name),
    ['Strategic Bets', 'Quick Wins', 'Defer', 'Time Sinks']
  );
  assert.equal(model.groups[0].items.length, 2);
});

test('parseQuadrant: returns null for an empty list', () => {
  assert.equal(parseQuadrant(''), null);
});

// ── niceCeil ───────────────────────────────────────────────────────────

test('niceCeil: rounds up to clean intervals', () => {
  assert.equal(niceCeil(87), 100);
  assert.equal(niceCeil(4.2), 5);
  assert.equal(niceCeil(1), 1);
  assert.equal(niceCeil(0), 1);
});

// ── parseEyebrow ───────────────────────────────────────────────────────

test('parseEyebrow: names + per-axis ranges', () => {
  const eb = parseEyebrow('Effort 0–10 → Reach 0–100');
  assert.equal(eb.xName, 'Effort');
  assert.equal(eb.yName, 'Reach');
  assert.deepEqual(eb.xRange, { min: 0, max: 10 });
  assert.deepEqual(eb.yRange, { min: 0, max: 100 });
  assert.equal(eb.targets, null);
});

test('parseEyebrow: names only (no scale)', () => {
  const eb = parseEyebrow('Effort → Reach');
  assert.equal(eb.xName, 'Effort');
  assert.equal(eb.yName, 'Reach');
  assert.equal(eb.xRange, null);
  assert.equal(eb.yRange, null);
});

test('parseEyebrow: trailing · targets parses to {x,y}', () => {
  const eb = parseEyebrow('Effort 0–10 → Reach 0–100 · targets 6, 75');
  assert.deepEqual(eb.targets, { x: 6, y: 75 });
  assert.deepEqual(eb.xRange, { min: 0, max: 10 });
});

test('parseEyebrow: empty string yields null fields', () => {
  const eb = parseEyebrow('');
  assert.equal(eb.xRange, null);
  assert.equal(eb.yRange, null);
  assert.equal(eb.targets, null);
});

// ── resolveScale ───────────────────────────────────────────────────────

test('resolveScale: eyebrow ranges win over data', () => {
  const model = parseQuadrant(innerOf(UL_FOUR));
  const s = resolveScale(model, 'Effort 0–10 → Reach 0–100');
  assert.equal(s.x.min, 0); assert.equal(s.x.max, 10);
  assert.equal(s.y.min, 0); assert.equal(s.y.max, 100);
  assert.equal(s.x.label, 'Effort');
  assert.equal(s.y.label, 'Reach');
});

test('resolveScale: auto-fits when eyebrow has no range', () => {
  const model = parseQuadrant(innerOf(UL_FOUR));
  const s = resolveScale(model, 'Effort → Reach');
  // data max x=8 → niceCeil → 10; data max y=85 → niceCeil → 100
  assert.equal(s.x.max, 10);
  assert.equal(s.y.max, 100);
});

test('resolveScale: targets reach the scale object', () => {
  const model = parseQuadrant(innerOf(UL_FOUR));
  const s = resolveScale(model, 'Effort 0–10 → Reach 0–100 · targets 6, 75');
  assert.deepEqual(s.targets, { x: 6, y: 75 });
});

// ── Geometry ───────────────────────────────────────────────────────────

test('plotPoint: (0,0) lands at the plot bottom-left', () => {
  const scale = { x: { min: 0, max: 10 }, y: { min: 0, max: 100 } };
  const p = plotPoint(0, 0, scale);
  assert.ok(Math.abs(p.x - GEOM.plot.x0) < 1e-6);
  assert.ok(Math.abs(p.y - GEOM.plot.y1) < 1e-6);
});

test('plotPoint: (max, max) lands at the plot top-right', () => {
  const scale = { x: { min: 0, max: 10 }, y: { min: 0, max: 100 } };
  const p = plotPoint(10, 100, scale);
  assert.ok(Math.abs(p.x - GEOM.plot.x1) < 1e-6);
  assert.ok(Math.abs(p.y - GEOM.plot.y0) < 1e-6);
});

test('plotPoint: clamps out-of-range values to the plot box', () => {
  const scale = { x: { min: 0, max: 10 }, y: { min: 0, max: 100 } };
  const p = plotPoint(-5, 999, scale);
  assert.ok(Math.abs(p.x - GEOM.plot.x0) < 1e-6);
  assert.ok(Math.abs(p.y - GEOM.plot.y0) < 1e-6);
});

test('bubbleRadius: undefined size or no range → standard dot radius', () => {
  assert.equal(bubbleRadius(undefined, null), GEOM.dotR);
  assert.equal(bubbleRadius(undefined, { min: 0, max: 10 }), GEOM.dotR);
});

test('bubbleRadius: a zero magnitude collapses to the bubble minimum', () => {
  assert.equal(bubbleRadius(0, { min: 0, max: 10 }), GEOM.bubble.rMin);
});

test('bubbleRadius: max size → rMax', () => {
  assert.equal(bubbleRadius(10, { min: 0, max: 10 }), GEOM.bubble.rMax);
});

test('bubbleRadius: half-max is √(0.5) × range above rMin', () => {
  const r = bubbleRadius(5, { min: 0, max: 10 });
  const expected = GEOM.bubble.rMin + Math.sqrt(0.5) * (GEOM.bubble.rMax - GEOM.bubble.rMin);
  assert.ok(Math.abs(r - expected) < 1e-9);
});

test('convexHull: 3-point triangle is its own hull', () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }];
  const hull = convexHull(pts);
  assert.equal(hull.length, 3);
});

test('convexHull: ignores an interior point', () => {
  const pts = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    { x: 5, y: 5 },
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4); // the interior point is dropped
});

test('centroid: midpoint of a square is the center', () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const c = centroid(pts);
  assert.ok(Math.abs(c.x - 2) < 1e-9);
  assert.ok(Math.abs(c.y - 2) < 1e-9);
});

// ── pickVariant ────────────────────────────────────────────────────────

test('pickVariant: default for a plain quadrant class', () => {
  assert.equal(pickVariant(['quadrant']), 'default');
});

test('pickVariant: each modifier is extracted', () => {
  for (const mod of QUADRANT_MODIFIERS) {
    assert.equal(pickVariant(['quadrant', mod]), mod);
  }
});

test('pickVariant: minimal is not a variant (composable modifier)', () => {
  assert.equal(pickVariant(['quadrant', 'minimal']), 'default');
});

// ── buildQuadrant — variant emission ───────────────────────────────────

function modelFour() { return parseQuadrant(innerOf(UL_FOUR)); }
const SCALE = { x: { min: 0, max: 10, label: 'Effort' }, y: { min: 0, max: 100, label: 'Reach' }, targets: null };

test('buildQuadrant: default emits figure + tints + frame + dots', () => {
  const out = buildQuadrant(modelFour(), 'default', SCALE);
  assert.match(out, /<div class="quadrant-figure" data-variant="default"/);
  assert.match(out, /<svg class="quadrant-svg"/);
  assert.equal((out.match(/class="quadrant-tint"/g) || []).length, 4);
  assert.match(out, /class="quadrant-bounds"/);
  // UL_FOUR carries 2+1+1+1 = 5 items across the four groups.
  assert.equal((out.match(/class="quadrant-dot"/g) || []).length, 5);
});

test('buildQuadrant: default labels every dot when items ≤ 16', () => {
  const out = buildQuadrant(modelFour(), 'default', SCALE);
  assert.equal((out.match(/class="quadrant-dot-label"/g) || []).length, 5);
});

test('buildQuadrant: default labels four quadrant corners', () => {
  const out = buildQuadrant(modelFour(), 'default', SCALE);
  assert.equal((out.match(/class="quadrant-label"/g) || []).length, 4);
  // Reading-order check: top-left is data-cell="0" with "Strategic Bets"
  // The label text now lives in a <tspan> (labels wrap), so the corner name
  // sits one element deeper than the flat <text> this used to match.
  assert.match(out, /data-cell="0"[^>]*>(?:<tspan[^>]*>)?[^<]*Strategic Bets/);
});

test('buildQuadrant: bubble — √-scaled bubbles + size pill', () => {
  const model = parseQuadrant(innerOf(UL_BUBBLE));
  const out = buildQuadrant(model, 'bubble', SCALE);
  assert.match(out, /data-variant="bubble"/);
  assert.match(out, /class="quadrant-bubble"/);
  // Both items have a third token (8.2, 5.4) → both render a value chip
  assert.equal((out.match(/class="quadrant-bubble-value"/g) || []).length, 2);
  assert.match(out, /8\.2/);
});

test('buildQuadrant: trail — before/after dots + dashed connector', () => {
  const model = parseQuadrant(innerOf(UL_TRAIL));
  const out = buildQuadrant(model, 'trail', SCALE);
  assert.match(out, /data-variant="trail"/);
  assert.equal((out.match(/class="quadrant-trail-before"/g) || []).length, 2);
  assert.equal((out.match(/class="quadrant-trail-after"/g) || []).length, 2);
  assert.equal((out.match(/class="quadrant-trail-line"/g) || []).length, 2);
});

test('buildQuadrant: cohort emits convex hulls + a legend', () => {
  const out = buildQuadrant(modelFour(), 'cohort', SCALE);
  assert.match(out, /data-variant="cohort"/);
  assert.match(out, /class="quadrant-hulls"/);
  // SVG-native key (2026-06-13-svg-native-legend.md): one swatch <rect> + label
  // <text> + count <text> per cohort, inside the diagram <svg> (not an HTML <ol>).
  assert.match(out, /class="chart-key-swatch"/);
  assert.match(out, /class="chart-key-label"/);
  assert.match(out, /class="chart-key-value"/);
  // Groups with 1 point each get neither a polygon nor a 2-point line; the
  // 2-item Strategic Bets group hits the 2-point hull branch.
  assert.match(out, /quadrant-hull-line/);
});

test('buildQuadrant: threshold emits target-line split + zone labels', () => {
  const scale = { ...SCALE, targets: { x: 6, y: 75 } };
  const out = buildQuadrant(modelFour(), 'threshold', scale);
  assert.match(out, /data-variant="threshold"/);
  assert.match(out, /data-kind="target"/);
  assert.match(out, /class="quadrant-target-badge/);
  assert.match(out, /data-tx="6"/);
  assert.match(out, /data-ty="75"/);
});

test('buildQuadrant: threshold zone labels fall back to defaults', () => {
  // Empty group names → fall back to On Pace / Star / At Risk / Lagging.
  const minimalUl = (
    '<li><ul><li>X <code>5, 60</code></li></ul></li>' +
    '<li><ul><li>Y <code>7, 80</code></li></ul></li>' +
    '<li><ul><li>Z <code>3, 30</code></li></ul></li>' +
    '<li><ul><li>W <code>8, 40</code></li></ul></li>'
  );
  const model = parseQuadrant(minimalUl);
  const out = buildQuadrant(model, 'threshold', { ...SCALE, targets: { x: 5, y: 50 } });
  assert.match(out, /Star/);
  assert.match(out, /On Pace/);
  assert.match(out, /At Risk/);
  assert.match(out, /Lagging/);
});

test('buildQuadrant: magic — falls back to canonical Gartner labels', () => {
  const minimalUl = (
    '<li><ul><li>X <code>3, 8</code></li></ul></li>' +
    '<li><ul><li>Y <code>8, 9</code></li></ul></li>' +
    '<li><ul><li>Z <code>2, 3</code></li></ul></li>' +
    '<li><ul><li>W <code>8, 4</code></li></ul></li>'
  );
  const model = parseQuadrant(minimalUl);
  const out = buildQuadrant(model, 'magic', SCALE);
  assert.match(out, /data-variant="magic"/);
  assert.match(out, /Challengers/);
  assert.match(out, /Leaders/);
  assert.match(out, /Niche Players/);
  assert.match(out, /Visionaries/);
});

test('buildQuadrant: magic — author-supplied group names override defaults', () => {
  const out = buildQuadrant(modelFour(), 'magic', SCALE);
  // The author-supplied "Strategic Bets" wins over the default "Challengers".
  assert.match(out, /Strategic Bets/);
  assert.doesNotMatch(out, /Challengers/);
});

// ── matchEyebrowText ───────────────────────────────────────────────────

test('matchEyebrowText: pulls the first <p><code> text', () => {
  assert.equal(matchEyebrowText('<p><code>Effort → Reach</code></p><h2>X</h2>'), 'Effort → Reach');
  assert.equal(matchEyebrowText('<h2>X</h2><ul></ul>'), '');
});

// ── chart-family dispatch (integration with lib/components/chart/_chart-family/chart-family.js) ───────
// Quadrant is a chart-family member; section dispatch + chart-frame
// wrapping are owned by lib/components/chart/_chart-family/chart-family.js. These pin the wiring.

const { transformChartSection } = require('../../../lib/components/chart/_chart-family/chart-family');

describe('quadrant', () => {
  test('chart-family: quadrant section is wrapped in chart-frame', () => {
    const inner = '<h2>Where to put the next dollar.</h2>' + UL_FOUR;
    const { html, cls, transformed } = transformChartSection(inner, 'quadrant');
    assert.equal(transformed, true);
    assert.match(cls, /\bchart-frame\b/);
    // .viz-frame merge: chrome is emitted top-level (no `.chart-header`) for the masthead lift.
    assert.doesNotMatch(html, /<div class="chart-header">/);
    assert.match(html, /<h2>Where to put the next dollar\.<\/h2>/);
    assert.match(html, /<div class="chart-body"><div class="quadrant-figure"/);
  });

  test('chart-family: quadrant variant rides the class list', () => {
    const inner = '<h2>X</h2>' + UL_BUBBLE;
    const { html } = transformChartSection(inner, 'quadrant bubble');
    assert.match(html, /data-variant="bubble"/);
    assert.match(html, /class="quadrant-bubble"/);
  });

  test('chart-family: eyebrow scale + targets reach the figure', () => {
    const inner = '<p><code>Effort 0–10 → Reach 0–100 · targets 6, 75</code></p>' +
      '<h2>X</h2>' + UL_FOUR;
    const { html } = transformChartSection(inner, 'quadrant threshold');
    assert.match(html, /data-tx="6"/);
    assert.match(html, /data-ty="75"/);
    // Eyebrow stays in the DOM as `.chart-eyebrow`.
    assert.match(html, /class="chart-eyebrow"/);
  });
});

describe('quadrant — per-item detail (interactive reveal substrate)', () => {
  // An item may carry an optional 3rd-level nested sublist (the x,y are inline
  // pills, so this level is free) — captured as present-mode detail (inert
  // <template>) + a speaker-note fallback, byte-identical export.
  const UL_DETAIL = (
    '<ul>' +
      '<li>Strategic Bets<ul>' +
        '<li>Scoring model v2 <code>3, 70</code><ul><li>Owner: Platform</li><li>Q3 bet</li></ul></li>' +
        '<li>Per-team calibration <code>5, 85</code></li>' +
      '</ul></li>' +
      '<li>Quick Wins<ul>' +
        '<li>Weekly brief <code>8, 80</code><ul><li>Already scoped</li></ul></li>' +
      '</ul></li>' +
    '</ul>'
  );
  const build = (variant) =>
    buildQuadrant(parseQuadrant(UL_DETAIL), variant, resolveScale(parseQuadrant(UL_DETAIL), 'Effort 0-10 → Reach 0-100'));

  test('a plain quadrant emits no detail payload and no note', () => {
    const html = buildQuadrant(parseQuadrant(UL_FOUR), 'default', resolveScale(parseQuadrant(UL_FOUR), ''));
    assert.doesNotMatch(html, /chart-details/);
    assert.doesNotMatch(html, /<!--/);
  });

  for (const variant of ['default', 'bubble', 'trail', 'cohort', 'threshold', 'magic']) {
    test(`${variant}: dot data-mark aligns with the detail templates`, () => {
      const html = build(variant);
      const dotMarks = [...html.matchAll(/class="quadrant-(?:dot|bubble|trail-after)"[^>]*data-mark="(\d+)"/g)].map((x) => +x[1]).sort();
      const tplMarks = [...html.matchAll(/class="chart-detail" data-mark="(\d+)"/g)].map((x) => +x[1]).sort();
      assert.deepEqual(dotMarks, [0, 1, 2], 'every item dot carries its global mark index');
      assert.deepEqual(tplMarks, [0, 2], 'only the two detailed items emit a template');
      assert.match(html, /<!-- /);
    });
  }

  test('the detail sublist does not leak into the dot label', () => {
    const html = build('default');
    assert.doesNotMatch(html, /<text[^>]*>Owner: Platform</);
  });
});

// ── label placement never lands on a data mark ──────────────────────────────
// Found by adversarial review: the de-collision pass was seeded only with the
// CORNER labels as obstacles, so nudging a label clear of its neighbor could
// push it straight onto a dot — the outcome the direction rule exists to
// prevent, arrived at from the other side. A label over a data point is worse
// than a label over a label: it hides the value it names.
test('buildQuadrant: a de-collided label never overlaps a plotted dot', () => {
  // Four items clustered tightly in one corner — the case that forces the pass
  // to move labels a long way.
  const ul = innerOf(`<ul>
    <li>Quick Wins<ul>
      <li>Multi-region failover <code>8, 88</code></li>
      <li>Legacy connector rewrite <code>8, 86</code></li>
      <li>Self-serve onboarding <code>7, 87</code></li>
      <li>Partner API keys <code>8, 84</code></li>
    </ul></li>
    <li>Strategic Bets<ul><li>Decision-log API <code>2, 20</code></li></ul></li>
  </ul>`);
  const out = buildQuadrant(parseQuadrant(ul), 'default', SCALE);

  const dots = [...out.matchAll(/<circle class="quadrant-dot"[^>]*cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2], r: +m[3] }));
  assert.ok(dots.length >= 5, 'expected every item to plot a dot');

  // Reconstruct each label's painted box from its tspans (x is the anchor, so
  // widen symmetrically for the centered anchor these labels use).
  // Reconstruct each label's PAINTED box the same way the emitter does — which
  // means honoring its dominant-baseline. Measuring every label as if it sat on
  // an alphabetic baseline is exactly the bug this whole area had: the box you
  // check is then not the box that gets painted.
  const labels = [...out.matchAll(/<text class="quadrant-dot-label"[^>]*>([\s\S]*?)<\/text>/g)].map((m, i) => {
    const head = out.split('<text class="quadrant-dot-label"')[i + 1] ?? '';
    const baseline = (head.match(/dominant-baseline="(\w+)"/) || [])[1] || 'auto';
    const anchor = (head.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
    const [above, below] = BASELINE_EXTENT[baseline] || BASELINE_EXTENT.auto;
    const lines = [...m[1].matchAll(/<tspan x="([-\d.]+)" y="([-\d.]+)">([^<]*)</g)]
      .map((t) => ({ x: +t[1], y: +t[2], text: t[3] }));
    const widest = lines.reduce((w, l) => Math.max(w, l.text.length), 0) * 8.5 * 0.6;
    // Horizontal extent follows the ANCHOR, exactly as the emitter computes it —
    // a side-placed label is start/end anchored, not centered.
    const x0 = lines[0].x;
    const left = anchor === 'middle' ? x0 - widest / 2 : anchor === 'end' ? x0 - widest : x0;
    return {
      left,
      right: left + widest,
      top: Math.min(...lines.map((l) => l.y)) - 8.5 * above,
      bottom: Math.max(...lines.map((l) => l.y)) + 8.5 * below,
    };
  });
  assert.ok(labels.length >= 5);

  for (const L of labels) {
    for (const d of dots) {
      const hits = L.left < d.cx + d.r && L.right > d.cx - d.r
        && L.top < d.cy + d.r && L.bottom > d.cy - d.r;
      assert.ok(!hits,
        `a label box (${L.left.toFixed(1)}…${L.right.toFixed(1)}) overlaps the dot at ` +
        `(${d.cx}, ${d.cy}) — labels must be placed clear of every plotted mark`);
    }
  }
});
