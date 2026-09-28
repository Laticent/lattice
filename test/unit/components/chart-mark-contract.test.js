/**
 * The mark contract (engineering/decisions/2026-09-07-chart-design-language/slot-contract.md):
 * every categorical mark says which of the eight hues it wears (`data-hue`), what that color
 * encodes (`data-encodes`) and which property carries it (`data-paint`). A chart finish
 * repaints through those three attributes, so a mark that drops them silently keeps the
 * as-shipped paint. These pins cover the helpers that stamp them and the members whose
 * stamps the chart gallery does not reach (a quadrant hull polygon, an out-of-range slot).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../../../lib/engine');
const { hueContract } = require('../../../lib/components/chart/flowchart/flowchart.transform');
const cells = require('../../../lib/core/matrix-grid-cells');
const { buildQuadrant, parseQuadrant } = require('../../../lib/components/chart/quadrant/quadrant.transform');

describe('flowchart hueContract', () => {
  test('a category-painted node carries its slot as the hue', () => {
    assert.equal(hueContract({ slot: 3 }, 'bg'), ' data-hue="3" data-encodes="hue" data-paint="bg"');
    assert.equal(hueContract({ slot: 8 }, 'fill'), ' data-hue="8" data-encodes="hue" data-paint="fill"');
  });
  test('a status, an explicit fill or no slot carries nothing', () => {
    assert.equal(hueContract({}, 'bg'), '');
    assert.equal(hueContract({ slot: 2, status: 'done' }, 'bg'), '');
    assert.equal(hueContract({ slot: 2, fill: 4 }, 'bg'), '');
  });
});

describe('matrix-grid cell kernel', () => {
  const filled = cells.parseCell('[x] Senior');
  test('a filled body cell names its row hue, wrapping after eight', () => {
    const hues = Array.from({ length: 10 }, (_, r) => +/data-hue="(\d)"/.exec(cells.cellHtml(filled, r))[1]);
    assert.deepEqual(hues, [1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
    assert.match(cells.cellHtml(filled, 0), /data-encodes="hue" data-paint="bg"/);
  });
  test('outlined, empty and row-less cells carry nothing', () => {
    assert.doesNotMatch(cells.cellHtml(cells.parseCell('[-]'), 0), /data-hue/);
    assert.doesNotMatch(cells.cellHtml(cells.parseCell('[ ]'), 0), /data-hue/);
    assert.doesNotMatch(cells.cellHtml(filled), /data-hue/);
  });
});

describe('quadrant cohort hull', () => {
  test('a three-member cohort draws a stamped polygon', () => {
    const ul = '<li>Bets<ul><li>A <code>2, 70</code></li><li>B <code>4, 90</code></li><li>C <code>3, 60</code></li></ul></li>' +
      '<li>Wins<ul><li>D <code>8, 40</code></li></ul></li><li>Defer<ul><li>E <code>4, 20</code></li></ul></li>' +
      '<li>Sinks<ul><li>F <code>7, 10</code></li></ul></li>';
    const scale = { x: { min: 0, max: 10, label: 'Effort' }, y: { min: 0, max: 100, label: 'Reach' }, targets: null };
    const out = buildQuadrant(parseQuadrant(ul), 'cohort', scale);
    const hull = /<polygon class="quadrant-hull"[^>]*>/.exec(out);
    assert.ok(hull, 'expected a hull polygon');
    assert.match(hull[0], /data-hue="\d" data-encodes="hue" data-paint="fill"/);
  });
});

describe('the chart gallery through the real engine', () => {
  const md = fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/chart.gallery.md'), 'utf8');
  const html = String(engine.render(md).html);
  // Each row: a mark's opening tag, and the encoding its stamp must name.
  const rows = [
    ['piechart', /<path[^>]*class="wedge"[^>]*>/, 'hue'],
    ['funnel', /<[a-z]+[^>]*class="funnel-band"[^>]*>/, 'hue'],
    ['quadrant', /<circle[^>]*class="quadrant-dot"[^>]*>/, 'hue'],
    ['matrix-grid', /<span class="cell cell-filled"[^>]*>/, 'hue'],
    ['heatmap', /<rect[^>]*class="heatmap-cell"[^>]*>/, 'ramp'],
    ['radar', /<polygon[^>]*class="radar-poly"[^>]*>/, 'layered'],
    ['radar dot', /<[a-z]+[^>]*class="radar-dot"[^>]*>/, 'hue'],
    ['map ramp region', /<path[^>]*class="map-region map-region--on"[^>]*>/, 'ramp'],
    ['journey actor dot', /<span[^>]*class="journey-actor-dot"[^>]*>/, 'hue'],
    ['stacked-bar segment', /<rect[^>]*class="sbar-seg"[^>]*>/, 'hue'],
    ['bar mark', /<rect[^>]*class="bar-mark"[^>]*>/, 'hue'],
    ['scatter dot', /<circle[^>]*class="scatter-dot"[^>]*>/, 'hue'],
    ['line dot', /<circle[^>]*class="line-dot"[^>]*>/, 'hue'],
  ];
  // A KEY carries the contract of the marks it keys, so a finish repaints the two together:
  // a tone finish whose wedges went tonal while its key kept five categorical colors was the
  // defect. A categorical swatch names its hue; the map's ramp swatch carries its own --mix.
  test('key swatches carry the contract of the marks they key', () => {
    const sw = html.match(/<rect class="chart-key-swatch"[^>]*>/g) || [];
    // A key whose marks the a11y themes texture names its hue as `data-hue` (pie).
    const hue = sw.filter((t) => /data-hue="\d"/.test(t));
    assert.ok(hue.length >= 5, 'the pie key');
    for (const t of hue) assert.match(t, /data-encodes="hue" data-paint="fill"/, t);
    // A key whose marks they do NOT texture names it as `data-key-hue` (radar), and never as
    // `data-hue`: a11y-base's `figure.chart-frame .chart-key-swatch[data-hue]` would otherwise
    // texture radar's key in Read·Article while its polygons stay plain (red-team finding).
    const keyOnly = sw.filter((t) => /data-key-hue="\d"/.test(t));
    assert.ok(keyOnly.length >= 3, 'the radar key');
    for (const t of keyOnly) {
      assert.doesNotMatch(t, / data-hue=/, t);
      assert.match(t, /data-encodes="hue" data-paint="fill"/, t);
    }
    const ramp = sw.filter((t) => /data-encodes="ramp"/.test(t));
    assert.ok(ramp.length, 'the map key');
    for (const t of ramp) assert.match(t, /data-paint="fill" style="--mix:[\d.]+%"/, t);
  });

  for (const [name, re, encodes] of rows) {
    test(`${name} marks carry the contract`, () => {
      const tags = html.match(new RegExp(re.source, 'g')) || [];
      assert.ok(tags.length, `the gallery renders no ${name} mark`);
      for (const tag of tags) assert.match(tag, new RegExp(`data-encodes="${encodes}"`), tag);
    });
  }
});

describe('marks the gallery does not render', () => {
  const render = (md) => String(engine.render(md).html);

  // Checker finding: stamping a slotted GROUP made a finish paint it as a saturated 82% body
  // with its title unreadable on it. A group is a container; a finish leaves it alone.
  test('a slotted flowchart group carries no contract; its shapes and tile key do', () => {
    const md = '<!-- _class: flowchart -->\n\n## F\n\n- Ingest `:c2`\n  - Pull `:c3` -> Parse `:c3`\n\n`[{:c2, Ingest}, {:c3, Step}]`\n';
    const html = render(md);
    const { browserJs } = require('../../../lib/components/chart/flowchart/flowchart.layout');
    // The group is drawn by the browser pass; its template must not stamp the contract.
    assert.doesNotMatch(browserJs(), /fc-group"[^\n]*data-hue/);
    const tile = /<span class="fc-key-swatch" data-kind="tile"[^>]*>/.exec(html);
    assert.ok(tile, 'a tile key swatch');
    assert.match(tile[0], /data-hue="3" data-encodes="hue" data-paint="bg"/);
    const group = /<span class="fc-key-swatch" data-kind="group"[^>]*>/.exec(html);
    assert.ok(group, 'a group key swatch');
    assert.doesNotMatch(group[0], /data-hue/);
  });

  // Checker finding: the band key kept the shipped ramp while its cells moved.
  test('a heatmap band key carries the ramp contract of the cells it keys', () => {
    const html = render('<!-- _class: heatmap scale -->\n\n## H\n\n|  | A | B |\n| --- | --: | --: |\n| X | 1 | 5 |\n| Y | 9 | 3 |\n');
    const keys = html.match(/<rect class="chart-key-swatch heatmap-cell"[^>]*>/g) || [];
    assert.ok(keys.length >= 2);
    for (const k of keys) assert.match(k, /data-encodes="ramp" data-paint="fill"/);
  });
});
