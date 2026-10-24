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
 * #1640, when the palette winning the cascade was still a proposal: five brand
 * palettes' `redline` runs and the `word-cloud` spectrum on onyx / concrete / the
 * four a11y palettes fell sub-threshold the moment it did, and every gate in the
 * repo stayed green because no gate looks at a composed surface. #1527 has since
 * landed, so those readings are what ships rather than what would.
 *
 * ── What it resolves ──────────────────────────────────────────────────────────
 * The merged token map is `dist/lattice.css`'s `:root` defaults with the palette
 * chain's `:root` on top — PALETTE WINS. That is the order `lib/engine/css.js`
 * `composeCss` has always used (Studio, docs Playground) and, since #1527, the order
 * the export path takes too — so this gate is truthful for every path that renders a
 * slide. Evaluation is delegated to
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
 *      composes: base-wins clears the bar, palette-wins does not. This was the
 *      invariant #1527 needed — both #1640 findings are exactly this shape — and it
 *      outlived the flip as a palette-curation rule, since `base.tokens.css` is the
 *      reference standard an override is meant to improve on.
 *
 *      NOTE WHAT THAT COUPLING MEANS, because it is not obvious and it has already
 *      blocked one change. BOTH arms are computed analytically from the two merged
 *      maps, so this arm does not depend on which order the export actually uses:
 *      the flip did not relax it and could not. It is a comparison of two INKS on
 *      the SAME canvas (the base declares no `--bg`), so it is apples-to-apples —
 *      and it means improving a base default RAISES the bar every palette override
 *      is measured against. Respacing the status trio's default to clear the
 *      achromatopsia floor fires six regressions on `concrete`, whose dark `--fail`
 *      cannot be re-solved: `redline/del` floors it at achromatopsia weight 0.786
 *      while AA floors `--pass`/`--warn` at ~0.79, leaving 0.21 of range where three
 *      signals mutually >= 0.11 need 0.22. See
 *      engineering/decisions/2026-08-24-palette-cascade-flip.md 5.
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
const { themeEntries } = require('../lib/theme/files.js');
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
// All four redline card families sit at 4% as of #1846, which levelled `.stacked` and
// `.rl-old`/`.rl-new` down from 5% to match `.split` / `.three-col`. One depth means one
// surface bounds them all -- but it also means the depth alone no longer IDENTIFIES a
// site, so the card pins below are anchored to their selectors. (Before the levelling
// this note said 5% "bounds" the 4% variants; that argument retired with the 5%.)
const REDLINE = 'lib/components/comparison/redline/redline.styles.css';
const WORDCLOUD = 'lib/components/chart/word-cloud/word-cloud.transform.js';
const POLICY = 'lib/components/legal/policy-recommendation/policy-recommendation.styles.css';
const OBLIGATION = 'lib/components/legal/obligation-matrix/obligation-matrix.styles.css';
const KPI = 'lib/components/evidence/kpi/kpi.styles.css';
const SPLITPANEL = 'lib/components/statement/split-panel/split-panel.styles.css';
const SPLITCOMPARE = 'lib/components/comparison/split-compare/split-compare.styles.css';
const CHECKLIST = 'lib/components/inventory/checklist/checklist.styles.css';
const CHARTFAMILY = 'lib/plugins/chart-family/chart-family.styles.css';
const BASETOKENS = 'lib/base/base.tokens.css';
const ROADMAP = 'lib/components/chart/roadmap/roadmap.styles.css';
const REGUPDATE = 'lib/components/legal/regulatory-update/regulatory-update.styles.css';
const KANBAN   = 'lib/components/chart/kanban/kanban.styles.css';
const STATECHART = 'lib/components/chart/state-chart/state-chart.styles.css';
const STATECHART_JS = 'lib/components/chart/state-chart/state-chart.layout.js';
const ELEMENTS = 'lib/base/base.elements.css';

// The kanban card's own opaque fill — the base every in-card surface sits on. Light is
// `--bg-alt` flat; DARK lifts it 12% toward white, so a dark card sits LIGHTER than the
// canvas and an ink tuned against `--bg` has less to work with, not more.
const KANBAN_CARD = 'light-dark(var(--bg-alt), color-mix(in oklab, var(--bg-alt) 88%, white))';
// The inline-code chip's ink, spelled as base.elements.css spells it. Its own background
// is `currentColor` at 10%, which resolves to exactly this — so the band moves with the
// ink, the `redline` shape one layer deeper.
const CHIP_INK = 'var(--code-inline-fg, var(--accent))';

/**
 * The bar for the split frames' panel-edge mark, and why it is NOT 3:1.
 *
 * Every other surface here scores TEXT, where 4.5 (or 3 for large text / non-text UI)
 * is the standard. This one scores a 4px decorative rule against the panel it sits on.
 * WCAG 1.4.11's 3:1 is calibrated for IDENTIFYING a UI component, a stricter task than
 * noticing a colored line, and holding this mark to it would fail 25 of 32 palettes —
 * including cuoio at 2.72 and indaco at 2.06, both of which were rendered and read
 * plainly. Fitting the number to those would be a ratchet-to-fit.
 *
 * The shipped population is bimodal with an empty band between: thirteen theme·mode
 * pairs sit at 1.00-1.11 (the achromatic palettes, where `--accent` IS
 * `--surface-inverse` — the same paint, no edge at all), and the next worst is
 * crepuscolo at 1.86. 1.5 sits in that gap, so it separates "indistinguishable" from
 * "quiet but present" without being tuned to any one palette. It is a FLOOR against
 * invisibility, not an accessibility claim; the categorical marks that DO carry
 * information (`--cat-N-mark` on `--cat-N-fill`) are gated separately and properly by
 * checkCatContrast. engineering/decisions/2026-08-18-split-frame-edge-ownership.md
 */
const PANEL_EDGE_MIN = 1.5;

const CARD = (tok, pct) => `color-mix(in srgb, var(${tok}) ${pct}%, var(--bg-alt))`;

// Below-the-bar ratios are compared against the base default at this tolerance, so
// a rounding-level difference in the last decimal is not reported as a regression.
const REGRESSION_EPSILON = 0.01;

/**
 * One `.chart-status` pill as a scored surface: the status's flat DEEP fill (the base's `--X-solid`) under the solid
 * ink `--on-solid`, white like every chart ink (ONE INK, base.tokens.css § STATUS, IN TWO JOBS): 7:1 on the light
 * face, 4.5:1 on the dark face, where a fill is the lightest mid-tone white still clears so it stands off the dark
 * slide. `requires` pins the fill, the ink and the state's hue mapping in the component CSS, so a retune of any of
 * them reddens the gate instead of silently re-pointing what is measured. */
const TRIO_STATES = ['pass', 'warn', 'fail'];
const SOLID_INK = '--on-solid';
const SOLID_MIN_DARK = 4.5;

function pillStop(state) {
  return {
    id: `chart/status-pill-${state}`,
    ctx: `chart-family .chart-status[${state}]: the status ink on the pill's flat fill`,
    base: '--bg',
    groups: [{ bg: `var(--${state}-solid)` }],
    ink: SOLID_INK,
    min: 7,
    minDark: SOLID_MIN_DARK,
    src: CHARTFAMILY,
    requires: [
      /\.chart-status \{[^}]*background: var\(--chart-status-hue\);[^}]*color: var\(--chart-solid-ink\);/,
      new RegExp(`--chart-status-hue: var\\(--state-${state}-hue\\)`),
      [BASETOKENS, new RegExp(`--state-${state}-hue: var\\(--${state}-solid\\)`)],
      new RegExp(`--chart-solid-ink: var\\(${SOLID_INK}\\)`),
    ],
  };
}

/**
 * One state-chart NODE surface: text on a status-filled tile.
 *
 * A status paints the node itself, as a flat FILL (chart-family.styles.css § THE SOLID TIER), and the state NAME
 * and ORDINAL on it are both `--state-node-ink`, which is `--chart-solid-ink`, the one solid ink `--on-solid`. The bar is
 * the pill's. `requires` pins the fill, the ink and the tone mapping, so a retune of any of them reddens the gate
 * instead of silently moving what is measured. The neutral tile is the neutral solid, gated with the rest by
 * test/unit/palette/chart-solids.test.js.
 */
function stateChartNode(state) {
  return {
    id: `state-chart/node-${state}`,
    ctx: `state-chart [data-s] node (${state} tone): the name and ordinal on the tile's flat fill`,
    base: '--bg',
    groups: [{ bg: `var(--${state}-solid)` }],
    ink: SOLID_INK,
    min: 7,
    minDark: SOLID_MIN_DARK,
    src: STATECHART,
    requires: [
      /--state-node-ink: var\(--chart-solid-ink\)/,
      /\.state-index-t\[data-s\] \{\s*color: var\(--state-node-ink\);\s*fill: var\(--state-node-ink\);/,
      /background: var\(--fill-hue\);/,
      new RegExp(`--fill-hue: var\\(--state-${state}-hue\\)`),
    ],
  };
}

const SURFACES = [
  // ── split frames · the panel's own top-edge mark on the panel fill ────────
  // NOT text: a 4px structural rule, so the bar is WCAG 1.4.11's non-text 3:1 rather
  // than 4.5. It is here because the mark's default is `--accent` and the panel fill is
  // `--surface-inverse` — on an ACHROMATIC palette those are the same paint. onyx
  // measured 1.00:1 (`#000000` on `#000000`) and the panel half shipped with no top
  // edge at all; ardesia / concrete / atelier were within a few points of it. Before
  // 2026-08-18 the visible edge over the panel came from the section's spectrum
  // `border-top`, which the split frames no longer carry, so nothing else covers this.
  // engineering/decisions/2026-08-18-split-frame-edge-ownership.md
  {
    id: 'split-panel/edge-mark',
    ctx: 'split-panel: the panel top-edge mark on the featured panel fill',
    base: '--surface-inverse', groups: [],
    ink: 'var(--panel-mark, var(--panel-edge-mark))', min: PANEL_EDGE_MIN,
    src: SPLITPANEL,
    requires: [/\.panel-left::after\s*\{[^}]*background:\s*var\(--panel-mark, var\(--panel-edge-mark\)\)/],
  },
  {
    id: 'split-compare/edge-mark',
    ctx: 'split-compare: the panel top-edge mark on the featured panel fill',
    base: '--surface-inverse', groups: [],
    ink: 'var(--panel-mark, var(--panel-edge-mark))', min: PANEL_EDGE_MIN,
    src: SPLITCOMPARE,
    requires: [/\.compare-left::after\s*\{[^}]*background:\s*var\(--panel-mark, var\(--panel-edge-mark\)\)/],
  },
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
  // than on the bare card above. 4% is the depth every redline card carries since #1846.
  {
    id: 'redline/ins-on-new-card',
    proactive: true,
    ctx: 'redline .stacked/.split: <ins> on --pass-bg over the 4% NEW card',
    base: '--bg-alt', groups: [{ bg: CARD('--pass', 4) }, { bg: '--pass-bg' }],
    ink: '--pass', min: 4.5,
    src: REDLINE,
    // ANCHORED to the .stacked / .rl-new families this surface models. Levelling the
    // card 5% -> 4% put the same literal at FOUR other sites (.split :145/:160 and
    // .three-col :277/:292), so the pre-levelling pins -- which only had to find `4%`
    // anywhere in the file -- became satisfiable by a decoy: deepening BOTH modeled
    // families to 8% left the gate green. Caught by mutation, not by a gate.
    requires: [
      /section\.redline\.stacked\.stacked > \.cell-stage > blockquote:nth-of-type\(2\)\s*\{[^}]*color-mix\(in srgb, var\(--pass\) 4%, var\(--bg-alt\)\)/,
      /blockquote\.rl-new[^{]*\{[^}]*color-mix\(in srgb, var\(--pass\) 4%, var\(--bg-alt\)\)/,
    ],
  },
  {
    id: 'redline/del-on-old-card',
    proactive: true,
    ctx: 'redline .stacked/.split: <del> on --fail-bg over the 4% OLD card',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 4) }, { bg: '--fail-bg' }],
    ink: '--fail', min: 4.5,
    src: REDLINE,
    // Anchored, for the reason on redline/ins-on-new-card above.
    requires: [
      /section\.redline\.stacked\.stacked > \.cell-stage > blockquote:nth-of-type\(1\)\s*\{[^}]*color-mix\(in srgb, var\(--fail\) 4%, var\(--bg-alt\)\)/,
      /blockquote\.rl-old[^{]*\{[^}]*color-mix\(in srgb, var\(--fail\) 4%, var\(--bg-alt\)\)/,
    ],
    // The engine's own quality bar is that a REDLINE reads: this is the deepest
    // own-hue stack it ships (a 12% band on a 4% card), so it binds --fail. The card
    // went 5% -> 4% to level with the four .split/.three-col sites that always shipped
    // at 4%; the 12% BAND is palette-declared and deliberately untouched (§8.3 of
    // 2026-08-25-status-trio-joint-solve-model.md).
  },
  // The OLD / NEW label sits directly on the card, no band. Four rules paint each one and
  // ALL FOUR are at 4% since #1846 levelled them, so every rule is pinned and the single
  // shared depth is what gets scored. (They were 4% / 4% / 5% / 5%; the split had no
  // recorded reason and the deeper pair was holding two dark-arm pairs under the bar.)
  {
    id: 'redline/old-label',
    ctx: 'redline .stacked / .split / .three-col: the OLD label on the own-hue card (4%, levelled with .split/.three-col)',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 4) }], ink: '--fail', min: 4.5,
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
    ctx: 'redline .stacked / .split / .three-col: the NEW label on the own-hue card (4%, levelled with .split/.three-col)',
    base: '--bg-alt', groups: [{ bg: CARD('--pass', 4) }], ink: '--pass', min: 4.5,
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
    ctx: 'redline .stacked: the struck OLD passage on the 4% own-hue card',
    base: '--bg-alt', groups: [{ bg: CARD('--fail', 4) }], ink: '--text-heading', min: 4.5,
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
  ...['900', '700', '600', '500'].map((stop) => ({
    id: `word-cloud/seq-${stop}`,
    ctx: `word-cloud spectrum: the --seq-${stop} word fill on the canvas`,
    base: '--bg', groups: [], ink: `--seq-${stop}`, min: 4.5,
    src: WORDCLOUD,
    requires: [new RegExp(`return 'var\\(--seq-${stop}\\)'`)],
  })),
  // ── policy-recommendation · the stance badge, and the ask's label on its ground ──
  // A stance that is a status paints its badge as a status MARK: the status solid under the one ink
  // (engineering/decisions/2026-10-24-status-is-one-system.md), so it is scored like a chart pill.
  ...[['adopt', 'pass'], ['amend', 'warn'], ['oppose', 'fail']].map(([variant, state]) => ({
    id: `policy-recommendation/${variant}-badge`,
    ctx: `policy-recommendation.${variant}: the one ink on the badge's status solid`,
    base: '--bg',
    groups: [{ bg: `var(--${state}-solid)` }],
    ink: SOLID_INK, min: 7, minDark: SOLID_MIN_DARK,
    src: POLICY,
    requires: [
      new RegExp(`section\\.policy-recommendation\\.${variant}\\s*\\{[^}]*--stance-badge-bg: var\\(--state-${state}-hue\\)[^}]*--stance-badge-ink: var\\(${SOLID_INK}\\)`),
      /color: var\(--stance-badge-ink\);\s*background: var\(--stance-badge-bg\);/,
    ],
  })),
  // A stance that is not a status keeps the outlined chip on its own ground.
  ...[['default', '--accent', '--accent-soft', /section\.policy-recommendation \{[^}]*--stance: var\(--accent\);[^}]*--stance-bg: var\(--accent-soft\);/],
      ['defer', '--text-secondary', '--bg-alt', /section\.policy-recommendation\.defer\s*\{[^}]*--stance: var\(--text-secondary\); --stance-bg: var\(--bg-alt\);/]].map(
    ([variant, ink, ground, pin]) => ({
      id: `policy-recommendation/${variant}-badge`,
      ctx: `policy-recommendation${variant === 'default' ? '' : `.${variant}`}: the stance badge ink on ${ground}`,
      base: '--bg', groups: [{ bg: ground }], ink, min: 4.5,
      src: POLICY,
      requires: [pin, /color: var\(--stance-badge-ink\);\s*background: var\(--stance-badge-bg\);/],
    }),
  ),
  // The ask's caption is a HEADING on the status GROUND (the theme's --X-bg): amber text on the 10% amber ground missed
  // 4.5:1 on twelve palette-modes, and "The ask" is not a status word.
  ...[['adopt', 'pass'], ['amend', 'warn'], ['oppose', 'fail']].map(([variant, state]) => ({
    id: `policy-recommendation/${variant}-ask-label`,
    ctx: `policy-recommendation.${variant}: the ask's caption on the --${state}-bg ground`,
    base: '--bg', groups: [{ bg: `--${state}-bg` }], ink: '--text-heading', min: 4.5,
    src: POLICY,
    requires: [
      new RegExp(`section\\.policy-recommendation\\.${variant}\\s*\\{ --stance: var\\(--${state}\\); --stance-bg: var\\(--${state}-bg\\);`),
      /blockquote \{\s*background: var\(--stance-bg\);/,
      /blockquote::before \{[^}]*color: var\(--text-heading\);/,
    ],
  })),
  // ── kpi · the status pill: a status MARK on the tile it sits on ──────────
  // The status pill is the deck's status solid under the one ink, led by a drawn mark, with the signal ring on warn
  // (engineering/decisions/2026-10-24-status-is-one-system.md). Two things are scored per site: the ink on the solid
  // (the label, and the mark painted in the same ink), and the solid against the TILE under it, which is what makes the
  // chip a chip now that the fill and the edge are one color. kpi lands pills on two tiles (`--bg-alt` on .ops and
  // .trajectory, `--accent-soft` on the .briefing / .attention heroes), and the warn arm on the hero is its own stack.
  //
  // EVERY PIN IS ANCHORED TO THE SELECTOR ITS SURFACE MODELS: an unanchored pin let one site satisfy all three and a
  // deleted `.attention` block stay green (caught by mutation, the first time). The MARK pin matters as much as the
  // ink: the status solids share a lightness, so without the drawn mark a kpi pill carries its status by hue alone and
  // the trio collapses under achromatopsia (0.1174 to 0.034 when last measured).
  ...[
    ['warn-pill', 'warn', '--bg-alt', 'kpi.ops: the warn pill on the --bg-alt tile',
      /section\.kpi\.ops[^{]*li:nth-child\(1\)[^{]*\{[^}]*--lat-pill-bg: var\(--state-warn-hue\);[^}]*--lat-pill-ink: var\(--on-solid\);[^}]*--kpi-pill-mark: var\(--mark-dash-bold\)[^}]*--kpi-pill-mark-box: inline-block;[^}]*--kpi-pill-signal: var\(--warn-solid-signal\)/],
    ['hero-pass-pill', 'pass', '--accent-soft', 'kpi (default/briefing): the pass pill on the accent-soft hero tile',
      /section\.kpi\.briefing[^{]*\{[^}]*--lat-pill-bg: var\(--state-pass-hue\);[^}]*--lat-pill-ink: var\(--on-solid\);[^}]*--kpi-pill-mark: var\(--mark-check-bold\)[^}]*--kpi-pill-mark-box: inline-block/],
    ['hero-warn-pill', 'warn', '--accent-soft', 'kpi.attention: the warn pill on the accent-soft hero tile',
      /section\.kpi\.attention[^{]*li:nth-child\(1\)[^{]*\{[^}]*--lat-pill-bg: var\(--state-warn-hue\);[^}]*--lat-pill-ink: var\(--on-solid\);[^}]*--kpi-pill-mark: var\(--mark-dash-bold\)[^}]*--kpi-pill-mark-box: inline-block;[^}]*--kpi-pill-signal: var\(--warn-solid-signal\)/],
  ].flatMap(([slug, state, tile, ctx, pin]) => {
    const shared = [
      pin,
      // The mark is painted in the pill's own ink, and drawn only where a row's hook turns its box on.
      /\.lat-pill::before \{[^}]*display: var\(--kpi-pill-mark-box, none\);[^}]*background-color: currentColor;[^}]*mask: var\(--kpi-pill-mark\)/,
      ...(tile === '--accent-soft'
        ? [/li:nth-child\(1\)[^{]*\{[^}]*background:\s*var\(\s*--accent-soft\s*\)/]
        : []),
    ];
    return [
      {
        id: `kpi/${slug}`, ctx: `${ctx}: the one ink on the status solid`,
        base: tile, groups: [{ bg: `var(--${state}-solid)` }], ink: SOLID_INK, min: 7, minDark: SOLID_MIN_DARK,
        src: KPI, requires: shared,
      },
      {
        id: `kpi/${slug}-on-tile`, ctx: `${ctx}: the pill's 1px border in the status ink against the tile (the chip's edge)`,
        base: tile, groups: [], ink: `--${state}`, min: 3,
        src: KPI, requires: [...shared, new RegExp(`--lat-pill-edge: var\\(--${state}\\);`), ['lib/plugins/pills/pills.styles.css', /border:1px solid var\(--lat-pill-edge,/]],
      },
    ];
  }),
  // ── kanban · the [data-s] card's status wash, and the two inks on it ─────
  // The wash is `--state-{s}-fill` mixed into the card — 55% light, 26% dark — and it is
  // the deepest own-hue ground the engine paints on a card. TWO inks land on it and they
  // fail differently, so both are scored: the title at `--text-heading` (clear, 6.65:1 at
  // worst) and the lane tag, which was `--text-secondary` and sub-AA on 152 of 320 before
  // #1788 stepped it up.
  //
  // MODELING NOTE, because getting this wrong is silent. `--state-{s}-fill` and
  // `--state-{s}-hue` are declared on `section.chart-frame`, not `:root`, so `mergedVars()`
  // cannot see them and they are seeded here from chart-family.styles.css. And the card must stay a
  // TOKEN (`--kanban-card`) rather than being inlined: `resolveTokenExpr` reduces a
  // `color-mix()` nested directly inside another `color-mix()`'s argument to a WRONG hex
  // rather than returning its input verbatim, which is the contract the rest of this file
  // relies on. Inlined, this surface scored concrete|dark at #897d7e; as a token it scores
  // #524647, which is the pixel the render actually paints. No other surface in the catalog
  // is written in that shape (checked), so nothing else is affected — but a future one could
  // be, and it would report a confident wrong number rather than an unresolved one.
  ...['pass', 'warn', 'fail', 'info', 'mute'].flatMap((state) => {
    const wash = `light-dark(color-mix(in oklab, var(--state-${state}-fill) 55%, var(--bg-alt)), `
               + `color-mix(in oklab, var(--state-${state}-fill) 26%, var(--kanban-card-dark)))`;
    return [
      ['title', '--text-heading', /\.kanban-card-title\s*\{[^}]*color:\s*var\(--text-heading\)/],
      ['lane',  '--text-heading', /\.kanban-card\[data-s\] \.kanban-lane\s*\{\s*color:\s*var\(--text-heading\)/],
    ].map(([slot, ink, pin]) => ({
      id: `kanban/${state}-card-${slot}`,
      ctx: `kanban: the ${slot} on a [data-s="${state}"] card's status wash over the card fill`,
      base: KANBAN_CARD, groups: [{ bg: wash }], ink, min: 4.5,
      src: KANBAN,
      requires: [
        /\.kanban-card\[data-s\]\s*\{[^}]*color-mix\(in oklab, var\(--status-fill\) 55%, var\(--bg-alt\)\)/,
        /\.kanban-card\[data-s\]\s*\{[^}]*color-mix\(in oklab, var\(--status-fill\) 26%, color-mix\(in oklab, var\(--bg-alt\) 88%, white\)\)/,
        new RegExp(`--status-fill: var\\(--state-${state}-fill\\)`),
        // The seeded recipe, pinned against chart-family so a retune there reddens this.
        [CHARTFAMILY, new RegExp(`--state-${state}-fill: light-dark\\(color-mix\\(in oklab, var\\(--state-${state}-hue\\) ${state === 'mute' ? 22 : 24}%, var\\(--bg\\)\\), color-mix\\(in oklab, var\\(--state-${state}-hue\\) ${state === 'mute' ? 46 : 50}%, black\\)\\)`)],
        pin,
      ],
    }));
  }),
  // ── checklist · the state row: the disc's rim and the rail, on the status GROUND ──
  // The disc is the status solid, but on a dark slide no fill deep enough for white text clears 3:1 against a tint, so
  // the disc's EDGE is its hairline rim in the status ink, the same color as the row's rail
  // (engineering/decisions/2026-10-24-status-is-one-system.md). Both are graphical (the file's text is --text-heading /
  // --text-muted / --text-secondary), so they owe WCAG 1.4.11's 3:1 against the row's --X-bg wash over the canvas.
  ...['pass', 'warn', 'fail'].map((state) => ({
    id: `checklist/${state}-row`,
    ctx: `checklist: the ${state} row's disc rim and rail (the slide ink) on its --${state}-bg wash`,
    base: '--bg', groups: [{ bg: `--${state}-bg` }], ink: `--${state}`, min: 3,
    src: CHECKLIST,
    requires: [
      // One anchored pin per state: the role line, the rail and the ground of THIS row's rule, in order and inside one
      // block, so a single row's rail re-pointed at the solid reddens its own surface (an unanchored rail pin let one
      // state's edit pass on the other two rows' match; a checker caught it by mutation).
      new RegExp(`li\\.state\\.${state} \\{\\s*--state-color:var\\(--state-${state}-hue\\); --state-ink:var\\(--${state}\\);[^}]*border-left-color:var\\(--state-ink\\);[^}]*background:var\\(--${state}-bg`),
      /0 0 0 var\(--state-ring-outer-w\) color-mix\(in srgb, var\(--state-ink\) var\(--state-ring-mix\), black\)/,
      [BASETOKENS, /--state-ring-outer-w: var\(--state-signal-w\);/],
      [BASETOKENS, /--state-ring-mix: 100%;/],
    ],
  })),
  // ── roadmap .status · the cell's label and rail on its status ground ──────
  // A heavy `status` cell paints its left ribbon as a status LINE (the slide ink) and its state label as NEUTRAL text,
  // both on the cell's status GROUND (the theme's --X-bg) over the canvas
  // (engineering/decisions/2026-10-24-status-is-one-system.md). The label is small caps, so it owes the text bar; the
  // ink on a tint of itself missed it on twelve palette-modes, so the label is neutral and the ground carries the color.
  ...[['shipped', 'pass'], ['wip', 'warn'], ['missed', 'fail']].map(([cell, state]) => ({
    id: `roadmap/${cell}-cell-label`,
    ctx: `roadmap.status: the ${cell} cell's label (neutral text) on its --${state}-bg ground`,
    base: '--bg', groups: [{ bg: `--${state}-bg` }], ink: '--text-heading', min: 4.5,
    src: ROADMAP,
    requires: [
      new RegExp(`td\\.cell-state\\.state-${cell},[^{]*\\{[^}]*--state-ink:var\\(--${state}\\);[^}]*--cell-state-bg:var\\(--${state}-bg\\);`),
      /background:var\(--cell-state-bg, transparent\);\s*border-left:var\(--chart-fill-accent\) solid var\(--state-ink\);/,
      /\.cell-state-label \{[^}]*color:var\(--text-heading\);/,
    ],
  })),
  // ── regulatory-update .priority · the tier label on its status solid ─────
  ...[[1, 'fail'], [2, 'warn'], [3, 'pass']].map(([tier, state]) => ({
    id: `regulatory-update/tier-${tier}`,
    ctx: `regulatory-update.priority: TIER ${tier} in the one ink on the --${state}-solid pill`,
    base: '--bg', groups: [{ bg: `var(--${state}-solid)` }], ink: SOLID_INK, min: 7, minDark: SOLID_MIN_DARK,
    src: REGUPDATE,
    requires: [new RegExp(`li:nth-child\\(${tier}\\)::before \\{ background:var\\(--state-${state}-hue\\); color:var\\(--on-solid\\);`)],
  })),
  // ── obligation-matrix .heat · body ink on the cell's status ground ───────
  // NB the component maps the pass CELL to the fail ground and vice versa on purpose (a heat map reads "hot =
  // attention"), so the ids below name the ground, not the state. The grounds are the theme's own --X-bg
  // (engineering/decisions/2026-10-24-status-is-one-system.md); the exempt row sits on --bg-alt.
  ...[['fail', '--fail-bg', /dd:has\(> \.state\.pass\) \{\s*background:var\(--fail-bg\);/],
      ['warn', '--warn-bg', /dd:has\(> \.state\.warn\) \{\s*background:var\(--warn-bg\);/],
      ['pass', '--pass-bg', /dd:has\(> \.state\.fail\) \{\s*background:var\(--pass-bg\);/],
      ['muted-mark', '--bg-alt', /dd:has\(> \.state\.skip\) \{\s*background:var\(--bg-alt\);/]].map(([slug, ground, pin]) => ({
    id: `obligation-matrix/heat-${slug}`,
    ctx: `obligation-matrix.heat: table body ink on the ${ground} cell ground`,
    base: '--bg',
    groups: [{ bg: ground }],
    ink: '--text-body', min: 4.5,
    src: OBLIGATION,
    requires: [pin],
  })),
  // ── kanban · the inline-code chip inside a card ──────────────────────────
  // Reached WITHOUT any status markup: the card transform consumes a trailing <code>
  // only when it is a SIZE (`kanbanSize`, lib/core/kanban-sizes.js) and reads a status only off a
  // SUB-BULLET, so `- Pilot retro pack \`done\`` on one line survives verbatim as a raw
  // chip (test/integration/baseline-decks/gallery.md, the kanban slide). Rendered at
  // 12.7px / weight 600, so the bar is 4.5 rather than 3.
  {
    id: 'kanban/card-code-chip',
    ctx: 'kanban: the inline <code> chip in a card title, on its own 10% currentColor wash over the card',
    base: KANBAN_CARD,
    groups: [{ bg: `color-mix(in srgb, ${CHIP_INK} 10%, transparent)` }],
    ink: CHIP_INK, min: 4.5,
    src: ELEMENTS,
    requires: [
      /section code\s*\{[^}]*color:\s*var\(--code-inline-fg, var\(--accent\)\)/,
      /section code\s*\{[^}]*background:\s*var\(--code-inline-bg, color-mix\(in srgb, currentColor 10%, transparent\)\)/,
      [KANBAN, /\.kanban-card\s*\{[^}]*background:\s*light-dark\(\s*var\(--bg-alt\),\s*color-mix\(in oklab, var\(--bg-alt\) 88%, white\)\)/],
    ],
  },
  // ── kanban · the done column's stepped-down card title ───────────────────
  // The done column recedes by INK, not alpha — #1717 removed an `opacity: 0.52` here
  // precisely because it dragged this pair under the bar — so this one pair IS the whole
  // de-emphasis and it has to clear 4.5 on its own.
  {
    id: 'kanban/done-card-title',
    ctx: 'kanban: the [data-done] card title stepped down to --text-body, on the card fill',
    base: KANBAN_CARD, groups: [], ink: '--text-body', min: 4.5,
    src: KANBAN,
    requires: [
      /\.kanban-column\[data-done\] \.kanban-card-title\s*\{[^}]*color:\s*var\(--text-body\)/,
      /\.kanban-card\s*\{[^}]*background:\s*light-dark\(\s*var\(--bg-alt\),\s*color-mix\(in oklab, var\(--bg-alt\) 88%, white\)\)/,
    ],
  },
  // ── kpi · the hero tile's target / trend line ────────────────────────────
  // The SECOND nested bullet of a kpi metric. On the hero it lands on the tile's
  // `--accent-soft` fill — the base kpi/hero-pass-pill already models — not the canvas,
  // which is why scoring `--text-secondary` against `--bg` reports it clean.
  {
    id: 'kpi/hero-target-line',
    ctx: 'kpi (default/briefing): the hero tile\'s target/trend line in --text-secondary on --accent-soft',
    base: '--accent-soft', groups: [], ink: '--text-secondary', min: 4.5,
    src: KPI,
    requires: [
      /li > :where\(ul, ol\) > li \+ li\s*\{[^}]*color:\s*var\(--text-secondary\)/,
      /li:nth-child\(1\)[^{]*\{[^}]*background:\s*var\(\s*--accent-soft\s*\)/,
    ],
  },
  // ── chart family · the .chart-status pill on its own depth gradient ───────
  // FOUND BY A REGRESSION, not by reading the token table — the fourth surface in
  // this swimlane that no catalog entry modeled. #1801 respaced every trio for the
  // achromatopsia floor (which moved --pass LIGHTER), #1789 let curated trios reach a
  // rendered export at all, and the pill's dark gradient end — calibrated for dimmer
  // hues — lifted its ground toward the light `--text-heading` label. It surfaced as
  // a sub-AA finding on a real `--player` export (gallery-jargon p50, crepuscolo,
  // "on-track", 4.40:1) and NOTHING analytic could see it, because the pill's ground
  // is a raw color-mix rather than a `*-bg` token.
  //
  // BOTH STOPS ARE LISTED, and the reason the 0% one was not is worth keeping. The
  // original entries modeled only the 100% stop, on the argument that the 0% stop is
  // "quieter by construction". That is true of the DARK arm — less hue mixed into black
  // is a darker ground under a LIGHT label — and false of the light arm, where less hue
  // mixed into `--bg` is a LIGHTER ground under a DARK label, so quieter means safer on
  // one arm and says nothing on the other. Measured on the shipped tree, the light 0%
  // stop was itself sub-AA at 4.38:1 on concrete|pass while every gate was green (#1807).
  // A stop nobody lists is a stop nobody scores, which is the fourth time in this
  // swimlane that a raw color-mix ground has been invisible.
  ...['pass', 'warn', 'fail', 'info', 'mute'].map((state) => pillStop(state)),
  // The VIVID intensity's fills (`chart-finish: … vivid`): the same pill, re-pointed by the rule that stamps it.
  ...[...TRIO_STATES, 'info'].map((state) => ({
    ...pillStop(state),
    id: `chart/status-pill-${state}-vivid`,
    ctx: `chart-family .chart-finish-vivid .chart-status[${state}]: the status ink on the vivid fill`,
    groups: [{ bg: `var(--${state}-solid-vivid)` }],
    ink: SOLID_INK,
    requires: [[BASETOKENS, new RegExp(`\\.chart-finish-vivid \\{[^}]*--state-${state}-hue: var\\(--${state}-solid-vivid\\)`)]],
  })),
  // ── risk-matrix · the CRITICAL band, the one status fill a chart mixes for itself ───────
  // A critical cell and a critical key disc are the vivid fail fill taken 18% away from the ink, so their number (the
  // solid ink) is scored on the mix itself; the stylesheet pin keeps the measured mix the painted one.
  {
    id: 'risk-matrix/critical-key',
    ctx: 'risk-matrix .risk-key-marker[critical]: the key number on the critical band\'s fill',
    base: '--bg',
    groups: [{ bg: 'color-mix(in oklab, var(--fail-solid-vivid) 82%, var(--on-solid-shade, black))' }],
    ink: '--on-solid',
    min: 4.5,
    src: 'lib/components/chart/risk-matrix/risk-matrix.styles.css',
    requires: [
      /\.risk-key-marker\[data-band="critical"\] \{\s*fill: color-mix\(in oklab, var\(--fail-solid-vivid\) 82%, var\(--on-solid-shade, black\)\);/,
      /\.risk-key-number \{ fill: var\(--chart-solid-ink\); \}/,
    ],
  },
  // ── state-chart · the name and the ordinal on a status-tinted node ───────
  ...['pass', 'warn', 'fail', 'info'].map((state) => stateChartNode(state)),
  // THE PAINTED TILE'S PAINT LIVES IN JS, and the entries above pin only the CSS. Once the layout pass runs, a
  // reader sees the SVG tile, whose one-stop paint server the adapter emits (`ramp`); this pins that it carries the
  // status's own solid, so a drift there cannot leave every CSS pin green over a different color.
  { ...stateChartNode('pass'),
    id: 'state-chart/node-svg-stops',
    ctx: 'state-chart SVG tile: the adapter paints the status solid the CSS tile wears',
    src: STATECHART_JS,
    requires: [
      /defs \+= ramp\(id, `--state-\$\{tone\}-hue`\)/,
      /stop-color:var\(\$\{hue\}\)/,
    ] },
];

// ── The frozen sub-threshold baseline ───────────────────────────────────────
//
// Every (theme × mode × surface) pair that is below its bar today, with the ratio
// it scores. It started as a real backlog rather than a set of individually
// justified exemptions — status ink on a 12% tint of ITSELF is a surface most
// curated hues do not clear — and it is now down to TWO pairs, which means every
// remaining row does have to carry its own argument.
//
// It is a SHRINKING baseline, and it has shrunk twice. The 24 `word-cloud/seq-*`
// rows left when this file landed were the canvas-blind sequential ramp, and #1697
// made the ramp's poles canvas-relative. Then #1698's second pass took the status
// population from 106 to 0: the trios were re-solved against the bands they land on AND
// made to reach every render path — at the time by declaring them at BOTH `:root` and
// `:root:root`, since neither form alone reached all three (the concat order vs Marpit's
// `:root` rewrite). #1527 then flipped the concat and the duplicate was retired; a plain
// `:root` declaration reaches every path on its own now
// (engineering/decisions/2026-08-24-status-trio-single-root.md). All of them are
// gone — deleted, not re-frozen, which is what the stale arm below exists to force.
//
// WHAT THE TWO SURVIVORS ARE, because a two-row baseline is read as "nearly done"
// and these two are not nearly anything. `kpi.attention` inks `--warn` on
// `--warn-bg` over the hero tile's `--accent-soft`, and carbone's `--accent-soft` is
// a tint of its LIME accent: an orange pill on a green tile, both dark. Measured,
// both exits cost more than they buy — lifting `--warn` to clear the pill drops
// `pass^warn` under protanopia from 0.2327 to 0.1235, through the 0.15 collapse
// floor; darkening `--accent-soft` until the pill clears puts the tile at ~1.06:1
// against carbone's own canvas, i.e. no tile. Thinning the band does not reach it
// (18% -> 12% -> 10% moves the pill 3.58 -> 3.67). Do not re-tune these two without
// re-measuring both of those.
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
// `themes/indaco/indaco.css`, which carries two of these rows, so a fresh palette starts
// with two new keys and this gate goes red. That is the gate working: either
// re-tune the two arms it names, or add the rows with the tracking issue in the
// commit message. Do not delete the check.
const DEGRADE_TOLERANCE = 0.02;

const KNOWN_SUB_THRESHOLD = new Map([
  // ── redline/del ── 2
  ['concrete-dark|dark|redline/del', 3.91],
  ['concrete|dark|redline/del', 3.91],
  // ── redline/del-on-old-card ── 6
  ['ardesia-dark|dark|redline/del-on-old-card', 4.31],
  ['ardesia|dark|redline/del-on-old-card', 4.31],
  ['brina-dark|dark|redline/del-on-old-card', 4.43],
  ['brina|dark|redline/del-on-old-card', 4.43],
  ['concrete-dark|dark|redline/del-on-old-card', 3.68],
  ['concrete|dark|redline/del-on-old-card', 3.68],
  // ── redline/old-label ── 2
  ['concrete-dark|dark|redline/old-label', 4.43],
  ['concrete|dark|redline/old-label', 4.43],
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

/**
 * The B column of a root-family compound, and it is LOAD-BEARING on the export arm.
 *
 * `lattice.js` concatenates the bundle AFTER the palette, so at EQUAL
 * specificity the engine default wins on source order and the palette's value is
 * silently discarded in the rendered PDF (#1527). `:root:root` is (0,2,0) and beats
 * the bundle's (0,1,0) whatever the order — which is exactly why four palettes
 * already reach `--panel-edge-mark` that way (themes/ardesia/ardesia.css, atelier, concrete,
 * onyx; 2026-08-18-split-frame-edge-ownership.md) and why the status trios reach
 * `--pass` / `--warn` / `--fail` that way as of #1698.
 *
 * Scoring it flat — treating every root block as one bucket — is not a rounding
 * error, it is a gate that reports the opposite of the truth in BOTH directions: it
 * scored `split-panel/edge-mark` on the bundle's `var(--accent)` for the four
 * palettes that had already escaped it, and it would score a re-curated trio as
 * inert on the one path where it is the whole point.
 *
 * BOTH OF THOSE MOTIVATING CASES ARE GONE, and the ranking is kept anyway. #1527
 * flipped the concat — the engine sheet loads FIRST now, so a plain `:root` palette
 * declaration wins the export on source order and needs no bump — and #1797 moved
 * `--panel-edge-mark` to plain `:root` in all four palettes, closing the 1.00:1 onyx
 * panel edge this docblock used to describe as live. `checkPackedRootReach` fails any
 * theme custom property declared above plain `:root`, so no palette should present a
 * ranked tie again.
 *
 * It stays because the ranking is what makes the arm TRUTHFUL rather than lucky: a flat
 * merge would be wrong the moment anything reintroduces the shape, and it would be wrong
 * silently, which is the failure mode this whole file exists to catch. `:where(:root)`
 * is 0 and loses to everything, which is what it is for.
 * engineering/decisions/2026-08-24-status-trio-single-root.md
 */
function rootSpecificity(compound) {
  // `:where()` contributes ZERO — but only for what is INSIDE it. `:where(:root):root` is
  // (0,1,0), not 0, so the test is the whole compound rather than its prefix; the prefix
  // form scored that selector 0 and would have ranked a real override below a plain
  // `:root`. Nothing in `themes/` writes it today; a scorer that is wrong only on the
  // shapes nobody uses yet is a trap for whoever uses one first.
  // `:where()` contributes ZERO, so its contents come out before anything is counted.
  // That is one rule rather than two special cases, and it gets every shape right:
  // `:where(:root)` -> 0, `:where(:root):root` -> 1, `:root:where(.x)` -> 1, `:root:root`
  // -> 2, `:root[data-x]` -> 2. An earlier cut returned 0 for anything STARTING with
  // `:where(:root)` — which scored a real override as zero — and the first fix moved it to
  // 2, still not the (0,1,0) its own comment claimed.
  const bare = compound.replace(/:where\([^()]*\)/gi, '');
  const roots = (bare.match(/:root/gi) || []).length;
  const quals = (bare.match(/\[[^\]]*\]|:(?!:)[a-z-]+(?:\([^()]*\))?/gi) || [])
    .filter((q) => !/^:root$/i.test(q)).length;
  return roots + quals;
}

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
        else {
          // A comma-list is scored by the WINNING part: `:root, :root:root { … }`
          // applies at (0,2,0), so the block carries the highest specificity it has.
          const spec = Math.max(-1, ...sel.split(',')
            .map((part) => part.trim())
            .filter((part) => ROOT_COMPOUND.test(part))
            .map(rootSpecificity));
          if (spec >= 0) out.push([spec, s.slice(i + 1, bodyEnd)]);
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

function parseRootVars(css, into = { vars: {}, spec: {} }) {
  for (const [spec, block] of rootBlocks(css)) {
    for (const d of (block.match(/--[a-z0-9-]+\s*:\s*[^;{}]+/gi) || [])) {
      // `s` flag: a custom-property value may span lines — a palette author is
      // free to write `--fail: light-dark(\n  #AF102D,\n  #FF6B72);`. Without it
      // `(.+)$` cannot match and the declaration was DROPPED, so `mergedVars`
      // silently fell back to the bundle default: both cascade orders then agree
      // and the gate passes a value that does not exist. That contradicts this
      // file's own contract — an unresolvable token is a failure, not a skip.
      const m = d.match(/--([a-z0-9-]+)\s*:\s*([\s\S]+)$/i);
      // Higher specificity always wins; at a TIE the later declaration does, which
      // is plain source order within one stylesheet (and within one chain).
      if (m && spec >= (into.spec[m[1]] ?? -1)) {
        into.vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
        into.spec[m[1]] = spec;
      }
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
    .map((n) => path.join(THEMES_DIR, n, `${n}.css`))
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
    bundleCache = parseRootVars(fs.readFileSync(BUNDLE, 'utf8'));
  }
  return bundleCache;
}

/**
 * Merged token map for one palette.
 *
 * `baseWins` composes the OTHER way, with `base.tokens.css`'s universal defaults
 * overriding everything a palette curated. That was the order `lattice.js`
 * used for the document shell until #1527 flipped it; no path renders it now, and it
 * is kept because the REGRESSION arm needs it as a REFERENCE — "is the palette's own
 * value worse than the default it replaces" is a question about two inks on one
 * canvas, not about a cascade anyone still ships.
 */
/**
 * Component tokens `mergedVars` cannot see, seeded so a surface can NAME them.
 *
 * `--state-{s}-hue` / `--state-{s}-fill` are declared on `section.chart-frame`
 * (lib/plugins/chart-family/chart-family.styles.css:394-416), not on `:root`, so the
 * `:root`-block parser below never collects them. A surface that needs one had to inline its
 * definition instead — and inlining puts a `color-mix()` inside another `color-mix()`'s
 * argument, which `resolveTokenExpr` reduces to a WRONG hex rather than returning verbatim.
 * Seeding them keeps the surface expression one level deep, where the resolver is correct.
 *
 * The values are pinned against the CSS by `checkSurfaceEvidence`'s `requires` on the kanban
 * surfaces, so a retune in chart-family reddens the gate rather than silently re-pointing what
 * is measured here.
 */
const CHART_FAMILY_TOKENS = Object.freeze(Object.fromEntries([
  // The kanban card's own dark-arm fill, as a token for the same reason: the status wash
  // mixes INTO it, and inlining it would nest a color-mix in a color-mix argument.
  ['kanban-card-dark', 'color-mix(in oklab, var(--bg-alt) 88%, white)'],
  ...['pass', 'warn', 'fail', 'info', 'mute'].flatMap((s) => {
    const [lp, dp] = s === 'mute' ? [22, 46] : [24, 50];
    const hue = `var(--${s})`;
    return [
      [`state-${s}-hue`, hue],
      [`state-${s}-fill`, `light-dark(color-mix(in oklab, ${hue} ${lp}%, var(--bg)), `
                        + `color-mix(in oklab, ${hue} ${dp}%, black))`],
    ];
  }),
]));

function mergedVars(theme, { baseWins = false } = {}) {
  const palette = { vars: {}, spec: {} };
  for (const f of paletteChainFiles(theme)) parseRootVars(fs.readFileSync(f, 'utf8'), palette);
  const bundle = bundleVars();
  if (!baseWins) return { ...CHART_FAMILY_TOKENS, ...bundle.vars, ...palette.vars };
  // THE BASE-WINS REFERENCE MAP. It is NOT "what the export does" any more — since #1527
  // the export loads the engine sheet first and the palette wins there too. What this arm
  // models is the REGRESSION question: is a palette's curated value worse than the base
  // default it overrides? Specificity still outranks source order in it, and that is
  // load-bearing in a way that bit once: while the status trio carried a `:root:root`
  // copy, the copy won THIS map too, both arms resolved the same value, and the regression
  // arm was silently vacuous for the trio. Removing the copy surfaced 18 real regressions.
  // engineering/decisions/2026-08-24-status-trio-single-root.md
  const out = { ...CHART_FAMILY_TOKENS, ...palette.vars };
  for (const [k, v] of Object.entries(bundle.vars)) {
    if ((palette.spec[k] ?? -1) <= (bundle.spec[k] ?? 0)) out[k] = v;
  }
  return out;
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
  return themeEntries(THEMES_DIR)
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
  if (!fs.existsSync(path.join(THEMES_DIR, theme, `${theme}.css`))) return null;
  const vars     = mergedVars(theme);
  const baseVars = mergedVars(theme, { baseWins: true });
  const rows = [];
  for (const [mode, isDark] of MODES) {
    for (const s of SURFACES) {
      const key  = `${theme}|${mode}|${s.id}`;
      const res  = evalSurface(vars, s, isDark);
      const base = evalSurface(baseVars, s, isDark);
      if (!res || !base) { rows.push({ key, theme, mode, surface: s, unresolved: true }); continue; }
      // A surface may hold its dark face to a different bar (`minDark`): a status fill on the dark face is the
      // status ink itself, at 4.5:1 under its text (base.tokens.css § STATUS, IN TWO JOBS).
      const min = isDark && s.minDark != null ? s.minDark : s.min;
      const below = res.ratio < min;
      rows.push({
        key, theme, mode, surface: s, min,
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
 * A component whose surfaces are modeled WITHOUT a group alpha must not declare
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
/**
 * All three `kpi` surfaces model the hero tile's fill as `--accent-soft`, taken
 * from the briefing rule. A MODIFIER that repaints that tile makes the modeled
 * base wrong — and a `requires` regex cannot see it, because `requires` asserts
 * presence and this risk is an ADDITION. Demonstrated: give `.attention`'s hero
 * its own `background`, and all three surfaces keep passing while two of them
 * model a stack that no longer exists. That is the "reports nothing at all, which
 * reads as a pass" failure this catalog exists to prevent, so it gets the same
 * treatment as redline's group alpha: a file-scoped absence check.
 *
 * Repainting the tile is not forbidden — model it (change the surface's `base`)
 * and re-derive the palette arms solved through it.
 */
/**
 * All three `kpi` surfaces model the hero tile's fill — `--accent-soft` for the two
 * hero stacks, `--bg-alt` for the `.ops` one. A MODIFIER that repaints that tile
 * makes the modeled base wrong, and a `requires` regex cannot see it, because
 * `requires` asserts PRESENCE and this risk is an ADDITION. Same treatment as
 * redline's group alpha: a scoped absence check.
 *
 * This is a FUNCTION, not a pattern, because three successive regexes got it wrong
 * in three different ways — one let `\s*` backtrack to zero width so the lookahead
 * inspected a space; one missed `background-color` / `background-image`, which are
 * the likeliest spellings of a real repaint and a live house idiom (29 uses under
 * lib/components/); and one fired on `li:nth-child(1) > strong`, a DESCENDANT of
 * the tile rather than the tile. Matching a CSS rule is a parse, so it parses.
 *
 * Repainting the tile is not forbidden — model it (change the surface's `base`) and
 * re-derive the palette arms solved through it.
 */
const TILE_FILL_OK = /^(?:var\(\s*--accent-soft\s*\)|none|transparent|inherit|initial|unset)$/i;
// The tile ITSELF: the selector ends at the hero `li`, so a descendant or a
// pseudo-element is not this rule. `first-child` selects the same element.
const HERO_TILE_RULE = /section\.kpi\.[a-z-]+[^{}]*?li:(?:nth-child\(1\)|first-child)\s*\{([^{}]*)\}/g;
const ANY_BACKGROUND = /(?:^|[;{\s])background(?:-color|-image)?\s*:\s*([^;}]*)/gi;

/** Every hero-tile rule in `css` whose fill is not one the catalog models. */
function tileRepaints(css) {
  const out = [];
  for (const rule of css.matchAll(HERO_TILE_RULE)) {
    for (const decl of rule[1].matchAll(ANY_BACKGROUND)) {
      const value = decl[1].replace(/!important/i, '').trim();
      if (value && !TILE_FILL_OK.test(value)) out.push(value);
    }
  }
  return out;
}

const NO_TILE_REPAINT = [
  KPI,
  // An ancestor sheet reaches the tile exactly as the component's own rule would —
  // the hole the sibling ANCESTOR_SHEETS check already exists to close.
  'lib/base/base.modifiers.css',
  'lib/base/base.elements.css',
];
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
    // A `requires` entry is a RegExp against `src`, OR a [relPath, RegExp] pair. Several
    // surfaces span TWO files — the chip's ink rule is in base.elements.css while the card
    // fill it sits on is in kanban.styles.css — and pinning only the half that happens to
    // live in `src` leaves the other half free to move under a green gate.
    for (const req of s.requires || []) {
      const [rel, re] = Array.isArray(req) ? req : [s.src, req];
      const target = rel === s.src ? file : path.join(ROOT, rel);
      if (!fs.existsSync(target)) {
        errors.push(`${s.id}: ${rel} is gone — re-derive this surface.`);
        continue;
      }
      const text = rel === s.src ? src : stripComments(fs.readFileSync(target, 'utf8'));
      if (!re.test(text)) {
        errors.push(
          `${s.id}: the rule this surface models is no longer in ${rel} ` +
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
        `${rel} declares a fractional \`opacity\`, but every surface modeled from it ` +
        'assumes no group alpha. Add it to the surface\'s `groups[].opacity` and re-derive ' +
        'the palette arms solved through it, or take the opacity back out.',
      );
    }
  }
  for (const rel of NO_TILE_REPAINT) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { errors.push(`${rel} is gone — re-derive the surfaces that name it.`); continue; }
    for (const fill of tileRepaints(stripComments(fs.readFileSync(file, 'utf8')))) {
      errors.push(
        `${rel}: a kpi rule repaints the hero tile with \`${fill}\`, but kpi/hero-pass-pill, ` +
        'kpi/hero-warn-pill and kpi/warn-pill all model that tile as `--accent-soft` / `--bg-alt`. ' +
        "Model the new fill in the surface's `base` and re-derive the arms solved through it, or take it out.",
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
        'every redline surface in SURFACES, which are modeled without a group alpha. ' +
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
  SURFACES, tileRepaints, KNOWN_SUB_THRESHOLD, DEGRADE_TOLERANCE, MODES,
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
  console.log('  Palette wins the cascade (engine order and, since #1527, export order too)\n');

  if (showAll) {
    for (const r of res.rows) {
      if (r.unresolved) { console.log(`  ?     ${r.key}`); continue; }
      const mark = r.regressed ? '  ✗  ' : r.below ? 'under' : '  ✓  ';
      console.log(
        `  ${mark} ${r.ratio.toFixed(2).padStart(6)}:1 (need ${r.min ?? r.surface.min}, ` +
        `base ${r.baseRatio.toFixed(2)})  ${r.key}`,
      );
    }
    console.log('');
  }

  for (const e of res.evidence) console.log(`  ! catalog: ${e}`);
  for (const r of res.unresolved) console.log(`  ? unresolved: ${r.key} — ${r.surface.ctx}`);
  for (const r of res.regressions) {
    console.log(
      `  ✗ ${r.baseRatio.toFixed(2)} -> ${r.ratio.toFixed(2)}:1 (need ${r.min ?? r.surface.min})  ${r.key}`,
    );
    console.log(`       ${r.surface.ctx}`);
    console.log(`       ink ${r.fgHex} on ${r.bgHex}  ·  ${r.surface.src}`);
  }

  for (const r of res.unlisted) {
    console.log(`  ✗ ${r.ratio.toFixed(2).padStart(6)}:1 (need ${r.min ?? r.surface.min})  ${r.key}  — NOT in the frozen baseline`);
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
