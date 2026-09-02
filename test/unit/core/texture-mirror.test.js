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
  // The chart family's own spectrum, and the one this file originally missed. The
  // declaration's comment governs CAT_FILLS and CHART_FILLS together and names
  // `--chart-catN` explicitly, but only the categorical half was covered — so a
  // re-tune of a11y-base's chart ramp (plausible: this change just re-tuned the
  // neighboring --cat-N block in the same file) would have drifted the native pie
  // wedge away from its texture chip with every gate green.
  { ramp: 'CHART_FILLS', theme: 'a11y-base', dark: false, token: 'chart', slots: 8 },
  { ramp: 'CAT_FILLS_DARK', theme: 'onyx', dark: true, token: 'fill' },
  { ramp: 'CONCRETE_FILLS_LIGHT', theme: 'concrete', dark: false, token: 'fill' },
  { ramp: 'CONCRETE_FILLS_DARK', theme: 'concrete', dark: true, token: 'fill' },
];

const shipped = ({ theme, dark, token, slots = 12 }) => {
  const vars = mergedVars(theme);
  const name = (i) => (token === 'chart' ? `chart-cat${i + 1}` : `cat-${i + 1}-${token}`);
  return Array.from({ length: slots }, (_, i) =>
    String(resolveTokenExpr(vars[name(i)], vars, dark)).trim().toLowerCase());
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
    const label = mirror.token === 'chart' ? '--chart-catN' : `--cat-N-${mirror.token}`;
    test(`${mirror.ramp} matches ${mirror.theme} ${mirror.dark ? 'dark' : 'light'} ${label}`, () => {
      const baked = MIRRORED_RAMPS[mirror.ramp].map((h) => h.toLowerCase());
      const theme = shipped(mirror);
      const slots = mirror.slots ?? 12;
      assert.equal(baked.length, slots, `${mirror.ramp} has ${baked.length} entries, not ${slots}.`);
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
