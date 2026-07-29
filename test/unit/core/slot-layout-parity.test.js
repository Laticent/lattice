/**
 * Unit: the slot-label-lift LAYOUT LIST is one list, two shapes.
 *
 * Which layouts lift their leading list text into a `<strong>` slot label used
 * to be written twice — a class regex inside the markdown-it plugin and a CSS
 * selector string inside lib/runtime/index.js. They drifted: `premise` and
 * `q-and-a` were added to the plugin only, so on a Marp-rendered deck (which
 * runs the runtime, never the plugin) a premise ledger's row terms came out as
 * plain text with no corner tag (#1256). Both are now derived from the kernel;
 * these tests pin that they stay derivable and stay equivalent.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  SLOT_LAYOUTS, LIST_STEPS_LIFT_VARIANTS, slotLayoutPattern, slotLayoutSelector,
} = require('../../../lib/core/slot-label-lift');

describe('slot-label-lift layout list', () => {
  test('the pattern matches every layout as a whole class token', () => {
    const re = slotLayoutPattern();
    for (const name of SLOT_LAYOUTS) {
      assert.ok(re.test(`form ${name} accent`), `${name} should match in a class string`);
    }
  });

  test('hyphenated names stay atomic — `timeline` must not match `timeline-list`', () => {
    const re = slotLayoutPattern();
    assert.ok(re.test('timeline'));
    assert.ok(!re.test('timeline-list'), 'the timeline-list chart class must not lift');
    assert.ok(!re.test('compare-prose-extra'));
  });

  test('the selector covers exactly the same layouts, plus the list-steps variants', () => {
    const selectors = slotLayoutSelector().split(', ');
    for (const name of SLOT_LAYOUTS) {
      assert.ok(selectors.includes(`section.${name}`), `selector is missing section.${name}`);
    }
    for (const v of LIST_STEPS_LIFT_VARIANTS) {
      assert.ok(selectors.includes(`section.list-steps.${v}`), `selector is missing list-steps.${v}`);
    }
    assert.equal(selectors.length, SLOT_LAYOUTS.length + LIST_STEPS_LIFT_VARIANTS.length);
  });

  test('the list-steps variants lift only on a list-steps host, never bare', () => {
    for (const v of LIST_STEPS_LIFT_VARIANTS) {
      assert.ok(!slotLayoutSelector().split(', ').includes(`section.${v}`),
        `${v} is a generic modifier — it must not lift on its own`);
    }
  });

  test('the layouts the drift lost are in the list', () => {
    assert.ok(SLOT_LAYOUTS.includes('premise'));
    assert.ok(SLOT_LAYOUTS.includes('q-and-a'));
  });

  test('both consumers read the kernel rather than re-listing the layouts', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const REPO = path.join(__dirname, '..', '..', '..');
    const plugin = fs.readFileSync(path.join(REPO, 'lib/integrations/markdown-it/plugins.js'), 'utf8');
    const runtime = fs.readFileSync(path.join(REPO, 'lib/runtime/index.js'), 'utf8');
    assert.match(plugin, /slotLayoutPattern\(\)/);
    assert.match(runtime, /slotLayoutSelector\(\)/);
    // A second hard-coded copy of the list is what caused the drift.
    for (const [name, src] of [['plugin', plugin], ['runtime', runtime]]) {
      assert.ok(!/compare-prose\|decision\|split-panel/.test(src), `${name} re-lists the layouts`);
      assert.ok(!/section\.compare-prose, section\.decision/.test(src), `${name} re-lists the layouts`);
    }
  });
});
