// Direct tests for the shared SVG-native legend builder — the keystone the four
// keyed charts (pie/radar/map/cohort quadrant) all emit through. The kernels
// cover it indirectly; these pin the load-bearing geometry/wrap/a11y logic so a
// regression in the shared module can't slip through on the kernels alone.
// See engineering/decisions/2026-06-13-svg-native-legend.md.

const { test } = require('node:test');
const assert = require('node:assert');
const { keySvg } = require('../../../lib/components/chart/_chart-family/legend-svg-key');
const { wrapLabelToLines } = require('../../../lib/components/chart/_chart-family/svg-legend');

test('wrapLabelToLines: short label stays one line', () => {
  assert.deepEqual(wrapLabelToLines('hello world', 20), ['hello world']);
});

test('wrapLabelToLines: wraps at the word boundary within budget', () => {
  assert.deepEqual(wrapLabelToLines('hello world', 5), ['hello', 'world']);
});

test('wrapLabelToLines: hard-breaks a single over-long token (no ellipsis)', () => {
  // 21 chars, budget 5 → 5/5/5/5/1, every piece ≤ budget, nothing dropped.
  const lines = wrapLabelToLines('supercalifragilistic', 5);
  assert.ok(lines.every((l) => l.length <= 5), 'no line exceeds the budget');
  assert.equal(lines.join(''), 'supercalifragilistic', 'no characters dropped');
});

test('wrapLabelToLines: empty input yields a single empty line', () => {
  assert.deepEqual(wrapLabelToLines('', 10), ['']);
  assert.deepEqual(wrapLabelToLines('   ', 10), ['']);
});

test('keySvg: returns geometry + a11y desc; emits swatch/label/value', () => {
  const key = keySvg({
    rows: [{ swatchFill: 'red', swatchStroke: 'darkred', label: 'Alpha', value: '46%' }],
    diagramRight: 180, diagramHeight: 200, hasValues: true,
  });
  assert.ok(key.viewW > 180, 'viewW includes the rail past the diagram');
  assert.equal(key.viewH, 200, 'a one-row key fits the diagram height (no growth)');
  assert.equal(key.diagramDy, 0, 'no vertical offset when the key fits');
  assert.match(key.body, /class="chart-key-swatch"[^>]*fill="red"[^>]*stroke="darkred"/);
  assert.match(key.body, /class="chart-key-label"[^>]*>.*Alpha/);
  assert.match(key.body, /class="chart-key-value"[^>]*text-anchor="end">46%</);
  // a11y: the row data is re-enumerated in a <desc> (it lives inside role="img").
  assert.match(key.desc, /<desc>Key — Alpha 46%<\/desc>/);
});

test('keySvg: no-value (radar) reclaims the value column for the label', () => {
  // Regression guard for the dead-reclaim bug: a label (18 chars) that wraps to
  // two lines WITH a value column (budget 15) must fit on ONE line without it
  // (budget 20 — the reclaimed value-column width).
  const rows = [{ swatchFill: 'blue', label: 'Net promoter score' }];
  const withVal = keySvg({ rows: rows.map((r) => ({ ...r, value: '9' })), diagramRight: 300, diagramHeight: 300, hasValues: true });
  const noVal = keySvg({ rows, diagramRight: 300, diagramHeight: 300, hasValues: false });
  const linesWith = (withVal.body.match(/<tspan /g) || []).length;
  const linesNo = (noVal.body.match(/<tspan /g) || []).length;
  assert.ok(linesNo < linesWith, `no-value column should wrap fewer lines (got no=${linesNo}, with=${linesWith})`);
  assert.doesNotMatch(noVal.body, /chart-key-value/, 'no value text when hasValues is false');
});

test('keySvg: a long-tail key grows the viewBox HEIGHT, not the font', () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ swatchFill: 'red', label: `Row ${i}`, value: `${i}%` }));
  const key = keySvg({ rows, diagramRight: 180, diagramHeight: 200, hasValues: true });
  assert.ok(key.viewH > 200, 'tall key grows viewH');
  // font is a fixed ratio of diagramHeight (200), never re-shrunk per chart
  assert.match(key.body, /font-size="9.00"/);
});

test('keySvg: head rows render a heading with no swatch; desc prefixes them', () => {
  const key = keySvg({
    rows: [
      { head: true, label: 'Asia' },
      { swatchFill: 'red', label: 'India', value: '48' },
    ],
    diagramRight: 400, diagramHeight: 320, hasValues: true,
  });
  assert.match(key.body, /class="chart-key-head"[^>]*><tspan[^>]*>Asia</);
  assert.equal((key.body.match(/chart-key-swatch/g) || []).length, 1, 'only the data row gets a swatch');
  assert.match(key.desc, /Key — Asia:, India 48/);
});

test('keySvg: escapes & and < in both body and desc', () => {
  const key = keySvg({
    rows: [{ swatchFill: 'red', label: 'R&D', value: '<6' }],
    diagramRight: 180, diagramHeight: 200, hasValues: true,
  });
  assert.match(key.body, /R&amp;D/);
  assert.match(key.desc, /R&amp;D &lt;6/);
});

test('keySvg: strips inline HTML tags before wrapping/emitting', () => {
  const key = keySvg({
    rows: [{ swatchFill: 'red', label: 'Net<sup>2</sup>', value: '1' }],
    diagramRight: 180, diagramHeight: 200, hasValues: true,
  });
  assert.match(key.body, /Net2/);
  assert.doesNotMatch(key.body, /<sup>/);
});

// ── §9 — portrait legend-below ───────────────────────────────────────────────
// The spine id is a per-call counter (SPINE_SEQ), so two builds never share the
// same chart-spine-N id; normalize it before any two-build comparison.
const normSpine = (s) => s.replace(/chart-spine-\d+/g, 'chart-spine-N');
const PIE = { rows: [
  { swatchFill: 'red', swatchStroke: 'darkred', label: 'Enterprise', value: '46%' },
  { swatchFill: 'blue', swatchStroke: 'navy', label: 'Mid-market segment', value: '31%' },
  { swatchFill: 'green', swatchStroke: 'darkgreen', label: 'SMB', value: '23%' },
], diagramRight: 180, diagramHeight: 200, hasValues: true };

test('keySvg: landscape (default) returns diagramDx 0 — the diagram sits at the left', () => {
  assert.equal(keySvg(PIE).diagramDx, 0);
});

test('keySvg: landscape output is FROZEN to a pre-§9 golden (byte-identity tripwire)', () => {
  // The across-orientations test below proves the three landscape aliases agree
  // with EACH OTHER; this pins them to the ACTUAL pre-§9 bytes so a refactor that
  // shifted landscape equally for all orientations can't slip through. Captured
  // from HEAD before the portrait branch landed; spine id normalized (per-call).
  //
  // This is a deliberate change-detector, NOT an independent oracle: on an
  // INTENTIONAL landscape-geometry change it WILL fail — that is the tripwire
  // doing its job. To re-bless: confirm the new geometry is correct by eye
  // (render the legend), then replace GOLDEN below with the new `got` string and
  // note the reason in the commit. Never re-capture blindly to silence a red run.
  // Re-blessed for the chart finish: a categorical swatch now carries `data-encodes="hue"
  // data-paint="fill"` beside its `data-hue` (svg-legend.js swatchContract), so a finish
  // repaints the key with its marks. Verified: removing those two attributes gives the
  // previous golden byte-for-byte, so the geometry did not move.
  // Re-blessed for one row style with the callouts (owner, 2026-10-21; decision note
  // 2026-10-20-callout-placement.md § 6): the swatch edge went from 1.04 to 1.45 of the label size
  // (svg-legend.js MARK_OF_LABEL), so swatches are larger, rows taller and the rail a little wider.
  // Checked by eye on the chart gallery and the callout demo deck, light and dark, before re-blessing.
  // Re-blessed for the flat chart family (2026-10-23): the key's spine is one flat stop, no fade
  // (svg-legend.js buildSpine). Only `defs` changed; the body and every coordinate are byte-identical.
  const GOLDEN = '{"viewW":380,"viewH":200,"diagramDx":0,"diagramDy":0,"fs":9,"defs":"<linearGradient id=\\"chart-spine-N\\" x1=\\"0\\" y1=\\"0\\" x2=\\"0\\" y2=\\"1\\"><stop offset=\\"0%\\" style=\\"stop-color:color-mix(in oklab, var(--accent) 45%, transparent)\\"/></linearGradient>","body":"<rect class=\\"chart-key-swatch\\" data-hue=\\"1\\" data-encodes=\\"hue\\" data-paint=\\"fill\\" x=\\"244.00\\" y=\\"79.93\\" width=\\"13.05\\" height=\\"13.05\\" rx=\\"2.87\\" fill=\\"F1\\" stroke=\\"S1\\" stroke-width=\\"1.17\\"/><text class=\\"chart-key-label\\" font-size=\\"9.00\\"><tspan x=\\"262.05\\" y=\\"89.52\\">Alpha</tspan></text><text class=\\"chart-key-value\\" font-size=\\"9.00\\" x=\\"371.85\\" y=\\"89.52\\" text-anchor=\\"end\\">60%</text><rect class=\\"chart-key-swatch\\" x=\\"244.00\\" y=\\"99.46\\" width=\\"13.05\\" height=\\"13.05\\" rx=\\"2.87\\" fill=\\"F2\\"/><text class=\\"chart-key-label\\" font-size=\\"9.00\\"><tspan x=\\"262.05\\" y=\\"109.05\\">Beta beta beta</tspan><tspan x=\\"262.05\\" y=\\"119.48\\">beta</tspan></text><text class=\\"chart-key-value\\" font-size=\\"9.00\\" x=\\"371.85\\" y=\\"109.05\\" text-anchor=\\"end\\">40%</text><rect x=\\"211.20\\" y=\\"22.00\\" width=\\"1.60\\" height=\\"156.00\\" rx=\\"0.80\\" fill=\\"url(#chart-spine-N)\\"/>","desc":"<desc>Key — Alpha 60%, Beta beta beta beta 40%</desc>"}';
  const key = keySvg({ rows: [
    { swatchFill: 'F1', swatchStroke: 'S1', label: 'Alpha', value: '60%', cat: 0 },
    { swatchFill: 'F2', label: 'Beta beta beta beta', value: '40%' },
  ], diagramRight: 180, diagramHeight: 200, hasValues: true });
  const got = JSON.stringify({
    viewW: key.viewW, viewH: key.viewH, diagramDx: key.diagramDx, diagramDy: key.diagramDy,
    fs: key.fs, defs: normSpine(key.defs), body: normSpine(key.body), desc: key.desc,
  });
  assert.equal(got, GOLDEN);
});

test('keySvg: orientation undefined/landscape/square are byte-identical (only the spine id varies)', () => {
  const base = normSpine(JSON.stringify(keySvg(PIE)));
  for (const orientation of [undefined, 'landscape', 'square']) {
    assert.equal(
      normSpine(JSON.stringify(keySvg({ ...PIE, orientation }))), base,
      `orientation=${orientation} stays the landscape right-rail layout`);
  }
});

test('keySvg: portrait stacks the key BELOW the diagram and centers it', () => {
  const land = keySvg(PIE);
  const port = keySvg({ ...PIE, orientation: 'portrait' });
  // The portrait unit is taller than wide (fills a tall box); landscape is wider.
  assert.ok(port.viewH > port.viewW, `portrait is tall (got ${port.viewW}×${port.viewH})`);
  assert.ok(land.viewW > land.viewH, `landscape is wide (got ${land.viewW}×${land.viewH})`);
  // The diagram is centered horizontally by a non-zero dx (landscape leaves it 0).
  assert.ok(port.diagramDx > 0, `portrait centers the diagram (dx=${port.diagramDx})`);
  // The key rows start BELOW the 200-tall diagram (landscape centers them beside it).
  const firstRowY = +(port.body.match(/y="([\d.]+)"/) || [])[1];
  assert.ok(firstRowY > 200, `first key row sits under the diagram (y=${firstRowY})`);
});

test('keySvg: portrait spine is a HORIZONTAL rule (x-axis gradient)', () => {
  const port = keySvg({ ...PIE, orientation: 'portrait' });
  assert.match(port.defs, /x1="0" y1="0" x2="1" y2="0"/, 'portrait spine fades along x');
  assert.match(keySvg(PIE).defs, /x1="0" y1="0" x2="0" y2="1"/, 'landscape spine fades along y');
});

test('keySvg: portrait widens the wrap budget — a label wraps to fewer lines', () => {
  const rows = [{ swatchFill: 'red', label: 'Mid-market segment', value: '31%' }];
  const land = keySvg({ rows, diagramRight: 180, diagramHeight: 200, hasValues: true });
  const port = keySvg({ rows, diagramRight: 180, diagramHeight: 200, hasValues: true, orientation: 'portrait' });
  const lines = (s) => (s.body.match(/<tspan /g) || []).length;
  assert.ok(lines(port) <= lines(land),
    `portrait's wider column wraps no more than landscape (portrait=${lines(port)}, landscape=${lines(land)})`);
});

// THE VALUE COLUMN FITS ITS VALUES. It was a fixed 3 × FS, right-anchored, so a text value
// (map highlight's `Caribbean / Central America`) ran left across its own row's name.
// Read through a DOM parser, not regexes over the markup.
const { JSDOM } = require('jsdom');
const keyOf = (values) => keySvg({
  rows: values.map((v, i) => ({ swatchFill: 'red', label: `Global South — Region ${i}`, value: v })),
  diagramRight: 180, diagramHeight: 200, hasValues: true,
});
const valuesOf = (key) => [...new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${key.body}</svg>`)
  .window.document.querySelectorAll('.chart-key-value')].map((el) => {
  const tspans = [...el.querySelectorAll('tspan')];
  return {
    lines: tspans.length ? tspans.map((t) => t.textContent) : [el.textContent],
    // The anchor rides the <text> for a one-line value and each <tspan> for a wrapped one.
    x: Number((tspans[0] || el).getAttribute('x')),
    wrapped: tspans.length > 0,
  };
});

test('keySvg: a key of short values keeps the old column, byte for byte', () => {
  const short = keyOf(['46%', '100%', '$1.2M']);
  assert.ok(valuesOf(short).every((v) => !v.wrapped), 'five characters or fewer: one plain <text>');
  assert.equal(short.viewW, keyOf(['46%']).viewW, 'the rail is as wide as a one-value key');
});

test('keySvg: a text value widens its column and never reaches the label', () => {
  const [short] = valuesOf(keyOf(['46%']));
  const text = valuesOf(keyOf(['Tier 1', 'Latin America']));
  assert.ok(text[0].x > short.x, 'the value anchor moves right to make room');
  // `Tier 1` is 6 characters: the budget is counted in characters, so it never floors to 5.
  assert.deepEqual(text[0].lines, ['Tier 1'], 'a value that fits the column sets on one line');
  assert.deepEqual(text[1].lines, ['Latin America']);
});

test('keySvg: a value past 13 characters wraps inside its column', () => {
  const [value] = valuesOf(keyOf(['Caribbean / Central America']));
  assert.ok(value.lines.length >= 2, `wrapped to ${value.lines.length} lines`);
  for (const l of value.lines) assert.ok(l.length <= 13, `"${l}" fits 13 characters`);
});
