/**
 * The CSS-ONLY FALLBACK UNION must equal the catalog's below-note set.
 *
 * Two tiers render the trailing beats' chrome (lib/base/base.modifiers.css §
 * THE TRAILING BEATS' CHROME). Tier 1 keys on the `.below-note` WRAPPER and names
 * no component: the kernel only emits that wrapper where `rendersBeat` said yes, so
 * the class IS the permission and there is nothing left for CSS to decide. (It is
 * keyed on the wrapper rather than on `.cell-coda` because the cell is a DOM PATH —
 * a hand-authored `.below-note` that the Form transform folds into `.cell-stage` is
 * a real shape, and keying on the cell dropped the register for it.) Tier 2 is the
 * fallback for a Marp deck that
 * loads `lattice.css` WITHOUT the runtime: no coda cell, no Form structure, and
 * the layout's claim visible only in its class name. That tier has to enumerate,
 * and an enumeration is exactly what rotted before.
 *
 * WHAT ROTTED, MEASURED. The annotation register used to be a hand-written
 * OPT-IN union of seventeen layouts. Rendered through the real emulator, one
 * probe slide per component, measured in Chromium: 15 layouts got the spark and
 * 19 that render a below-note got an ordinary one instead. Two of the seventeen
 * — `timeline` and `principles` — are not components at all, so those arms had
 * never matched anything in any render.
 *
 * THIS TEST DERIVES, IT DOES NOT MIRROR. The expected set comes from
 * `blocksFor()`, the same predicate the render and the published
 * `authoring.blocks` contract read (HARD RULE #1). So it fails in BOTH
 * directions — a layout that gains the note and is missing from the CSS, and a
 * name in the CSS that no longer renders one. That direction matters: this is
 * NOT the CSS-parsing drift test the coda change deleted, which mirrored a
 * `:not()` chain into a hand-kept JS array and could only ever confirm that two
 * hand-written lists still matched each other.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CATALOG = require('../../../lib/forms/cell/coda/coda-catalog.generated.js');
const { blocksFor } = require('../../../lib/core/authoring-blocks');

const CSS_PATH = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

/** Every layout the catalog says renders a below-note. */
function expectedSet() {
  return Object.keys(CATALOG).filter((name) => blocksFor(name).includes('below-note')).sort();
}

/**
 * The class names in each `section:is( … ):not(:has(.below-note))` head.
 *
 * Matched on the WHOLE head rather than by scraping every `.name` in the file:
 * a looser scan would happily pass on a union that had been split in half.
 */
function fallbackUnions() {
  const re = /section:is\(([^)]*)\):not\(:has\(\.below-note\)\)/g;
  const found = [];
  let m;
  while ((m = re.exec(css))) {
    found.push(m[1].split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean).sort());
  }
  return found;
}

describe('coda CSS-only fallback union', () => {
  test('the fallback tier exists and every arm carries the same union', () => {
    const unions = fallbackUnions();
    assert.ok(unions.length > 0, 'no `section:is(…):not(:has(.below-note))` head found — tier 2 is gone');
    const first = JSON.stringify(unions[0]);
    for (const u of unions) {
      assert.equal(JSON.stringify(u), first,
        'the fallback arms disagree; every arm must carry the identical union');
    }
  });

  test('the union equals the catalog\'s below-note set, in both directions', () => {
    const expected = expectedSet();
    const actual = fallbackUnions()[0];

    const missing = expected.filter((n) => !actual.includes(n));
    const stale = actual.filter((n) => !expected.includes(n));

    assert.deepEqual(missing, [],
      `these layouts render a below-note but are absent from the CSS-only fallback: ${missing.join(', ')}`);
    assert.deepEqual(stale, [],
      `these names are in the CSS-only fallback but render no below-note (or are not components at all): ${stale.join(', ')}`);
  });

  test('every name in the union is a real component', () => {
    const unknown = fallbackUnions()[0].filter((n) => !CATALOG[n]);
    assert.deepEqual(unknown, [],
      `the fallback names layouts that do not exist: ${unknown.join(', ')} — the defect that shipped as \`timeline\` and \`principles\``);
  });

  test('tier 1 names no component', () => {
    // Scoped to the register's OWN selector head (`section .below-note`, descendant
    // combinator), not to every line mentioning a note: the split envelope legitimately
    // carries `section.form.lat-split-native … > .cell-coda …` rules, and those are a
    // different feature keyed on a split marker, not on a layout.
    const tier1 = css.split('\n').filter((l) => l.includes('section .below-note'));
    assert.ok(tier1.length >= 3,
      `tier 1 is incomplete — expected the hairline, type and spark rules, found ${tier1.length}`);
    for (const line of tier1) {
      assert.ok(!/section\.[a-z]/.test(line),
        `tier 1 must be component-blind, found a layout class in: ${line.trim()}`);
    }
    // All three arms of the register must be present. Adding a layout to one or two
    // of them used to produce a half-styled note rather than a visible failure.
    for (const arm of [
      'section .below-note:has(> p > em:only-child)::before',   // dotted rule
      'section .below-note > p:has(> em:only-child) {',          // type + ink
      'section .below-note > p:has(> em:only-child)::before',    // the ✦ mask
    ]) {
      assert.ok(css.includes(arm), `the annotation register is missing its arm: ${arm}`);
    }
  });
});
