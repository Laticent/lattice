/**
 * Unit: the baked texture chips still match the themes they claim to mirror.
 *
 * `lib/core/accessibility-textures.js` paints its patterns from LITERAL hex ramps
 * rather than tokens, on purpose — the `<defs>` it emits has to survive renderers
 * that resolve no custom properties. The cost is four hand-copied ramps whose
 * declarations say "MUST mirror" and which, until this file, nothing compared to the
 * themes. A categorical re-tune moved two of them (onyx's dark fills and concrete's
 * light fills) and every gate stayed green: `texture-polarity.test.js` measures the
 * ink against the BAKED chip, so a chip that has drifted away from its token is
 * still internally consistent and still passes. The visible symptom would have been
 * a pie whose wedge and whose legend swatch are different colors.
 *
 * The comparison is by VALUE, not by ΔE. These are supposed to be the same bytes:
 * a tolerance here would just be a slower way of letting them drift.
 *
 * If this fails: re-copy the ramp named in the message out of the theme, then
 * re-bless `test/unit/core/texture-defs.golden.svg` — the chips are baked into it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MIRRORED_RAMPS } = require('../../../lib/core/accessibility-textures.js');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr.js');
const { mergedVars } = require('../../../tools/composed-contrast.js');

/** Which theme, which canvas, and which token each baked ramp is a copy of. */
const MIRRORS = [
  { ramp: 'CAT_FILLS', theme: 'a11y-base', dark: false, token: 'fill' },
  { ramp: 'CAT_FILLS_DARK', theme: 'onyx', dark: true, token: 'fill' },
  { ramp: 'CONCRETE_FILLS_LIGHT', theme: 'concrete', dark: false, token: 'fill' },
  { ramp: 'CONCRETE_FILLS_DARK', theme: 'concrete', dark: true, token: 'fill' },
];

const shipped = ({ theme, dark, token }) => {
  const vars = mergedVars(theme);
  return Array.from({ length: 12 }, (_, i) =>
    String(resolveTokenExpr(vars[`cat-${i + 1}-${token}`], vars, dark)).trim().toLowerCase());
};

describe('baked texture chips mirror their themes', () => {
  test('every mirrored ramp is declared', () => {
    assert.deepEqual(
      Object.keys(MIRRORED_RAMPS).sort(),
      MIRRORS.map((m) => m.ramp).sort(),
      'accessibility-textures.js exports a set of mirrored ramps this test does not cover — add the row, '
      + 'or the new ramp drifts from its theme unwatched, which is the whole defect this file exists for.',
    );
  });

  for (const mirror of MIRRORS) {
    test(`${mirror.ramp} matches ${mirror.theme} ${mirror.dark ? 'dark' : 'light'} --cat-N-${mirror.token}`, () => {
      const baked = MIRRORED_RAMPS[mirror.ramp].map((h) => h.toLowerCase());
      const theme = shipped(mirror);
      assert.equal(baked.length, 12, `${mirror.ramp} has ${baked.length} entries, not 12.`);
      const drifted = baked
        .map((h, i) => (h === theme[i] ? null : `slot ${i + 1}: baked ${h}, theme ${theme[i]}`))
        .filter(Boolean);
      assert.deepEqual(drifted, [],
        `${drifted.length} chip(s) in ${mirror.ramp} no longer match ${mirror.theme} `
        + `(${mirror.dark ? 'dark' : 'light'}):\n  ${drifted.join('\n  ')}\n`
        + 'Re-copy the ramp from the theme, then re-bless test/unit/core/texture-defs.golden.svg.');
    });
  }
});
