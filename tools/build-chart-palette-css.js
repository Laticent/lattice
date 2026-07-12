/**
 * build-chart-palette-css — compile the chart colour recipe to FLAT, per-theme
 * literal planes (STATIC PALETTE COMPILATION).
 *
 * WHY. Every chart colour in Lattice is authored through `light-dark()` and
 * `color-mix()` (the chart-family recipe, per-theme `--chart-cat*`, the journey
 * mood ramp, math's function-plot re-colour). On an engine that lacks those CSS
 * functions (old WebKit < 16.2 / an old smart-TV Chromium fork), the WHOLE
 * declaration is invalid-at-computed-value and dropped — an SVG `fill` then falls
 * to its black initial value, an HTML `background` vanishes. Charts render solid
 * black or colourless. The former fix wrapped a flat twin in
 * `@supports not (light-dark)`, but that fork is NEVER executed by headless
 * Chromium, so regressions rode through it invisibly (#925/#936). This module
 * DELETES the fork: it compiles the recipe to plain literals + plain `var()` (a
 * 2016-era feature, six years below the color-mix/light-dark floor), so **modern
 * and old browsers run byte-identical chart CSS** and a future regression surfaces
 * on modern, where it is testable.
 *
 * WHAT. The recipe lives between `>>> chart-palette-recipe >>>` sentinels in
 * chart-family.css (a build-time INPUT; `tools/build-css.js` strips it from the
 * shipped bundle). For each theme this reads those token definitions and resolves
 * every one to two flat literals (its own declared scheme + the opposite) with the
 * shared offline evaluator (lib/core/resolve-token-expr.js — the SAME math that
 * already ships in dist), then emits TWO PLANES:
 *
 *   1. DEFAULT plane — the theme's own declared scheme, on the kernel's own
 *      selectors INCLUDING the bare `.chart-frame` (so the Read·Article <figure>
 *      re-host resolves identically to a slide — figure == section for free).
 *   2. OVERRIDE plane — the OPPOSITE scheme, as a DESCENDANT-/COMPOUND-SUBJECT on a
 *      canonical anchor union (`.chart-frame.dark`, `[data-lp-scheme=dark] .chart-frame`,
 *      the strict OS arm `@media(prefers-color-scheme:dark){:root[data-lp-scheme=system]…}`).
 *      Custom properties inherit by TREE DEPTH, not specificity — a default literal
 *      set directly on `.chart-frame` would beat an override inherited from an
 *      ancestor `:root`; so the override MUST land on the consuming element itself,
 *      at strictly higher specificity than the default. The OS arm byte-matches the
 *      exported player's strict form (lib/export/player-core.mjs) so an old engine
 *      that repaints on `data-lp-scheme` flips in lockstep.
 *
 * Lattice drives dark by `color-scheme` (a `*-dark` theme sets it deck-wide;
 * `section.dark`/`section.light` flip a single slide) and by `data-lp-scheme` in
 * the exported player — NEVER by OS `@media` except the no-JS `system` fallback.
 * The DEFAULT plane is the theme's declared scheme; the OVERRIDE plane keys on the
 * OPPOSITE-scheme anchors. Because the recipe is now the ONLY chart-colour source
 * (no `light-dark()` survives for the browser to follow natively), those anchors
 * must capture EVERY dark-selection path or MODERN dark regresses too — hence the
 * per-slide class, the player attribute, and the OS arm are all emitted.
 *
 * Consumed by tools/build-css.js (appended to each dist/themes/*.min.css) AND by
 * lattice-emulator.js (appended to the palette CSS, so the CLI PDF + exported
 * player carry the same planes). Pure module: no writes of its own.
 *
 * See engineering/decisions/2026-07-12-chart-color-static-palette.md.
 */

const fs = require('fs');
const path = require('path');
const { resolveDeclarationValue } = require('../lib/core/resolve-token-expr');
const { parseRootVars, isDarkScheme } = require('../lib/core/parse-root-vars');

const ROOT = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const CHART_FAMILY = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-family.css');

/** Any modern colour function that breaks an old engine. */
const MODERN_FN = /\blight-dark\(|\bcolor-mix\(/;

/** The kernel selectors the DEFAULT plane paints on. Bare `.chart-frame` is
 *  included so the Read·Article <figure> re-host (a chart SVG re-hosted outside its
 *  section, #925) resolves the exact same literals as the slide. */
const DEFAULT_PLANE_SELECTOR = 'section.chart-frame, section.word-cloud, .chart-frame';

/** The subject-anchored union that selects the OPPOSITE scheme. `subj` is the
 *  consuming element (`.chart-frame` / `.word-cloud`) so custom props land on it
 *  directly (tree-depth inheritance beats specificity for inherited props — the
 *  override must be ON the subject, never a bare ancestor). Every arm is strictly
 *  higher specificity than the DEFAULT plane's matching arm. */
function schemeAnchors(scheme) {
  const subjects = ['chart-frame', 'word-cloud'];
  // Per-slide modifier (`section.dark`/`.light` add the class to the chart section,
  // which IS the .chart-frame element) → compound-subject `.chart-frame.<scheme>`.
  const perSlide = subjects.map((s) => `.${s}.${scheme}`);
  // Exported player / Read·Article figure host → the pinned `data-lp-scheme`
  // attribute on an ancestor, subject = the consuming element.
  const attr = subjects.map((s) => `[data-lp-scheme=${scheme}] .${s}`);
  return { plain: [...perSlide, ...attr], subjects };
}

/**
 * Resolve a theme's `@import` chain to one CSS string, base-import first, so its
 * inherited tokens are all present. Skips the `'lattice'` base bundle (passed
 * separately as baseCss). Cycle-guarded.
 */
function resolveThemeCascade(themeName, seen = new Set()) {
  if (seen.has(themeName)) return '';
  seen.add(themeName);
  const file = path.join(THEMES_DIR, `${themeName}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    const name = m[1].replace(/\.css$/, '');
    if (name === 'lattice') continue;
    out += resolveThemeCascade(name, seen) + '\n';
  }
  return out + css;
}

/** Read the sentinel-delimited recipe region from chart-family.css → an ordered
 *  list of `{ name, value }` token definitions (the colours to compile). */
function recipeTokens() {
  const css = fs.readFileSync(CHART_FAMILY, 'utf8');
  const start = css.indexOf('>>> chart-palette-recipe');
  const end = css.indexOf('<<< chart-palette-recipe');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('build-chart-palette-css: chart-palette-recipe sentinels not found in chart-family.css');
  }
  const region = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const seen = new Set();
  for (const m of region.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = m[1].slice(2);
    if (seen.has(name)) continue; // first definition wins (source order)
    seen.add(name);
    out.push({ name, value: m[2].trim() });
  }
  return out;
}

/** The token map to resolve the recipe against: base + theme :root tokens, then
 *  the recipe's own definitions layered on (so a recipe token that references
 *  another recipe token — `--chart-cat-1-fill` → `--chart-cat-1-hue` — resolves,
 *  even though neither is a `:root` token). */
function themeVarMap(themeCss, baseCss, recipe) {
  const vars = parseRootVars(`${baseCss}\n${themeCss}`);
  for (const t of recipe) if (!(t.name in vars)) vars[t.name] = t.value;
  return vars;
}

/**
 * Compile one theme's recipe → { rules, declaredDark } where each rule is
 * `{ name, base, override }` (base = the theme's declared scheme, override = the
 * opposite; override omitted when identical).
 */
function buildPlanes(themeCss, baseCss) {
  const recipe = recipeTokens();
  const vars = themeVarMap(themeCss, baseCss, recipe);
  const declaredDark = isDarkScheme(`${baseCss}\n${themeCss}`);
  const rules = [];
  for (const t of recipe) {
    const light = resolveDeclarationValue(`var(--${t.name})`, vars, false);
    const dark = resolveDeclarationValue(`var(--${t.name})`, vars, true);
    if (MODERN_FN.test(light) || MODERN_FN.test(dark)) {
      throw new Error(`build-chart-palette-css: --${t.name} did not fully flatten (light=${light} dark=${dark})`);
    }
    const base = declaredDark ? dark : light;
    const override = declaredDark ? light : dark;
    rules.push({ name: t.name, base, override: override === base ? null : override });
  }
  return { rules, declaredDark };
}

/** Serialize the two planes to CSS (no `@supports` — this is the primary paint). */
function serialize(rules, declaredDark) {
  if (!rules.length) return '';
  const decls = (pick) => rules
    .map((r) => `--${r.name}: ${pick(r)}`)
    .join('; ');

  const baseBody = decls((r) => r.base);
  let out = `${DEFAULT_PLANE_SELECTOR} { ${baseBody} }\n`;

  const overrides = rules.filter((r) => r.override != null);
  if (overrides.length) {
    // The opposite scheme: a light theme's override is DARK; a dark theme's is LIGHT.
    const scheme = declaredDark ? 'light' : 'dark';
    const { plain, subjects } = schemeAnchors(scheme);
    const body = overrides.map((r) => `--${r.name}: ${r.override}`).join('; ');
    out += `${plain.join(', ')} { ${body} }\n`;
    // Strict OS arm — byte-matches the exported player (player-core.mjs): only the
    // no-JS `system` receiver follows the OS, and it keys on `=system`, never
    // `:not([=light])`, so a pinned export is untouched by the viewer's OS.
    const osSel = subjects.map((s) => `:root[data-lp-scheme=system] .${s}`).join(', ');
    out += `@media (prefers-color-scheme:${scheme}) { ${osSel} { ${body} } }\n`;
  }
  return out;
}

/**
 * Generate the compiled chart-palette planes for one theme.
 * @param {string} themeName  theme file basename (e.g. 'indaco', 'indaco-dark')
 * @param {string} baseCss    the assembled base bundle (stands in for `@import 'lattice'`)
 * @returns {string} the two-plane CSS (empty if the recipe is empty)
 */
function chartPaletteCssForTheme(themeName, baseCss) {
  const themeCss = resolveThemeCascade(themeName);
  const { rules, declaredDark } = buildPlanes(themeCss, baseCss);
  return serialize(rules, declaredDark);
}

/** The recipe token names — the compile-time contract (Gate 3: the compiled planes
 *  must DEFINE a superset of these, so a dropped token blacks out modern too). */
function recipeTokenNames() {
  return recipeTokens().map((t) => t.name);
}

/** The chart/math component paint files whose colour the palette covers — the
 *  chart bucket's `*.styles.css`, the shared kernel, and math (the one non-chart
 *  component that re-colours SVG through themed tokens). Consumed by the
 *  gallery-parity gate and the Phase-3 output scan. */
function scannedFiles() {
  const out = [];
  const chartRoot = path.join(ROOT, 'lib', 'components', 'chart');
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.styles.css')) out.push(p);
    }
  };
  walk(chartRoot);
  out.push(CHART_FAMILY);
  out.push(path.join(ROOT, 'lib', 'components', 'math', 'math', 'math.styles.css'));
  out.push(path.join(ROOT, 'lib', 'integrations', 'mermaid', 'mermaid.css'));
  return [...new Set(out)].filter((p) => fs.existsSync(p)).sort();
}

module.exports = {
  chartPaletteCssForTheme,
  recipeTokens,
  recipeTokenNames,
  scannedFiles,
  resolveThemeCascade,
  DEFAULT_PLANE_SELECTOR,
  schemeAnchors,
};
