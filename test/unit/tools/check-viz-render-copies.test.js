/**
 * The copy-parity rule in tools/check-viz-render.js, pinned without a browser.
 *
 * A chart shown OUTSIDE its slide (Read · Article, a stylesheet-free SVG) may change
 * a color — the article follows the page's scheme — but it may not DROP one. The
 * integration pass renders the gallery; this pins the rule it applies, because a
 * rule that is too loose passes #2344's black charts and one that is too strict
 * fails every legitimate re-theme.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { lostPaint, paintClass, findingKey } = require('../../../tools/check-viz-render.js');

describe('check-viz-render copy parity', () => {
  test('paintClass separates nothing, black and a real paint', () => {
    for (const v of ['none', 'transparent', 'rgba(0, 0, 0, 0)', 'color(srgb 0.4 0.5 0.6 / 0)', '']) assert.equal(paintClass(v), 'none', v);
    for (const v of ['rgb(0, 0, 0)', 'black', '#000000']) assert.equal(paintClass(v), 'black', v);
    for (const v of ['rgb(0, 99, 152)', 'color(srgb 0.4 0.5 0.6 / 0.2)', 'oklab(0.5 -0.05 -0.1)', 'url("#g")', 'linear-gradient(red, blue)']) {
      assert.equal(paintClass(v), 'paint', v);
    }
  });

  test('the #2344 shapes are losses: a fill or stroke that went black or to nothing', () => {
    assert.equal(lostPaint('fill', 'rgb(0, 99, 152)', 'rgb(0, 0, 0)'), true);
    assert.equal(lostPaint('stroke', 'color(srgb 0.4 0.5 0.6 / 0.2)', 'none'), true);
    assert.equal(lostPaint('stop-color', 'oklab(0.9 -0.01 -0.02)', 'rgb(0, 0, 0)'), true);
    // An HTML chart that lost its CSS goes transparent, not black.
    assert.equal(lostPaint('background-color', 'oklab(0.87 -0.01 -0.02)', 'rgba(0, 0, 0, 0)'), true);
    assert.equal(lostPaint('background-image', 'linear-gradient(red, blue)', 'none'), true);
  });

  test('a changed color is not a loss, and nothing lost from nothing', () => {
    assert.equal(lostPaint('fill', 'rgb(0, 99, 152)', 'rgb(200, 100, 0)'), false);
    assert.equal(lostPaint('background-color', 'rgb(250, 247, 242)', 'rgb(0, 0, 0)'), false);
    assert.equal(lostPaint('fill', 'none', 'rgb(0, 0, 0)'), false);
    assert.equal(lostPaint('fill', 'rgb(0, 0, 0)', 'none'), false, 'a slide that was already black promised nothing');
  });

  test('a copy finding keys on its mode; a scoped finding keeps its original key', () => {
    const base = { family: 'chart', component: 'radar', selector: 'polygon.radar-ring', property: 'stroke', scheme: 'light' };
    assert.equal(findingKey(base), 'chart/radar/polygon.radar-ring/stroke/light');
    assert.equal(findingKey({ ...base, mode: 'flat' }), 'flat:chart/radar/polygon.radar-ring/stroke/light');
    assert.notEqual(findingKey({ ...base, mode: 'flat' }), findingKey({ ...base, mode: 'baked' }));
  });
});

describe('check-viz-render compareCopies', () => {
  const { compareCopies } = require('../../../tools/check-viz-render.js');
  const el = (drawn, paints) => ({ component: 'radar', selector: 'polygon.radar-ring', drawn, paints });

  test('a copy that is not drawn is a finding, not a skip', () => {
    // The first draft SKIPPED undrawn elements, so a hidden article passed clean.
    const { lost, pairs } = compareCopies('flat', 'light', { 1: el(true, { stroke: 'rgb(1, 2, 3)' }) }, { 1: el(false, { stroke: 'rgb(1, 2, 3)' }) });
    assert.equal(lost.length, 1);
    assert.equal(lost[0].property, 'drawn');
    assert.equal(pairs.radar, 1, 'an undrawn copy still counts as paired, so the floor cannot hide it');
  });

  test('an element the slide itself does not draw promises nothing', () => {
    const { lost, pairs } = compareCopies('flat', 'light', { 1: el(false, { stroke: 'rgb(1, 2, 3)' }) }, { 1: el(false, { stroke: 'none' }) });
    assert.equal(lost.length, 0);
    assert.equal(pairs.radar, undefined);
  });

  test('pairs count per component, so one missing chart is visible', () => {
    const ref = { 1: el(true, {}), 2: { ...el(true, {}), component: 'bar' } };
    const { pairs } = compareCopies('baked', 'dark', ref, { 1: el(true, {}) });
    assert.deepEqual(pairs, { radar: 1 });
  });
});
