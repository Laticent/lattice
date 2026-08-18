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
  hexToRgb,
  rgbToHex,
  oklchToHex,
  relativeLuminance,
  withLightness,
  withChroma,
  mix,
  pickInk,
  ensureContrast,
  normalizeHex,
  AA,
  AA_LARGE,
} = require('./color.js');
const { solveInkArm } = require('./cat-ink.js');

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

/**
 * Required output token groups — the completeness contract.
 *
 * THE ADMISSION RULE, since #1457: a token belongs here when the engine reads it
 * with NO SAFE DEFAULT — no `:root` default in the base layer and no `var(…, …)`
 * fallback at the read — because then a theme that omits it does not fall back,
 * it fails visibly. `checkNoSafeDefaultTokens` (tools/check-ownership.js) computes
 * that set from the CSS and this list, so the next such token is caught by the
 * machine rather than by a render. What a miss actually looks like, measured on
 * the export path before this contract was widened:
 *
 *   --c-container / --c-container-edge   Mermaid's `clusterBkg`/`clusterBorder`
 *       read through lib/core/mermaid-theme-map.js, whose PDF-path reader
 *       substitutes a black sentinel that SHIPS — solid black subgraph boxes on
 *       5 of 8 slides of examples/containment-tier.md, up to 23.9% of a slide.
 *   --spectrum / --spectrum-vertical     read bare inside a `background`
 *       shorthand, so a miss invalidates the WHOLE declaration at computed-value
 *       time: `section.dark` and `.divider` lost their canvas entirely and painted
 *       near-white text on white paper.
 *   --cat-N-ink                          the one family with a fallback at every
 *       read (`var(--cat-N-ink, var(--cat-N-mark))`, gated by checkCatInkFallback),
 *       so it degrades rather than breaks — but it degrades onto a mark curated to
 *       the 3:1 GRAPHICAL floor. Sampling 200 essential sets PER RAMP STRATEGY, the
 *       share carrying at least one sub-AA categorical label is 23-34 of 200 under the
 *       four hue-spread ramps and 176 of 200 under `brand-mono` (worst 2.99:1), where a
 *       single-hue cycle puts most slots at one lightness. With the tier: 0 of 200 on
 *       every strategy. Contract, not fallback.
 */
const REQUIRED_TOKENS = Object.freeze({
  surfaces: ['bg', 'bg-alt', 'surface-inverse', 'border'],
  // `code-inline-fg` is INK, not an accent container, and that distinction is the whole
  // reason it is here. It used to be absent, with `section code` reading
  // `var(--code-inline-fg, var(--accent))` — ink falling back onto an AREA token held to no
  // text-contrast contract. That is the --cat-N-ink shape, and it shipped the same result:
  // the chip painted --accent at 4.36:1 on a card against a 4.5 floor.
  ink: ['text-display', 'text-heading', 'text-body', 'text-secondary', 'text-label', 'text-muted', 'code-inline-fg'],
  // `muted-mark` is GRAPHICAL, not ink — it is the de-emphasis tier for rules,
  // hairlines and empty/skipped marks, held to 3:1 rather than 4.5:1 (#1715).
  graphical: ['muted-mark'],
  accent: ['accent', 'accent-soft', 'on-accent', 'on-accent-soft', 'accent-soft-body'],
  semantic: ['pass', 'fail', 'warn', 'pass-bg', 'fail-bg', 'warn-bg'],
  dark: [
    'scheme-dark-bg', 'scheme-dark-bg-alt', 'scheme-dark-border',
    'scheme-dark-text-heading', 'scheme-dark-text-body', 'scheme-dark-text-display',
    'scheme-dark-text-secondary', 'scheme-dark-text-label', 'scheme-dark-text-muted',
    'scheme-dark-muted-mark',
  ],
  categorical: [
    ...Array.from({ length: CATEGORICAL_COUNT }, (_, i) => `cat-${i + 1}-fill`),
    ...Array.from({ length: CATEGORICAL_COUNT }, (_, i) => `cat-${i + 1}-mark`),
    // The ON-CANVAS ink tier: the slot's hue as TEXT on --bg / --bg-alt, solved
    // by lib/theme/cat-ink.js — the same recipe tools/derive-cat-ink.js writes
    // into the hand-authored palettes.
    ...Array.from({ length: CATEGORICAL_COUNT }, (_, i) => `cat-${i + 1}-ink`),
    'cat-on-fill', 'cat-on-mark',
    // diagram-structural (flipped to canonical, group 2 — ADR §11.3)
    'diagram-stroke', 'diagram-line', 'diagram-accent-warm',
  ],
  // Containment — two nested structural surfaces (flowchart cluster, sankey area,
  // kanban column / a box nested in one), each with its own edge and label ink.
  // No engine default at all, and Mermaid reads the first two through the export
  // path's black sentinel, so an omission is a solid black box rather than a
  // missing tint.
  containment: [
    'c-container', 'c-subcontainer',
    'c-container-edge', 'c-subcontainer-edge',
    'c-on-container', 'c-on-subcontainer',
  ],
  // The brand ribbon. `--spectrum` rides inside `background:` shorthands, where a
  // miss takes the whole declaration down with it; `--spectrum-end` is the curated
  // endpoint the `spectrum: duo` register reads.
  spectrum: ['spectrum', 'spectrum-vertical', 'spectrum-end'],
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

/**
 * Repair an ink against the surface IT WILL ACTUALLY PAINT ON, when that surface is the
 * element's own translucent wash over a canvas.
 *
 * The inline-code chip fills itself with `color-mix(in srgb, currentColor 10%, transparent)`
 * (base.tokens.css), so what sits behind the glyphs is not the card — it is `0.1·ink +
 * 0.9·card`, composited in sRGB. Repairing against the bare card is one step short, and
 * short by exactly enough to matter: measured, it left indaco's derived chip at 4.38:1 on
 * the real surface while reporting 5.01 against the card, i.e. still failing the 4.5 floor
 * this token exists to hold. Five of fourteen shipped palettes derived a sub-AA chip that
 * way, including the very case the token was added to fix.
 *
 * The target depends on the ink, so this solves rather than computes: repair, recompute the
 * wash the repaired ink would lay down, repair again. Each pass moves the surface by only a
 * tenth of the ink's own move, so it settles in two or three; the cap is a guard, not a
 * schedule. `ensureContrast` returns its input unchanged once the target is met, so a
 * fixed point is an exact equality test.
 *
 * NOTE the sRGB compositing. `mix()` here is OKLab, which is right for choosing colors and
 * wrong for predicting a browser's alpha blend — CSS composites in the destination space.
 */
const WASH_ALPHA = 0.1; // must track --code-inline-bg in base.tokens.css
function washOver(ink, canvas) {
  const a = hexToRgb(ink);
  const b = hexToRgb(canvas);
  return rgbToHex(a.map((v, i) => Math.round(v * WASH_ALPHA + b[i] * (1 - WASH_ALPHA))));
}
function inkOnWash(ink, canvas, direction) {
  let out = ink;
  for (let pass = 0; pass < 4; pass++) {
    const next = ensureContrast(out, washOver(out, canvas), AA, direction);
    if (next === out) break;
    out = next;
  }
  return out;
}
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
  // #1715 SPLIT THE ROLE. This said "Muted is DECORATIVE / WCAG-exempt — pass
  // through, no repair", and every hand-authored palette carried the same comment on
  // the same token — while `--text-muted` was ALSO the color 88 sites painted real
  // text with, and it was below AA on 44 of 72 palette-mode-surface pairs (worst
  // 2.11:1). The name says text; the comment said exempt; both could not be true.
  //
  // So the TEXT role keeps the name and gains the floor the name always promised,
  // and the DECORATIVE role — rules, hairlines, empty/skipped marks, glyph washes —
  // moves to `--muted-mark`, which is named for what it is and takes the 3:1
  // graphical floor instead. `mutedLight`/`darkMuted` stay the author's own value
  // wherever it already clears; the repair is a minimum lightness move.
  const mutedTextLight = ensureContrast(
    ensureContrast(e.textMuted, e.bg, AA, 'darken'), e.bgAlt, AA, 'darken',
  );
  const mutedTextDark = ensureContrast(darkMuted, darkBgDeeper, AA, 'lighten');
  t['text-muted'] = ld(mutedTextLight, mutedTextDark);
  // The decoration tier: the author's muted, repaired only to the GRAPHICAL floor.
  const mutedMarkLight = ensureContrast(
    ensureContrast(e.textMuted, e.bg, AA_LARGE, 'darken'), e.bgAlt, AA_LARGE, 'darken',
  );
  const mutedMarkDark = ensureContrast(darkMuted, darkBgDeeper, AA_LARGE, 'lighten');
  t['muted-mark'] = ld(mutedMarkLight, mutedMarkDark);

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
  // Inline-code chip ink. The chip is surface-aware by design — its wash and border are
  // color-mix(currentColor) deltas off this ink — so this ONE value carries the chip's
  // legibility on every surface it can land on, and it is TEXT, so the floor is 4.5 and not
  // the 3:1 graphical one --accent is held to.
  //
  // Repaired against both canvases, and against each one AS THE CHIP ACTUALLY PAINTS IT —
  // see inkOnWash. Repairing against the bare canvas is one step short, and short by exactly
  // enough to matter.
  t['code-inline-fg'] = ld(
    inkOnWash(inkOnWash(e.accent, e.bg, 'darken'), e.bgAlt, 'darken'),
    inkOnWash(inkOnWash(darkAccent, darkBgDeeper, 'lighten'), darkBgAlt, 'lighten'),
  );

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
  t['scheme-dark-text-muted'] = mutedTextDark;
  t['scheme-dark-muted-mark'] = mutedMarkDark;

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
  const marksLight = [];
  const marksDark = [];
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
    marksLight.push(markLight);
    marksDark.push(markDark);
  }

  // ── Categorical ON-CANVAS ink ──────────────────────────────────────────────
  // The mark is repaired to the GRAPHICAL floor (3:1 vs the canvas) because it is
  // a shape — a bar, a node, a chip. The same hue used as LABEL TEXT is held to
  // 4.5:1 on BOTH slide surfaces, which is a different number, so it gets its own
  // tier rather than being borrowed. Every consumer in lib/ reads it as
  // `var(--cat-N-ink, var(--cat-N-mark))`, so a theme without this tier renders
  // the mark instead: legible as a shape, and measurably not as text — sampling 200
  // essential sets per ramp strategy, 23-34 of 200 carry a sub-AA label that way under
  // the hue-spread ramps and 176 of 200 under `brand-mono` (worst 2.99:1); with this
  // tier, 0 of 200 on every strategy. The sampler is in
  // engineering/decisions/2026-08-10-no-safe-default-token-contract.md §2, seeded, so
  // the figures are reproducible. Solved by the shared recipe in lib/theme/cat-ink.js, NON-STRICT: this
  // runs in a browser on a color the user just picked, and `deriveTheme` has never
  // thrown for a valid essential set (see that module's failure-policy note).
  const inkLightArm = solveInkArm({ marks: marksLight, bg: e.bg, bgAlt: e.bgAlt, arm: 'light' });
  const inkDarkArm = solveInkArm({ marks: marksDark, bg: darkBgDeeper, bgAlt: darkBgAlt, arm: 'dark' });
  for (let i = 0; i < CATEGORICAL_COUNT; i++) {
    t[`cat-${i + 1}-ink`] = ld(inkLightArm.inks[i], inkDarkArm.inks[i]);
  }

  // ── Containment tier ───────────────────────────────────────────────────────
  // Two nested structural SURFACES — a monotonic luminance ladder away from the
  // canvas, one step per nesting level, brand-hue-tinted at a barely-there chroma
  // so they never compete with the categorical fills that sit on them. Each rung
  // carries its own edge and label ink, because the fill is deliberately a hair
  // off the canvas: the EDGE is what makes the grouping perceivable
  // (test/unit/palette/containment-contrast.test.js — ink ≥ 4.5:1 on its rung,
  // edge ≥ 3:1 on the fill it outlines, and the ladder must not step back).
  const containment = (canvas, brandEdge) => {
    const { L } = hexToOklch(canvas);
    const away = L >= 0.5 ? -1 : 1; // a light deck steps down, a dark one steps up
    const lum = hex => relativeLuminance(hexToRgb(hex));
    const canvasLum = lum(canvas);
    const rung = step => oklchToHex({ L: Math.min(1, Math.max(0, L + away * step)), C: 0.012, h: accentHue });
    // The ladder is asserted on RELATIVE LUMINANCE, not on OKLCH lightness, and in
    // principle the two can disagree when the canvas is chromatic and the rung is
    // not. This widens the step until the rung has measurably moved away.
    //
    // IT HAS NEVER FIRED. Across 20,000 random canvases plus all four starters in
    // both arms it never widened once, and replacing it with `base` produces
    // byte-identical output. It is a clamp, not a check — kept because it costs one
    // predicate on a path that runs once per theme and it makes the invariant true
    // by construction rather than by an argument about OKLCH monotonicity. What
    // actually carries the ladder is `away` above: invert that and 4 of 8 arms step
    // back toward the canvas, which the ladder test catches.
    const step = (from, base) => {
      let s = base;
      for (let i = 0; i < 20 && (lum(rung(s)) - from) * away <= 0; i++) s = base + (i + 1) * 0.02;
      return s;
    };
    const s1 = step(canvasLum, 0.06);
    const container = rung(s1);
    const s2 = step(lum(container), s1 + 0.07);
    const subcontainer = rung(s2);
    // Edge: the brand hue, moved only as far as the 3:1 graphical floor demands.
    // Ink: whichever pole reads on the rung, repaired to AA as label text.
    return {
      'c-container': container,
      'c-subcontainer': subcontainer,
      'c-container-edge': ensureContrast(brandEdge, container, AA_LARGE),
      'c-subcontainer-edge': ensureContrast(brandEdge, subcontainer, AA_LARGE),
      'c-on-container': ensureContrast(pickInk(container, inkLight, inkDark), container, AA),
      'c-on-subcontainer': ensureContrast(pickInk(subcontainer, inkLight, inkDark), subcontainer, AA),
    };
  };
  // Both arms run the same recipe against their own canvas; the tier ships as six
  // light-dark() pairs, like every other surface token.
  const cLight = containment(e.bg, e.accent);
  const cDark = containment(darkBgDeeper, darkAccent);
  for (const name of REQUIRED_TOKENS.containment) t[name] = ld(cLight[name], cDark[name]);

  // ── Structural (diagram-*) ──────────────────────────────────────────────────
  t['diagram-stroke'] = withChroma(withLightness(e.accent, 0.5), 0.09);
  t['diagram-line'] = ld(withLightness(e.textBody, 0.32), withLightness(darkBody, 0.78));
  t['diagram-accent-warm'] = 'var(--accent)';

  // ── Universal alarm ────────────────────────────────────────────────────────
  // A flipping alarm red: DEEP on the light canvas ↔ PALE on the dark canvas, so it
  // reads as "critical" against either canvas and stays the darkest/most-saturated of
  // the diagram-active/done/critical severity ramp. (Historically this also had to let
  // --cat-on-mark clear it, because the mermaid error box painted that ink on it; that
  // coupling was retired in #1181 — the error box now uses the gated ['bg','fail'] pair
  // — so this value now serves only the gantt critical bar + the severity ramp.)
  t['diagram-critical'] = ld(
    ensureContrast('#c20000', inkDark, AA, 'darken'),
    ensureContrast(withLightness('#c20000', 0.68), inkLight, AA, 'lighten'),
  );

  // ── Spectrum ribbon ────────────────────────────────────────────────────────
  // The brand bar on the section edge, the divider's left rail, and (via
  // `--spectrum-structure`) the hairline under a table head. Three stops in the
  // theme's own hue family — a deep canvas-side anchor, the accent at full voice,
  // and a curated endpoint — which is the shape the shipped palettes use
  // (indaco: navy → bright blue → green). The endpoint hue comes from the SAME
  // ramp strategy as the categorical cycle, so `brand-mono` yields a single-hue
  // ribbon rather than a rainbow that contradicts the rest of the theme.
  //
  // These are DECORATIVE and carry no contrast contract — but they are read bare
  // inside `background:` shorthands (`section.dark`, `.divider`), where an
  // undefined custom property invalidates the whole declaration at computed-value
  // time. A missing ribbon does not drop the ribbon; it drops the CANVAS.
  //
  // AN ACHROMATIC BRAND STAYS ACHROMATIC. The first cut floored chroma at 0.09 with
  // no opt-out, so a gray accent (`#3A3A3A`, C = 0.0000, hue = numerical noise) got a
  // brown-gold-to-teal ribbon across the top of every slide and down every divider
  // rail — a brand color invented out of a rounding error. The three shipped
  // near-monochrome palettes answer this exact input deliberately and differently:
  // `onyx` runs #000000 → #666666 → one curated pop, and `carbone`/`concrete` the
  // same shape. So below a visible-chroma threshold the ribbon becomes a lightness
  // ramp of the accent itself and the endpoint hue is not rotated.
  const accentC = hexToOklch(e.accent).C;
  const achromatic = accentC < 0.02;
  const ribbonC = achromatic ? accentC : Math.max(0.09, accentC);
  const endHue = achromatic ? accentHue : norm360(rampHue(strategy, accentHue, 4, CATEGORICAL_COUNT));
  const spectrumStops = achromatic
    ? [
        oklchToHex({ L: 0.20, C: ribbonC, h: accentHue }),
        oklchToHex({ L: 0.45, C: ribbonC, h: accentHue }),
        oklchToHex({ L: 0.68, C: ribbonC, h: accentHue }),
      ]
    : [
        oklchToHex({ L: 0.34, C: ribbonC * 0.85, h: accentHue }),
        oklchToHex({ L: 0.62, C: ribbonC, h: accentHue }),
        // Stop 3 sits a touch lighter than stop 2 as well as hue-rotated: on a tight
        // ramp (`analogous` Δh ≈ 13.6°, `brand-mono` Δh = 8°) two stops at the same
        // lightness read as one flat band across the last 45% of the bar.
        oklchToHex({ L: 0.68, C: ribbonC, h: endHue }),
      ];
  const ribbon = deg => `linear-gradient(${deg}deg, ${spectrumStops[0]} 0%, ${spectrumStops[1]} 55%, ${spectrumStops[2]} 100%)`;
  t.spectrum = ribbon(90);
  t['spectrum-vertical'] = ribbon(180);
  t['spectrum-end'] = spectrumStops[2];

  // ── highlight.js syntax (TEXT on the code surface — held to the AA floor) ──
  const onCode = darkBg;
  // NOT the 3:1 graphical floor. Syntax highlighting is small text a human reads,
  // so it takes 4.5:1 like any other text — the same floor `checkHljsContrast`
  // holds every committed palette to. This said "decorative; 3:1" until 2026-08-11,
  // which meant every theme the Studio generated shipped comments at ~3.1:1: the
  // exact defect the committed palettes were repaired for, still being manufactured
  // downstream. A generated theme committed to `themes/` would fail `build:check`.
  const synth = (rot, L = 0.72, C = 0.11) =>
    ensureContrast(oklchToHex({ L, C, h: (((accentHue + rot) % 360) + 360) % 360 }), onCode, 4.5, 'lighten');
  t['hljs-comment'] = ensureContrast(mix(e.textMuted, onCode, 0.2), onCode, 4.5, 'lighten');
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
