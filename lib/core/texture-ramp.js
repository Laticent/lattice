/**
 * texture-ramp — derive a categorical TEXTURE set from a theme's OWN fills.
 *
 * #1562. Only four texture sets exist (`engineering/textures.md`), and each bakes
 * a literal ramp in `accessibility-textures.js`: a11y grays, deeper chart grays,
 * onyx's grays, concrete's material tints. That is why `--cat-N-texture` cannot
 * join `REQUIRED_TOKENS` — a generated theme could only point at a set whose
 * colors were baked for a DIFFERENT palette, so a `brand-mono` theme in a
 * blue-green cycle would get gray chips contradicting its own `--cat-N-fill`.
 * A visible mismatch shipped to close a gate gap is worse than the gap.
 *
 * This module is the supply side of the fix: given a theme's own light and dark
 * `--cat-N-fill` ramps, produce the fills and the two overlay inks a pattern set
 * needs. It does NOT emit patterns and does NOT touch `texturePatternDefs()` —
 * that output is byte-locked against `texture-defs.golden.svg`, and changing it
 * is a separate, sign-off-bearing step. What is here is the part that had no
 * answer.
 *
 * WHERE THE INK NUMBERS COME FROM — the four shipped sets, measured, not invented.
 * Overlay-ink lightness against the mean fill lightness (OKLCH L):
 *
 *   light chips   onyx    −0.141      dark chips   a11y chart  +0.490
 *                 concrete −0.251                  onyx dark   +0.560
 *                 a11y     −0.557                  concrete    +0.465
 *
 * The dark arm agrees tightly across all three: ink sits about half a lightness
 * step ABOVE the chips. The light arm splits, and the split is documented in
 * `engineering/textures.md`: the two THEMED sets whisper (−0.14, −0.25) so the
 * dark label text on the chip stays the dominant mark, while a11y drives to
 * near-black (−0.557) because a CVD palette has no color channel to carry the
 * category and wants the texture loud. A derived theme is in the themed case, so
 * the light arm targets the whisper band and a11y stays hand-authored — which it
 * must anyway, being the iOS all-black-pie literal guard.
 *
 * THE INK CARRIES THE THEME'S HUE, at low chroma — WHEN THE RAMP HAS ONE. That is
 * the point of a per-theme set: a near-neutral ink drawn from the palette's own
 * fills reads as of-a-piece, where a shared gray reads as a foreign set bolted on.
 * A ramp with no meaningful chroma gets a TRUE neutral instead, because its "hue"
 * is 8-bit rounding rather than a fact about the palette — see `dominantHue`, which
 * records what going the other way produced. `concrete`'s light ramp is in the
 * second case (its hand-tuned `#8f8f8c` carries C = 0.0044, below perceptual
 * threshold); its DARK ramp carries real material tints and gets a hued ink.
 *
 * Pure: no fs, no deps beyond the color kernel — bundles for the browser.
 */

const { hexToOklch, oklchToHex, contrastRatio } = require('../theme/color.js');

/** Ink lightness relative to the mean chip lightness, per arm. See the header. */
const LIGHT_ARM_DELTA = -0.20;   // between onyx (−0.141) and concrete (−0.251)
const DARK_ARM_DELTA = 0.50;     // the three shipped dark arms agree at +0.465…+0.560

/** Keep the ink off both poles so it never becomes pure black/white on a themed set. */
const INK_L_MIN = 0.18;
const INK_L_MAX = 0.97;

/**
 * Near-neutral, but not neutral. High enough that the ink reads as the theme's
 * own gray rather than a foreign one; low enough that it never competes with the
 * chip as a second categorical signal. Applied only when the ramp is chromatic;
 * an achromatic ramp gets C = 0 exactly.
 */
const INK_CHROMA = 0.012;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Mean OKLCH lightness of a ramp. */
function meanLightness(fills) {
  if (!fills.length) throw new Error('texture-ramp: empty fill ramp');
  return fills.reduce((s, f) => s + hexToOklch(f).L, 0) / fills.length;
}

/**
 * Below this, a ramp is ACHROMATIC and its hue is not a fact about the palette.
 *
 * Measured, and the separation is unambiguous: across the 32 shipped themes the
 * chromatic ramps sit at C = 0.047…0.087 and the achromatic ones (onyx, the five
 * a11y palettes, concrete) at 0.00000…0.00345. There is no theme between 0.004
 * and 0.047.
 */
const ACHROMATIC_C = 0.01;

/**
 * The dominant hue of a ramp — the hue of its most CHROMATIC entry, or `null`
 * when the ramp carries no meaningful chroma at all.
 *
 * Most-chromatic rather than a circular mean: a mean over hues is meaningless for
 * a cycle that spans the wheel (indaco's twelve slots cover most of it) and would
 * land on an arbitrary angle, while the most saturated chip is the one a viewer
 * reads as "this theme's color".
 *
 * THE NULL CASE IS NOT A DETAIL. A first cut returned the most-chromatic hue
 * unconditionally and claimed a neutral ramp "returns hue 0, which at INK_CHROMA
 * is indistinguishable from gray". Both halves were false. sRGB gray round-trips
 * through OKLab at C ≈ 2e-8 with an essentially arbitrary hue, so onyx — a fully
 * achromatic palette — got an olive-tinted ink; and concrete, whose ramp is
 * neutral to within 8-bit rounding, selected between two slots differing by
 * 0.00001 chroma and produced a MAUVE at 326°, about 140° from the warm gray the
 * module claims to reproduce. Changing one hex digit in one slot flipped it to
 * green: a discontinuous, visible output from an imperceptible input. Hue 0 at
 * INK_CHROMA is not gray either — it is a pink cast.
 */
function dominantHue(fills) {
  let best = { C: -1, h: 0 };
  for (const f of fills) {
    const { C, h } = hexToOklch(f);
    if (C > best.C) best = { C, h };
  }
  return best.C < ACHROMATIC_C ? null : best.h;
}

/**
 * Which arm a ramp wants, from the chips themselves.
 *
 * 'light' means PALE CHIPS carrying dark labels, where the ink whispers; 'dark'
 * means DEEP CHIPS carrying light labels, where the ink reads. That is a fact
 * about the ramp's lightness, NOT about which slot of a `light-dark()` pair it
 * came from — and conflating the two is a real defect, not a wording slip.
 * `carbone` has no `light-dark()` on its fills and its single ramp is DARK
 * (mean L 0.367): given the light arm it derived a near-black `#121116` for deep
 * chips, inverted from every hand-tuned set and saved from going darker only by
 * INK_L_MIN. Picking the arm from the ramp puts it on the dark arm, where it
 * belongs.
 *
 * The 0.5 split is unambiguous on the real corpus: every light ramp sits at
 * L 0.77–0.90 and every dark one at 0.37–0.48.
 */
function armFor(fills) {
  return meanLightness(fills) > 0.5 ? 'light' : 'dark';
}

/**
 * The overlay ink for one arm of a theme's categorical ramp.
 *
 * `arm` is 'light' (pale chips carrying dark labels — the ink whispers) or 'dark'
 * (deep chips carrying light labels — the ink reads). Pass `armFor(fills)` unless
 * you are deliberately testing the other one.
 */
function deriveTextureInk(fills, arm) {
  if (arm !== 'light' && arm !== 'dark') throw new Error(`texture-ramp: unknown arm "${arm}"`);
  const L = clamp(
    meanLightness(fills) + (arm === 'light' ? LIGHT_ARM_DELTA : DARK_ARM_DELTA),
    INK_L_MIN,
    INK_L_MAX,
  );
  const h = dominantHue(fills);
  // An achromatic ramp gets a TRUE neutral, not a hue at INK_CHROMA. See dominantHue.
  return h === null ? oklchToHex({ L, C: 0, h: 0 }) : oklchToHex({ L, C: INK_CHROMA, h });
}

/**
 * The full texture set for a theme: its own fills, plus an ink per arm.
 *
 * `darkFills` may be omitted for a MODE-INVARIANT palette (the a11y family keeps
 * one literal set in every scheme); the set is then marked `static`, which is the
 * signal to use `patternSet` rather than `schemeAwarePatternSet`.
 */
function textureSetFrom({ lightFills, darkFills = null }) {
  if (!Array.isArray(lightFills) || !lightFills.length) {
    throw new Error('texture-ramp: lightFills is required and must be non-empty');
  }
  if (darkFills !== null && !Array.isArray(darkFills)) {
    throw new Error('texture-ramp: darkFills must be an array or null');
  }
  if (darkFills && darkFills.length !== lightFills.length) {
    throw new Error(
      `texture-ramp: ramp length mismatch — ${lightFills.length} light fills, ${darkFills.length} dark`,
    );
  }
  return {
    mode: darkFills ? 'schemeAware' : 'static',
    slots: lightFills.length,
    lightFills,
    darkFills,
    // The arm follows the CHIPS, not the slot — so `lightInk` is "the ink for the
    // light-MODE ramp" and `lightArm` says whether that ramp got the whisper or the
    // read treatment. They usually agree; `carbone`'s single ramp is dark, so its
    // lightInk is a DARK-arm ink. A caller banding contrast must band by the arm.
    lightArm: armFor(lightFills),
    lightInk: deriveTextureInk(lightFills, armFor(lightFills)),
    darkArm: darkFills ? armFor(darkFills) : null,
    darkInk: darkFills ? deriveTextureInk(darkFills, armFor(darkFills)) : null,
  };
}

/**
 * How the derived ink actually lands: the per-chip contrast range for each arm.
 *
 * Reported rather than asserted here, because the two arms want different things
 * and neither is a WCAG floor — texture is redundant encoding layered over a fill
 * that already carries the category, painted at 0.40/0.45 opacity, so the ratio
 * that matters is "visible without burying the label", not a threshold. The
 * shipped sets are the reference: light 1.05–2.82, dark 2.85–12.46.
 */
function inkContrastRange(set) {
  const range = (fills, ink) => {
    if (!ink) return null;
    const rs = fills.map((f) => contrastRatio(ink, f));
    return { min: Math.min(...rs), max: Math.max(...rs) };
  };
  return { light: range(set.lightFills, set.lightInk), dark: set.darkFills ? range(set.darkFills, set.darkInk) : null };
}

module.exports = {
  armFor,
  LIGHT_ARM_DELTA,
  ACHROMATIC_C,
  DARK_ARM_DELTA,
  INK_L_MIN,
  INK_L_MAX,
  INK_CHROMA,
  meanLightness,
  dominantHue,
  deriveTextureInk,
  textureSetFrom,
  inkContrastRange,
};
