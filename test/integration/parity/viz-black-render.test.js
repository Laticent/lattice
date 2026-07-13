/**
 * Integration: the SCOPED-render black-fill guard (see tools/check-viz-render.js).
 *
 * Renders the chart gallery deck (the SVG-painting chart components) through the
 * REAL scoped `composeCss()` a browser host loads (playground / Studio / Player) —
 * the surface #956's map/quadrant/radar iOS-black bug lived on, which every
 * UNSCOPED colour check (color-parity, the resolver twin) is blind to. Asserts no
 * SVG paintable element computes to opaque black except the sanctioned
 * max-contrast inks in test/viz-render/black-baseline.json. A dropped-colour
 * regression (a scoping or token-name break) shows up here as a NEW black.
 * (Mermaid diagrams bake inline fills at mmdc time — immune to this mechanism,
 * covered by test/integration/mermaid/.)
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache); SKIPS with a notice when
 * none is reachable, never a false green (HARD RULE #23). Runs in the integration
 * tier (PR + nightly). To re-bless after an intentional change:
 *   node tools/check-viz-render.js --bless
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../../../tools/check-viz-render.js');

test('no unsanctioned black SVG paint on the scoped playground/Studio/Player render path', async () => {
  const { skipped, regressions, stale } = await evaluate();
  if (skipped) {
    console.error('viz-black-render: SKIPPED — no Chromium; the scoped-render guard did not run.');
    return; // not a pass claim — the skip is logged
  }

  const regressionMsg = regressions
    .map((f) => `${f.family}/section.${f.component}/${f.selector} { ${f.property} } → black`)
    .join('\n  ');
  assert.equal(
    regressions.length,
    0,
    `NEW black SVG paint on the scoped path — a themed colour resolved to nothing (scoping/token break, cf. #956):\n  ${regressionMsg}\n` +
      'If intentional, re-bless: node tools/check-viz-render.js --bless',
  );

  assert.equal(
    stale.length,
    0,
    `STALE black-baseline entr(y/ies) no longer render black (the list rotted): ${stale.join(', ')}\n` +
      'Re-bless to drop them: node tools/check-viz-render.js --bless',
  );
});
