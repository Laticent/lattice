/**
 * THE POLARITY SOLVERS — the four moves that turn a seed color into a chart solid under the rule "text color carries
 * the kind" (engineering/chart-styling.md §3).
 *
 *   - a CATEGORY or the neutral is a DEEP fill under white: `deepFill` on the light face, `midFill` on the dark face
 *     (the lightest tone white still clears, so it stands off a dark slide).
 *   - a STATUS is a BRIGHT fill under near-black: `brightFill`, and its EDGE (`edgeFor`), the same hue deep enough to
 *     rim the bright fill and to serve as the status line and text.
 *
 * Pure and fs-free, so the curated themes (tools/curate-chart-solids.js) and the Studio's generated ones
 * (lib/theme/derive.js, bundled for the browser by tools/build-theme-core.js) solve with the same functions.
 */
const { contrastRatio, ensureContrast, hexToOklch, oklchToHex } = require('./color.js');

const WHITE = '#FFFFFF';
/** The bars, each with a small margin so a round-trip through hex cannot land under it. */
const TEXT_ON_SOLID = 7.05;
/** White on a dark-face category: AA with headroom. */
const CAT_DARK = 4.6;
/** Near-black on a dark-face status fill. */
const STATUS_DARK = 9;
/** A status edge clears AA off the slide, because it also serves as status TEXT and as a status LINE. */
const EDGE = 4.6;

/**
 * THE TRIO SPREADS IN LIGHTNESS. Three bright fills at one lightness are one gray to a reader without color vision
 * (measured on the first cut: achromatopsia median 0.000 OKLab across the brand palettes, from 0.085). So each status
 * fill is solved at its own text bar, light face and dark face: fail at the floor, pass a step up, warn (amber is light
 * by nature) brightest. Info sits at the floor beside them.
 */
const STATUS_BAR = {
  fail: [TEXT_ON_SOLID, STATUS_DARK],
  pass: [8.6, 10.3],
  warn: [10.4, 11],
  info: [TEXT_ON_SOLID, STATUS_DARK],
};

const inGamut = (x, C) => Math.abs(hexToOklch(x).C - C) <= 0.012;

/** A DEEP fill under white at `min`: the seed's hue and chroma, lightness lowered only as far as the bar needs. */
function deepFill(seed, min = TEXT_ON_SOLID) {
  return ensureContrast(seed, WHITE, min, 'darken').toUpperCase();
}

/**
 * A dark-face category: the LIGHTEST tone of the hue that white still clears at `min` (4.6:1 by default). Chroma is the seed's, lowered
 * only where the gamut runs out; a gray stays gray (its hue is noise, and lifting its chroma would tint it).
 */
function midFill(seed, min = CAT_DARK) {
  const { h, C } = hexToOklch(seed);
  // Grays have only lightness to tell them apart, and the lightest tone under white is the same gray for all of them.
  // So a gray keeps its light-face ORDER on the dark face: the deeper it was, the deeper it goes (half its light-face
  // ratio under white, held to 6.6:1 so the deepest still clears 3:1 off a black slide), and a monochrome palette's
  // grays stay as distinct as lightness alone allows (chart-contrast.test.js).
  if (C < 0.02) min = Math.max(min, Math.min(6.6, contrastRatio(seed, WHITE) / 2));
  for (let k = C < 0.02 ? C : Math.min(Math.max(C, 0.03), 0.2); k >= 0; k -= 0.005) {
    for (let L = 0.75; L > 0.2; L -= 0.003) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      if (contrastRatio(x, WHITE) >= min) return x.toUpperCase();
    }
  }
  throw new Error(`no dark-face tone of ${seed} carries white at ${min}:1`);
}

/**
 * THE NEON BAND. Between green and cyan (OKLCH hue 140-200) sRGB holds a great deal of chroma at the lightness a
 * bright fill needs, so a saturated mint there reads as neon, not as a status (laguna's dark vivid green did). A fill
 * in that band is held to NEON_CHROMA.
 */
const NEON_BAND = [140, 200];
const NEON_CHROMA = 0.13;

/** A BRIGHT fill under `ink` at `min`: hue `h` at chroma `C` (lowered only for gamut), the lowest lightness that clears. */
function brightFill(h, C, ink, min) {
  const cap = h >= NEON_BAND[0] && h <= NEON_BAND[1] ? Math.min(C, NEON_CHROMA) : C;
  for (let k = cap; k >= 0; k -= 0.005) {
    for (let L = 0.55; L <= 0.99; L += 0.002) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      if (contrastRatio(x, ink) >= min) return x.toUpperCase();
    }
  }
  throw new Error(`no fill at hue ${Math.round(h)} clears ${min}:1 under ${ink}`);
}

/**
 * A status edge: the fill's hue, deep enough to clear 4.6:1 off every slide surface. A neutral stays neutral.
 * `strict: false` is the Studio's policy (lib/theme/derive.js never throws mid-edit): where no shade clears every
 * surface (a canvas pair that straddles, near-white beside near-black), it returns the shade with the best worst case.
 */
function edgeFor(fill, surfaces, { strict = true } = {}) {
  const { h, C, L: L0 } = hexToOklch(fill);
  const c = C < 0.03 ? C : Math.min(Math.max(C, 0.06), 0.16);
  let best = null;
  for (let k = c; k >= 0; k -= 0.005) {
    for (let L = L0; L > 0.1; L -= 0.003) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      const worst = Math.min(...surfaces.map((s) => contrastRatio(x, s)));
      if (worst >= EDGE) return x.toUpperCase();
      if (!best || worst > best.worst) best = { worst, hex: x.toUpperCase() };
    }
  }
  if (strict || !best) throw new Error(`no edge for ${fill} clears ${EDGE}:1`);
  return best.hex;
}

module.exports = { deepFill, midFill, brightFill, edgeFor, STATUS_BAR, TEXT_ON_SOLID, CAT_DARK, STATUS_DARK, EDGE };
