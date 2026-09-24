const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { fitFunctionPlotSvg, FIT_FUNCTION_PLOT_SRC } = require('../../../lib/core/function-plot-viewbox');

const plot = (attrs) => {
  const doc = new JSDOM(`<div class="functionplot"><svg class="function-plot" ${attrs}></svg></div>`).window.document;
  return doc.querySelector('.functionplot');
};

test('stamps a viewBox equal to the drawn size, so a host can scale it', () => {
  const div = plot('width="1152" height="320"');
  fitFunctionPlotSvg(div);
  assert.equal(div.querySelector('svg').getAttribute('viewBox'), '0 0 1152 320');
});

test('leaves an existing viewBox alone, and skips an SVG with no size', () => {
  const kept = plot('width="10" height="10" viewBox="1 2 3 4"');
  fitFunctionPlotSvg(kept);
  assert.equal(kept.querySelector('svg').getAttribute('viewBox'), '1 2 3 4');
  const bare = plot('');
  fitFunctionPlotSvg(bare);
  assert.equal(bare.querySelector('svg').hasAttribute('viewBox'), false);
});

test('the injected source is the same function', () => {
  const div = plot('width="480" height="320"');
  new Function(`return (${FIT_FUNCTION_PLOT_SRC})`)()(div);
  assert.equal(div.querySelector('svg').getAttribute('viewBox'), '0 0 480 320');
});
