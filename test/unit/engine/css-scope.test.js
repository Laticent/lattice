/**
 * Gate: the playground/Studio selector scoper (`packTheme` in lib/engine/css.js)
 * distributes a LEADING `:is(…)` forgiving list so each arm scopes by its own
 * leftmost combinator.
 *
 * WHY THIS EXISTS — the map/quadrant/radar iOS-black bug (2026-07-13). The docs-
 * site playground wraps each engine selector under `article.lattice > section`. Its
 * "targets the slide section" test used to be a LITERAL leading `section` only, so
 * a chart rule led by `:is(section.map, figure.chart-frame)` (the Read·Article
 * re-host broadening) was scoped as a slide DESCENDANT —
 * `article.lattice > section :is(section.map, …)` — which can never match the map
 * slide (`section.map` IS the slide, not inside it). The rule never applied,
 * `--map-base` was never defined, and every map fill reading it fell to SVG's black
 * initial value. This locks the distribution so that regression can't return.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { packTheme } = require('../../../lib/engine/css.js');

/** Scope a single selector and return the packed selector text (before the `{`). */
function scope(sel) {
  return packTheme(`${sel}{a:1}`).split('{')[0].trim();
}

describe('packTheme selector scoping', () => {
  test('a leading :is(section.X, figure.Y) distributes — the section arm targets the SLIDE', () => {
    const out = scope(':is(section.map, figure.chart-frame) .map-region--on');
    // The section arm must land on the slide section itself (direct child of the
    // wrapper), NOT as a descendant — else it never matches and the map goes black.
    assert.match(out, /article\.lattice > section\.map \.map-region--on/,
      'the section.map arm must scope to the slide section directly');
    // The figure arm stays a descendant (a re-hosted <figure> inside the slide).
    assert.match(out, /article\.lattice > section figure\.chart-frame \.map-region--on/,
      'the figure.chart-frame arm must scope as a slide descendant');
    // The bug signature — a slide-descendant `:is(section…)` — must be gone.
    assert.doesNotMatch(out, /section :is\(/, 'must not leave `:is(section…)` as a slide descendant');
  });

  test('every chart :is(section.<comp>, figure.chart-frame) pattern distributes', () => {
    for (const comp of ['map', 'gantt', 'radar', 'quadrant', 'funnel', 'piechart']) {
      const out = scope(`:is(section.${comp}, figure.chart-frame) .x`);
      assert.match(out, new RegExp(`article\\.lattice > section\\.${comp} \\.x`),
        `${comp}: the section arm must target the slide`);
    }
  });

  test('non-:is selectors are UNCHANGED (no regression)', () => {
    assert.equal(scope('section.title'), 'article.lattice > section.title');
    assert.equal(scope('section.map .map-region'), 'article.lattice > section.map .map-region');
    assert.equal(scope('.chart-frame .chart-body'), 'article.lattice > section .chart-frame .chart-body');
    assert.equal(scope('h2'), 'article.lattice > section h2');
    assert.equal(scope('section:has(.x)'), 'article.lattice > section:has(.x)');
    assert.equal(scope('section.map, section.radar'),
      'article.lattice > section.map, article.lattice > section.radar');
  });

  test(':root still becomes the (0,1,0)-preserving slide-root marker', () => {
    assert.match(scope(':root'), /article\.lattice > :where\(section\):not\(\[\\20 root\]\)/);
  });
});
