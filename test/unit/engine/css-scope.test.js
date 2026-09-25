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
    // The figure arm packs as a slide descendant. That is harmless in the PREVIEW (no
    // re-hosted figure exists there) but it is NOT where the re-host lives: Read·Article
    // lifts the figure OUT of the slide. The exported player packs with `flat: true`, which
    // adds the unscoped arm — see the FLAT describe block below.
    assert.match(out, /article\.lattice > section figure\.chart-frame \.map-region--on/,
      'the figure.chart-frame arm packs as a slide descendant');
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

/**
 * FLAT packing — the stylesheet for the exported player (`render(…, { styles: 'flat' })`).
 *
 * WHY: the Studio's Webpage export drew every chart in Read · Article black (the radar
 * report, 2026-09-24). The view lifts each chart's figure out of its slide, and the preview
 * pack scopes both the figure's rules and every palette token to the inside of a slide. The
 * CLI player ships the rules UNPACKED and never had the bug. Flat packing emits each arm the
 * pack re-scoped twice — packed, then as written — so a slide keeps its exact cascade and
 * content outside a slide matches what the CLI's copy of the rule matches.
 */
function flatScope(sel) {
  return packTheme(`${sel}{a:1}`, { flat: true }).split('{')[0].trim();
}
const armsOf = (list) => list.split(',').map((s) => s.trim());

describe('packTheme flat (the exported player)', () => {
  test('the chart re-host arm gains its written, unscoped form', () => {
    const arms = armsOf(flatScope(':is(section.radar, figure.chart-frame) .radar-ring'));
    assert.deepEqual(arms, [
      'article.lattice > section.radar .radar-ring',
      'article.lattice > section figure.chart-frame .radar-ring',
      'figure.chart-frame .radar-ring',
    ]);
  });

  test('a bare-class chart token block (`.chart-frame`) gains its written form', () => {
    // The chart palette (`--chart-cat-1-hue` …) is declared on `.chart-frame`; the
    // re-hosted figure carries that class outside any slide.
    assert.deepEqual(armsOf(flatScope('.chart-frame')), ['article.lattice > section .chart-frame', '.chart-frame']);
  });

  test('a :root token block also lands on :root', () => {
    assert.deepEqual(armsOf(flatScope(':root')), ['article.lattice > :where(section):not([\\20 root])', ':root']);
  });

  test('a slide-leading arm is NOT duplicated — it strips back to exactly what was written', () => {
    for (const sel of ['section.title', 'section.map .map-region', 'section h2', 'section:has(.x)', 'section>.x']) {
      assert.equal(flatScope(sel), scope(sel), sel);
    }
  });

  test('flat only ADDS arms: the preview-shaped arms are all still there, in order', () => {
    for (const sel of [':root', 'h2', '.chart-frame .chart-body', ':is(section.map, figure.chart-frame) .x', 'section.title']) {
      const flat = armsOf(flatScope(sel));
      const packed = armsOf(scope(sel));
      assert.deepEqual(flat.filter((a) => packed.includes(a)), packed, sel);
    }
  });

  test('the default pack is unchanged by the option existing', () => {
    assert.equal(packTheme(':root{a:1}h2{b:2}'), packTheme(':root{a:1}h2{b:2}', { flat: false }));
  });
});

