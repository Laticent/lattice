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
  ];
  for (const [name, re, encodes] of rows) {
    test(`${name} marks carry the contract`, () => {
      const tags = html.match(new RegExp(re.source, 'g')) || [];
      assert.ok(tags.length, `the gallery renders no ${name} mark`);
      for (const tag of tags) assert.match(tag, new RegExp(`data-encodes="${encodes}"`), tag);
    });
  }
});
