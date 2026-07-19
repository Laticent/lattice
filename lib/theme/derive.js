/**
 * Theme Studio derivation — pure, fs-free.
 *
 * Takes a small, author-facing ESSENTIAL SET and derives the full Lattice
 * token contract (design/theming.md), CONTRAST-AWARE: every token the palette
 * gate asserts (the categorical pale/deep tiers vs. their paired ink, heading
 * on the canvases, the alarm fill vs. white) is repaired to clear WCAG AA in
 * BOTH canvas modes before it is returned. The output is a flat
 * `{ name: value }` map (names without `--`) that `lib/theme/serialize.js`
 * renders to a `themes/<name>.css` file and `lib/theme/contrast.js` audits.
 *
 * Derivation is the head start, not a cage: an author can override any derived
 * token afterwards (the studio reveals them). The model, when wired, only ever
 * proposes an ESSENTIAL SET — this deterministic core turns it into a valid,
 * complete, contrast-clean theme. No model is required to run this.
 */

const {
  hexToOklch,
  oklchToHex,
  withLightness,
  withChroma,
  mix,
  pickInk,
  ensureContrast,
  normalizeHex,
  AA,
  AA_LARGE,
} = require('./color.js');

// ── The essential set (author-facing inputs) ────────────────────────────────

/** Keys an essential set must carry. */
const ESSENTIAL_KEYS = Object.freeze([
  'bg', 'bgAlt', // light surfaces
  'textHeading', 'textBody', 'textMuted', // ink trio
  'accent', 'accentSoft', // brand
  'pass', 'warn', 'fail', // semantic signals
]);

/** The categorical THREE-LAYER FLIPPING contract's per-mode tiers (design/theming.md,
 * engineering/decisions/2026-07-15-categorical-token-contract.md). Each slot is one hue
 * rendered as a flipping light-dark() pair: LIGHT = pale chromatic fill + deep mark;
 * DARK = dark jewel fill + pale mark. The inks flip with the fill so the label stays
 * legible on both, and every tier is contrast-repaired IN ITS MODE to hold ① mark-vs-bg
 * ≥ 3 (graphical), ③ ink-vs-fill ≥ 4.5 (label), fill ≠ mark. (Pre-#1022 this was a single
 * non-flipping pale/deep pair with a fixed dark ink — which left dark-mode marks ~2.7:1
 * vs the dark canvas, below the graphical floor.) */
const PALE_L = 0.9; // LIGHT fill — pale tier, perceptual L (≈ the L≈87 sRGB tier)
const DEEP_L = 0.45; // LIGHT mark — deep tier starting point; repaired vs bg + white ink
const PALE_C = 0.04; // gentle tint chroma for pale fills
const DEEP_C = 0.13; // saturated chroma for deep marks
const JEWEL_L = 0.42; // DARK fill — a dark jewel tone of the hue (reads under white ink)
const JEWEL_C = 0.12; // saturated chroma for the dark jewel fill
const PALE_MARK_L = 0.82; // DARK mark — a pale tint that reads on the dark canvas
const PALE_MARK_C = 0.085; // gentle chroma for the dark pale mark

// The number of categorical data-viz slots the ramp derives (each a flipping
// fill+mark pair). The single source for this count: the REQUIRED_TOKENS list,
// the derivation loop, AND the theme canon (lib/theme/ai.js) all read it, so the
// "N slots" the model is told can never drift from the N the engine emits.
const CATEGORICAL_COUNT = 12;

// ── Categorical ramp strategies ─────────────────────────────────────────────
// The AI proposes a NAMED strategy (lib/theme/ai.js); this is where it disposes.
// A strategy only chooses the HUE LAYOUT (and, for the mono case, a per-slot
// chroma wobble) — the lightness tiers + AA repair below are unchanged, so every
// strategy still yields a contrast-clean palette. `spectrum` reproduces the
// historical fixed 30°/45° spread exactly, so it is the no-regression default.
const RAMP_STRATEGIES = Object.freeze(['spectrum', 'analogous', 'triad', 'complementary', 'brand-mono']);
const DEFAULT_STRATEGY = 'spectrum';

const norm360 = d => (((d % 360) + 360) % 360);

/** Hue (deg) for slot `i` of `count`, given the base accent hue and strategy. */
function rampHue(strategy, baseH, i, count) {
  switch (strategy) {
    case 'analogous': {
      // A tight fan within ±50° of the accent — calm, cohesive.
      const band = 100;
      return baseH + (count <= 1 ? 0 : (i / (count - 1) - 0.5) * band);
    }
    case 'triad': {
      // Three hue families 120° apart; later rounds drift slightly to stay distinct.
      return baseH + (i % 3) * 120 + Math.floor(i / 3) * 14;
    }
    case 'complementary': {
      // The accent and its complement, split between with a gentle drift.
      return baseH + (i % 2) * 180 + Math.floor(i / 2) * 16;
    }
    case 'brand-mono': {
      // Hue locked to the accent (a tiny ± jitter only); chroma does the work.
      return baseH + (i % 2 ? 8 : -8);
    }
    default: // 'spectrum' — even spread across the full wheel (historical behavior).
      return baseH + i * (360 / count);
  }
}

/** Per-slot chroma multiplier; only `brand-mono` varies it (to keep one hue distinct). */
function rampChromaMul(strategy, i, count) {
  if (strategy !== 'brand-mono' || count <= 1) return 1;
  return 0.45 + (i / (count - 1)) * 0.7; // 0.45×…1.15× across the cycle
}

/**
 * Per-slot lightness delta. Only `brand-mono` uses it: with the hue locked to the
 * accent, chroma alone can't separate 12 slots perceptibly at a fixed lightness
 * (a single-hue cycle collapses to ~2 distinct colors). Spreading lightness ±0.07
 * across the cycle turns it into an honest light→dark single-hue ramp — the
 * distinctness comes from L, which buys far more ΔE per step here than chroma. 0
 * for every other strategy, so `spectrum` (and the rest) are byte-for-byte unchanged.
 */
function rampLightnessDelta(strategy, i, count) {
  if (strategy !== 'brand-mono' || count <= 1) return 0;
  return (i / (count - 1) - 0.5) * 0.14; // −0.07…+0.07 across the cycle
}

/** Normalize a requested strategy to a known one (forgiving; defaults to spectrum). */
function normalizeStrategy(s) {
  const v = String(s || '').toLowerCase().trim();
  return RAMP_STRATEGIES.includes(v) ? v : DEFAULT_STRATEGY;
}

/** Required output token groups — the completeness contract. */
const REQUIRED_TOKENS = Object.freeze({
  surfaces: ['bg', 'bg-alt', 'surface-inverse', 'border'],
  ink: ['text-display', 'text-heading', 'text-body', 'text-secondary', 'text-label', 'text-muted'],
  accent: ['accent', 'accent-soft', 'on-accent', 'on-accent-soft', 'accent-soft-body'],
  semantic: ['pass', 'fail', 'warn', 'pass-bg', 'fail-bg', 'warn-bg'],
  dark: [
    'scheme-dark-bg', 'scheme-dark-bg-alt', 'scheme-dark-border',
    'scheme-dark-text-heading', 'scheme-dark-text-body', 'scheme-dark-text-display',
    'scheme-dark-text-secondary', 'scheme-dark-text-label', 'scheme-dark-text-muted',
  ],
  categorical: [
    ...Array.from({ length: CATEGORICAL_COUNT }, (_, i) => `cat-${i + 1}-fill`),
    ...Array.from({ length: CATEGORICAL_COUNT }, (_, i) => `cat-${i + 1}-mark`),
    'cat-on-fill', 'cat-on-mark',
    // diagram-structural (flipped to canonical, group 2 — ADR §11.3)
    'diagram-stroke', 'diagram-line', 'diagram-accent-warm',
  ],
  // Universal semantic — the others (c-warm/cool/mark/note) default in
  // lattice.css; the alarm fill is gate-checked (c-ink-dark on c-alarm) so a
  // generated theme must define it explicitly.
  universal: ['diagram-critical'],
  hljs: [
    'hljs-comment', 'hljs-keyword', 'hljs-built_in', 'hljs-number', 'hljs-literal',
    'hljs-string', 'hljs-title', 'hljs-type', 'hljs-variable', 'hljs-punctuation',
  ],
  chart: [
    ...Array.from({ length: 8 }, (_, i) => `chart-cat${i + 1}`),
    'chart-state-pass', 'chart-state-warn', 'chart-state-fail',
    'chart-state-info', 'chart-state-mute',
  ],
});

/** Flat list of every token derivation guarantees. */
function requiredTokenList() {
  return Object.values(REQUIRED_TOKENS).flat();
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Throw on a malformed essential set; returns a normalized copy on success. */
function validateEssentials(essentials) {
  if (!essentials || typeof essentials !== 'object') {
    throw new Error('essentials must be an object');
  }
  const out = {};
  for (const k of ESSENTIAL_KEYS) {
    if (essentials[k] == null) throw new Error(`essential set missing "${k}"`);
    try {
      out[k] = normalizeHex(essentials[k]);
    } catch {
      throw new Error(`essential "${k}" is not a hex colour: ${essentials[k]}`);
    }
  }
  return out;
}

const ld = (light, dark) => `light-dark(${light}, ${dark})`;
const tint = (color, pct) => `color-mix(in srgb, var(--${color}) ${pct}%, transparent)`;

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * Derive the full token contract from an essential set.
 * @param {object} essentials  see ESSENTIAL_KEYS
 * @param {object} [options]
 * @param {string} [options.rampStrategy] one of RAMP_STRATEGIES; chooses the
 *   categorical/chart hue layout. Unknown/absent → 'spectrum' (no regression).
 * @returns {object} flat token map (names without `--`)
 */
function deriveTheme(essentials, options = {}) {
  const e = validateEssentials(essentials);
  const strategy = normalizeStrategy(options.rampStrategy);
  const t = {};

  const accentHue = hexToOklch(e.accent).h;

  // ── Dark canvas band — derived from the accent hue at very low lightness ──
  const darkBg = oklchToHex({ L: 0.16, C: 0.012, h: accentHue });
  const darkBgDeeper = oklchToHex({ L: 0.12, C: 0.012, h: accentHue });
  const darkBgAlt = oklchToHex({ L: 0.19, C: 0.014, h: accentHue });
  // Light inks for the dark band, repaired to clear AA on the dark canvas.
  const darkHeading = ensureContrast(mix(e.bg, '#ffffff', 0.4), darkBgDeeper, AA, 'lighten');
  const darkBody = ensureContrast(mix(e.textBody, '#ffffff', 0.55), darkBgDeeper, AA, 'lighten');
  const darkSecondary = ensureContrast(mix(e.textBody, '#ffffff', 0.4), darkBgDeeper, AA, 'lighten');
  const darkLabel = ensureContrast(withLightness(e.accent, 0.82), darkBgDeeper, AA, 'lighten');
  const darkMuted = mix(e.textMuted, '#ffffff', 0.35);
  const darkBorder = mix(darkBg, darkBody, 0.22);

  // ── Surfaces ──────────────────────────────────────────────────────────────
  t.bg = ld(e.bg, darkBgDeeper);
  t['bg-alt'] = ld(e.bgAlt, darkBgAlt);
  t['surface-inverse'] = darkBg;
  t.border = ld(mix(e.bg, e.textBody, 0.18), darkBorder);

  // ── Ink ramp ──────────────────────────────────────────────────────────────
  // text-display rides on dark surfaces in BOTH modes → a single near-white.
  t['text-display'] = mix(e.bg, '#ffffff', 0.6);
  // Heading must clear AA on bg AND bg-alt, both modes (the gate's assertion).
  const headingLight = ensureContrast(ensureContrast(e.textHeading, e.bg, AA, 'darken'), e.bgAlt, AA, 'darken');
  t['text-heading'] = ld(headingLight, darkHeading);
  t['text-body'] = ld(
    ensureContrast(ensureContrast(e.textBody, e.bg, AA, 'darken'), e.bgAlt, AA, 'darken'),
    darkBody,
  );
  // Secondary content tier — a step lighter than body but still AA on bg AND bg-alt.
  const secondaryLight = ensureContrast(
    ensureContrast(mix(e.textBody, e.textMuted, 0.45), e.bg, AA, 'darken'),
    e.bgAlt, AA, 'darken',
  );
  t['text-secondary'] = ld(secondaryLight, darkSecondary);
  // Accent-hued label — AA on the canvas.
  t['text-label'] = ld(ensureContrast(e.accent, e.bg, AA, 'darken'), darkLabel);
  // Muted is DECORATIVE / WCAG-exempt — pass through, no repair.
  t['text-muted'] = ld(e.textMuted, darkMuted);

  // ── Accent containers ─────────────────────────────────────────────────────
  const darkAccent = ensureContrast(withLightness(e.accent, 0.78), darkBgAlt, AA, 'lighten');
  t.accent = ld(e.accent, darkAccent);
  // accent-soft: pale tint surface (given for light; mid panel for dark).
  const darkAccentSoft = oklchToHex({ L: 0.3, C: Math.min(0.06, hexToOklch(e.accent).C), h: accentHue });
  t['accent-soft'] = ld(e.accentSoft, darkAccentSoft);
  // on-accent: white or espresso, whichever reads on the accent fill; repaired.
  t['on-accent'] = ld(
    ensureContrast(pickInk(e.accent, withLightness(e.accent, 0.12)), e.accent, AA),
    ensureContrast(pickInk(darkAccent, withLightness(e.accent, 0.12)), darkAccent, AA),
  );
  // on-accent-soft = accent itself per contract; repaired onto the soft fill.
  t['on-accent-soft'] = ld(
    ensureContrast(e.accent, e.accentSoft, AA, 'darken'),
    ensureContrast(darkAccent, darkAccentSoft, AA, 'lighten'),
  );
  t['accent-soft-body'] = 'var(--text-body)';

  // ── Semantic signals ──────────────────────────────────────────────────────
  // Lift each for both canvases: AA on bg (light) and on the dark canvas.
  t.pass = ld(ensureContrast(e.pass, e.bg, AA, 'darken'), ensureContrast(mix(e.pass, '#ffffff', 0.3), darkBgDeeper, AA, 'lighten'));
  t.fail = ld(ensureContrast(e.fail, e.bg, AA, 'darken'), ensureContrast(mix(e.fail, '#ffffff', 0.3), darkBgDeeper, AA, 'lighten'));
  t.warn = ld(ensureContrast(e.warn, e.bg, AA, 'darken'), ensureContrast(mix(e.warn, '#ffffff', 0.3), darkBgDeeper, AA, 'lighten'));
  t['pass-bg'] = tint('pass', 10);
  t['fail-bg'] = tint('fail', 10);
  t['warn-bg'] = tint('warn', 10);

  // ── Dark-variant tokens ───────────────────────────────────────────────────
  t['scheme-dark-bg'] = darkBgDeeper;
  t['scheme-dark-bg-alt'] = darkBgAlt;
  t['scheme-dark-border'] = darkBorder;
  t['scheme-dark-text-heading'] = darkHeading;
  t['scheme-dark-text-body'] = darkBody;
  t['scheme-dark-text-display'] = mix(e.bg, '#ffffff', 0.6);
  t['scheme-dark-text-secondary'] = darkSecondary;
  t['scheme-dark-text-label'] = darkLabel;
  t['scheme-dark-text-muted'] = darkMuted;

  // ── Categorical cycle — 12 hues around the accent, THREE-LAYER FLIPPING ─────
  // The inks flip with the fill tier (each is a light-dark() pair): a dark ink on
  // the pale LIGHT fill / a white ink on the jewel DARK fill (cat-on-fill), and the
  // inverse on the mark (cat-on-mark). Each fill/mark is a flipping pair too, and
  // each tier is repaired IN ITS MODE to hold the three-layer contract:
  //   ① mark vs bg ≥ 3 (graphical),  ③ ink vs fill ≥ 4.5 (label),  fill ≠ mark.
  const inkLight = ensureContrast(headingLight, '#ffffff', AA, 'darken'); // dark ink
  const inkDark = '#ffffff'; // light ink
  t['cat-on-fill'] = ld(inkLight, inkDark); // dark on pale (light) ↔ white on jewel (dark)
  t['cat-on-mark'] = ld(inkDark, inkLight); // white on deep (light) ↔ dark on pale (dark)
  for (let i = 0; i < CATEGORICAL_COUNT; i++) {
    const h = norm360(rampHue(strategy, accentHue, i, CATEGORICAL_COUNT));
    const cMul = rampChromaMul(strategy, i, CATEGORICAL_COUNT);
    const dL = rampLightnessDelta(strategy, i, CATEGORICAL_COUNT);
    // LIGHT: pale chromatic fill (dark ink reads on it) + deep mark (reads on the
    // light canvas AND carries the white on-mark ink).
    const fillLight = ensureContrast(oklchToHex({ L: PALE_L + dL, C: PALE_C * cMul, h }), inkLight, AA, 'lighten');
    let markLight = ensureContrast(oklchToHex({ L: DEEP_L + dL, C: DEEP_C * cMul, h }), e.bg, AA_LARGE, 'darken');
    markLight = ensureContrast(markLight, inkDark, AA, 'darken');
    // DARK: jewel fill (white ink reads on it) + pale mark (reads on the dark canvas
    // AND carries the dark on-mark ink).
    const fillDark = ensureContrast(oklchToHex({ L: JEWEL_L + dL, C: JEWEL_C * cMul, h }), inkDark, AA, 'darken');
    let markDark = ensureContrast(oklchToHex({ L: PALE_MARK_L + dL, C: PALE_MARK_C * cMul, h }), darkBgDeeper, AA_LARGE, 'lighten');
    markDark = ensureContrast(markDark, inkLight, AA, 'lighten');
    t[`cat-${i + 1}-fill`] = ld(fillLight, fillDark);
    t[`cat-${i + 1}-mark`] = ld(markLight, markDark);
  }

  // ── Structural (diagram-*) ──────────────────────────────────────────────────
  t['diagram-stroke'] = withChroma(withLightness(e.accent, 0.5), 0.09);
  t['diagram-line'] = ld(withLightness(e.textBody, 0.32), withLightness(darkBody, 0.78));
  t['diagram-accent-warm'] = 'var(--accent)';

  // ── Universal alarm (gate checks cat-on-mark on diagram-critical) ──────────
  // A flipping mark, like the categorical marks: a DEEP red under the white on-mark
  // ink (light) ↔ a PALE red under the dark on-mark ink (dark). cat-on-mark flips
  // with the mark tier, so the alarm must flip too or the dark-mode ink fails on it.
  t['diagram-critical'] = ld(
    ensureContrast('#c20000', inkDark, AA, 'darken'),
    ensureContrast(withLightness('#c20000', 0.68), inkLight, AA, 'lighten'),
  );

  // ── highlight.js syntax (decorative; readable on the dark code surface) ────
  const onCode = darkBg;
  // hljs is decorative; hold it to the 3:1 graphical floor on the code surface.
  const synth = (rot, L = 0.72, C = 0.11) =>
    ensureContrast(oklchToHex({ L, C, h: (((accentHue + rot) % 360) + 360) % 360 }), onCode, 3, 'lighten');
  t['hljs-comment'] = ensureContrast(mix(e.textMuted, onCode, 0.2), onCode, 3, 'lighten');
  t['hljs-keyword'] = synth(0);
  t['hljs-built_in'] = synth(120);
  t['hljs-number'] = synth(60);
  t['hljs-literal'] = synth(330);
  t['hljs-string'] = synth(40);
  t['hljs-title'] = synth(20);
  t['hljs-type'] = synth(180);
  t['hljs-variable'] = synth(120);
  t['hljs-punctuation'] = synth(0, 0.78, 0.04);

  // ── Chart-family spectrums ────────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const h = norm360(rampHue(strategy, accentHue, i, 8));
    const lightPigment = oklchToHex({ L: 0.5 + rampLightnessDelta(strategy, i, 8), C: 0.12 * rampChromaMul(strategy, i, 8), h });
    t[`chart-cat${i + 1}`] = ld(lightPigment, mix(lightPigment, '#ffffff', 0.3));
  }
  t['chart-state-pass'] = 'var(--pass)';
  t['chart-state-warn'] = 'var(--warn)';
  t['chart-state-fail'] = 'var(--fail)';
  t['chart-state-info'] = ld(withLightness(oklchToHex({ L: 0.5, C: 0.1, h: 250 }), 0.5), withLightness(oklchToHex({ L: 0.7, C: 0.1, h: 250 }), 0.7));
  t['chart-state-mute'] = ld(mix(e.textMuted, '#000000', 0.1), mix(e.textMuted, '#ffffff', 0.1));

  return t;
}

module.exports = {
  ESSENTIAL_KEYS,
  REQUIRED_TOKENS,
  requiredTokenList,
  validateEssentials,
  deriveTheme,
  RAMP_STRATEGIES,
  DEFAULT_STRATEGY,
  normalizeStrategy,
  CATEGORICAL_COUNT,
  PALE_L,
  DEEP_L,
};
