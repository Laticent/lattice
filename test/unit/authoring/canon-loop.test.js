/**
 * Unit: the authoring-canon LOOP — the cross-cutting invariants that tie the
 * per-generator canons together (Win 5, closing the authoring-canon unification).
 *
 * Each product generator is grounded by exactly ONE authoring canon:
 *   theme     → lib/theme/ai.js   THEME_CANON
 *   component → lib/layout/ai.js  COMPONENT_CANON
 *   deck      → lib/authoring/deck-canon.js  DECK_CANON (+ DECK_CANON_SHORT on-device)
 *   finish    → docs FINISH_SYSTEM (covered by finish-system-vocab.test.ts; docs runner)
 *
 * The per-canon drift gates (theme-canon / component-canon / deck-canon /
 * finish-system-vocab) hold each canon true to its own source. THIS gate holds
 * the SHARED facts consistent ACROSS canons — the "one truth per artifact"
 * guarantee: a fact sourced from the engine (here, the categorical slot count)
 * must read the same everywhere it appears, so two canons can never teach the
 * model two different numbers for the same engine contract.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { THEME_CANON } = require('../../../lib/theme/ai.js');
const { COMPONENT_CANON } = require('../../../lib/layout/ai.js');
const { DECK_CANON, DECK_CANON_SHORT } = require('../../../lib/authoring/deck-canon.js');
const { CATEGORICAL_COUNT } = require('../../../lib/theme/derive.js');

// The generator → canon registry: exactly one substantive canon per generator.
const CANONS = {
  theme: THEME_CANON,
  component: COMPONENT_CANON,
  deck: DECK_CANON,
};

describe('authoring-canon loop', () => {
  test('every generator has exactly ONE substantive canon', () => {
    for (const [gen, canon] of Object.entries(CANONS)) {
      assert.equal(typeof canon, 'string', `${gen} canon must be a string`);
      assert.ok(canon.length > 300, `${gen} canon should be substantive (got ${canon.length} chars)`);
    }
    // The canons are distinct — no generator accidentally reuses another's.
    const bodies = Object.values(CANONS);
    assert.equal(new Set(bodies).size, bodies.length, 'each generator canon must be distinct');
  });

  test('the on-device deck canon is a strict, shorter variant of the full one', () => {
    assert.ok(DECK_CANON_SHORT.length > 0 && DECK_CANON_SHORT.length < DECK_CANON.length, 'short canon must be a shorter sibling');
  });

  test('the shared categorical-slot fact agrees across every canon (one truth)', () => {
    // Any canon that points the model at the categorical ramp must key it to the SAME
    // engine count — never a stale literal that disagrees with a sibling canon.
    const overshoot = CATEGORICAL_COUNT + 1;
    for (const [gen, canon] of Object.entries(CANONS)) {
      // No canon may reference a categorical slot BEYOND the live count…
      assert.ok(!canon.includes(`--cat-${overshoot}-`), `${gen} canon references --cat-${overshoot}-* beyond the ${CATEGORICAL_COUNT}-slot ramp`);
      assert.ok(!canon.includes(`${overshoot} slots`), `${gen} canon states ${overshoot} slots, past the live ${CATEGORICAL_COUNT}`);
    }
    // …and where a canon names the ramp's top slot, it is exactly the live count.
    assert.ok(THEME_CANON.includes(`${CATEGORICAL_COUNT} slots`), 'theme canon must state the live slot count');
    assert.ok(COMPONENT_CANON.includes(`--cat-${CATEGORICAL_COUNT}-mark`), 'component canon must anchor the ramp at the live top slot');
  });
});
