/**
 * Unit: the narrow forms of tower, quadrant, risk-matrix and word-cloud are the fluid viewer's alone.
 *
 * Each kernel draws a narrow form below 260 units wide: tower's names above its bands, quadrant's 300-wide
 * plane, risk-matrix's key under the grid, word-cloud's scaled size key. A half-width pane on a 16:9 slide
 * is 223 units wide too, so the form keys on the `fluid` mark that only lib/runtime/chart-redraw.js puts on
 * the canvas it passes; an export's pane keeps its drawing (the checker's repro: a ten-risk matrix in a
 * pane fell from 14.6px to 7.7px when the form keyed on width alone).
 * engineering/decisions/2026-11-03-responsive-tables.md §"The whole-source kinds".
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');

const LISTS = {
  tower: '<ul><li>Layer 2 <code>$70M xs $90M</code><ul><li>Acme Re <code>40%</code></li><li>Umbra Re <code>60%</code></li></ul></li><li>Layer 1 <code>$40M xs $50M</code><ul><li>Globex Re <code>100%</code></li></ul></li><li>Retention <code>$50M</code></li></ul>',
  quadrant: '<ul><li>Quick wins<ul><li>Digest <code>{2, 80}</code></li></ul></li><li>Bets<ul><li>Model <code>{8, 90}</code></li></ul></li><li>Defer<ul><li>UI <code>{2, 20}</code></li></ul></li><li>Sinks<ul><li>Exports <code>{8, 10}</code></li></ul></li></ul>',
  'risk-matrix': '<ul><li>Cyber outage <code>{4, 5}</code></li><li>FX swing <code>{4, 2}</code></li><li>Pandemic <code>{1, 5}</code></li></ul>',
  'word-cloud': '<ul><li>onboarding <code>9</code></li><li>pricing <code>5</code></li><li>security <code>7</code></li><li>support <code>3</code></li></ul>',
};
/** Render-scoped ids differ between two renders (`chart-spine-3`, `-4`); number them alike. */
const norm = (h) => h.replace(/([a-z])-\d+\b/g, '$1-N');
/** What the WIDE form draws, the one an export's narrow pane must keep. */
const WIDE = {
  tower: /class="tower-name" text-anchor="end"/,            // names in the side column, right-aligned
  quadrant: /viewBox="0 0 420 348"/,                         // the fixed wide plane
  'risk-matrix': /viewBox="0 0 223 180"/,                    // the key beside the grid, inside the pane
  'word-cloud': /^(?![\s\S]*scale\(2\.4\))/,                 // the size key unscaled
};
const draw = (kind, orientation, view) => {
  const out = transformChartSection(`<h2>.</h2>${LISTS[kind]}`, kind, orientation, view, null, undefined);
  assert.ok(out.transformed, `${kind} drew`);
  return out.html;
};

for (const kind of Object.keys(LISTS)) {
  // word-cloud's narrow key is the portrait key's; the others take the form in either orientation.
  const orientation = kind === 'word-cloud' ? 'portrait' : undefined;
  test(`${kind}: a narrow EXPORT pane keeps its drawing; the fluid redraw's narrow canvas takes the narrow form`, () => {
    const pane = draw(kind, orientation, { w: 223, h: 180 });
    const fluid = draw(kind, orientation, { w: 223, h: 180, fluid: true });
    const wide = draw(kind, orientation, { w: 300, h: 180, fluid: true });
    assert.match(pane, WIDE[kind], 'the export pane keeps the wide form');
    assert.doesNotMatch(fluid, WIDE[kind], 'the fluid canvas draws the narrow form');
    // Past the threshold the mark changes nothing: the same box draws the same with or without it.
    assert.equal(norm(wide), norm(draw(kind, orientation, { w: 300, h: 180 })));
  });
}
