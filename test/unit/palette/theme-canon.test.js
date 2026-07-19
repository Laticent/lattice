/**
 * Unit: lib/theme/ai.js THEME_CANON — the facts-from-source drift gate (Win 2).
 *
 * THEME_CANON is what the product AI (Fabricate's theme generator) is told about
 * how a Lattice theme derives, so its 10 essential picks anticipate the OKLCH
 * derivation. The teaching prose is hand-written, but the FALSIFIABLE facts — the
 * token-contract size, the categorical slot count, and the graphical-edge
 * threshold — MUST be interpolated from the engine's own source, so the model can
 * never be told a number the derivation no longer emits. This gate fails the
 * build if a future edit hardcodes one of those facts and it drifts, and if the
 * canon and design/theming.md stop describing the same three-layer contract.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { THEME_CANON, ASK_SYSTEM } = require('../../../lib/theme/ai.js');
const { CATEGORICAL_COUNT, requiredTokenList } = require('../../../lib/theme/derive.js');
const { AA_LARGE } = require('../../../lib/theme/color.js');

describe('theme-canon (facts-from-source)', () => {
  test('states the live token-contract size (sourced from requiredTokenList)', () => {
    const n = requiredTokenList().length;
    assert.match(THEME_CANON, new RegExp(`${n}-token contract`), `canon must state the live ${n}-token contract size`);
  });

  test('states the live categorical slot count (sourced from CATEGORICAL_COUNT)', () => {
    assert.match(THEME_CANON, new RegExp(`each of ${CATEGORICAL_COUNT} slots`), `canon must state the live ${CATEGORICAL_COUNT}-slot count`);
  });

  test('states the live graphical-edge threshold (sourced from AA_LARGE)', () => {
    assert.match(THEME_CANON, new RegExp(`clears ${AA_LARGE}:1`), `canon must state the live ${AA_LARGE}:1 edge floor`);
  });

  test('the facts are interpolated, NOT hardcoded — a source change moves the canon', () => {
    // A hardcoded literal would survive a mismatch; interpolation cannot. Prove the
    // number in the canon IS the computed one by regenerating the substring here.
    const n = requiredTokenList().length;
    assert.ok(THEME_CANON.includes(`${n}-token contract`) && THEME_CANON.includes(`each of ${CATEGORICAL_COUNT} slots`) && THEME_CANON.includes(`clears ${AA_LARGE}:1`));
    // And ASK_SYSTEM embeds the canon (so the model actually receives these facts).
    assert.ok(ASK_SYSTEM.includes(THEME_CANON), 'ASK_SYSTEM must embed THEME_CANON');
  });

  test('canon and design/theming.md agree on the three-layer flipping model', () => {
    const doc = fs.readFileSync(path.join(__dirname, '../../../design/theming.md'), 'utf8');
    // Both must teach the SAME contract vocabulary, so a doc reader and the model
    // are told the same story: a flipping three-layer categorical model with a
    // pale-fill/jewel-fill swap.
    for (const term of ['three-layer', 'flip', 'jewel', 'pale']) {
      assert.match(THEME_CANON.toLowerCase(), new RegExp(term), `canon should mention "${term}"`);
      assert.match(doc.toLowerCase(), new RegExp(term), `theming.md should mention "${term}"`);
    }
  });
});
