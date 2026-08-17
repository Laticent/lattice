#!/usr/bin/env node
/**
 * composed-contrast — WCAG audit of the surfaces a COMPONENT composes, not the
 * pairs a palette declares.
 *
 * Complements tools/contrast-audit.js rather than duplicating it (HARD RULE #15).
 * That tool scores each theme's own token matrix: an ink against `--bg` and
 * `--bg-alt`, the two opaque canvases a palette names. It structurally cannot see
 * the surface a component INVENTS by stacking paints — and this engine's status
 * ink is almost never on a bare canvas:
 *
 *   · `redline` paints `<ins>` / `<del>` on `--pass-bg` / `--fail-bg`, which is a
 *     12% tint OF THE SAME TOKEN. The background MOVES WITH THE INK, so a curated
 *     hue can be re-tuned and gain nothing.
 *   · its `.split` / `.stacked` / `.three-col` cards put that band on ANOTHER
 *     own-hue tint (4–5% over `--bg-alt`), two own-hue layers deep.
 *   · `word-cloud spectrum` paints `--seq-700/500/400` — stops the BASE derives
 *     from the palette's anchor in OKLab — as word fills. contrast-audit skips the
 *     `lattice` @import entirely, so it never sees a base-derived ink at all.
 *
 * That blind spot is the root cause this file exists to close. It was measured on
 * #1640: five brand palettes' `redline` runs and the `word-cloud` spectrum on
 * onyx / concrete / the four a11y palettes fell sub-threshold the moment the
 * palette wins the cascade (#1527), and every gate in the repo stayed green
 * because no gate looks at a composed surface.
 *
 * ── What it resolves ──────────────────────────────────────────────────────────
 * The merged token map is `dist/lattice.css`'s `:root` defaults with the palette
 * chain's `:root` on top — PALETTE WINS. That is the order `lib/engine/css.js`
 * `composeCss` has always used (Studio, docs Playground) and the order the export
 * path takes once #1527 lands, so this gate is truthful for the engine path today
 * and for both paths after the flip. Evaluation is delegated to
 * `lib/core/resolve-token-expr` — the engine's own custom-property evaluator
 * (var() with fallback, light-dark() arms, color-mix() in oklab/srgb, a
 * `transparent` stop reduced to rgba) — so this gate cannot disagree with the
 * renderer about what a token means.
 *
 * ── The compositing model ─────────────────────────────────────────────────────
 * Each surface is an ink inside a stack of nested element GROUPS over one opaque
 * base. A group carries its own background paint (possibly translucent) and its
 * own `opacity`. CSS `opacity` renders the subtree to a buffer and composites the
 * whole buffer — background included — at that alpha, which is why an opacity a
 * component sets for de-emphasis pulls BOTH the ink and its band toward the
 * backdrop and is invisible to any tool that reads computed `color` alone
 * (tools/check-slide-contrast.js cannot see it either — its number for a struck
 * `<del>` run is optimistic by design).
 *
 * ── The two arms ──────────────────────────────────────────────────────────────
 * Every surface is scored in BOTH cascade orders, and the two answers gate
 * different things:
 *
 *   1. REGRESSION (budget 0, no exemptions). A palette's own curated value must
 *      not be WORSE than the base default it overrides, on a surface a component
 *      composes: base-wins clears the bar, palette-wins does not. This is the
 *      invariant #1527 needs — both #1640 findings are exactly this shape — and it
 *      outlives the flip as a palette-curation rule, since `base.tokens.css` is
 *      the reference standard an override is meant to improve on.
 *
 *   2. ABSOLUTE (a frozen baseline, target zero). Which composed pairs are below
 *      their bar at all, and at what ratio. This population is large and mostly
 *      PRE-EXISTING — status ink on a 12% tint of itself is a hard surface, which
 *      is why the bar was proposed once before and reverted (see the `NOT audited
 *      (deliberately)` note in tools/contrast-audit.js). Re-curating fifteen
 *      palettes' status trios is its own slice (#1698), so the set is FROZEN
 *      rather than fixed: a new failure, an existing one getting worse, and a
 *      stale entry all fail.
 *
 * Any token the audit cannot resolve is a failure, not a skip — a skipped pair
 * reads as a pass, which is how a green gate hid a 2.49:1 rung (#1207).
 *
 * Usage:
 *   node tools/composed-contrast.js               # all themes
 *   node tools/composed-contrast.js indaco onyx   # specific themes
 *   node tools/composed-contrast.js --all         # list every pair, not just fails
 *
 * Gated by test/unit/palette/composed-surface-contrast.test.js.
 */

const fs   = require('fs');
const path = require('path');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr.js');
const { contrastRatio, hexToRgb, rgbToHex } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT       = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const BUNDLE     = path.join(ROOT, 'dist', 'lattice.css');

// ── Surface catalog ─────────────────────────────────────────────────────────
//
// Each entry describes what one component really paints, OUTERMOST group first:
//
//   base    an opaque expression — the paint the outermost group sits on
//   groups  nested element groups, outermost first. `bg` is that element's own
//           background (any expression the engine's evaluator understands, or
//           null); `opacity` is its CSS `opacity` (omit for 1).
//   ink     the text color, painted inside the innermost group
//   min     the WCAG bar this run owes (4.5 normal text · 3 large text / marks)
//   proactive  the CSS produces this pairing, but no deck in the repo writes the
//           markup that reaches it. Scored and frozen like any other surface, but
//           it never fires the REGRESSION arm: #1704 let two such surfaces drive
//           real brand hues, and one of those re-tunes collapsed magnolia's
//           warn^fail separation under tritanopia. A surface nobody renders does
//           not get to move a palette. Re-check the claim before adding one —
//           `grep` every *.md for the markup, and remember that a component can
//           set the state in CSS rather than markup (kpi paints its pass pill on
//           every default tile, so kpi/hero-pass-pill is NOT proactive).
//   src     the declaration site, and `requires` regexes that must still match it
//           — a surface whose rule has moved is re-derived, never silently kept.
//
// The 4% variants of the redline cards are deliberately absent: 5% is the same
// shape one step deeper (a fatter own-hue layer under the same band), so it
// bounds them. Scoring both would double the table and report the same defect.
const REDLINE = 'lib/components/comparison/redline/redline.styles.css';
const WORDCLOUD = 'lib/components/chart/word-cloud/word-cloud.transform.js';
const POLICY = 'lib/components/legal/policy-recommendation/policy-recommendation.styles.css';
const OBLIGATION = 'lib/components/legal/obligation-matrix/obligation-matrix.styles.css';
const KPI = 'lib/components/evidence/kpi/kpi.styles.css';
const CHECKLIST = 'lib/components/inventory/checklist/checklist.styles.css';

const CARD = (tok, pct) => `color-mix(in srgb, var(${tok}) ${pct}%, var(--bg-alt))`;

// Below-the-bar ratios are compared against the base default at this tolerance, so
// a rounding-level difference in the last decimal is not reported as a regression.
const REGRESSION_EPSILON = 0.01;

const SURFACES = [
  // ── redline · the default stage blockquote (bg-alt card) ──────────────────
  {
    id: 'redline/ins',
    ctx: 'redline: <ins> ink on its own --pass-bg tint over the stage card',
    base: '--bg-alt', groups: [{ bg: '--pass-bg' }], ink: '--pass', min: 4.5,
    src: REDLINE,
    requires: [/section\.redline ins[^{]*\{[^}]*background:var\(--pass-bg\)/],
  },
  {
    id: 'redline/del',
    ctx: 'redline: <del> ink on its own --fail-bg tint over the stage card',
    base: '--bg-alt', groups: [{ bg: '--fail-bg' }], ink: '--fail', min: 4.5,
    src: REDLINE,
    requires: [/section\.redline del[^{]*\{[^}]*background:var\(--fail-bg\)/],
  },
  // ── redline · .split / .stacked / .three-col / rl-old|rl-new cards ────────
  // The band lands on a SECOND own-hue tint, so the ink has less to work with
  // than on the bare card above. 5% is the deepest shipped tint.
  {
    id: 'redline/ins-on-new-card',
    proactive: true,
    ctx: 'redline .stacked/.split: <ins> on --pass-bg over the 5% NEW card',
    base: '--bg-alt', groups: [{ bg: CARD('--pass', 5) }, { bg: '--pass-bg' }],
    ink: '--pass', min: 4.5,
    src: REDLINE,
    requires: [/blockquote(?:\.rl-new|:nth-of-type\(2\))[^{]*\{[^}]*color-mix\(in srgb, var\(--pass\) 5%, var\(--bg-alt\)\)/],
  },
  {
    id: 'redline/del-on-old-card',
    proactive: true,
    ctx: 'redline .stacked/.split: <del> on --fail-bg over the 5% OLD card',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 5) }, { bg: '--fail-bg' }],
    ink: '--fail', min: 4.5,
    src: REDLINE,
    requires: [/blockquote(?:\.rl-old|:nth-of-type\(1\))[^{]*\{[^}]*color-mix\(in srgb, var\(--fail\) 5%, var\(--bg-alt\)\)/],
    // The engine's own quality bar is that a REDLINE reads: this is the deepest
    // own-hue stack it ships (a 12% band on a 5% card), so it binds --fail.
  },
  // The OLD / NEW label sits directly on the card, no band. Four rules paint each
  // one — .split and .three-col at a 4% tint, .stacked and the carousel block-split
  // at 5% — so all four are pinned and the DEEPEST (5%) is what gets scored.
  {
    id: 'redline/old-label',
    ctx: 'redline .stacked / .split / .three-col: the OLD label on the own-hue card (5%, the deepest)',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 5) }], ink: '--fail', min: 4.5,
    src: REDLINE,
    requires: [
      /blockquote\.rl-old::before[^}]*color:var\(--fail\)/,
      /\.stacked\.stacked > \.cell-stage > blockquote:nth-of-type\(1\)::before[^}]*color:var\(--fail\)/,
      /\.split\.split > \.cell-stage > blockquote:nth-of-type\(1\)::before[^}]*color:var\(--fail\)/,
      /\.three-col\.three-col > \.cell-stage > blockquote:nth-of-type\(1\)::before[^}]*color:var\(--fail\)/,
    ],
  },
  {
    id: 'redline/new-label',
    ctx: 'redline .stacked / .split / .three-col: the NEW label on the own-hue card (5%, the deepest)',
    base: '--bg-alt', groups: [{ bg: CARD('--pass', 5) }], ink: '--pass', min: 4.5,
    src: REDLINE,
    requires: [
      /blockquote\.rl-new::before[^}]*color:var\(--pass\)/,
      /\.stacked\.stacked > \.cell-stage > blockquote:nth-of-type\(2\)::before[^}]*color:var\(--pass\)/,
      /\.split\.split > \.cell-stage > blockquote:nth-of-type\(2\)::before[^}]*color:var\(--pass\)/,
      /\.three-col\.three-col > \.cell-stage > blockquote:nth-of-type\(2\)::before[^}]*color:var\(--pass\)/,
    ],
  },
  {
    id: 'redline/stacked-old-body',
    ctx: 'redline .stacked: the struck OLD passage on the 5% own-hue card',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 5) }], ink: '--text-heading', min: 4.5,
    src: REDLINE,
    requires: [/\.stacked\.stacked > \.cell-stage > blockquote:nth-of-type\(1\)\s*\{/],
  },
  // ── word-cloud spectrum · the base-derived sequential ramp as word fills ──
  // The four stops the heat ramp paints, keyed off weight (>=4.5 / >=3.5 / >=2.5 /
  // >=1.5). Measured on the component's own gallery slide the lower three render at
  // 56px / 38.3px / 23.5px at weight 700 and the top tier larger still — WCAG large
  // text on all four, so the bar is 3:1. The variant's `sizeSpread` is [14, 76], so a
  // cloud whose weight->size mapping put a ramp tier under 18.66px would owe 4.5
  // instead; no shipped deck does, and the sizes above are from a render rather than
  // from the config. `--seq-900` joined the set with #1697, which moved the top tier
  // off `var(--accent)` and onto the ramp — while that tier was a brand hue this
  // gate could not score it as a ramp stop, and contrast-audit scores --accent
  // against the canvas anyway.
  ...['900', '700', '500', '400'].map((stop) => ({
    id: `word-cloud/seq-${stop}`,
    ctx: `word-cloud spectrum: the --seq-${stop} word fill on the canvas`,
    base: '--bg', groups: [], ink: `--seq-${stop}`, min: 3,
    src: WORDCLOUD,
    requires: [new RegExp(`return 'var\\(--seq-${stop}\\)'`)],
  })),
  // ── policy-recommendation · the stance badge on its own 12% tint ─────────
  ...[['adopt', '--pass'], ['amend', '--warn'], ['oppose', '--fail'],
      ['defer', '--text-secondary'], ['', '--accent']].map(
    ([variant, tok]) => ({
      id: `policy-recommendation/${variant || 'default'}-badge`,
      ctx: `policy-recommendation${variant ? `.${variant}` : ''}: the stance badge ink on --stance-bg`,
      base: '--bg',
      groups: [{ bg: `color-mix(in srgb, var(${tok}) 12%, var(--bg))` }],
      ink: tok, min: 4.5,
      src: POLICY,
      requires: [/--stance-bg: color-mix\(in srgb, var\(--stance\) 12%, var\(--bg\)\)/],
    }),
  ),
  // ── kpi · the status pill on its own-hue fill ────────────────────────────
  // The universal pill (base.modifiers.css) inks `--pill-fg` on `--pill-bg`;
  // kpi points both at a status token and its 12% tint. `.ops` tiles sit on
  // `--bg-alt` — the same stack `redline/ins` already scores — so only the two
  // surfaces that are NOT duplicates are listed: the WARN arm (which redline has
  // no consumer for) and the hero tile, whose fill is `--accent-soft`.
  {
    id: 'kpi/warn-pill',
    ctx: 'kpi.ops / .attention: the warn pill ink on its own --warn-bg tint over the tile',
    base: '--bg-alt', groups: [{ bg: '--warn-bg' }], ink: '--warn', min: 4.5,
    src: KPI,
    requires: [/--pill-bg: var\(--warn-bg\);\s*\n?\s*--pill-fg: var\(--warn\)/],
  },
  {
    id: 'kpi/hero-pass-pill',
    ctx: 'kpi (default/briefing): the pass pill on --pass-bg over the accent-soft hero tile',
    base: '--accent-soft', groups: [{ bg: '--pass-bg' }], ink: '--pass', min: 4.5,
    src: KPI,
    requires: [
      /--pill-bg: var\(--pass-bg\);\s*\n?\s*--pill-fg: var\(--pass\)/,
      /li:nth-child\(1\)[^{]*\{[^}]*background: var\(--accent-soft\)/,
    ],
  },
  // ── checklist · the state row, whose own-hue wash sits on the CANVAS ─────
  // Same shape as redline's band one layer up: `--bg` rather than `--bg-alt`.
  ...[['pass', '--pass'], ['warn', '--warn'], ['fail', '--fail']].map(([state, tok]) => ({
    id: `checklist/${state}-row`,
    ctx: `checklist: the ${state} row's state DISC and rail on its own --${state}-bg wash`,
    // 3:1, not 4.5. checklist paints NO text in the state hue — the file's only
    // `color:` values are --text-heading, --text-muted and --text-secondary. What
    // carries the hue is the ::before disc (--state-fill-pct:100%) and the
    // border-left rail, which are non-text graphical objects and owe WCAG 1.4.11's
    // 3:1. Scoring them at the text bar reported 24 compliant surfaces as defects
    // and would have red-gated a future palette on a surface that meets WCAG.
    base: '--bg', groups: [{ bg: `--${state}-bg` }], ink: tok, min: 3,
    src: CHECKLIST,
    requires: [new RegExp(`--state-color:var\\(${tok}\\);[\\s\\S]{0,120}background:var\\(--${state}-bg`)],
  })),
  // ── obligation-matrix .heat · body ink on the own-hue cell wash ──────────
  // NB the component maps the pass CELL to a --fail wash and vice versa on
  // purpose (a heat map reads "hot = attention"), so the tokens below are the
  // wash hues, not the state names.
  ...[['14', '--fail'], ['14', '--warn'], ['10', '--pass'], ['6', '--text-muted']].map(([pct, tok]) => ({
    id: `obligation-matrix/heat-${tok.replace(/^--/, '')}`,
    ctx: `obligation-matrix.heat: table body ink on the ${pct}% ${tok} cell wash`,
    base: '--bg',
    groups: [{ bg: `color-mix(in srgb, var(${tok}) ${pct}%, var(--bg))` }],
    ink: '--text-body', min: 4.5,
    src: OBLIGATION,
    requires: [new RegExp(`color-mix\\(in srgb, var\\(${tok}\\) ${pct}%, var\\(--bg\\)\\)`)],
  })),
];

// ── The frozen sub-threshold baseline ───────────────────────────────────────
//
// Every (theme × mode × surface) pair that is below its bar today, with the ratio
// it scores. This is a real backlog, not a set of individually justified
// exemptions: status ink on a 12% tint of ITSELF is a surface most curated hues do
// not clear, and re-curating fifteen palettes' status trios is a slice of its own
// (#1698). Recorded here so it is visible and bounded rather than invisible.
//
// It is a SHRINKING baseline, and it has shrunk once: the 24 `word-cloud/seq-*`
// rows left when this file landed were the canvas-blind sequential ramp, and #1697
// made the ramp's poles canvas-relative and re-anchored every palette's dark arm
// mid-range. All 24 are gone — deleted, not re-frozen, which is what the stale arm
// below exists to force.
//
// It is a keyed map rather than a count, and the difference is load-bearing. A
// count says "no MORE failures"; it says nothing about an existing failure getting
// worse, so a palette could take a 1.66:1 word fill to 1.03:1 with the gate green.
// Keyed with its ratio, the gate fails on:
//
//   · a below-bar pair that is not listed          — a new defect
//   · a listed pair that scores worse than frozen  — an old defect getting worse
//   · a listed pair that now passes, or no longer
//     exists as a (theme, mode, surface) triple    — a stale entry, so it can't rot
//
// Ratios are floored to 2dp; DEGRADE_TOLERANCE absorbs the last digit.
//
// A NEW PALETTE WILL LAND HERE. `tools/new-theme.js` scaffolds from
// `themes/indaco.css`, which carries two of these rows, so a fresh palette starts
// with two new keys and this gate goes red. That is the gate working: either
// re-tune the two arms it names, or add the rows with the tracking issue in the
// commit message. Do not delete the check.
const DEGRADE_TOLERANCE = 0.02;

const KNOWN_SUB_THRESHOLD = new Map([
  // ── checklist/fail-row ── 1
  ['carbone|light|checklist/fail-row', 2.09],
  // ── checklist/pass-row ── 1
  ['carbone|light|checklist/pass-row', 2.75],
  // ── kpi/hero-pass-pill ── 9
  ['atelier-dark|light|kpi/hero-pass-pill', 3.79],
  ['atelier|light|kpi/hero-pass-pill', 3.79],
  ['burgundy-dark|light|kpi/hero-pass-pill', 3.93],
  ['burgundy|light|kpi/hero-pass-pill', 3.93],
  ['carbone|light|kpi/hero-pass-pill', 1.88],
  ['crepuscolo-dark|light|kpi/hero-pass-pill', 4.47],
  ['crepuscolo|light|kpi/hero-pass-pill', 4.47],
  ['magnolia-dark|light|kpi/hero-pass-pill', 4.34],
  ['magnolia|light|kpi/hero-pass-pill', 4.34],
  // ── kpi/warn-pill ── 33
  ['a11y-achromatopsia|light|kpi/warn-pill', 4.05],
  ['a11y-base|light|kpi/warn-pill', 4.28],
  ['a11y-deuteranopia|light|kpi/warn-pill', 4.06],
  ['a11y-protanopia|light|kpi/warn-pill', 4.06],
  ['a11y-tritanopia|light|kpi/warn-pill', 4.02],
  ['ardesia-dark|light|kpi/warn-pill', 3.95],
  ['ardesia|light|kpi/warn-pill', 3.95],
  ['atelier-dark|light|kpi/warn-pill', 4.03],
  ['atelier|light|kpi/warn-pill', 4.03],
  ['brina-dark|light|kpi/warn-pill', 4.07],
  ['brina|light|kpi/warn-pill', 4.07],
  ['burgundy-dark|light|kpi/warn-pill', 4.05],
  ['burgundy|light|kpi/warn-pill', 4.05],
  ['carbone|dark|kpi/warn-pill', 4.10],
  ['carbone|light|kpi/warn-pill', 2.80],
  ['carta-dark|light|kpi/warn-pill', 4.13],
  ['carta|light|kpi/warn-pill', 4.13],
  ['concrete-dark|dark|kpi/warn-pill', 4.40],
  ['concrete|dark|kpi/warn-pill', 4.40],
  ['crepuscolo-dark|light|kpi/warn-pill', 4.07],
  ['crepuscolo|light|kpi/warn-pill', 4.07],
  ['cuoio-dark|light|kpi/warn-pill', 4.46],
  ['cuoio|light|kpi/warn-pill', 4.46],
  ['indaco-dark|light|kpi/warn-pill', 4.10],
  ['indaco|light|kpi/warn-pill', 4.10],
  ['laguna-dark|light|kpi/warn-pill', 3.96],
  ['laguna|light|kpi/warn-pill', 3.96],
  ['magnolia-dark|light|kpi/warn-pill', 4.02],
  ['magnolia|light|kpi/warn-pill', 4.02],
  ['mustard-dark|light|kpi/warn-pill', 3.96],
  ['mustard|light|kpi/warn-pill', 3.96],
  ['onyx-dark|light|kpi/warn-pill', 4.28],
  ['onyx|light|kpi/warn-pill', 4.28],
  // ── policy-recommendation/adopt-badge ── 3
  ['carbone|light|policy-recommendation/adopt-badge', 2.94],
  ['concrete-dark|light|policy-recommendation/adopt-badge', 4.06],
  ['concrete|light|policy-recommendation/adopt-badge', 4.06],
  // ── policy-recommendation/amend-badge ── 23
  ['a11y-achromatopsia|light|policy-recommendation/amend-badge', 4.39],
  ['a11y-deuteranopia|light|policy-recommendation/amend-badge', 4.37],
  ['a11y-protanopia|light|policy-recommendation/amend-badge', 4.37],
  ['a11y-tritanopia|light|policy-recommendation/amend-badge', 4.37],
  ['ardesia-dark|light|policy-recommendation/amend-badge', 4.45],
  ['ardesia|light|policy-recommendation/amend-badge', 4.45],
  ['brina-dark|light|policy-recommendation/amend-badge', 4.36],
  ['brina|light|policy-recommendation/amend-badge', 4.36],
  ['burgundy-dark|light|policy-recommendation/amend-badge', 4.40],
  ['burgundy|light|policy-recommendation/amend-badge', 4.40],
  ['carbone|light|policy-recommendation/amend-badge', 3.46],
  ['carta-dark|light|policy-recommendation/amend-badge', 4.44],
  ['carta|light|policy-recommendation/amend-badge', 4.44],
  ['concrete-dark|light|policy-recommendation/amend-badge', 4.02],
  ['concrete|light|policy-recommendation/amend-badge', 4.02],
  ['crepuscolo-dark|light|policy-recommendation/amend-badge', 4.50],
  ['crepuscolo|light|policy-recommendation/amend-badge', 4.50],
  ['indaco-dark|light|policy-recommendation/amend-badge', 4.34],
  ['indaco|light|policy-recommendation/amend-badge', 4.34],
  ['laguna-dark|light|policy-recommendation/amend-badge', 4.28],
  ['laguna|light|policy-recommendation/amend-badge', 4.28],
  ['mustard-dark|light|policy-recommendation/amend-badge', 4.40],
  ['mustard|light|policy-recommendation/amend-badge', 4.40],
  // ── policy-recommendation/default-badge ── 2
  ['mustard-dark|light|policy-recommendation/default-badge', 3.76],
  ['mustard|light|policy-recommendation/default-badge', 3.76],
  // ── policy-recommendation/defer-badge ── 6
  ['brina-dark|light|policy-recommendation/defer-badge', 4.30],
  ['brina|light|policy-recommendation/defer-badge', 4.30],
  ['cuoio-dark|light|policy-recommendation/defer-badge', 4.34],
  ['cuoio|light|policy-recommendation/defer-badge', 4.34],
  ['laguna-dark|light|policy-recommendation/defer-badge', 4.50],
  ['laguna|light|policy-recommendation/defer-badge', 4.50],
  // ── policy-recommendation/oppose-badge ── 3
  ['carbone|light|policy-recommendation/oppose-badge', 2.17],
  ['concrete-dark|light|policy-recommendation/oppose-badge', 3.93],
  ['concrete|light|policy-recommendation/oppose-badge', 3.93],
  // ── redline/del ── 3
  ['carbone|light|redline/del', 1.85],
  ['concrete-dark|dark|redline/del', 3.82],
  ['concrete|dark|redline/del', 3.82],
  // ── redline/del-on-old-card ── 12
  ['ardesia-dark|dark|redline/del-on-old-card', 4.23],
  ['ardesia|dark|redline/del-on-old-card', 4.23],
  ['brina-dark|dark|redline/del-on-old-card', 4.33],
  ['brina|dark|redline/del-on-old-card', 4.33],
  ['carbone|dark|redline/del-on-old-card', 4.25],
  ['carbone|light|redline/del-on-old-card', 1.81],
  ['carta-dark|dark|redline/del-on-old-card', 4.42],
  ['carta|dark|redline/del-on-old-card', 4.42],
  ['concrete-dark|dark|redline/del-on-old-card', 3.53],
  ['concrete|dark|redline/del-on-old-card', 3.53],
  ['laguna-dark|dark|redline/del-on-old-card', 4.46],
  ['laguna|dark|redline/del-on-old-card', 4.46],
  // ── redline/ins ── 7
  ['atelier-dark|light|redline/ins', 4.20],
  ['atelier|light|redline/ins', 4.20],
  ['carbone|light|redline/ins', 2.39],
  ['magnolia-dark|light|redline/ins', 4.45],
  ['magnolia|light|redline/ins', 4.45],
  ['mustard-dark|light|redline/ins', 4.28],
  ['mustard|light|redline/ins', 4.28],
  // ── redline/ins-on-new-card ── 16
  ['a11y-tritanopia|light|redline/ins-on-new-card', 4.44],
  ['atelier-dark|light|redline/ins-on-new-card', 3.97],
  ['atelier|light|redline/ins-on-new-card', 3.97],
  ['burgundy-dark|light|redline/ins-on-new-card', 4.26],
  ['burgundy|light|redline/ins-on-new-card', 4.26],
  ['carbone|light|redline/ins-on-new-card', 2.30],
  ['carta-dark|light|redline/ins-on-new-card', 4.41],
  ['carta|light|redline/ins-on-new-card', 4.41],
  ['concrete-dark|dark|redline/ins-on-new-card', 4.18],
  ['concrete|dark|redline/ins-on-new-card', 4.18],
  ['crepuscolo-dark|light|redline/ins-on-new-card', 4.39],
  ['crepuscolo|light|redline/ins-on-new-card', 4.39],
  ['magnolia-dark|light|redline/ins-on-new-card', 4.19],
  ['magnolia|light|redline/ins-on-new-card', 4.19],
  ['mustard-dark|light|redline/ins-on-new-card', 4.03],
  ['mustard|light|redline/ins-on-new-card', 4.03],
  // ── redline/new-label ── 1
  ['carbone|light|redline/new-label', 2.71],
  // ── redline/old-label ── 3
  ['carbone|light|redline/old-label', 1.95],
  ['concrete-dark|dark|redline/old-label', 4.26],
  ['concrete|dark|redline/old-label', 4.26],
]);

// ── Color compositing ──────────────────────────────────────────────────────

/** `#rrggbb` / `rgba(r,g,b,a)` / `transparent` / `white` / `black` → {rgb,a}. */
function toRgba(value) {
  if (value == null) return null;
  const s = String(value).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  }
  const lower = s.toLowerCase();
  if (lower === 'transparent') return { rgb: [0, 0, 0], a: 0 };
  if (lower === 'white') return { rgb: [255, 255, 255], a: 1 };
  if (lower === 'black') return { rgb: [0, 0, 0], a: 1 };
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return { rgb: hexToRgb(s), a: 1 };
  return null;
}

/** Composite premultiplied-equivalent `top` over `bottom`. */
function over(top, bottom) {
  if (top.a <= 0) return { rgb: bottom.rgb.slice(), a: bottom.a };
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { rgb: [0, 0, 0], a: 0 };
  const rgb = top.rgb.map(
    (c, i) => (c * top.a + bottom.rgb[i] * bottom.a * (1 - top.a)) / a,
  );
  return { rgb, a };
}

// ── Token map ───────────────────────────────────────────────────────────────

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/**
 * `:root`-family declaration blocks only, and ONLY where `:root` is the whole
 * compound selector.
 *
 * Two traps, both hit while building this. A flat sweep of the bundle picks up the
 * `section.print` band's remaps (`--pass: var(--print-pass)`) and every
 * component-scoped recipe, and last-wins would then hand the audit the print
 * palette on every theme. And a pattern that merely CONTAINS `:root` matches a
 * DESCENDANT rule — `dist/lattice.css` ships `:root[data-lattice-view="fluid"] body
 * { … }`, whose custom properties are scoped to `body`, not to `:root`. So each
 * comma-part of the selector is tested whole: a compound built only out of
 * `:root` / `:root:root` / `:where(:root)` plus attribute or pseudo-class
 * qualifiers, with no combinator.
 *
 * At-rules are entered rather than skipped, so a `:root` inside `@media`/`@supports`
 * is still read; none exists in `themes/` today, and silently dropping one later
 * would be the "skipped pair reads as a pass" failure this gate exists to avoid.
 */
const ROOT_COMPOUND = /^(?::root|:root:root|:where\(:root\))(?:\[[^\]]*\]|:(?!:)[a-z-]+(?:\([^()]*\))?)*$/i;

function rootBlocks(css) {
  const s = stripComments(css);
  const out = [];
  const scan = (from, to) => {
    let i = from;
    let selStart = from;
    while (i < to) {
      const ch = s[i];
      if (ch === '{') {
        const sel = s.slice(selStart, i).trim();
        let depth = 1;
        let j = i + 1;
        while (j < to && depth > 0) {
          if (s[j] === '{') depth++;
          else if (s[j] === '}') depth--;
          j++;
        }
        const bodyEnd = j - 1;
        if (sel.startsWith('@')) scan(i + 1, bodyEnd);              // at-rule: descend
        else if (sel.split(',').some((part) => ROOT_COMPOUND.test(part.trim()))) {
          out.push(s.slice(i + 1, bodyEnd));
        }
        i = j;
        selStart = i;
        continue;
      }
      // `;` ENDS A STATEMENT, and forgetting that is not cosmetic: a theme opens
      // with `@import 'parent';` and no closing brace, so without this the first
      // rule's "selector" reads `@import 'parent'; … :root`, starts with `@`, and
      // gets descended into as an at-rule — every a11y palette then resolved to
      // its PARENT's tokens with the gate still green.
      if (ch === '}' || ch === ';') { i++; selStart = i; continue; }
      i++;
    }
  };
  scan(0, s.length);
  return out;
}

function parseRootVars(css, into = {}) {
  for (const block of rootBlocks(css)) {
    for (const d of (block.match(/--[a-z0-9-]+\s*:\s*[^;{}]+/gi) || [])) {
      // `s` flag: a custom-property value may span lines — a palette author is
      // free to write `--fail: light-dark(\n  #AF102D,\n  #FF6B72);`. Without it
      // `(.+)$` cannot match and the declaration was DROPPED, so `mergedVars`
      // silently fell back to the bundle default: both cascade orders then agree
      // and the gate passes a value that does not exist. That contradicts this
      // file's own contract — an unresolvable token is a failure, not a skip.
      const m = d.match(/--([a-z0-9-]+)\s*:\s*([\s\S]+)$/i);
      if (m) into[m[1]] = m[2].trim().replace(/\s+/g, ' ');
    }
  }
  return into;
}

/**
 * A palette's chain, PARENT FIRST — the order a child overrides in.
 *
 * Delegated to `lib/theme/chain.mjs` + the generated manifest edges, which is the
 * canonical theme graph (2026-08-16-manifest-is-the-theme-contract.md). That note
 * is explicit that no stylesheet is parsed to discover it, and it records exactly
 * the drift a fresh `@import` regex reproduces: a `\s+`-anchored pattern misses a
 * minified `@import"indaco"` and silently drops the parent, which is how the
 * emulator once resolved a palette without its own base. One graph, no fourth
 * parser (HARD RULE #1 / #15).
 */
function paletteChainFiles(name) {
  return themeChain(name, THEME_EDGES)
    .map((n) => path.join(THEMES_DIR, `${n}.css`))
    .filter((f) => fs.existsSync(f));
}

let bundleCache = null;
function bundleVars() {
  if (!bundleCache) {
    if (!fs.existsSync(BUNDLE)) {
      throw new Error(
        `composed-contrast: ${path.relative(ROOT, BUNDLE)} is missing — run \`npm run build\`. ` +
        'The base defaults this gate resolves through live in the bundle, not in the themes.',
      );
    }
    bundleCache = parseRootVars(fs.readFileSync(BUNDLE, 'utf8'), {});
  }
  return bundleCache;
}

/**
 * Merged token map for one palette.
 *
 * `baseWins` composes the OTHER way — the order `lattice-emulator.js` uses for
 * the document shell until #1527 flips it, where `base.tokens.css`'s universal
 * defaults override everything a palette curated. The REGRESSION arm needs both
 * so it can ask whether the palette's own value is worse than the default it
 * replaces.
 */
function mergedVars(theme, { baseWins = false } = {}) {
  const palette = {};
  for (const f of paletteChainFiles(theme)) parseRootVars(fs.readFileSync(f, 'utf8'), palette);
  return baseWins ? { ...palette, ...bundleVars() } : { ...bundleVars(), ...palette };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function evalSurface(vars, surface, isDark) {
  const paint = (expr) => {
    if (expr == null) return { rgb: [0, 0, 0], a: 0 };
    const raw = expr.startsWith('--') ? vars[expr.slice(2)] : expr;
    if (raw === undefined) return null;
    return toRgba(resolveTokenExpr(String(raw), vars, isDark));
  };
  const base = paint(surface.base);
  if (!base || base.a < 0.999) return null;   // the base must be opaque
  const inkPaint = paint(surface.ink);
  if (!inkPaint || inkPaint.a <= 0) return null;

  // Walk the groups innermost-first: composite onto that group's own
  // background, then scale by its opacity before it leaves the group.
  const groups = surface.groups || [];
  const climb = (seed) => {
    let acc = seed;
    for (let i = groups.length - 1; i >= 0; i--) {
      const bg = paint(groups[i].bg);
      if (bg === null) return null;
      acc = over(acc, bg);
      acc = { rgb: acc.rgb, a: acc.a * (groups[i].opacity ?? 1) };
    }
    return over(acc, base);
  };
  const fg = climb({ rgb: inkPaint.rgb.slice(), a: inkPaint.a });
  const bg = climb({ rgb: [0, 0, 0], a: 0 });
  if (!fg || !bg) return null;
  const fgHex = rgbToHex(fg.rgb);
  const bgHex = rgbToHex(bg.rgb);
  return { ratio: contrastRatio(fgHex, bgHex), fgHex, bgHex };
}

function listAllThemes() {
  return fs.readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace('.css', ''))
    .sort();
}

/**
 * Both modes are scored for EVERY palette, with no per-palette exemption. A
 * light-pinned palette still meets the dark arms through a per-slide
 * `_class: dark` (which sets color-scheme on the SECTION, under the deck pin —
 * the seam #1323 and #1681 both landed on), and a dark-pinned one meets the light
 * arms through `_class: light` / `.print`.
 */
const MODES = [['light', false], ['dark', true]];

/** Audit one theme in both cascade orders. Pure — no console, no process state. */
function auditTheme(theme) {
  if (!fs.existsSync(path.join(THEMES_DIR, `${theme}.css`))) return null;
  const vars     = mergedVars(theme);
  const baseVars = mergedVars(theme, { baseWins: true });
  const rows = [];
  for (const [mode, isDark] of MODES) {
    for (const s of SURFACES) {
      const key  = `${theme}|${mode}|${s.id}`;
      const res  = evalSurface(vars, s, isDark);
      const base = evalSurface(baseVars, s, isDark);
      if (!res || !base) { rows.push({ key, theme, mode, surface: s, unresolved: true }); continue; }
      const below = res.ratio < s.min;
      rows.push({
        key, theme, mode, surface: s,
        ratio: res.ratio, fgHex: res.fgHex, bgHex: res.bgHex,
        baseRatio: base.ratio,
        below,
        // BELOW ITS BAR *AND* WORSE THAN THE BASE DEFAULT IT OVERRIDES. The
        // straddle-only form (`below && base >= min`) reads more natural and is
        // wrong twice: it misses a regression where base itself lands a hair under
        // the bar (carta's `redline/ins-on-new-card` was 4.49 -> 4.41 and silent),
        // and it lets an ALREADY-failing pair degrade without limit — a palette
        // could take a 1.66:1 word fill to 1.03:1 with both arms green. Adding
        // `< baseRatio` costs nothing above the bar, where a palette is free to
        // curate a value that scores differently from the default.
        regressed: below && res.ratio < base.ratio - REGRESSION_EPSILON,
      });
    }
  }
  return { theme, rows };
}

/**
 * A component whose surfaces are modelled WITHOUT a group alpha must not declare
 * one anywhere, because a group alpha applies to whatever it wraps: putting it on
 * an ancestor, a sibling rule, or a decoy selector changes the composite just as a
 * `del { opacity }` would. A per-rule "this block contains no `opacity`" pattern
 * cannot see any of those — an adversarial pass got three separate re-additions
 * past exactly that shape — so the check is file-scoped and shape-blind: no
 * fractional `opacity` in the sheet at all.
 *
 * `redline` is the one entry today. It is not a ban on the property: it is the
 * pin that keeps SURFACES honest. Adding one back means adding it to the model
 * too — `groups[].opacity` — and re-deriving the values that were solved through it
 * (#1640; base.tokens.css's rule is "spend size or weight, not alpha").
 */
const NO_GROUP_ALPHA = [REDLINE];
// Every shape a group alpha can take, not just `0.85`. An adversarial pass got
// `opacity: 85%` (valid CSS Color 4, Chromium 78+), `opacity: var(--wash)`,
// `OPACITY: .85` and `opacity: .85 !important` past the first cut of this — and
// the pattern also has to tolerate `!important` and a missing final `;`.
// A literal `1`, `100%` or `inherit` is not a group alpha and is allowed.
const FRACTIONAL_OPACITY =
  /(^|[;{\s])opacity\s*:\s*(?!(?:1(?:\.0+)?|100%|inherit|initial|unset|revert)\s*(?:!important\s*)?[;}])[^;{}]+/i;
// The sheets an ancestor wash could reach these surfaces through. A group alpha
// on ANY of them composites redline's ink the same way its own rule would, and
// scanning only the component's file cannot see it: base.modifiers.css already
// carries eleven fractional opacities of its own, none of them on this path.
const ANCESTOR_SHEETS = [
  'lib/base/base.modifiers.css',
  'lib/base/base.elements.css',
];
// Selectors in those sheets that would actually wrap a redline surface. Checked
// by selector rather than by file, so the eleven unrelated washes stay legal.
const ANCESTOR_REACHES_REDLINE = /(^|[,}])\s*section\.redline[^{,]*\{[^}]*opacity\s*:/i;

/**
 * Every surface's `requires` regexes still match its declaration site, and every
 * sheet in NO_GROUP_ALPHA still has none. A rule that moved makes this catalog a
 * description of code that no longer exists — which is the failure mode that lets
 * a gate report green about nothing.
 */
function checkSurfaceEvidence() {
  const errors = [];
  for (const s of SURFACES) {
    const file = path.join(ROOT, s.src);
    if (!fs.existsSync(file)) { errors.push(`${s.id}: ${s.src} is gone — re-derive this surface.`); continue; }
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const re of s.requires || []) {
      if (!re.test(src)) {
        errors.push(
          `${s.id}: the rule this surface models is no longer in ${s.src} ` +
          `(${re}). Re-derive the surface from the CSS; do not delete the check.`,
        );
      }
    }
  }
  for (const rel of NO_GROUP_ALPHA) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { errors.push(`${rel} is gone — re-derive the surfaces that name it.`); continue; }
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    if (FRACTIONAL_OPACITY.test(src)) {
      errors.push(
        `${rel} declares a fractional \`opacity\`, but every surface modelled from it ` +
        'assumes no group alpha. Add it to the surface\'s `groups[].opacity` and re-derive ' +
        'the palette arms solved through it, or take the opacity back out.',
      );
    }
  }
  // An ancestor wash in a SHARED sheet reaches these surfaces just as the
  // component's own rule would, and the per-file scan above cannot see it.
  for (const rel of ANCESTOR_SHEETS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    if (ANCESTOR_REACHES_REDLINE.test(src)) {
      errors.push(
        `${rel} sets an \`opacity\` on a \`section.redline\` selector. That composites ` +
        'every redline surface in SURFACES, which are modelled without a group alpha. ' +
        'Model it in `groups[].opacity` and re-derive, or take it out.',
      );
    }
  }
  return errors;
}

/**
 * Full audit, plus the catalog's own evidence check and the baseline's hygiene.
 *
 * `stale` is only computed over a FULL run: a single-theme invocation naturally
 * produces none of the other themes' rows, and reporting those as stale would
 * teach the reader to ignore the field.
 */
function auditAll(themes = listAllThemes()) {
  const rows = [];
  for (const t of themes) {
    const res = auditTheme(t);
    if (res) rows.push(...res.rows);
  }
  const below = rows.filter((r) => r.below);
  const belowKeys = new Set(below.map((r) => r.key));
  const full = themes.length === listAllThemes().length;
  return {
    rows,
    unresolved:  rows.filter((r) => r.unresolved),
    // PROACTIVE surfaces are excluded from the REGRESSION arm — see the
    // `proactive` note on the catalog. They are still scored, still counted, and
    // still frozen, so they cannot silently worsen; they simply do not force a
    // palette to move a brand hue for markup no deck writes.
    regressions: rows.filter((r) => r.regressed && !r.surface.proactive),
    below,
    // Below its bar and NOT in the frozen baseline — a new defect.
    unlisted: below.filter((r) => !KNOWN_SUB_THRESHOLD.has(r.key)),
    // Listed, and now scoring worse than it did when frozen.
    degraded: below
      .filter((r) => KNOWN_SUB_THRESHOLD.has(r.key))
      .map((r) => ({ ...r, frozen: KNOWN_SUB_THRESHOLD.get(r.key) }))
      .filter((r) => r.ratio < r.frozen - DEGRADE_TOLERANCE),
    // Listed but no longer failing (or no longer produced at all) — delete it.
    stale: full
      ? [...KNOWN_SUB_THRESHOLD.keys()].filter((k) => !belowKeys.has(k))
      : [],
    evidence: checkSurfaceEvidence(),
  };
}

module.exports = {
  SURFACES, KNOWN_SUB_THRESHOLD, DEGRADE_TOLERANCE, MODES,
  auditTheme, auditAll, listAllThemes, mergedVars, evalSurface, checkSurfaceEvidence,
};

// ── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args   = process.argv.slice(2);
  const showAll = args.includes('--all');
  const themes = args.filter((a) => !a.startsWith('-'));
  const res    = auditAll(themes.length ? themes : listAllThemes());

  console.log('\n  Lattice · Composed-surface contrast');
  console.log('  ══════════════════════════════════════════════════════════════');
  console.log('  Palette wins the cascade (engine order / post-#1527 export order)\n');

  if (showAll) {
    for (const r of res.rows) {
      if (r.unresolved) { console.log(`  ?     ${r.key}`); continue; }
      const mark = r.regressed ? '  ✗  ' : r.below ? 'under' : '  ✓  ';
      console.log(
        `  ${mark} ${r.ratio.toFixed(2).padStart(6)}:1 (need ${r.surface.min}, ` +
        `base ${r.baseRatio.toFixed(2)})  ${r.key}`,
      );
    }
    console.log('');
  }

  for (const e of res.evidence) console.log(`  ! catalog: ${e}`);
  for (const r of res.unresolved) console.log(`  ? unresolved: ${r.key} — ${r.surface.ctx}`);
  for (const r of res.regressions) {
    console.log(
      `  ✗ ${r.baseRatio.toFixed(2)} -> ${r.ratio.toFixed(2)}:1 (need ${r.surface.min})  ${r.key}`,
    );
    console.log(`       ${r.surface.ctx}`);
    console.log(`       ink ${r.fgHex} on ${r.bgHex}  ·  ${r.surface.src}`);
  }

  for (const r of res.unlisted) {
    console.log(`  ✗ ${r.ratio.toFixed(2).padStart(6)}:1 (need ${r.surface.min})  ${r.key}  — NOT in the frozen baseline`);
    console.log(`       ${r.surface.ctx}`);
    console.log(`       ink ${r.fgHex} on ${r.bgHex}  ·  ${r.surface.src}`);
  }
  for (const r of res.degraded) {
    console.log(`  ✗ ${r.key}  ${r.frozen.toFixed(2)} -> ${r.ratio.toFixed(2)}:1 — already below its bar, and now worse`);
  }
  for (const k of res.stale) console.log(`  ! stale KNOWN_SUB_THRESHOLD entry (delete it): ${k}`);

  const bad = res.regressions.length + res.unresolved.length + res.evidence.length
            + res.unlisted.length + res.degraded.length + res.stale.length;
  console.log('\n  ══════════════════════════════════════════════════════════════');
  console.log(
    `  ${res.regressions.length} cascade regressions · ${res.unlisted.length} unlisted · ` +
    `${res.degraded.length} degraded · ${res.stale.length} stale · ${res.unresolved.length} unresolved\n` +
    `  ${res.below.length} of ${res.rows.length} pairs below their bar ` +
    `(${KNOWN_SUB_THRESHOLD.size} frozen in the baseline)\n`,
  );
  process.exitCode = bad ? 1 : 0;
}
