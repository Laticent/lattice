/**
 * Unit: the DERIVED `headlineDefault` field on every component in dist/docs/components.json
 * (tools/build-docs-portal.js `headlineDefault`). It reports what `headline: auto` resolves to for
 * each component — `left` or `center` — computed from the component's own CSS, NOT hand-authored.
 * A layout is `center` when it sets the shared `--headline-justify` axis to `center` as the fallback
 * on its masthead-lede (Form) or section root (anchor); variant-only centering (list-steps.timeline,
 * divider.light) is NOT the base default. This test is the rot-guard on that derivation.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const components = require('../../../dist/docs/components.json').components;

const byName = Object.fromEntries(components.map((c) => [c.name, c]));

describe('components.json headlineDefault (derived)', () => {
  test('every component carries a left|center headlineDefault', () => {
    for (const c of components) {
      assert.ok(['left', 'center'].includes(c.headlineDefault), `${c.name}: ${c.headlineDefault}`);
    }
  });

  test('the layouts that center their masthead by default are center', () => {
    for (const n of ['stats', 'title', 'closing']) {
      assert.equal(byName[n]?.headlineDefault, 'center', `${n} should center its masthead by default`);
    }
  });

  test('variant-only centering does NOT flip the base component (timeline / light)', () => {
    // list-steps centers only in its `timeline` variant; divider only in `light`. The base default is left.
    assert.equal(byName['list-steps']?.headlineDefault, 'left', 'list-steps base is left (timeline variant centers)');
    assert.equal(byName['divider']?.headlineDefault, 'left', 'divider base is left (light variant centers)');
  });

  test('a centered CAPTION (chart/diagram) is not a centered masthead', () => {
    // chart/diagram center their caption below the body, but the masthead heading lefts.
    for (const n of ['diagram']) {
      assert.equal(byName[n]?.headlineDefault, 'left', `${n} masthead lefts (only the caption centers)`);
    }
  });
});
