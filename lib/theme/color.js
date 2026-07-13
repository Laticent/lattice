/**
 * Pure, dependency-free colour math — the SINGLE SOURCE of the colour
 * primitives shared by the Theme Studio (Workbench Faculty 1) and the WCAG
 * contrast gate. Two families live here:
 *
 *   1. WCAG sRGB luminance + contrast ratio. These are the EXACT functions
 *      the palette contrast gate (test/unit/palette/contrast.test.js) asserts
 *      with — extracted here so the Theme Studio's live contrast meter and the
 *      derivation's contrast-aware repair reuse the gate's own predicate
 *      rather than a drifting copy ("share, never duplicate", per CLAUDE.md).
 *
 *   2. OKLCH ↔ sRGB. Perceptually-uniform lightness/chroma/hue control, so the
 *      derivation can place the categorical cycle on the lightness contract's
 *      pale (L≈87) / deep (L≈32) tiers and rotate hue around the accent. OKLab
 *      is already the mixing space the shipped themes use (`color-mix(in oklab,
 *      …)` in cuoio.css), so this stays in-idiom.
 *
 * No `fs`, no `require` of anything in the repo — it bundles cleanly for the
 * browser, exactly like lib/authoring/lint-core.js.
 *
 * Sibling implementations / consumers:
 *   - test/unit/palette/contrast.test.js  (imports the WCAG trio)
 *   - lib/theme/contrast.js               (the audit / meter)
 *   - lib/theme/derive.js                 (contrast-aware derivation)
 */

// ── Hex ↔ RGB ──────────────────────────────────────────────────────────────

/** Normalize `#abc` / `abc` / `#aabbcc` / `aabbcc` → lowercase `#aabbcc`. */
function normalizeHex(hex) {
  const h = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`.toLowerCase();
  throw new Error(`not a hex color: ${hex}`);
}

/** `#aabbcc` (or 3-digit) → `[r, g, b]` in 0–255. */
function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** `[r, g, b]` in 0–255 (rounded, clamped) → `#aabbcc`. */
function rgbToHex(rgb) {
  const hex = rgb
    .map(v => {
      const n = Math.max(0, Math.min(255, Math.round(v)));
      // `('0' + …).slice(-2)`, not String.padStart (ES2017): this runs inside the old-browser
      // colour shim on engines down to Chrome 49 / Safari 9.1, below padStart (Chrome 57 / Safari 10).
      return `0${n.toString(16)}`.slice(-2);
    })
    .join('');
  return `#${hex}`;
}

// ── WCAG sRGB luminance + contrast (the gate's predicate) ───────────────────

/** Single sRGB channel (0–255) → linear-light component (0–1). */
function srgbChannelToLinear(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance from an `[r, g, b]` (0–255) triple. */
function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two hex colours, in [1, 21].
 * `(L_lighter + 0.05) / (L_darker + 0.05)`.
 */
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [hi, lo] = lA > lB ? [lA, lB] : [lB, lA];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA for normal text. */
const AA = 4.5;
/** AA for large text (≥18pt, or ≥14pt bold); AAA graphical floor is 3:1 too. */
const AA_LARGE = 3;
/** AAA for normal text. */
const AAA = 7;

// ── sRGB ↔ OKLab ↔ OKLCH (Björn Ottosson) ──────────────────────────────────

function linearToSrgbChannel(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}

/** `#aabbcc` → OKLab `{ L, a, b }` (L in 0–1). */
function hexToOklab(hex) {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = srgbChannelToLinear(r8);
  const g = srgbChannelToLinear(g8);
  const b = srgbChannelToLinear(b8);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab `{ L, a, b }` → linear-sRGB `[r, g, b]` (0–1), unclamped. */
function oklabToLinearRgb({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const TAU = Math.PI * 2;

/** `#aabbcc` → OKLCH `{ L, C, h }` (L 0–1, C ≥ 0, h in degrees 0–360). */
function hexToOklch(hex) {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 360) / TAU;
  if (h < 0) h += 360;
  return { L, C, h };
}

function oklchToOklab({ L, C, h }) {
  const rad = (h / 360) * TAU;
  return { L, a: Math.cos(rad) * C, b: Math.sin(rad) * C };
}

/** True if a linear-RGB triple sits inside the sRGB gamut (small epsilon). */
function inGamut(linear) {
  return linear.every(c => c >= -1e-4 && c <= 1 + 1e-4);
}

/**
 * OKLCH → `#aabbcc`, reducing chroma toward 0 (binary search) until the colour
 * fits the sRGB gamut. Lightness and hue are preserved; only chroma gives way —
 * the standard gamut-clip that keeps a colour recognizable.
 */
function oklchToHex({ L, C, h }) {
  let lo = 0;
  let hi = C;
  // If even C=0 is out of gamut (L outside [0,1]-ish), the clamp in rgbToHex
  // catches it; we still binary-search chroma for the common case.
  if (inGamut(oklabToLinearRgb(oklchToOklab({ L, C, h })))) {
    hi = C;
    lo = C;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinearRgb(oklchToOklab({ L, C: mid, h })))) lo = mid;
      else hi = mid;
    }
  }
  const linear = oklabToLinearRgb(oklchToOklab({ L, C: lo, h }));
  return rgbToHex(linear.map(linearToSrgbChannel));
}

// ── OKLCH-space manipulations ───────────────────────────────────────────────

/** Return `hex` with its OKLCH lightness replaced by `L` (0–1). */
function withLightness(hex, L) {
  const { C, h } = hexToOklch(hex);
  return oklchToHex({ L, C, h });
}

/** Return `hex` with its OKLCH chroma replaced by `C`. */
function withChroma(hex, C) {
  const { L, h } = hexToOklch(hex);
  return oklchToHex({ L, C, h });
}

/** Return `hex` with its OKLCH hue rotated by `deg` degrees. */
function rotateHue(hex, deg) {
  const { L, C, h } = hexToOklch(hex);
  return oklchToHex({ L, C, h: (((h + deg) % 360) + 360) % 360 });
}

/**
 * Perceptual distance (ΔE) between two hex colours in OKLab — the Euclidean
 * distance of their `{L, a, b}` coordinates. The categorical-distinctness
 * metric the audits use: ≈0.15 is "just about distinct" for adjacent slots
 * (tools/contrast-audit.js, tools/cvd-audit.js).
 */
function oklabDistance(hexA, hexB) {
  const A = hexToOklab(hexA);
  const B = hexToOklab(hexB);
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

/**
 * Perceptual mix of two hex colours in OKLab. `t` is the weight of `hexB`
 * (0 → hexA, 1 → hexB). Mirrors CSS `color-mix(in oklab, …)`.
 */
function mix(hexA, hexB, t) {
  const A = hexToOklab(hexA);
  const B = hexToOklab(hexB);
  const lin = oklabToLinearRgb({
    L: A.L + (B.L - A.L) * t,
    a: A.a + (B.a - A.a) * t,
    b: A.b + (B.b - A.b) * t,
  });
  return rgbToHex(lin.map(linearToSrgbChannel));
}

// ── Contrast-aware helpers (the derivation's repair primitives) ─────────────

/**
 * Pick whichever of two candidate inks contrasts better with `bg`. Defaults
 * to white vs a near-black espresso, matching the engine's `--on-accent`
 * decision (white on dark accents, dark ink on pale accents).
 */
function pickInk(bg, dark = '#111111', light = '#ffffff') {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/**
 * Adjust `fg`'s OKLCH lightness — monotonically darker OR lighter — until it
 * clears `target` contrast against `bg`, or the lightness rail is exhausted.
 * `direction: 'auto'` picks the side that already has headroom (darken on a
 * light bg, lighten on a dark bg). Returns the repaired hex (best effort).
 */
function ensureContrast(fg, bg, target = AA, direction = 'auto') {
  if (contrastRatio(fg, bg) >= target) return fg;

  const bgL = hexToOklch(bg).L;
  const dir = direction === 'auto' ? (bgL >= 0.5 ? 'darken' : 'lighten') : direction;
  const { C, h } = hexToOklch(fg);

  let best = fg;
  let bestRatio = contrastRatio(fg, bg);
  // March lightness in fine steps toward the high-contrast end.
  for (let i = 1; i <= 100; i++) {
    const L = dir === 'darken' ? Math.max(0, hexToOklch(fg).L - i * 0.01) : Math.min(1, hexToOklch(fg).L + i * 0.01);
    const cand = oklchToHex({ L, C, h });
    const ratio = contrastRatio(cand, bg);
    if (ratio > bestRatio) {
      best = cand;
      bestRatio = ratio;
    }
    if (ratio >= target) return cand;
    if (L === 0 || L === 1) break;
  }
  return best; // couldn't fully reach target; return the best we found
}

module.exports = {
  // hex / rgb
  normalizeHex,
  hexToRgb,
  rgbToHex,
  // WCAG
  srgbChannelToLinear,
  linearToSrgbChannel,
  relativeLuminance,
  contrastRatio,
  AA,
  AA_LARGE,
  AAA,
  // OKLCH
  hexToOklab,
  hexToOklch,
  oklchToHex,
  withLightness,
  withChroma,
  rotateHue,
  mix,
  oklabDistance,
  // repair
  pickInk,
  ensureContrast,
};
