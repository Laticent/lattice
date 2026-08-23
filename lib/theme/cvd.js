/**
 * Colour-vision-deficiency (CVD) simulation — pure, dependency-free.
 *
 * Given a colour, return what a viewer with a given dichromacy would perceive.
 * This is the measurement primitive the colour-blindness accessibility work is
 * built on (engineering/decisions/2026-06-16-colour-blindness-accessibility.md):
 * you cannot hand-curate a palette that "stays separable under deuteranopia" by
 * eye, so the audit gate simulates each deficiency and measures whether adjacent
 * categories survive.
 *
 * Algorithm: Machado, Oliveira & Fernandes (2009), "A Physiologically-based
 * Model for Simulation of Color Vision Deficiency" (IEEE TVCG). Each deficiency
 * is a single 3×3 matrix applied to LINEAR-light RGB. We use the severity-1.0
 * (full dichromacy) matrices — the worst case, which is what a "does it collapse"
 * gate must assert against. The matrices' rows sum to 1, so achromatic colours
 * (R=G=B) are preserved exactly; that invariant is asserted in the unit test.
 *
 * Application space: the Machado matrices are derived for linear RGB, so we
 * linearize (sRGB → linear), apply the matrix, then re-encode (linear → sRGB).
 * Applying to gamma-encoded sRGB directly — as several web simulators do — is a
 * common shortcut but not what the model specifies; we take the principled path.
 * (See the DaltonLens analysis of open-source CVD simulators.)
 *
 * Sibling implementations / consumers:
 *   - lib/theme/color.js                  (the colour primitives reused here)
 *   - tools/cvd-audit.js                  (per-theme collapse report, all four conditions)
 *   - test/unit/palette/theme-cvd.test.js (the simulation's properties)
 */

const {
  hexToRgb,
  rgbToHex,
  srgbChannelToLinear,
  linearToSrgbChannel,
  relativeLuminance,
  oklabDistance,
} = require('./color.js');

// ── Machado 2009 severity-1.0 matrices (linear-RGB, row-major) ───────────────

const MACHADO = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

/** The dichromacy types this module simulates (v1 scope). */
const CVD_TYPES = Object.freeze(['protanopia', 'deuteranopia', 'tritanopia']);

/**
 * ACHROMATOPSIA — total color blindness, a MONOCHROMACY rather than a dichromacy,
 * so it is deliberately NOT in `CVD_TYPES`: that list is the three Machado
 * matrices, and a unit test pins it as exactly the three. Added for #1715, where
 * `a11y-achromatopsia`'s syntax family has to be measured under the condition the
 * palette is named for and there was no primitive for it.
 *
 * `tools/cvd-audit.js` loops `SIMULATED_TYPES`, not `CVD_TYPES` — it gained the
 * monochromacy arm in the follow-on #1715 §9 asked for, with its own lower collapse
 * floor (only lightness survives, so the reachable ΔE is smaller). Widening the audit
 * is not license to widen `CVD_TYPES`.
 *
 * There is no Machado matrix for it because it is not a matrix problem: with no
 * functioning cones, only LUMINANCE survives. So the simulation is WCAG relative
 * luminance (the same `relativeLuminance` the contrast gates use, not an ad-hoc
 * 0.299/0.587/0.114 average) re-encoded to a neutral sRGB gray. Like the Machado
 * matrices this preserves achromatic input exactly — `#767676` maps to itself —
 * which is the same invariant the dichromacies are tested for.
 */
const ACHROMATOPSIA = 'achromatopsia';

/** Every condition `simulate` accepts, dichromacies plus the monochromacy. */
const SIMULATED_TYPES = Object.freeze([...CVD_TYPES, ACHROMATOPSIA]);

/**
 * Short aliases → canonical type names, so callers can pass either the clinical
 * `-anopia` name (front-matter / docs vocabulary) or the common short form.
 */
const TYPE_ALIASES = {
  achroma: ACHROMATOPSIA,
  achromatopsia: ACHROMATOPSIA,
  monochromacy: ACHROMATOPSIA,
  protan: 'protanopia',
  protanope: 'protanopia',
  deutan: 'deuteranopia',
  deuteranope: 'deuteranopia',
  tritan: 'tritanopia',
  tritanope: 'tritanopia',
};

function canonicalType(type) {
  const t = String(type).trim().toLowerCase();
  if (t === 'normal' || t === 'none') return 'normal';
  if (MACHADO[t]) return t;
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  throw new Error(`unknown CVD type: ${type} (expected one of ${SIMULATED_TYPES.join(', ')}, or normal)`);
}

/**
 * Simulate how `hex` appears under colour-vision deficiency `type`
 * (`'protanopia'` | `'deuteranopia'` | `'tritanopia'` | `'achromatopsia'`, or an
 * alias; `'normal'` is the identity). Returns a `#rrggbb` hex.
 */
function simulate(hex, type) {
  const canon = canonicalType(type);
  if (canon === 'normal') return rgbToHex(hexToRgb(hex)); // normalize, no transform
  if (canon === ACHROMATOPSIA) {
    // No cones, so no matrix: only luminance survives. WCAG relative luminance is
    // already linear-light, so it re-encodes straight back through the same
    // sRGB transfer function the dichromacies use.
    const y = linearToSrgbChannel(relativeLuminance(hexToRgb(hex)));
    return rgbToHex([y, y, y]);
  }
  const M = MACHADO[canon];

  // sRGB (0–255) → linear (0–1)
  const lin = hexToRgb(hex).map(srgbChannelToLinear);

  // Apply the 3×3 deficiency matrix in linear space.
  const out = M.map(row => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);

  // linear → sRGB (0–255); rgbToHex clamps out-of-gamut channels.
  return rgbToHex(out.map(linearToSrgbChannel));
}

/**
 * Perceptual distance between two colours *as seen under* deficiency `type` —
 * the OKLab ΔE of their simulated forms. The reading the audit gate cares about:
 * two categories that are far apart to a normal-sighted viewer but collapse to
 * the same colour under a deficiency score near 0 here.
 */
function distanceUnder(hexA, hexB, type) {
  return oklabDistance(simulate(hexA, type), simulate(hexB, type));
}

module.exports = {
  CVD_TYPES,
  ACHROMATOPSIA,
  SIMULATED_TYPES,
  MACHADO,
  canonicalType,
  simulate,
  distanceUnder,
};
