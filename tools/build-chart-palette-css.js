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

/** Any modern colour function that breaks an old engine. Used for the reference-driven
 *  "does this token need flattening?" test — a token whose value transitively uses one of
 *  these must be compiled. (The OUTPUT flatness check is an allowlist, `unflattened` below,
 *  not this denylist — so a NEW modern colour function is caught even if it isn't listed here.) */
const MODERN_FN = /\blight-dark\(|\bcolor-mix\(/;

/** The functions an OLD engine (Safari < 16.2 / old smart-TV Chromium) parses. A compiled
 *  plane value may contain ONLY these — everything else (color-mix/light-dark/oklch/lab/lch/
 *  hwb/color()/relative-color rgb(from …), AND a surviving `var()` that means an undefined
 *  token) is a black-out on old engines and fails the build. Allowlist, not denylist: a modern
 *  colour function invented next year is rejected by default, closing the invisible-rot seam. */
const OLD_SAFE_FNS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla',
  'linear-gradient', 'radial-gradient', 'conic-gradient',
  'repeating-linear-gradient', 'repeating-radial-gradient',
  'calc', 'min', 'max', 'clamp',
]);

/** True if `v` (a compiled plane value) contains any function NOT on the old-safe allowlist —
 *  i.e. it did not fully flatten to something an old engine can paint. `rgb(from …)` relative
 *  colour is caught because the `from` keyword makes it un-flat here (we never emit it) — but
 *  even a bare `oklch(`/`lab(`/`var(` trips it. */
function unflattened(v) {
  for (const m of String(v).matchAll(/([a-z][a-z0-9-]*)\(/gi)) {
    if (!OLD_SAFE_FNS.has(m[1].toLowerCase())) return true;
  }
  return false;
}

/** The valid plane-group tags a `>>> chart-palette-recipe [group] >>>` region may carry.
 *  `chart` (default) paints on `.chart-frame`; `diagram` paints on the scoped diagram/chart
 *  root union (DIAGRAM_PLANE_SELECTOR). An unknown tag is a build error, not a silent
 *  mis-route to the chart group. */
const PLANE_GROUPS = new Set(['chart', 'diagram']);

/** The kernel selectors the DEFAULT plane paints on. Bare `.chart-frame` is
 *  included so the Read·Article <figure> re-host (a chart SVG re-hosted outside its
 *  section, #925) resolves the exact same literals as the slide. `section.math` is a
 *  sibling subtree (not a `.chart-frame`) that also draws chart-palette tokens
 *  (`--math-error-bg`), so it joins the union too. */
const DEFAULT_PLANE_SELECTOR = 'section.chart-frame, section.word-cloud, section.math, .chart-frame';

/** The DIAGRAM group's DEFAULT-plane selector — the engine-wide `--cat-*` categorical
 *  palette + the `--diagram-*` structurals (and the per-component mood / phase ramps built
 *  off them) that the Mermaid subtree and journey / roadmap consume. This group's token set
 *  necessarily includes CORE engine tokens (`--bg`, `--text-*`, `--accent`, `--border`,
 *  `--pass/warn/fail`) because Mermaid reads them DIRECTLY in an SVG paint (`fill:
 *  var(--text-heading)`). Emitting those flat literals must therefore be SCOPED to where
 *  diagram/chart content actually renders — NOT the whole deck: a bare `section, figure`
 *  would freeze the engine's entire colour system to build-time literals on every slide,
 *  taking core colour off the theme's live `:root light-dark()` and routing it through this
 *  compiler's scheme logic deck-wide (so a bug in that logic would mis-colour every slide's
 *  text/bg, not just a chart). The scope that matches the retired `@supports` fork's intent:
 *    • `.chart-frame`      — journey / roadmap / every chart-frame chart, AND their
 *                            Read·Article re-host `figure.chart-frame` (prose-projection.mjs).
 *    • `section.diagram`   — a Mermaid slide (Mermaid is the `diagram` bucket, NOT a
 *                            chart-frame; the SVG inherits from the section).
 *    • `.lp-figure`        — the Read·Article re-host figures, incl. the bare
 *                            `figure.lp-figure` a Mermaid diagram re-hosts into.
 *    • `section.math`      — the function-plot SVG (math.canvas) reads the shared `--viz-*`
 *                            structural ink/surface tokens; math is NOT a chart-frame.
 *    • `section.word-cloud`— completes the viz-root union (Phase A convergence toward the
 *                            unified `.viz-frame`; carries the shared `--viz-*` set too).
 *  This is now the FULL viz-root union — every element a visualization renders on. The
 *  shared `--viz-*` structural tokens (chart-family.css `[diagram]` recipe region) are the
 *  bounded ink/surface an SVG paint reads INSTEAD of a raw core token, so no SVG paint
 *  reads `--text-*`/`--bg`/`--accent`/`--border` directly (unified-viz-frame.md §Phase A).
 *  Everything OUTSIDE this union keeps the theme's native `:root` core tokens, untouched. */
const DIAGRAM_PLANE_SELECTOR = '.chart-frame, section.diagram, .lp-figure, section.math, section.word-cloud';

/** Build the subject-anchored OPPOSITE-scheme union for a plane group. `subjects` are the
 *  FULL simple selectors the custom props must land ON (tree-depth inheritance beats
 *  specificity for inherited props — the override must be on the subject, never a bare
 *  ancestor): a class (`.chart-frame`), a compound (`section.diagram`), whatever the group
 *  paints on. A scheme/OS modifier composes onto the SAME element (`.chart-frame.dark`,
 *  `section.diagram.dark`). Every arm is strictly higher specificity than the group's
 *  DEFAULT plane arm, so the opposite scheme always wins on its own subtree. */
function schemeAnchors(scheme, subjects) {
  const sel = (s) => s;                             // the subject IS the selector
  const compound = (s, cls) => `${s}.${cls}`;       // subject + class on the SAME element
  // Per-slide modifier (`section.dark`/`.light`) — the class is on the consuming subject.
  const perSlide = subjects.map((s) => compound(s, scheme));
  // Exported player / Read·Article figure host → pinned `data-lp-scheme` on an ancestor.
  const attr = subjects.map((s) => `[data-lp-scheme=${scheme}] ${sel(s)}`);
  return { plain: [...perSlide, ...attr], subjects, sel, compound };
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

/**
 * Expand `@expand VAR in LIST … @end` template blocks into concrete declarations.
 * The template lives INSIDE a CSS comment, so only this compiler sees it — every
 * other reader (parseVars, the contrast assessment) strips comments and ignores the
 * placeholders. LIST is a `a..b` numeric range or a comma list; each item replaces
 * VAR (a bare capital token, matched case-sensitively) throughout the body. This
 * keeps the ~150 per-slot/-state derived tokens (solid / gradient stops / pill /
 * card / ramp) as a compact FORMULA in the recipe source rather than hand-listed.
 *
 *   /* @expand N in 1..8
 *      --chart-cat-N-solid: color-mix(in oklab, var(--chart-cat-N-hue) 82%, var(--bg));
 *    @end *​/
 */
function expandTemplates(region) {
  return region.replace(
    /\/\*\s*@expand\s+([A-Z]\w*)\s+in\s+([^\n]+?)\s*\n([\s\S]*?)@end\s*\*\//g,
    (_m, varName, listSpec, body) => {
      const range = listSpec.trim().match(/^(\d+)\.\.(\d+)$/);
      const items = range
        ? Array.from({ length: +range[2] - +range[1] + 1 }, (_v, i) => String(+range[1] + i))
        : listSpec.split(',').map((s) => s.trim()).filter(Boolean);
      const re = new RegExp(varName, 'g');
      return items.map((it) => body.replace(re, it)).join('\n');
    },
  );
}

/** Collect `{ name, value, group }` recipe tokens from every `>>> chart-palette-recipe >>>`
 *  … `<<< chart-palette-recipe` region across the scanned chart files. chart-family.css
 *  holds the shared spectrum; a component `*.styles.css` may add its OWN region for its
 *  bespoke colour tokens (co-located with the component, discovered automatically —
 *  no central-file edit, so components stay independent). A region opens with an
 *  optional `[group]` tag right after the sentinel — `>>> chart-palette-recipe [diagram] : …`
 *  routes its tokens to the DIAGRAM plane group (emitted on `section, figure`); with no
 *  tag they default to the CHART group (`.chart-frame`). Template blocks (`@expand … @end`)
 *  are expanded first; first definition wins across files. */
function recipeTokens() {
  const out = [];
  const seen = new Set();
  // chart-family first (the shared spectrum other tokens build on), then the rest.
  const files = [CHART_FAMILY, ...scannedFiles().filter((f) => f !== CHART_FAMILY)];
  for (const file of files) {
    const css = fs.readFileSync(file, 'utf8');
    let idx = 0;
    for (;;) {
      const start = css.indexOf('>>> chart-palette-recipe', idx);
      if (start === -1) break;
      const end = css.indexOf('<<< chart-palette-recipe', start);
      if (end === -1) throw new Error(`build-chart-palette-css: unterminated chart-palette-recipe in ${file}`);
      // An optional `[group]` tag routes the region's tokens to a plane group. It must
      // sit IMMEDIATELY after the sentinel marker (anchored, so a `[word]` in the trailing
      // description can't be misread as the tag), on the opening line. No tag → chart.
      const nl = css.indexOf('\n', start);
      const header = css.slice(start, nl === -1 ? css.length : nl);
      const tag = header.match(/^>>> chart-palette-recipe\s*\[([a-z-]+)\]/);
      const group = tag ? tag[1] : 'chart';
      if (!PLANE_GROUPS.has(group)) {
        throw new Error(`build-chart-palette-css: unknown recipe group [${group}] in ${file} — known groups: ${[...PLANE_GROUPS].join(', ')}`);
      }
      // Expand templates BEFORE stripping comments (the templates ARE comments), then
      // strip the remaining (documentation) comments and read the declarations.
      const region = expandTemplates(css.slice(start, end)).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of region.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
        const name = m[1].slice(2);
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({ name, value: m[2].trim(), group });
      }
      idx = end + ('<<< chart-palette-recipe'.length);
    }
  }
  if (!out.length) {
    throw new Error('build-chart-palette-css: no chart-palette-recipe region found in chart-family.css');
  }
  return out;
}

/** The token map to resolve the recipe against: base + theme :root tokens, then
 *  the recipe's own definitions layered on (so a recipe token that references
 *  another recipe token — `--chart-cat-1-fill` → `--chart-cat-1-hue` — resolves,
 *  even though neither is a `:root` token). */
function themeVarMap(themeCss, baseCss, recipe) {
  const vars = parseRootVars(`${baseCss}\n${themeCss}`);
  // Chart-family's own non-`:root` tokens (the geometry constants like
  // `--chart-fill-top-l` that the gradient recipe references) live on `.chart-frame`,
  // so parseRootVars misses them — scan the file for every `--x: y` and layer them
  // in. The recipe's OWN (expanded) definitions win last for any recipe token.
  const family = fs.readFileSync(CHART_FAMILY, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of family.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
    const n = m[1].slice(2);
    if (!(n in vars)) vars[n] = m[2].trim();
  }
  for (const t of recipe) vars[t.name] = t.value;
  return vars;
}

/** The component paint files that consume the engine-wide `--cat-*` / `--diagram-*`
 *  palette (the DIAGRAM plane group's audience). SCOPE-MATCHED to the retired `@supports`
 *  fork, which covered `lib/components/chart/**` + mermaid ONLY — Mermaid (a bare
 *  `section.diagram`) plus the two chart-bucket members that read the engine-wide palette
 *  (journey mood, roadmap phase ramp). Legal / comparison-decision are DELIBERATELY absent:
 *  the fork never covered them, they're not on the diagram-plane selector, and pulling their
 *  `var()` refs in would over-widen the flattened token set for no coverage. Their reference-
 *  driven `var()`s drive the token set the diagram plane flattens. */
function diagramFiles() {
  return [
    'lib/integrations/mermaid/mermaid.css',
    'lib/components/chart/journey/journey.styles.css',
    'lib/components/chart/roadmap/roadmap.styles.css',
  ].map((r) => path.join(ROOT, r)).filter((p) => fs.existsSync(p));
}

/** True when `raw` (a token's authored value) would be DROPPED by an engine that lacks
 *  `light-dark()`/`color-mix()` — either it uses one directly, or it `var()`s through a
 *  token that does. These are the tokens the DIAGRAM group must re-emit flattened; a
 *  token already a flat literal (`--diagram-stroke: #1F4A6E`) is old-safe as-is and is
 *  left alone. Cycle-guarded via `seen`. */
function resolvesThroughModern(raw, vars, seen = new Set()) {
  if (raw == null) return false;
  if (MODERN_FN.test(raw)) return true;
  for (const m of String(raw).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    const name = m[1].slice(2);
    if (seen.has(name)) continue;
    seen.add(name);
    if (resolvesThroughModern(vars[name], vars, seen)) return true;
  }
  return false;
}

/** The theme-level tokens the diagram-family paints REFERENCE that need flattening —
 *  every `var(--X)` in those files whose theme/base definition resolves through a modern
 *  function. Excludes names already emitted by a recipe region (`exclude`): the CHART
 *  group serves its own `--chart-*`/`--state-*` tokens on `.chart-frame` (journey/roadmap
 *  ARE chart-frames), and the DIAGRAM recipe regions serve their own. Order-stable. */
function diagramReferencedTokenNames(vars, exclude) {
  const names = [];
  const seen = new Set();
  for (const file of diagramFiles()) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      const name = m[1].slice(2);
      if (seen.has(name) || exclude.has(name)) continue;
      seen.add(name);
      if (name in vars && resolvesThroughModern(vars[name], vars)) names.push(name);
    }
  }
  return names;
}

/**
 * Resolve one token to `{ name, base, override }` (base = the theme's declared scheme,
 * override = the opposite; override null when identical). Throws on any unflattened
 * output — a surviving color-mix()/light-dark() breaks old engines, a surviving var()
 * blacks out the mark on EVERY engine; either is the exact bug this compiler prevents.
 */
function resolveToken(name, value, vars, declaredDark) {
  // Resolve the token's VALUE (not `var(--name)`): resolveDeclarationValue scans colour
  // functions EMBEDDED in a larger value — e.g. the light-dark(color-mix(…)) stops inside
  // a `-fillgrad` linear-gradient() — which a whole-value var() hop would return verbatim.
  const light = resolveDeclarationValue(value, vars, false);
  const dark = resolveDeclarationValue(value, vars, true);
  if (unflattened(light) || unflattened(dark)) {
    throw new Error(`build-chart-palette-css: --${name} did not fully flatten to an OLD-SAFE literal (light=${light} dark=${dark}). Every function must be in the old-safe allowlist [${[...OLD_SAFE_FNS].join(', ')}] — a color-mix()/light-dark()/oklch()/lab()/relative-color, or a surviving var() (undefined token), blacks the mark out on an old engine. Compile the colour to a flat literal in the recipe.`);
  }
  const base = declaredDark ? dark : light;
  const override = declaredDark ? light : dark;
  return { name, base, override: override === base ? null : override };
}

/**
 * Compile one theme's recipe → { chart, diagram, declaredDark } where `chart` and
 * `diagram` are each a `[{ name, base, override }]` rule list for their plane group.
 * The CHART group is the `--chart-*`/`--state-*` recipe on `.chart-frame`; the DIAGRAM
 * group is the engine-wide `--cat-*`/`--diagram-*` palette + the `[diagram]`-tagged
 * component recipe tokens, reference-driven from the diagram-family paints, on
 * `section, figure`.
 */
function buildPlanes(themeCss, baseCss) {
  const recipe = recipeTokens();
  const vars = themeVarMap(themeCss, baseCss, recipe);
  const declaredDark = isDarkScheme(`${baseCss}\n${themeCss}`);

  const chart = [];
  const diagram = [];
  const recipeNames = new Set(recipe.map((t) => t.name));
  for (const t of recipe) {
    (t.group === 'diagram' ? diagram : chart).push(resolveToken(t.name, t.value, vars, declaredDark));
  }
  // Reference-driven: the theme-level tokens the diagram paints read that need flattening.
  for (const name of diagramReferencedTokenNames(vars, recipeNames)) {
    diagram.push(resolveToken(name, `var(--${name})`, vars, declaredDark));
  }
  return { chart, diagram, declaredDark };
}

/** Serialize ONE plane group (base + opposite-scheme override + strict OS arm). No
 *  `@supports` — this is the primary paint. `baseSelector` is the group's default-plane
 *  union; `subjects` are the FULL simple selectors the override anchors compose onto. */
function serializeGroup(rules, declaredDark, baseSelector, subjects) {
  if (!rules.length) return '';
  const baseBody = rules.map((r) => `--${r.name}: ${r.base}`).join('; ');
  let out = `${baseSelector} { ${baseBody} }\n`;

  const overrides = rules.filter((r) => r.override != null);
  if (overrides.length) {
    // The opposite scheme: a light theme's override is DARK; a dark theme's is LIGHT.
    const scheme = declaredDark ? 'light' : 'dark';
    const { plain, sel, compound } = schemeAnchors(scheme, subjects);
    const body = overrides.map((r) => `--${r.name}: ${r.override}`).join('; ');
    out += `${plain.join(', ')} { ${body} }\n`;
    // OS arm — for surfaces that follow the OS. Two anchors:
    //   • the exported player's strict `:root[data-lp-scheme=system]` (byte-matches
    //     player-core.mjs: keys on `=system`, never `:not([=light])`, so a pinned
    //     export is untouched by the viewer's OS); and
    //   • `.color-system` — the `color-mode: system` per-slide modifier
    //     (base.modifiers.css `section.color-system{color-scheme:light dark}`), which
    //     follows the OS on ANY surface. Compound (the section IS the subject) AND
    //     descendant (a nested figure re-host) both covered, both above the default plane.
    const osSel = [
      ...subjects.map((s) => `:root[data-lp-scheme=system] ${sel(s)}`),
      ...subjects.map((s) => compound(s, 'color-system')),
      ...subjects.map((s) => `.color-system ${sel(s)}`),
    ].join(', ');
    out += `@media (prefers-color-scheme:${scheme}) { ${osSel} { ${body} } }\n`;

    // RESTORE-BASE arm. A per-slide class that returns a slide to the theme's DECLARED scheme
    // (`.light` on a light theme, `.dark` on a dark theme) must win over a deck pinned to the
    // OPPOSITE scheme. Without this, the override's `[data-lp-scheme=opp] <subject>` (0,1,1) beats
    // the base plane's bare `<subject>` (0,0,1), so a `_class: light` slide on a `color-mode: dark`
    // deck paints the DARK tokens (red-team P1). Re-emit the BASE tokens on the base-scheme class at
    // (0,2,1): once for the `data-lp-scheme` deck pin (color-mode:/class:), once for the OS `system`
    // receiver inside the opposite-scheme media block. (A per-slide OVERRIDE class already wins — it
    // has the override arm above; only the base-class-under-opposite-pin case was unrestored.)
    const baseClass = declaredDark ? 'dark' : 'light';
    const restorePinned = subjects.map((s) => `[data-lp-scheme=${scheme}] ${compound(s, baseClass)}`).join(', ');
    out += `${restorePinned} { ${baseBody} }\n`;
    const restoreOs = subjects.map((s) => `:root[data-lp-scheme=system] ${compound(s, baseClass)}`).join(', ');
    out += `@media (prefers-color-scheme:${scheme}) { ${restoreOs} { ${baseBody} } }\n`;
  }
  return out;
}

/**
 * Generate the compiled chart-palette planes for one theme — both plane groups.
 * @param {string} themeName  theme file basename (e.g. 'indaco', 'indaco-dark')
 * @param {string} baseCss    the assembled base bundle (stands in for `@import 'lattice'`)
 * @returns {string} the compiled CSS (empty if the recipe is empty)
 */
function chartPaletteCssForTheme(themeName, baseCss) {
  const themeCss = resolveThemeCascade(themeName);
  const { chart, diagram, declaredDark } = buildPlanes(themeCss, baseCss);
  return serializeGroup(chart, declaredDark, DEFAULT_PLANE_SELECTOR, ['.chart-frame', '.word-cloud', '.math'])
    + serializeGroup(diagram, declaredDark, DIAGRAM_PLANE_SELECTOR, ['.chart-frame', 'section.diagram', '.lp-figure', 'section.math', 'section.word-cloud']);
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
