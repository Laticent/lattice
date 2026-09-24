/**
 * Integration: the SCOPED-render black-fill guard (see tools/check-viz-render.js).
 *
 * Renders the chart gallery deck (the SVG-painting chart components) through the
 * REAL scoped `composeCss()` a browser host loads (playground / Studio / Player) —
 * the surface #956's map/quadrant/radar iOS-black bug lived on, which every
 * UNSCOPED color check (color-parity, the resolver twin) is blind to. Asserts no
 * SVG paintable element computes to opaque black except the sanctioned
 * max-contrast inks in test/viz-render/black-baseline.json. A dropped-color
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

// It also runs the COPY-PARITY pass: every chart shown outside its slide — FLAT
// (the exported player's Read · Article) and BAKED (a stylesheet-free SVG, the
// Studio rasterizer's shape) — must keep every paint its slide has. #2344 shipped
// the flat copy black; this pass fails on that shape (309 distinct losses measured
// with the old slide-scoped pack). See
// engineering/decisions/2026-09-24-one-style-delivery-spine.md.
test('no unsanctioned black SVG paint on the scoped path, and no lost paint in a flat or baked copy', async () => {
  const { skipped, regressions, stale, compared, unpaired, unjustified } = await evaluate();
  if (skipped) {
    console.error('viz-black-render: SKIPPED — no Chromium; the scoped-render guard did not run.');
    return; // not a pass claim — the skip is logged
  }

  // A copy pass that paired nothing would report nothing — a broken harness, not a
  // clean surface. The first draft of the pass hid the whole article exactly that way.
  assert.ok(compared.flat > 0, 'the flat (Read · Article) copy pass compared 0 element pairs');
  assert.ok(compared.baked > 0, 'the baked (stylesheet-free SVG) copy pass compared 0 element pairs');
  // Per chart as well: one chart going missing from a copy hides inside a global count.
  assert.deepEqual(
    unpaired.map((u) => `${u.mode} · ${u.component} · ${u.theme} ${u.scheme}`),
    [],
    'a chart that should have a copy compared nothing',
  );
  assert.deepEqual(unjustified, [], 'a copy-loss sanction has a missing or TODO `why` in test/viz-render/black-baseline.json');

  const regressionMsg = regressions
    .map((f) =>
      f.mode
        ? `${f.mode} copy · ${f.component} · ${f.selector} { ${f.property} } ${f.from} → ${f.to}`
        : `${f.family}/section.${f.component}/${f.selector} { ${f.property} } → black`,
    )
    .join('\n  ');
  assert.equal(
    regressions.length,
    0,
    `NEW finding — black SVG paint on the scoped path (cf. #956), or a paint a chart lost outside its slide (cf. #2344):\n  ${regressionMsg}\n` +
      'If intentional, re-bless: node tools/check-viz-render.js --bless',
  );

  assert.equal(
    stale.length,
    0,
    `STALE black-baseline entr(y/ies) no longer render black (the list rotted): ${stale.join(', ')}\n` +
      'Re-bless to drop them: node tools/check-viz-render.js --bless',
  );
});

// THE ARMS — proof the copy pass FAILS on each shape it guards. A gate that has never
// been seen to fail is a claim, not a gate. Each arm runs one theme and one scheme (the
// shapes are theme-independent), and the three run side by side.
test('the copy pass fails on the #2344, blind-copy and #2210 shapes', async () => {
  const { collectCopies, uniqueByKey } = require('../../../tools/check-viz-render.js');
  const cheap = { themes: ['indaco'], schemes: ['light'] };
  const [scopedPack, hidden, unfrozen] = await Promise.all([
    // #2344: the article gets the preview's slide-scoped pack.
    collectCopies({ ...cheap, flatPack: false }),
    // A copy that is not drawn at all. The first draft of the pass reported this clean.
    collectCopies({ ...cheap, extraFlatCss: '#lp-article svg{display:none!important}' }),
    // #2210: a bake that leaves `var()` behind in a host with no stylesheet.
    collectCopies({ ...cheap, freezeTokens: false }),
  ]);
  if (scopedPack.skipped) {
    console.error('viz-black-render arms: SKIPPED — no Chromium.');
    return;
  }
  const count = (r, mode, property) => uniqueByKey(r.lost).filter((f) => f.mode === mode && f.property === property).length;
  // The clean run sanctions 5 distinct flat losses per theme and scheme (all HTML
  // backgrounds), so each arm must show losses of a KIND the clean run never has.
  assert.ok(count(scopedPack, 'flat', 'fill') > 10, 'the slide-scoped pack must lose chart fills in the article');
  assert.ok(count(hidden, 'flat', 'drawn') > 10, 'a hidden article copy must be reported as not drawn');
  assert.ok(count(unfrozen, 'baked', 'fill') > 10, 'a bake without frozen tokens must lose fills');
});
