/**
 * Unit: lib/radar.js — kernel for the `radar` chart-family member.
 *
 * Section dispatch + chart-frame wrapping live in lib/components/chart/_chart-family/chart-family.js (radar
 * is one of CHART_LAYOUTS); this kernel just produces the figure HTML. Tests
 * here cover the layers chart-family delegates to:
 *
 *   1. Source parsing: parseAxisItem, parseSeries, parseRadar
 *   2. Scale resolution: niceCeil, resolveScale, readRadarAxis
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
  resolveScale,
  niceCeil,
  pickVariant,
  buildRadar,
  seriesPoints,
  valueRadius,
  axisAngle,
  polar,
  readRadarAxis,
  transformSection,
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

// ── resolveScale ────────────────────────────────────────────────────────

test('resolveScale: a pinned range wins', () => {
  const model = parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false);
  assert.deepEqual(resolveScale(model, { min: 0, max: 120 }), { min: 0, max: 120 });
});

test('resolveScale: auto-fits the data max when no override', () => {
  const model = parseRadar(UL_TWO.replace(/^<ul>|<\/ul>$/g, ''), false);
  // data max is 90 → niceCeil → 100
  assert.deepEqual(resolveScale(model, null), { min: 0, max: 100 });
});

// ── Geometry ────────────────────────────────────────────────────────────

test('axisAngle: axis 0 points straight up', () => {
  assert.equal(axisAngle(0, 4), 0);
  assert.ok(Math.abs(axisAngle(2, 4) - Math.PI) < 1e-9);
});

test('polar: angle 0 sits directly above the center', () => {
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

// ── a radar in a PANE lays out for the pane ───────────────────────────────
// `paneView` is the pane in the canvas units a landscape chart slide is drawn in (180 tall). A
// radar slide prints its rim labels at 11 radar units × 180 / 332 (its 300 diagram plus two
// 16-unit label bands, height-bound) ≈ 5.96 canvas units — 14.0px on a 1280px slide.
const SLIDE_AXIS = 11 * 180 / 332;
const printed = (html, pv) => {
  // The root's open tag, cut out by index rather than one pattern spanning `[^>]*` (CodeQL:
  // polynomial on a string of repeated `class="radar-svg"`).
  const at = html.indexOf('class="radar-svg"');
  const tag = html.slice(at, html.indexOf('>', at));
  const [, , W, H] = tag.match(/\bviewBox="([^"]+)"/)[1].split(' ').map(Number);
  const m = Number((html.match(/--radar-type-scale:([\d.]+)/) || [0, 1])[1]);
  const s = Math.min(pv.w / W, pv.h / H);
  return { axis: 11 * m * s, diagram: 300 * s, m };
};

test('buildRadar on a slide stamps no type scale: an ordinary slide is unchanged', () => {
  for (const v of ['default', 'target', 'delta', 'benchmark']) {
    const out = buildRadar(modelTwo(), v, SCALE, false);
    assert.doesNotMatch(out, /--radar-type-scale/, v);
    assert.match(out, /viewBox="0 0 \d+ \d+"/, v);
  }
});

// Pane canvases the engine stamps at 16:9 (`data-pane-view`): 35%, 50% and 65% side panes under a
// heading, a 35% pane under an eyebrow and a note, and a short stacked band.
const PANES = [{ w: 156, h: 164 }, { w: 223, h: 164 }, { w: 290, h: 164 }, { w: 156, h: 122 }, { w: 300, h: 80 }];

test('buildRadar in a pane: rim labels print toward a radar slide\'s size, never past it', () => {
  for (const pv of PANES) {
    for (const v of ['default', 'target', 'delta', 'benchmark']) {
      const before = printed(buildRadar(modelTwo(), v, SCALE, false), pv);
      const got = printed(buildRadar(modelTwo(), v, SCALE, false, undefined, false, pv), pv);
      const at = `${v} in ${pv.w}x${pv.h}`;
      assert.ok(got.axis >= before.axis, `${at}: labels ${before.axis} -> ${got.axis}`);
      assert.ok(got.axis <= SLIDE_AXIS * 1.001, `${at}: labels ${got.axis} past the slide's ${SLIDE_AXIS}`);
      assert.ok(got.diagram >= before.diagram * 0.75, `${at}: plot ${before.diagram} -> ${got.diagram}`);
    }
  }
  // Where the pane has the room, the labels reach the slide's size (within the pick's 5%).
  const pv = { w: 156, h: 164 };
  const roomy = printed(buildRadar(modelTwo(), 'default', SCALE, false, undefined, false, pv), pv);
  assert.ok(roomy.axis >= SLIDE_AXIS * 0.95 && roomy.m > 1, JSON.stringify(roomy));
});

// A long rim name, to see the wrap follow the type scale.
const LONG = parseRadar([
  '<li>A<ul><li>Operational resilience and continuity <code>5</code></li><li>Cost <code>6</code></li>',
  '<li>Speed <code>7</code></li><li>Support <code>4</code></li><li>Customer onboarding flow <code>6</code></li></ul></li>',
  '<li>B<ul><li>Operational resilience and continuity <code>4</code></li><li>Cost <code>5</code></li>',
  '<li>Speed <code>6</code></li><li>Support <code>7</code></li><li>Customer onboarding flow <code>5</code></li></ul></li>',
].join(''), false);
const lineCount = (html, name) => {
  const m = html.match(new RegExp(`<text class="radar-axis-label"[^>]*>((?:(?!</text>)[\\s\\S])*)</text>`, 'g'))
    .find((t) => t.includes(name.split(' ')[0]));
  return (m.match(/<tspan/g) || []).length;
};

test('buildRadar in a pane: the rim labels are WRAPPED at the scaled size the CSS paints', () => {
  const pv = { w: 156, h: 164 };
  const out = buildRadar(LONG, 'default', SCALE, false, undefined, false, pv);
  const m = printed(out, pv).m;
  assert.ok(m > 1.3, `m ${m}`);
  // At m, a glyph is m times wider, and the room beside the web only grows by the pad's share of
  // it, so a long name breaks into MORE lines than on a slide. Measured at the unscaled size it
  // would keep the slide's lines and paint past the room it was given.
  const slide = buildRadar(LONG, 'default', SCALE, false);
  assert.ok(lineCount(out, 'Customer') > lineCount(slide, 'Customer'),
    `Customer onboarding: ${lineCount(slide, 'Customer')} line(s) on a slide, ${lineCount(out, 'Customer')} in the pane`);
  assert.match(out, new RegExp(`--radar-type-scale:${m}`));
});

test('radar.styles.css multiplies the rim, sector and tick sizes by the kernel\'s scales', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../lib/components/chart/radar/radar.styles.css'), 'utf8');
  const sizeOf = (sel) => (css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*font-size:\\s*([^;]+);`)) || [])[1];
  assert.equal(sizeOf(':is(section.radar, figure.chart-frame) .radar-axis-label'), 'calc(var(--radar-axis-label-size) * var(--radar-type-scale, 1))');
  assert.equal(sizeOf(':is(section.radar, figure.chart-frame) .radar-sector-label'), 'calc(9px * var(--radar-type-scale, 1))');
  assert.equal(sizeOf(':is(section.radar, figure.chart-frame) .radar-tick'), 'calc(var(--radar-tick-size) * var(--radar-tick-scale, 1))');
});

test('buildRadar in a pane: the key\'s rail moves out with the rim labels, keeping a slide\'s clearance', () => {
  // A landscape unit (the key to the right). The rightmost rim anchor sits at most at
  // cx + R + labelGap in diagram units, and on a slide the key's spine stands 71 units past it.
  const pv = { w: 290, h: 164 };
  const out = buildRadar(modelTwo(), 'default', SCALE, false, undefined, false, pv);
  const m = printed(out, pv).m;
  const dx = Number(out.match(/<g transform="translate\(([\d.]+) [\d.]+\)"><g class="radar-grid/)?.[1]
    ?? out.match(/<g transform="translate\(0 [\d.]+\)"><g transform="translate\(([\d.]+) /)[1]);
  // Each `<rect …>` tag on its own, then its attributes (one pattern over the whole string with a
  // `[^>]*` gap is polynomial on repeated `<rect x="…"`, CodeQL).
  const spineTag = out.split('<rect ').slice(1).map((r) => r.slice(0, r.indexOf('>')))
    .find((r) => r.includes('fill="url(#chart-spine'));
  assert.ok(spineTag, 'a landscape key with a spine');
  const spineX = Number(spineTag.match(/^x="([\d.]+)"/)[1]);
  const anchor = GEOM.cx + GEOM.R + GEOM.labelGap + dx;
  assert.ok(m > 1, `m ${m}`);
  assert.ok(spineX - anchor >= 71 * m * 0.98, `clearance ${spineX - anchor} at m ${m}, want ~${71 * m}`);
});

test('buildRadar in a pane: the ticks stop growing before they crowd one ring apart', () => {
  const pv = { w: 156, h: 122 };
  const out = buildRadar(modelTwo(), 'default', SCALE, false, undefined, false, pv);
  const m = printed(out, pv).m;
  const t = Number(out.match(/--radar-tick-scale:([\d.]+)/)[1]);
  assert.ok(m > t, `m ${m}, tick ${t}`);
  // A tick line (9 units × 1.6) never exceeds the ring spacing it sits on.
  assert.ok(9 * t * 1.6 <= GEOM.R / GEOM.rings + 0.01, `tick ${9 * t} in a ${GEOM.R / GEOM.rings} ring`);
});

// ── readRadarAxis ───────────────────────────────────────────────────────

test('readRadarAxis: the axis list pins the scale and leaves the slide', () => {
  const a = readRadarAxis('<p><code>[{Scale, 0..100}]</code></p>\n<h2>X</h2>\n<ul><li>A<ul><li>x <code>3</code></li></ul></li></ul>');
  assert.deepEqual(a.range, { min: 0, max: 100 });
  assert.doesNotMatch(a.html, /Scale/);
});

test('a pinned scale stays on a small-multiples slide, whose mini radars print no ticks', () => {
  const html = '<p><code>[{Scale, 0..10}]</code></p>\n<h2>T</h2>\n<ul><li>A<ul><li>x <code>3</code></li><li>y <code>4</code></li><li>z <code>5</code></li></ul></li></ul>';
  const out = (cls) => { const r = transformSection(html, { classTokens: cls, orientation: 'landscape' }); return typeof r === 'string' ? r : r.html; };
  assert.match(out(['radar', 'small-multiples']), /<p><code>Scale · 0–10<\/code><\/p>\n<h2>/);
  assert.doesNotMatch(out(['radar']), /Scale/, 'a radar that prints ticks needs no eyebrow');
  // An eyebrow the author kept is not doubled.
  const kept = html.replace('<h2>', '<p><code>Scale · 0–10, on our criteria</code></p>\n<h2>');
  const r = transformSection(kept, { classTokens: ['radar', 'small-multiples'], orientation: 'landscape' });
  assert.equal(((typeof r === 'string' ? r : r.html).match(/Scale ·/g) || []).length, 1);
});

test('readRadarAxis: an eyebrow that is not a bracketed list is not the axis', () => {
  assert.equal(readRadarAxis('<p><code>Scale · 0–10</code></p>\n<h2>X</h2>\n<ul><li>A</li></ul>'), null);
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

  // The dispatcher seam — the same contract the quadrant and the gantt axis
  // use. `.radar-sector-label` is `--font-body`, which `mode: sketch` re-points
  // at the hand sans, and its wrap + de-collision boxes are estimated at build
  // time; if the token stops reaching buildRadar the labels still render, just
  // measured for the wrong face. `MAXIMUM COMMITMENT` is chosen because the two
  // faces straddle a word break on it — most sector names do not (#1672).
  test('chart-family: the sketch token reaches the radar builder', () => {
    const inner = '<h2>Cap</h2><ul><li>Our capability<ul>' +
      '<li>Maximum Commitment<ul><li>Hiring <code>4</code></li>' +
      '<li>Retention <code>3</code></li></ul></li>' +
      '<li>Process<ul><li>Cadence <code>5</code></li>' +
      '<li>Rigor <code>4</code></li></ul></li>' +
      '</ul></li></ul>';
    // Match every <text>, then filter on its class LIST. Baking the class into
    // the pattern (`<text class="foo"[^>]*>([\s\S]*?)`) backtracks polynomially
    // over a document with many such tags, which CodeQL flags and rightly. The
    // tspan pattern anchors on the literal `x="`/`y="` the emitter always writes
    // for the same reason — an unbounded `[^>]*` run is what backtracks, so
    // `<tspan[^>]*>` is flagged even though it ends at a bare `<`.
    const TEXT_EL = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    const TSPAN = /<tspan x="([-\d.]+)" y="([-\d.]+)"(?: dominant-baseline="[a-z]+")?>([^<]*)</g;
    const labels = (cls) => [...transformChartSection(inner, cls).html.matchAll(TEXT_EL)]
      .filter((m) => ((m[1].match(/class="([^"]*)"/) || [])[1] || '')
        .split(/\s+/).includes('radar-sector-label'))
      .map((m) => [...m[2].matchAll(TSPAN)].map((t) => t[3]));
    const clean = labels('radar quadrant');
    const hand = labels('radar quadrant sketch');
    assert.notDeepEqual(clean, hand,
      'identical output means `hand` never reached buildRadar');
    const tspans = (set) => set.flat().length;
    assert.ok(tspans(hand) > tspans(clean), 'the wider face must wrap sooner, not later');
  });

  test('chart-family: eyebrow scale override is honored', () => {
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
    return buildRadar(model, variant, resolveScale(model, { min: 0, max: 100 }), false);
  };

  test('a plain radar emits no detail payload and no note', () => {
    const model = parseRadar(UL_TWO, false);
    const html = buildRadar(model, 'default', resolveScale(model, { min: 0, max: 100 }), false);
    assert.doesNotMatch(html, /chart-details/);
    assert.doesNotMatch(html, /<!--/);
  });

  for (const variant of ['default', 'target', 'delta', 'benchmark', 'small-multiples']) {
    test(`${variant}: axis-label data-mark aligns with the detail templates`, () => {
      const html = build(variant);
      // The label is emitted by the shared wrapping emitter now, so text-anchor
      // sits between the class and data-mark.
      const axisMarks = [...html.matchAll(/radar-axis-label"[^>]*data-mark="(\d+)"/g)].map((x) => +x[1]);
      const tplMarks = [...html.matchAll(/class="chart-detail" data-mark="(\d+)"/g)].map((x) => +x[1]).sort();
      assert.deepEqual([...new Set(axisMarks)].sort(), [0, 1, 2], 'every axis label carries its index');
      assert.deepEqual(tplMarks, [0, 2], 'only the two detailed axes emit a template');
      assert.match(html, /<!-- /);
    });
  }

  test('the detail sublist does not leak into the axis label text', () => {
    const html = build('default');
    assert.doesNotMatch(html, /<t(?:ext|span)[^>]*>[^<]*Strongest/);
  });
});
