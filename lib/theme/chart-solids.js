/**
 * THE CHART SOLID SOLVERS — the moves that turn a seed color into a chart solid under ONE INK: every chart fill, a
 * category or a status, is deep enough to carry white text (engineering/chart-styling.md §3).
 *
 *   - a CATEGORY or the neutral: `deepFill` on the light face, `midFill` on the dark face (the lightest tone white
 *     still clears, so it stands off a dark slide).
 *   - a STATUS: `solveStatusSet`, the same two faces in the status's own hue at the status's own chroma, plus an EDGE
 *     (the ink a status line or status text paints) and, for the two exceptions, a SIGNAL (the bright ring that marks
 *     an at-risk or blocked shape, so an exception never relies on its fill alone).
 *
 * Pure and fs-free, so the curated themes (tools/curate-chart-solids.js) and the Studio's generated ones
 * (lib/theme/derive.js, bundled for the browser by tools/build-theme-core.js) solve with the same functions.
 */
const { contrastRatio, ensureContrast, hexToOklch, oklchToHex } = require('./color.js');

const WHITE = '#FFFFFF';
/** The bars, each with a small margin so a round-trip through hex cannot land under it. */
const TEXT_ON_SOLID = 7.05;
/** White on a dark-face fill: AA with headroom. */
const CAT_DARK = 4.6;
/** A status edge clears AA off the slide, because it serves as status TEXT and as a status LINE. */
const EDGE = 4.6;
/**
 * A signal ring has two neighbors, the fill inside it and the slide outside, and clears 3:1 (WCAG 1.4.11, with a
 * margin) against the one OPPOSITE it in lightness. On a light slide that is the deep fill. On a dark slide it is the
 * slide, which a bright ring clears many times over, so there the ring only has to step 2:1 off its mid-tone fill, and
 * keeps its color: a ring held to 3:1 off a mid-tone fill washes out to near white.
 */
const SIGNAL = 3.2;
const SIGNAL_DARK_FILL = 2;

/**
 * Each status's white-text bar on the light face. At risk and info sit at the floor, the most luminous a fill under
 * white can be; blocked a step deeper, so the two exceptions are never one gray; done deepest, because a settled
 * status should be the quietest mark on the slide; deferred between.
 *
 * The dark face has far less room: a fill must clear 4.6:1 under white and stand 3:1 off the slide, a band of about
 * 0.07 OKLab lightness on a near-black slide, less on a lifted one. So each status takes a fixed POSITION across the
 * band its slide leaves (`DARK_SPREAD`, 0 at the white bar, 1 at the slide's limit), in the same order.
 *
 * Measured against the bright scheme it replaced, this spread RAISES the worst-separated status pair under every
 * colorblind condition across the brand palettes (cvd-trio-floor.test.js § THE STATUS FILLS); the drawn marks and the
 * signal rings carry the rest.
 */
const STATUS_BAR = {
  pass: [10],
  warn: [TEXT_ON_SOLID],
  fail: [8.5],
  info: [TEXT_ON_SOLID],
  mute: [8],
};
const DARK_SPREAD = { warn: 0, info: 0, fail: 0.5, mute: 0.5, pass: 1 };

/**
 * Each status's chroma, for a palette of average saturation (a theme scales it by its own strength). Muted keeps done
 * a quiet SAGE and lets the exceptions carry the color: a burnt orange and a crimson. Vivid makes every status rich,
 * done an emerald, for a deck that celebrates its wins. Deferred is a neutral and has no intensity.
 */
const STATUS_CHROMA = {
  muted: { pass: 0.06, warn: 0.12, fail: 0.19, info: 0.09 },
  vivid: { pass: 0.13, warn: 0.16, fail: 0.22, info: 0.13 },
};
const MUTE_CHROMA = 0.012;
const SIGNAL_CHROMA = 0.17;

/**
 * Where each status's hue may sit. Warn is a BURNT ORANGE (an amber deep enough for white text turns brown); fail a
 * CRIMSON; pass stays green, short of teal; info owns the cyan band, apart from a category blue and a pass green. The
 * signals keep the classic hues: an amber ring for at risk, a coral-red ring for blocked.
 */
const HUE_BAND = { pass: [120, 165], warn: [45, 62], fail: [10, 30], info: [200, 235] };
const SIGNAL_BAND = { warn: [65, 85], fail: [20, 40] };
const clampHue = (h, [lo, hi]) => Math.min(hi, Math.max(lo, h));

const inGamut = (x, C) => Math.abs(hexToOklch(x).C - C) <= 0.012;

/** A DEEP fill under white at `min`: the seed's hue and chroma, lightness lowered only as far as the bar needs. */
function deepFill(seed, min = TEXT_ON_SOLID) {
  return ensureContrast(seed, WHITE, min, 'darken').toUpperCase();
}

/** The LIGHTEST tone of hue `h` at chroma `C` (lowered only for gamut) that white still clears at `min`. */
function toneUnderWhite(h, C, min) {
  for (let k = C; k >= 0; k -= 0.005) {
    for (let L = 0.85; L > 0.15; L -= 0.002) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      if (contrastRatio(x, WHITE) >= min) return x.toUpperCase();
    }
  }
  throw new Error(`no tone of hue ${Math.round(h)} carries white at ${min}:1`);
}

/**
 * A dark-face category: the LIGHTEST tone of the hue that white still clears at `min` (4.6:1 by default). Chroma is
 * the seed's, lowered only where the gamut runs out; a gray stays gray (its hue is noise, and lifting its chroma would
 * tint it).
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
 * bright fill needs, so a saturated mint there reads as neon, not as a status. A bright tone in that band is held to
 * NEON_CHROMA.
 */
const NEON_BAND = [140, 200];
const NEON_CHROMA = 0.13;

/**
 * A BRIGHT tone against `ink` at `min`: hue `h` at chroma `C` (lowered only for gamut), the lowest lightness from
 * `fromL` up that clears. A ring passes its fill's own lightness, so it can only come out brighter than the fill.
 */
function brightFill(h, C, ink, min, fromL = 0.4) {
  const cap = h >= NEON_BAND[0] && h <= NEON_BAND[1] ? Math.min(C, NEON_CHROMA) : C;
  for (let k = cap; k >= 0; k -= 0.005) {
    for (let L = fromL; L <= 0.99; L += 0.002) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      if (contrastRatio(x, ink) >= min) return x.toUpperCase();
    }
  }
  throw new Error(`no tone at hue ${Math.round(h)} clears ${min}:1 against ${ink}`);
}

/**
 * A status edge: the fill's hue, moved (darker on a light slide, lighter on a dark one) only as far as it needs to
 * clear 4.6:1 off every slide surface. A neutral stays neutral. `strict: false` is the Studio's policy
 * (lib/theme/derive.js never throws mid-edit): where no shade clears every surface, it returns the shade with the
 * best worst case.
 */
function edgeFor(fill, surfaces, { strict = true } = {}) {
  const { h, C, L: L0 } = hexToOklch(fill);
  const darkSlide = surfaces.every((s) => hexToOklch(s).L < 0.5);
  const step = darkSlide ? 0.003 : -0.003;
  const c = C < 0.03 ? C : Math.min(Math.max(C, 0.06), 0.16);
  let best = null;
  for (let k = c; k >= 0; k -= 0.005) {
    for (let L = L0; L > 0.1 && L < 0.99; L += step) {
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

/**
 * THE COLORBLIND PALETTES' DARK FACE. Under white text a dark-face fill has 0.10 of lightness to work in (white at
 * 4.6:1 above, 3:1 off a black slide below), and achromatopsia needs 0.22 to keep three statuses apart. So the `a11y-*`
 * palettes, all of them alike, turn the dark face around: every chart fill is BRIGHT under a near-black ink. It is
 * still one ink per slide, and the bright band holds 0.3 of lightness. `BRIGHT_BAR` is each fill's bar under that ink.
 */
const DARK_INK = '#1A1A1A';
const BRIGHT_BAR = { pass: TEXT_ON_SOLID, warn: TEXT_ON_SOLID, fail: TEXT_ON_SOLID, info: TEXT_ON_SOLID, mute: 8 };

/** A DEEP tone of hue `h` below `fromL` that clears `min` against `against` and 2:1 off every surface in `off`. */
function deepRing(h, C, against, min, fromL, off) {
  for (let k = C; k >= 0; k -= 0.005) {
    for (let L = fromL; L > 0.1; L -= 0.002) {
      const x = oklchToHex({ L, C: k, h });
      if (k > 0.012 && !inGamut(x, k)) continue;
      if (contrastRatio(x, against) >= min && off.every((bg) => contrastRatio(x, bg) >= SIGNAL_DARK_FILL)) return x.toUpperCase();
    }
  }
  throw new Error(`no deep ring at hue ${Math.round(h)} clears ${min}:1 against ${against}`);
}

/**
 * ONE THEME'S STATUS SET. `hue` holds each status's seed hue (pass, warn, fail, info, mute); `strength` scales the
 * chroma to the palette's own saturation; `light` and `dark` are each face's slide surfaces. `override` replaces any
 * muted fill pair (the colorblind palettes solve their trio against their own condition). Returns the declarations,
 * `{ token: [light, dark] }`:
 *   --X-solid / --X-solid-vivid   the fill, deep under white on both faces (no vivid for mute)
 *   --X-solid-edge                a status line or status text: the light fill where it clears the slide, and on the
 *                                 dark face a lifted tone of the hue
 *   --warn-solid-signal / --fail-solid-signal   the ring on an exception: the bright classic hue (SIGNAL above)
 */
function solveStatusSet({ hue, strength = 1, light, dark, override = {}, strict = true, darkInk = WHITE }) {
  const out = {};
  // The dark face's fills sit under `darkInk`: white (deep fills, the default) or the colorblind palettes' near-black
  // (bright fills, DARK_INK above).
  const brightDark = darkInk !== WHITE;
  // A deep dark-face fill sits at its DARK_SPREAD position between the white bar (4.6:1) and the deepest tone that
  // still stands 3:1 off the slide (`dark[0]`, the `--bg` every fill gate measures against).
  const darkTone = (hh, C, s) => {
    if (brightDark) return brightFill(hh, C, darkInk, BRIGHT_BAR[s]);
    let deepest = CAT_DARK;
    while (deepest < 21 && contrastRatio(toneUnderWhite(hh, C, deepest + 0.05), dark[0]) >= 3.05) deepest += 0.05;
    return toneUnderWhite(hh, C, CAT_DARK + DARK_SPREAD[s] * (deepest - CAT_DARK));
  };
  const h = {
    pass: clampHue(hue.pass, HUE_BAND.pass),
    warn: clampHue(hue.warn, HUE_BAND.warn),
    fail: clampHue(hue.fail, HUE_BAND.fail),
    info: clampHue(hue.info, HUE_BAND.info),
  };
  const fills = {};
  for (const s of ['pass', 'warn', 'fail', 'info']) {
    const [barLight] = STATUS_BAR[s];
    const pair = (C) => [toneUnderWhite(h[s], C * strength, barLight), darkTone(h[s], C * strength, s)];
    const muted = override[s] ?? pair(STATUS_CHROMA.muted[s]);
    const vivid = override[s] ?? pair(STATUS_CHROMA.vivid[s]);
    fills[s] = muted;
    out[`${s}-solid`] = muted;
    out[`${s}-solid-vivid`] = vivid;
  }
  const mute = override.mute ?? [toneUnderWhite(hue.mute, MUTE_CHROMA, STATUS_BAR.mute[0]), darkTone(hue.mute, MUTE_CHROMA, 'mute')];
  fills.mute = mute;
  out['mute-solid'] = mute;
  for (const s of ['pass', 'warn', 'fail', 'info', 'mute']) {
    out[`${s}-solid-edge`] = [edgeFor(fills[s][0], light, { strict }), edgeFor(fills[s][1], dark, { strict })];
  }
  // THE RING IS THE STATUS COLOR AT THE OPPOSITE LIGHTNESS TO ITS FILL (muted and vivid share a lightness, so either).
  // A deep fill takes a bright ring: 3:1 off the fill on the light face; on the dark face 3:1 off the slide and 2:1
  // off the fill. A bright fill (the colorblind palettes' dark face) takes a deep ring: 3:1 off the fill and 2:1 off
  // the slide.
  for (const s of ['warn', 'fail']) {
    const sh = clampHue(hue[s], SIGNAL_BAND[s]);
    const C = SIGNAL_CHROMA * strength;
    const above = (face) => hexToOklch(fills[s][face]).L;
    const lightRing = brightFill(sh, C, fills[s][0], SIGNAL, above(0));
    let darkRing;
    if (brightDark) darkRing = deepRing(sh, C, fills[s][1], SIGNAL, above(1), dark);
    else {
      darkRing = brightFill(sh, C, fills[s][1], SIGNAL_DARK_FILL, above(1));
      for (const bg of dark) if (contrastRatio(darkRing, bg) < SIGNAL) darkRing = brightFill(sh, C, bg, SIGNAL, hexToOklch(darkRing).L);
    }
    // Where one tone serves both faces, the dark face steps one notch brighter, so the pair stays a pair (a theme
    // never flattens a base light-dark() token, paired-token-parity.test.js).
    if (!brightDark && darkRing === lightRing) darkRing = brightFill(sh, C, fills[s][1], contrastRatio(lightRing, fills[s][1]) + 0.15, above(1));
    out[`${s}-solid-signal`] = [lightRing, darkRing];
  }
  return out;
}

module.exports = {
  deepFill, midFill, toneUnderWhite, brightFill, edgeFor, solveStatusSet, DARK_INK, BRIGHT_BAR,
  STATUS_BAR, DARK_SPREAD, STATUS_CHROMA, HUE_BAND, SIGNAL_BAND, TEXT_ON_SOLID, CAT_DARK, EDGE, SIGNAL, SIGNAL_DARK_FILL,
};
