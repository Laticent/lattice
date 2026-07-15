/**
 * Unit: lib/radar.js — kernel for the `radar` chart-family member.
 *
 * Section dispatch + chart-frame wrapping live in lib/components/chart/_chart-family/chart-family.js (radar
 * is one of CHART_LAYOUTS); this kernel just produces the figure HTML. Tests
 * here cover the layers chart-family delegates to:
 *
 *   1. Source parsing: parseAxisItem, parseSeries, parseRadar
 *   2. Scale resolution: niceCeil, parseScale, resolveScale, matchEyebrowText
 *   3. Geometry: axisAngle, polar, valueRadius, seriesPoints — pure,
 *      deterministic functions of the value model.
 *   4. Variant emission: buildRadar — one default + five modifiers.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  RADAR_MODIFIERS,
  GEOM,
  parseRadar,
  parseSeries,
  parseAxisItem,
  parseScale,
  resolveScale,
  niceCeil,
  pickVariant,
  buildRadar,
  seriesPoints,
  valueRadius,
  axisAngle,
  polar,
  matchEyebrowText,
} = require('../../../lib/components/chart/radar/radar.transform');

// ── Fixtures ────────────────────────────────────────────────────────────

// Series-major: two series over three axes.
const UL_TWO = (
  '<ul>' +
    '<li>Teacher<ul>' +
      '<li>Calculus <code>85</code></li>' +
      '<li>Geometry <code>70</code></li>' +
      '<li>Algebra <code>90</code></li>' +
    '</ul></li>' +
    '<li>Student<ul>' +
      '<li>Calculus <code>75</code></li>' +
      '<li>Geometry <code>80</code></li>' +
      '<li>Algebra <code>85</code></li>' +
    '</ul></li>' +
  '</ul>'
);

// Three-level: one series, two groups.
const UL_QUADRANT = (
  '<ul>' +
    '<li>Our capability<ul>' +
      '<li>People<ul>' +
        '<li>Hiring <code>4</code></li>' +
        '<li>Retention <code>3</code></li>' +
      '</ul></li>' +
      '<li>Process<ul>' +
        '<li>Cadence <code>5</code></li>' +
        '<li>Rigor <code>4</code></li>' +
      '</ul></li>' +
    '</ul></li>' +
  '</ul>'
);

// ── parseAxisItem ───────────────────────────────────────────────────────

test('parseAxisItem: extracts trailing <code> as the value', () => {
  assert.deepEqual(parseAxisItem('Calculus <code>85</code>'), { label: 'Calculus', value: 85, detail: '' });
});

test('parseAxisItem: accepts floats', () => {
  assert.deepEqual(parseAxisItem('Latency <code>2.5</code>'), { label: 'Latency', value: 2.5, detail: '' });
});

test('parseAxisItem: defaults value to 0 when no <code>', () => {
  assert.deepEqual(parseAxisItem('Calculus'), { label: 'Calculus', value: 0, detail: '' });
});

test('parseAxisItem: captures an optional nested detail sublist', () => {
  const r = parseAxisItem('Calculus <code>85</code><ul><li>Strongest dimension</li></ul>');
  assert.deepEqual(r, { label: 'Calculus', value: 85, detail: '<li>Strongest dimension</li>' });
});

// ── parseSeries ─────────────────────────────────────────────────────────

test('parseSeries: 2-level — name plus axis points', () => {
  const li = 'Teacher<ul><li>Calculus <code>85</code></li><li>Geometry <code>70</code></li></ul>';
  const s = parseSeries(li, false);
  assert.equal(s.name, 'Teacher');
  assert.equal(s.points.length, 2);
  assert.deepEqual(s.points[0], { axis: 'Calculus', group: null, value: 85, detail: '' });
});

test('parseSeries: quadrant — 3-level carries group on each point', () => {
  const li = 'Cap<ul><li>People<ul><li>Hiring <code>4</code></li></ul></li></ul>';
  const s = parseSeries(li, true);
  assert.equal(s.points.length, 1);
  assert.deepEqual(s.points[0], { axis: 'Hiring', group: 'People', value: 4, detail: '' });
});

// ── parseRadar ──────────────────────────────────────────────────────────

test('parseRadar: axis order taken from the first series', () => {
  const model = parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false);
  assert.deepEqual(model.axes.map(a => a.label), ['Calculus', 'Geometry', 'Algebra']);
  assert.equal(model.series.length, 2);
});

test('parseRadar: later series align to axes by label', () => {
  // Student's axes are listed in a scrambled order — alignment is by label.
  const ul = (
    '<li>A<ul><li>X <code>1</code></li><li>Y <code>2</code></li></ul></li>' +
    '<li>B<ul><li>Y <code>20</code></li><li>X <code>10</code></li></ul></li>'
  );
  const model = parseRadar(ul, false);
  assert.deepEqual(model.axes.map(a => a.label), ['X', 'Y']);
  assert.deepEqual(model.series[1].values, [10, 20]); // realigned to X,Y
});

test('parseRadar: missing axis label falls back to position', () => {
  const ul = (
    '<li>A<ul><li>X <code>1</code></li><li>Y <code>2</code></li></ul></li>' +
    '<li>B<ul><li>Z <code>9</code></li><li>Y <code>8</code></li></ul></li>'
  );
  const model = parseRadar(ul, false);
  // B has no "X" — position 0 falls back to B's first point (Z=9).
  assert.equal(model.series[1].values[0], 9);
  assert.equal(model.series[1].values[1], 8);
});

test('parseRadar: quadrant collects group order', () => {
  const model = parseRadar(UL_QUADRANT.replace(/^<ul>|<\/ul>$/g, ''), true);
  assert.deepEqual(model.groups, ['People', 'Process']);
  assert.deepEqual(model.axes.map(a => a.label), ['Hiring', 'Retention', 'Cadence', 'Rigor']);
  assert.equal(model.axes[2].group, 'Process');
});

test('parseRadar: returns null for an empty list', () => {
  assert.equal(parseRadar('', false), null);
});

// ── niceCeil ────────────────────────────────────────────────────────────

test('niceCeil: rounds up to a clean interval', () => {
  assert.equal(niceCeil(87), 100);
  assert.equal(niceCeil(4.2), 5);
  assert.equal(niceCeil(1), 1);
  assert.equal(niceCeil(23), 25);
  assert.equal(niceCeil(0), 1);
});

// ── parseScale ──────────────────────────────────────────────────────────

test('parseScale: reads an explicit range', () => {
  assert.deepEqual(parseScale('0–100'), { min: 0, max: 100 });
  assert.deepEqual(parseScale('0-100'), { min: 0, max: 100 });
  assert.deepEqual(parseScale('Scale · 0 to 100'), { min: 0, max: 100 });
});

test('parseScale: reads a lone maximum', () => {
  assert.deepEqual(parseScale('100'), { min: 0, max: 100 });
  assert.deepEqual(parseScale('Layout · 5'), { min: 0, max: 5 });
});

test('parseScale: returns null when there are no numbers', () => {
  assert.equal(parseScale('Layout · radar'), null);
  assert.equal(parseScale(''), null);
});

// ── resolveScale ────────────────────────────────────────────────────────

test('resolveScale: eyebrow override wins', () => {
  const model = parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false);
  assert.deepEqual(resolveScale(model, '0–100'), { min: 0, max: 100 });
});

test('resolveScale: auto-fits the data max when no override', () => {
  const model = parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false);
  // data max is 90 → niceCeil → 100
  assert.deepEqual(resolveScale(model, ''), { min: 0, max: 100 });
});

// ── Geometry ────────────────────────────────────────────────────────────

test('axisAngle: axis 0 points straight up', () => {
  assert.equal(axisAngle(0, 4), 0);
  assert.ok(Math.abs(axisAngle(2, 4) - Math.PI) < 1e-9);
});

test('polar: angle 0 sits directly above the centre', () => {
  const p = polar(GEOM.R, 0);
  assert.ok(Math.abs(p.x - GEOM.cx) < 1e-9);
  assert.ok(Math.abs(p.y - (GEOM.cy - GEOM.R)) < 1e-9);
});

test('valueRadius: maps the scale onto [0, R] and clamps', () => {
  assert.equal(valueRadius(0,   { min: 0, max: 100 }), 0);
  assert.equal(valueRadius(100, { min: 0, max: 100 }), GEOM.R);
  assert.equal(valueRadius(50,  { min: 0, max: 100 }), GEOM.R / 2);
  assert.equal(valueRadius(999, { min: 0, max: 100 }), GEOM.R); // clamped
});

test('seriesPoints: emits one "x,y" pair per axis', () => {
  const pts = seriesPoints([100, 100, 100], 3, { min: 0, max: 100 });
  assert.equal(pts.split(' ').length, 3);
  assert.match(pts, /^[\d.]+,[\d.]+ /);
});

// ── pickVariant ─────────────────────────────────────────────────────────

test('pickVariant: default for a plain radar class', () => {
  assert.equal(pickVariant(['radar']), 'default');
});

test('pickVariant: extracts each modifier', () => {
  for (const mod of RADAR_MODIFIERS) {
    assert.equal(pickVariant(['radar', mod]), mod);
  }
});

test('pickVariant: minimal is not a variant (composable modifier)', () => {
  assert.equal(pickVariant(['radar', 'minimal']), 'default');
});

// ── buildRadar — variant emission ───────────────────────────────────────

function modelTwo() { return parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false); }
const SCALE = { min: 0, max: 100 };

test('buildRadar: default emits a figure, svg, grid, two polygons, legend', () => {
  const out = buildRadar(modelTwo(), 'default', SCALE, false);
  assert.match(out, /<div class="radar-figure" data-variant="default"/);
  assert.match(out, /<svg class="radar-svg"/);
  assert.match(out, /class="radar-ring"/);
  assert.equal((out.match(/class="radar-poly"/g) || []).length, 2);
  // SVG-native key (2026-06-13-svg-native-legend.md): the legend lives inside the
  // diagram <svg> as a swatch <rect> + label <text> per series, not an HTML <ol>.
  assert.equal((out.match(/class="chart-key-swatch"/g) || []).length, 2);
  assert.equal((out.match(/class="chart-key-label"/g) || []).length, 2);
  // Radar keys carry NO value column (the rail reclaims that width for labels).
  assert.equal((out.match(/class="chart-key-value"/g) || []).length, 0);
});

test('buildRadar: minimal flag is recorded on the figure', () => {
  const out = buildRadar(modelTwo(), 'default', SCALE, true);
  assert.match(out, /data-variant="minimal"/);
});

test('buildRadar: target emits a reference polygon and gap segments', () => {
  const out = buildRadar(modelTwo(), 'target', SCALE, false);
  assert.match(out, /data-variant="target"/);
  assert.match(out, /radar-poly--target/);
  assert.match(out, /class="radar-gap" data-dir="(under|over)"/);
});

test('buildRadar: delta emits a before polygon and change segments', () => {
  const out = buildRadar(modelTwo(), 'delta', SCALE, false);
  assert.match(out, /data-variant="delta"/);
  assert.match(out, /radar-poly--before/);
  assert.match(out, /class="radar-delta-seg" data-dir="(up|down|flat)"/);
});

test('buildRadar: benchmark emits an envelope band and a hero polygon', () => {
  const out = buildRadar(modelTwo(), 'benchmark', SCALE, false);
  assert.match(out, /data-variant="benchmark"/);
  assert.match(out, /class="radar-band"/);
  assert.match(out, /radar-poly--hero/);
});

test('buildRadar: quadrant emits sectors, mean arcs and rim labels', () => {
  const model = parseRadar(UL_QUADRANT.replace(/^<ul>|<\/ul>$/g, ''), true);
  const out = buildRadar(model, 'quadrant', { min: 0, max: 5 }, false);
  assert.match(out, /data-variant="quadrant"/);
  assert.match(out, /class="radar-sector"/);
  assert.match(out, /class="radar-sector-mean"/);
  assert.match(out, /class="radar-sector-label"/);
});

test('buildRadar: quadrant falls back to standard when ungrouped', () => {
  // A `quadrant` class on a flat 2-level list — no groups parsed.
  const model = modelTwo();
  const out = buildRadar(model, 'quadrant', SCALE, false);
  assert.match(out, /data-variant="default"/);
});

test('buildRadar: small-multiples emits one mini figure per series', () => {
  const out = buildRadar(modelTwo(), 'small-multiples', SCALE, false);
  assert.match(out, /data-variant="small-multiples"/);
  assert.equal((out.match(/class="radar-mini"/g) || []).length, 2);
  assert.equal((out.match(/radar-svg--mini/g) || []).length, 2);
});

// ── matchEyebrowText ────────────────────────────────────────────────────

test('matchEyebrowText: pulls the first <p><code> text', () => {
  assert.equal(matchEyebrowText('<p><code>0–100</code></p><h2>X</h2>'), '0–100');
  assert.equal(matchEyebrowText('<h2>X</h2><ul></ul>'), '');
});

// ── chart-family dispatch (integration with lib/components/chart/_chart-family/chart-family.js) ────────
// Radar is a chart-family member; section dispatch + chart-frame wrapping
// are owned by lib/components/chart/_chart-family/chart-family.js. These tests pin the wiring so a
// regression in either module surfaces here, not only in the integration
// PDF build.

const { transformChartSection, applyToRenderedHtml } = require('../../../lib/components/chart/_chart-family/chart-family');

describe('radar', () => {
  test('chart-family: radar section is wrapped in chart-frame', () => {
    const inner = '<h2>Skills</h2>' + UL_TWO;
    const { html, cls, transformed } = transformChartSection(inner, 'radar');
    assert.equal(transformed, true);
    assert.match(cls, /\bchart-frame\b/);
    // .viz-frame merge: chrome is emitted top-level (no `.chart-header`) for the masthead lift.
    assert.doesNotMatch(html, /<div class="chart-header">/);
    assert.match(html, /<h2>Skills<\/h2>/);
    assert.match(html, /<div class="chart-body"><div class="radar-figure"/);
  });

  test('chart-family: radar variant rides the class list', () => {
    const inner = '<h2>Cap</h2>' + UL_QUADRANT;
    const { html } = transformChartSection(inner, 'radar quadrant');
    assert.match(html, /data-variant="quadrant"/);
    assert.match(html, /class="radar-sector"/);
  });

  test('chart-family: eyebrow scale override is honoured', () => {
    const inner = '<p><code>0–10</code></p><h2>Skills</h2>' + UL_TWO;
    const { html } = transformChartSection(inner, 'radar');
    // Eyebrow lifts to .chart-eyebrow but the value text survives for parsing.
    assert.match(html, /<p class="chart-eyebrow"><code>0–10<\/code><\/p>/);
    assert.match(html, /<div class="radar-figure"/);
  });

  const RADAR_SECTION = (
    '<section id="1" class="radar" data-lattice-slide="1"><h2>Skills</h2>' + UL_TWO + '</section>'
  );
  const RADAR_QUAD_SECTION = (
    '<section id="2" class="radar quadrant" data-lattice-slide="2"><h2>Cap</h2>' + UL_QUADRANT + '</section>'
  );

  test('chart-family: applyToRenderedHtml transforms radar sections', () => {
    const out = applyToRenderedHtml(RADAR_SECTION);
    assert.match(out, /<div class="radar-figure"/);
    assert.match(out, /class="radar chart-frame"/);
  });

  test('chart-family: applyToRenderedHtml handles modifier variants', () => {
    const out = applyToRenderedHtml(RADAR_QUAD_SECTION);
    assert.match(out, /data-variant="quadrant"/);
    assert.match(out, /class="radar quadrant chart-frame"/);
  });

  test('chart-family: idempotent on re-application (already chart-frame)', () => {
    const once  = applyToRenderedHtml(RADAR_SECTION);
    const twice = applyToRenderedHtml(once);
    assert.equal(once, twice);
  });
});

describe('radar — per-axis detail (interactive reveal substrate)', () => {
  // Radar reveals PER-AXIS: detail authored as a sublist under each axis in the
  // first series → the axis label carries data-mark, the sublist becomes an
  // inert <template> + a speaker-note fallback. Byte-identical export.
  const UL_DETAIL = (
    '<ul>' +
      '<li>Teacher<ul>' +
        '<li>Calculus <code>85</code><ul><li>Strongest dimension</li><li>Mentors two TAs</li></ul></li>' +
        '<li>Geometry <code>70</code></li>' +
        '<li>Algebra <code>90</code><ul><li>Curriculum lead</li></ul></li>' +
      '</ul></li>' +
      '<li>Student<ul>' +
        '<li>Calculus <code>75</code></li><li>Geometry <code>80</code></li><li>Algebra <code>85</code></li>' +
      '</ul></li>' +
    '</ul>'
  );
  const build = (variant) => {
    const model = parseRadar(UL_DETAIL, variant === 'quadrant');
    return buildRadar(model, variant, resolveScale(model, '0–100'), false);
  };

  test('a plain radar emits no detail payload and no note', () => {
    const model = parseRadar(UL_TWO, false);
    const html = buildRadar(model, 'default', resolveScale(model, '0–100'), false);
    assert.doesNotMatch(html, /chart-details/);
    assert.doesNotMatch(html, /<!--/);
  });

  for (const variant of ['default', 'target', 'delta', 'benchmark', 'small-multiples']) {
    test(`${variant}: axis-label data-mark aligns with the detail templates`, () => {
      const html = build(variant);
      const axisMarks = [...html.matchAll(/radar-axis-label" data-mark="(\d+)"/g)].map((x) => +x[1]);
      const tplMarks = [...html.matchAll(/class="chart-detail" data-mark="(\d+)"/g)].map((x) => +x[1]).sort();
      assert.deepEqual([...new Set(axisMarks)].sort(), [0, 1, 2], 'every axis label carries its index');
      assert.deepEqual(tplMarks, [0, 2], 'only the two detailed axes emit a template');
      assert.match(html, /<!-- /);
    });
  }

  test('the detail sublist does not leak into the axis label text', () => {
    const html = build('default');
    assert.doesNotMatch(html, /<text[^>]*radar-axis-label[^>]*>[^<]*Strongest/);
  });
});
