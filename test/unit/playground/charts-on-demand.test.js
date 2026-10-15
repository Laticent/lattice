/**
 * Unit: chart kernels on demand (engineering/decisions/2026-10-14-engine-spine.md §3.2).
 *
 * The docs site's ESM engine starts with an empty chart-kernel table and loads the kernels a deck
 * names before its synchronous render. Two things keep that safe, and this pins both:
 *   1. a section whose kernel is not loaded passes through untouched and is RECORDED, so the host
 *      loads it and renders again. Before this guard a missing kernel threw out of the whole render
 *      (`KERNELS[layout].transformSection` on undefined), taking every slide with it.
 *   2. `chartsNeeded` reads directive comments, the only place a layout class is written, so
 *      prose like "the road map" does not fetch the map kernel.
 * Node carries every kernel, so the guard is exercised by removing one for the test.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const dispatch = require('../../../lib/plugins/chart-family/chart-family.dispatch');

const BAR = '<!-- _class: bar -->\n\n## Revenue\n\n- North `10`\n- South `20`\n';

describe('a chart whose kernel is not loaded', () => {
  const saved = dispatch.KERNELS.bar;
  after(() => {
    dispatch.KERNELS.bar = saved;
  });

  test('passes through as authored and is recorded, instead of failing the render', async () => {
    const { default: PG } = await import('../../../lib/playground/index.js');
    PG.takeMissingCharts();
    delete dispatch.KERNELS.bar;
    const out = PG.render(BAR, 'indaco');
    assert.ok(out.html.includes('North'), 'the slide still renders');
    assert.ok(!out.html.includes('chart-frame'), 'no chart was drawn');
    assert.deepEqual(PG.takeMissingCharts(), ['bar']);
    assert.deepEqual(PG.takeMissingCharts(), [], 'taking clears the record');

    dispatch.KERNELS.bar = saved;
    assert.ok(PG.render(BAR, 'indaco').html.includes('chart-frame'), 'loaded, the same deck draws the chart');
    assert.deepEqual(PG.takeMissingCharts(), []);
  });
});

describe('chartsNeeded', () => {
  test('is empty when every kernel is loaded (Node, and the single-file bundle)', async () => {
    const { default: PG } = await import('../../../lib/playground/index.js');
    assert.deepEqual(PG.chartsNeeded(BAR), []);
  });

  test('names the layouts in directive comments, whole words only, and ignores prose', async () => {
    const { default: PG } = await import('../../../lib/playground/index.js');
    const saved = { ...dispatch.KERNELS };
    try {
      for (const k of Object.keys(dispatch.KERNELS)) delete dispatch.KERNELS[k];
      const deck = [
        '# The road map, line by line', // prose: not a class
        '<!-- _class: stacked-bar dark -->',
        '<!--\n_class: hub-spoke\n-->',
      ].join('\n\n');
      assert.deepEqual(PG.chartsNeeded(deck).sort(), ['hub-spoke', 'stacked-bar']);
    } finally {
      Object.assign(dispatch.KERNELS, saved);
    }
  });
});
