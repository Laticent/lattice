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
 * THE INK CARRIES THE THEME'S HUE, at low chroma. That is the whole point: a
 * near-neutral ink drawn from the palette's own fills reads as of-a-piece, where
 * a shared gray reads as a foreign set bolted on. `concrete`'s hand-tuned
 * `#8f8f8c` is exactly this — a warm gray, not a neutral one.
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
 * chip as a second categorical signal. `concrete`'s hand-tuned #8f8f8c sits at
 * about this chroma.
 */
const INK_CHROMA = 0.012;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Mean OKLCH lightness of a ramp. */
function meanLightness(fills) {
  if (!fills.length) throw new Error('texture-ramp: empty fill ramp');
  return fills.reduce((s, f) => s + hexToOklch(f).L, 0) / fills.length;
}

/**
 * The dominant hue of a ramp, as the hue of its most CHROMATIC entry rather than
 * a circular mean. A mean over hues is meaningless for a cycle that spans the
 * wheel (indaco's twelve slots cover most of it) and would land on an arbitrary
 * angle; the most saturated chip is the one a viewer reads as "this theme's
 * color". A fully neutral ramp (onyx, the a11y sets) returns hue 0, which at
 * INK_CHROMA is indistinguishable from gray — correct for those.
 */
function dominantHue(fills) {
  let best = { C: -1, h: 0 };
  for (const f of fills) {
    const { C, h } = hexToOklch(f);
    if (C > best.C) best = { C, h };
  }
  return best.h;
}

/**
 * The overlay ink for one arm of a theme's categorical ramp.
 *
 * `arm` is 'light' (pale chips carrying dark labels — the ink whispers) or 'dark'
 * (deep chips carrying light labels — the ink reads).
 */
function deriveTextureInk(fills, arm) {
  if (arm !== 'light' && arm !== 'dark') throw new Error(`texture-ramp: unknown arm "${arm}"`);
  const L = clamp(
    meanLightness(fills) + (arm === 'light' ? LIGHT_ARM_DELTA : DARK_ARM_DELTA),
    INK_L_MIN,
    INK_L_MAX,
  );
  return oklchToHex({ L, C: INK_CHROMA, h: dominantHue(fills) });
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
    lightInk: deriveTextureInk(lightFills, 'light'),
    darkInk: darkFills ? deriveTextureInk(darkFills, 'dark') : null,
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
  LIGHT_ARM_DELTA,
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
