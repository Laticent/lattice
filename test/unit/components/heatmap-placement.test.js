/**
 * Unit: where a heatmap puts its callouts and its key, chosen by measure
 * (lib/components/chart/heatmap/heatmap.transform.js `buildHeatmap`). Design:
 * engineering/decisions/2026-10-20-callout-placement.md § 5.
 *
 * The arms pin the CHOICE, not the geometry: which side wins at which slide shape, that a
 * placement which drops a callout never beats one that draws it, and that trying the losers
 * leaves no trace in the output.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { transformSection, parseHeatmapTable, resolveCallouts, layoutHeatmap } = require('../../../lib/components/chart/heatmap/heatmap.transform');
const { liftLegends } = require('../../../lib/core/lift-label-set');
const { resetRenderIds } = require('../../../lib/core/render-ids');

const md = new MarkdownIt({ html: true });
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const TABLE = `|  | M0 | M1 | M2 | M3 | M4 |
| --- | --: | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 | 41 |
| Feb 2026 | 100 | 58 | 31 | 30 | 27 |
| Mar 2026 | 100 | 71 | 55 | 50 | 40 |
| Apr 2026 | 100 | 66 | 52 | 47 | 44 |`;
const THREE = '`@callout{[{Onboarding change, row="Feb 2026", col=M2}, {Setup call cut, row="Jan 2026", col=M1}, {Spring lift, row="Apr 2026", col=M3}]}`';
const SIX = `\`@callout{[${Array.from({ length: 6 }, (_, i) => `{Support backlog peaked after the migration ${i}, row="${['Jan', 'Feb', 'Mar', 'Apr'][i % 4]} 2026", col=M${i % 5}}`).join(', ')}]}\``;

const render = (extra, ctx = {}, tokens = []) => {
  resetRenderIds('');
  return transformSection(md.render(`## Retention\n\n${TABLE}\n\n${extra}`), { classTokens: tokens, ...ctx });
};
// A keyed figure draws the grid in a group the key's layout shifts; the key itself is in root
// coordinates. Everything is compared in root coordinates.
const shift = (d) => {
  const g = d.querySelector('svg > g[transform^="translate("]');
  const m = g?.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { dx: Number(m[1]), dy: Number(m[2]) } : { dx: 0, dy: 0 };
};
const cellBox = (d) => {
  const cells = [...d.querySelectorAll('rect.heatmap-cell')].filter((r) => !r.classList.contains('chart-key-swatch'));
  const { dx, dy } = shift(d);
  return {
    right: dx + Math.max(...cells.map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width')))),
    bottom: dy + Math.max(...cells.map((r) => Number(r.getAttribute('y')) + Number(r.getAttribute('height')))),
  };
};
const labels = (d) => {
  const { dx, dy } = shift(d);
  return [...d.querySelectorAll('text.legend-text--bare tspan')].map((t) => ({ x: dx + Number(t.getAttribute('x')), y: dy + Number(t.getAttribute('y')) }));
};
const swatches = (d) => [...d.querySelectorAll('rect.chart-key-swatch')];
const keyX = (d) => Math.min(...swatches(d).map((r) => Number(r.getAttribute('x'))));
const keyY = (d) => Math.min(...swatches(d).map((r) => Number(r.getAttribute('y'))));

describe('callouts: beside the grid on a wide slide, under it on a squarer one', () => {
  test('landscape keeps the notes in a lane to the right of every cell', () => {
    const d = doc(render(THREE));
    const { right } = cellBox(d);
    for (const l of labels(d)) assert.ok(l.x > right, `${l.x} > ${right}`);
  });

  test('square sets them under the lowest cell, and the figure grows to hold them', () => {
    const out = render(THREE, { orientation: 'square' });
    const d = doc(out);
    const { bottom } = cellBox(d);
    for (const l of labels(d)) assert.ok(l.y > bottom, `${l.y} > ${bottom}`);
    assert.ok(Number(out.match(/viewBox="0 0 \d+ (\d+)"/)[1]) > 180);
  });

  test('every callout is drawn whichever side wins, in the key size, with no "not drawn"', () => {
    for (const orientation of ['landscape', 'square', 'portrait']) {
      const d = doc(render(SIX, { orientation }));
      assert.equal(d.querySelectorAll('text.legend-text--bare').length, 6, orientation);
      assert.doesNotMatch(d.querySelector('desc').textContent, /Not drawn/, orientation);
    }
  });
});

describe('the key: beside the grid on a wide slide, under it on a squarer one', () => {
  test('landscape keeps a lone key to the right', () => {
    const d = doc(render('', {}, ['scale']));
    assert.ok(keyX(d) > cellBox(d).right);
  });

  test('square moves it under the grid', () => {
    const d = doc(render('', { orientation: 'square' }, ['scale']));
    assert.ok(keyY(d) > cellBox(d).bottom);
  });

  test('portrait keeps its key under the grid', () => {
    const d = doc(render('', { orientation: 'portrait' }, ['scale']));
    assert.ok(keyY(d) > cellBox(d).bottom);
  });
});

describe('notes and key together', () => {
  test('landscape keeps both beside the grid, the notes nearer to it', () => {
    const d = doc(render(THREE, {}, ['scale']));
    const { right } = cellBox(d);
    for (const l of labels(d)) assert.ok(l.x > right && l.x < keyX(d));
  });

  test('square puts the key under the grid and keeps the notes beside it, within the margin', () => {
    const d = doc(render(THREE, { orientation: 'square' }, ['scale']));
    const { right, bottom } = cellBox(d);
    for (const l of labels(d)) assert.ok(l.x > right);
    assert.ok(keyY(d) > bottom);
  });

  test('both under the grid: the notes run its width, then the key, with the key\'s own rule between', () => {
    const model = parseHeatmapTable(md.render(`${TABLE}\n`).match(/<table>[\s\S]*<\/table>/)[0]);
    model.bands = [];
    resolveCallouts(model, liftLegends(md.render(THREE)).legends);
    resetRenderIds('');
    const { svg, drawn } = layoutHeatmap(model, { classTokens: ['scale'] }, { callouts: 'below', key: 'below' });
    const d = doc(svg);
    const { bottom } = cellBox(d);
    const lowest = Math.max(...labels(d).map((l) => l.y));
    assert.equal(drawn, 3);
    assert.ok(Math.min(...labels(d).map((l) => l.y)) > bottom);
    assert.ok(keyY(d) > lowest, `${keyY(d)} > ${lowest}`);
    assert.equal(d.querySelectorAll('defs linearGradient').length, 1, 'one spine, between the notes and the key');
  });

  test('the notes and the key print at one size wherever they sit', () => {
    for (const orientation of ['landscape', 'square']) {
      const d = doc(render(THREE, { orientation }, ['scale']));
      const note = d.querySelector('text.legend-text--bare').getAttribute('font-size');
      const key = d.querySelector('text.chart-key-label').getAttribute('font-size');
      assert.equal(Number(note).toFixed(1), Number(key).toFixed(1), orientation);
    }
  });
});

describe('trying the placements leaves no trace', () => {
  test('the layouts that lose report no label drops', () => {
    const { collectLabelDrops } = require('../../../lib/components/chart/_chart-family/label-drops');
    const { drops } = collectLabelDrops(() => render(SIX, { orientation: 'landscape' }));
    assert.deepEqual(drops, []);
  });

  test('a render with a choice to make mints the ids a single layout would', () => {
    const once = render(THREE, { orientation: 'square' }, ['scale']);
    const again = render(THREE, { orientation: 'square' }, ['scale']);
    assert.equal(once, again);
    assert.match(once, /chart-spine-1"/);
    assert.doesNotMatch(once, /chart-spine-2"/);
  });

  test('a figure with no callouts and no key has nothing to choose and draws as before', () => {
    const out = render('');
    assert.doesNotMatch(out, /legend|chart-key/);
    assert.match(out, /viewBox="0 0 320 180"/);
  });
});

describe('the slide\'s real shape settles what its orientation name cannot', () => {
  const viewBox = (out) => out.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);

  test('one orientation, two aspects, two layouts: a lone key sits beside the grid at 16:9 and under it at 4:3', () => {
    const wide = viewBox(render('', { orientation: 'landscape', aspect: 16 / 9 }, ['scale']));
    const standard = viewBox(render('', { orientation: 'landscape', aspect: 1.33 }, ['scale']));
    assert.ok(wide[0] > standard[0], 'the key widens the 16:9 figure');
    assert.ok(standard[1] > wide[1], 'and deepens the 4:3 one');
  });

  test('portrait: three notes sit beside the grid at 4:5 and under it at 9:16', () => {
    const fourFive = viewBox(render(THREE, { orientation: 'portrait', aspect: 0.8 }));
    const story = viewBox(render(THREE, { orientation: 'portrait', aspect: 0.56 }));
    assert.ok(story[1] > fourFive[1]);
  });

  test('no aspect falls back to the orientation name: landscape is scored at 16:9', () => {
    assert.equal(render(THREE, { orientation: 'landscape' }, ['scale']), render(THREE, { orientation: 'landscape', aspect: 16 / 9 }, ['scale']));
  });

  test('the chart box follows the slide: measured points exactly, linear between, clamped outside', () => {
    const { chartBoxAspect } = require('../../../lib/components/chart/heatmap/heatmap.transform');
    assert.equal(chartBoxAspect(16 / 9), 2.72);
    assert.equal(chartBoxAspect(0.8), 1.09);
    assert.equal(chartBoxAspect(0.3), 0.67);
    assert.equal(chartBoxAspect(3), 2.72);
    const mid = chartBoxAspect(1.15);
    assert.ok(mid > 1.26 && mid < 1.74, String(mid));
  });
});
