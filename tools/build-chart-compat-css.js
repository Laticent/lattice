/**
 * build-chart-compat-css — generate the OLD-BROWSER colour fallback for charts.
 *
 * WHY. Every chart colour in Lattice resolves through `light-dark()` and/or
 * `color-mix()` (the chart-family kernel, per-theme `--cat-*`, the journey mood
 * ramp, math's function-plot re-colour). On an engine that doesn't support those
 * CSS functions (an old webOS / smart-TV Chromium fork predating Chromium 123),
 * the WHOLE declaration is invalid at computed-value time and is dropped — an SVG
 * `fill` then falls to its black initial value, an HTML `background` vanishes.
 * Charts render solid black or colourless. (#svg-token-colors-lg-tv)
 *
 * WHAT. For every chart colour, emit a FLAT-literal twin inside
 * `@supports not (color: light-dark(#000,#fff))` — a block a modern engine
 * evaluates to FALSE and never applies (so modern output is byte-identical), and
 * an old engine applies (so it gets a parseable colour). Light values are the
 * default; dark values ride `@media (prefers-color-scheme: dark)` + `section.dark`,
 * so the fallback still flips per canvas with no JS and no flash.
 *
 * HOW — three rule sources, so the browser's own cascade does the hard part and
 * no fragile setter→painter relocation is needed:
 *
 *   (1) SETTER FLATTEN. Every custom-property whose value resolves through a
 *       modern function is re-emitted flattened on its OWN selector
 *       (`--mood-color: light-dark(a,b)` → `--mood-color: #hex`). The browser
 *       inherits it to every plain-`var()` consumer (a journey face reading its
 *       ancestor's `--mood-color`) — cross-element cases resolve for free.
 *   (2) GLOBAL REDEFINE (chart-scoped). Chart CSS also reads theme `:root` tokens
 *       directly (`var(--text-heading)`, `var(--cat-2-mark)`). Those are redefined
 *       flattened, scoped to the chart section roots, so chart descendants get
 *       literals without touching the rest of the deck.
 *   (3) PAINTER FLATTEN. A paint declaration whose value carries a modern function
 *       (or a token that resolves to one) is re-emitted flat + `!important` — the
 *       `!important` (inert on modern engines, since the whole block is) lets it
 *       override an inline broken paint, e.g. a pie wedge's `fill:url(#gradient)`
 *       whose stops are unparseable. Painters that read a LOCAL (`--fill-hue`, set
 *       per status on the SAME element) are joined with that same-element setter —
 *       a reliable class-prefix match, never cross-element ancestry inference.
 *
 * Themes are NOT touched: the generator READS the authored chart CSS +
 * chart-family.css + math.styles.css and resolves against each theme's token map
 * with the shared offline evaluator (lib/core/resolve-token-expr.js). The recipe
 * stays in the authored CSS; this mirrors it flattened, so it can't drift (a
 * parity test pins each literal to the browser's computed value).
 *
 * The map choropleth ramp (`--mix`, set inline per region) is the one continuous
 * per-instance case: it degrades to a representative flat tone (coarse-flat, the
 * agreed on-brand degradation), correct hue and canvas.
 *
 * Consumed by tools/build-css.js (appended to dist/lattice.css + each
 * dist/themes/*.css). Pure module: exports the generator; no writes of its own.
 */

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const { resolveTokenExpr, resolveDeclarationValue } = require('../lib/core/resolve-token-expr');
const { parseRootVars, isDarkScheme } = require('../lib/core/parse-root-vars');

const ROOT = path.resolve(__dirname, '..');

// `light-dark()` shipped LAST of the two functions (Chromium 123) — any engine
// missing color-mix() also misses this, so one probe is the tightest single gate.
const SUPPORTS_GUARD = 'not (color: light-dark(#000, #fff))';

// The chart section roots — where the chart-scoped global-token redefinitions
// (source 2) live so they inherit to every chart descendant without reaching the
// rest of the deck. Every scanned component renders under one of these.
const CHART_ROOTS = 'section.chart-frame, section.journey, section.map, section.math';

// The map choropleth ramp degrades to a representative upper-mid tone — the
// agreed coarse-flat on-brand degradation for the one continuous per-instance fill.
const MAP_RAMP_REPRESENTATIVE_MIX = 65;

const MODERN_FN = /\blight-dark\(|\bcolor-mix\(/;
// Colour properties whose LOSS turns a chart black or colourless — the ones worth
// a fallback. Deliberately EXCLUDES box-shadow / outline / filter glows: those
// degrade gracefully (the effect just vanishes, no black fill) and, being on
// hover/active refinements, would otherwise force over-broad joins.
const COLOUR_PROPS = /^(fill|stroke|stop-color|background|background-color|background-image|border|border-color|border-top-color|border-left-color|border-bottom-color|border-right-color|color)$/;

const THEMES_DIR = path.join(ROOT, 'themes');

/**
 * Resolve a theme's `@import` chain to one CSS string, base-import first, so its
 * inherited tokens are all present in the map. A `*-dark` theme imports its light
 * base (`@import 'indaco'`), an a11y theme imports its base (`@import 'a11y-base'`
 * → `@import 'onyx'`), and every theme imports `'lattice'` — which is NOT a theme
 * file but the assembled base bundle passed separately as `baseCss`, so it is
 * skipped here. Cycle-guarded.
 */
function resolveThemeCascade(themeName, seen = new Set()) {
  if (seen.has(themeName)) return '';
  seen.add(themeName);
  const file = path.join(THEMES_DIR, `${themeName}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  // Prepend each imported theme (base-first), skipping the 'lattice' base bundle.
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    const name = m[1].replace(/\.css$/, '');
    if (name === 'lattice') continue;
    out += resolveThemeCascade(name, seen) + '\n';
  }
  return out + css;
}

/** Chart bucket (every chart is an HTML+SVG hybrid) + the shared kernel CSS +
 *  math (the one non-chart component that re-colours SVG through themed tokens). */
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
  out.push(path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-family.css'));
  out.push(path.join(ROOT, 'lib', 'components', 'math', 'math', 'math.styles.css'));
  return [...new Set(out)].filter((p) => fs.existsSync(p)).sort();
}

/** The last compound selector (after the final combinator) of a selector. */
function lastCompound(sel) {
  const parts = sel.split(/\s+|>|\+|~/).filter(Boolean);
  return parts[parts.length - 1] || sel;
}
/** The variant SUFFIX of a compound — its `[attr]` / `:pseudo` parts, which make
 *  it a variant of a base element (e.g. `.gantt-bar[data-s="x"]` → `[data-s="x"]`,
 *  `[data-cell="0"]` → `[data-cell="0"]`, `.wedge:nth-of-type(6n+1)` →
 *  `:nth-of-type(6n+1)`). Appending this to the painter's own selector targets the
 *  SAME element carrying that variant — robust whether the variant is keyed by a
 *  class or a bare attribute, unlike a base-class match. */
function variantSuffix(compound) {
  const parts = compound.match(/(\[[^\]]*\]|::?[a-z][a-z-]*(\([^)]*\))?)/gi) || [];
  return parts.join('');
}

/**
 * Parse the scanned CSS once:
 *   customProps — [{ selector, name, value, variant }]  every --x declaration
 *   painters    — [{ selector, prop, value }]           colour paint declarations
 *   setters     — Map name → [{ selector, value }]      --x set by a variant rule
 */
function parseModel(files) {
  const customProps = [];
  const painters = [];
  const setters = new Map();
  for (const file of files) {
    let ast;
    try { ast = postcss.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    ast.walkRules((rule) => {
      const selector = rule.selector.replace(/\s+/g, ' ').trim();
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) {
          const name = decl.prop.slice(2);
          const variant = /\[data-|:nth-of-type|:nth-child|--on\b|--hl\b/.test(selector);
          customProps.push({ selector, name, value: decl.value, variant });
          if (variant) {
            if (!setters.has(name)) setters.set(name, []);
            setters.get(name).push({ selector, value: decl.value });
          }
          return;
        }
        if (COLOUR_PROPS.test(decl.prop) && /var\(|color-mix|light-dark/.test(decl.value)) {
          painters.push({ selector, prop: decl.prop, value: decl.value });
        }
      });
    });
  }
  return { customProps, painters, setters };
}

/** Build the light + dark token maps for one theme (base :root + theme :root +
 *  chart-scoped tokens defined on section.chart-frame etc.). */
function themeMaps(themeCss, baseCss, files) {
  const combined = `${baseCss}\n${themeCss}`;
  const vars = parseRootVars(combined);
  // Layer chart-scoped token DEFINITIONS (defined on section.chart-frame /
  // :root in the component CSS, which parseRootVars over base+theme misses).
  for (const file of files) {
    let ast;
    try { ast = postcss.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    ast.walkRules((rule) => {
      const variant = /\[data-|:nth-of-type|:nth-child|--on\b|--hl\b/.test(rule.selector);
      if (variant) return; // variant setters are locals, not global tokens
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--') && !(decl.prop.slice(2) in vars)) {
          vars[decl.prop.slice(2)] = decl.value;
        }
      });
    });
  }
  return { vars, declaredDark: isDarkScheme(combined) };
}

/** Names referenced by an expression via var(). */
function referencedVars(value) {
  return (value.match(/var\(\s*--([a-z0-9-]+)/gi) || []).map((m) => m.replace(/var\(\s*--/i, ''));
}

/** Does resolving `value` (light or dark) require a modern function, i.e. is it a
 *  colour that would break on an old engine? Considers both the global token map
 *  AND variant-LOCAL vars (a painter reading `var(--cell-fill)`, where --cell-fill
 *  is set per `[data-cell]` to `var(--chart-cat-1-fill)`): a local isn't in the
 *  global map, so its modern-fn nature is only visible through its setter. */
function needsFallback(value, vars, setters) {
  if (MODERN_FN.test(value)) return true;
  for (const n of referencedVars(value)) {
    const raw = vars[n];
    if (raw && (MODERN_FN.test(raw) || MODERN_FN.test(resolveDeclarationValue(`var(--${n})`, vars, false)))) return true;
    if (setters && setters.has(n)) {
      for (const s of setters.get(n)) if (needsFallback(s.value, vars, null)) return true;
    }
  }
  return false;
}

/** Two flat resolutions of an expression (light, dark) or null if it can't be
 *  fully flattened (a modern fn survives — the coverage/parity gate flags it). */
function bothModes(value, vars, locals) {
  const map = locals ? { ...vars, ...locals } : vars;
  const light = resolveDeclarationValue(value, map, false);
  const dark = resolveDeclarationValue(value, map, true);
  if (MODERN_FN.test(light) || MODERN_FN.test(dark)) return null;
  return { light, dark };
}

/**
 * Build the three rule sources for one theme.
 * @returns {Array<{selector, prop, light, dark, important}>}
 */
function buildRules(themeCss, baseCss) {
  const files = scannedFiles();
  const model = parseModel(files);
  const { vars } = themeMaps(themeCss, baseCss, files);
  const rules = [];

  // (1) SETTER FLATTEN — every custom-property that resolves through a modern fn,
  // re-emitted flat on its own selector. Deduped per (selector,name).
  const seenSetter = new Set();
  for (const cp of model.customProps) {
    if (!needsFallback(cp.value, vars)) continue;
    const key = `${cp.selector} ${cp.name}`;
    if (seenSetter.has(key)) continue;
    seenSetter.add(key);
    const m = bothModes(cp.value, vars, null);
    if (!m) continue;
    rules.push({ selector: cp.selector, prop: `--${cp.name}`, light: m.light, dark: m.dark, important: false });
  }

  // (2) GLOBAL REDEFINE (chart-scoped) — theme/base :root tokens read by chart
  // CSS that resolve through a modern fn, redefined flat under the chart roots.
  const referenced = new Set();
  const collect = (value) => { for (const n of referencedVars(value)) referenced.add(n); };
  for (const p of model.painters) collect(p.value);
  for (const cp of model.customProps) collect(cp.value);
  // transitive closure through the token map
  const queue = [...referenced];
  while (queue.length) {
    const n = queue.shift();
    const raw = vars[n];
    if (!raw) continue;
    for (const r of referencedVars(raw)) if (!referenced.has(r)) { referenced.add(r); queue.push(r); }
  }
  const baseRootNames = new Set(Object.keys(parseRootVars(`${baseCss}\n${themeCss}`)));
  for (const name of referenced) {
    if (!baseRootNames.has(name)) continue; // only real :root theme/base tokens
    const raw = vars[name];
    if (!raw || !MODERN_FN.test(resolveDeclarationValue(`var(--${name})`, vars, false)) && !MODERN_FN.test(raw)) continue;
    const m = bothModes(`var(--${name})`, vars, null);
    if (!m) continue;
    rules.push({ selector: CHART_ROOTS, prop: `--${name}`, light: m.light, dark: m.dark, important: false });
  }

  // (3) PAINTER FLATTEN — a colour paint declaration re-emitted flat + !important
  // so it beats an inline broken paint. Fires when the paint is SVG fill/stroke
  // (which may compete with an inline `url(#gradient)` whose stops are unparseable)
  // OR the value carries a modern function LITERALLY (a gantt/pill gradient). A
  // plain-var() HTML consumer (a journey face `color: var(--mood-color)`) is NOT
  // fired here — source (1) flattens its token and the cascade inherits it, no
  // inline competition to override.
  const isSvgPaint = (prop) => /^(fill|stroke|stop-color)$/.test(prop);
  for (const p of model.painters) {
    if (!needsFallback(p.value, vars, model.setters)) continue;
    if (!isSvgPaint(p.prop) && !MODERN_FN.test(p.value)) continue;
    const localsUsed = referencedVars(p.value).filter((n) => model.setters.has(n) || /^(mix|region-hue|series-color|actor-color)$/.test(n));
    // (3a) no local — resolve straight against the theme map (the painter selector
    // already pins the slot, e.g. `.wedge:nth-of-type(6n+1) { fill: var(--chart-cat-1-fill) }`).
    if (localsUsed.length === 0) {
      const m = bothModes(p.value, vars, null);
      if (m) rules.push({ selector: p.selector, prop: p.prop, light: m.light, dark: m.dark, important: true });
      continue;
    }
    // (3b) the map choropleth ramp: --mix set inline per region → coarse-flat tone.
    if (localsUsed.includes('mix') && !model.setters.has('mix')) {
      const m = bothModes(p.value, vars, { mix: `${MAP_RAMP_REPRESENTATIVE_MIX}%` });
      if (m) rules.push({ selector: p.selector, prop: p.prop, light: m.light, dark: m.dark, important: true });
      continue;
    }
    // (3c) same-element local (a variant sets the local on the very element the
    // painter styles). For each setter, append its variant SUFFIX to the painter's
    // OWN selector — targets the same element carrying that variant, whether the
    // variant is keyed by class or bare attribute. A cross-element painter (the
    // gantt milestone sets --fill-hue, its child .gantt-diamond paints) produces a
    // non-matching combo (harmless): its flat token still arrives via source (1),
    // so only its gradient fill degrades — an acceptable loss on a small marker.
    const anchor = localsUsed.find((n) => model.setters.has(n));
    if (!anchor) continue; // inline-kernel local with no setter + not --mix
    for (const setter of model.setters.get(anchor)) {
      const locals = {};
      for (const n of localsUsed) {
        const b = (model.setters.get(n) || []).find((s) => s.selector === setter.selector);
        if (b) locals[n] = b.value;
      }
      const m = bothModes(p.value, vars, locals);
      if (!m) continue;
      const suffixes = setter.selector.split(',').map((s) => variantSuffix(lastCompound(s.trim()))).filter(Boolean);
      if (!suffixes.length) continue;
      const target = suffixes.map((suf) => `${p.selector}${suf}`).join(', ');
      rules.push({ selector: target, prop: p.prop, light: m.light, dark: m.dark, important: true });
    }
  }
  return rules;
}

/** Serialize rules into an @supports block (light default + dark override). */
function serialize(rules) {
  if (!rules.length) return '';
  const light = new Map(); // selector → [decl]
  const dark = new Map();
  const push = (map, sel, text) => { if (!map.has(sel)) map.set(sel, []); map.get(sel).push(text); };
  for (const r of rules) {
    const bang = r.important ? ' !important' : '';
    push(light, r.selector, `${r.prop}: ${r.light}${bang}`);
    if (r.dark !== r.light) push(dark, r.selector, `${r.prop}: ${r.dark}${bang}`);
  }
  const block = (map, indent) => [...map.entries()]
    .map(([sel, decls]) => `${indent}${sel} { ${decls.join('; ')} }`).join('\n');

  let out = `@supports ${SUPPORTS_GUARD} {\n`;
  out += block(light, '  ');
  if (dark.size) {
    out += '\n  @media (prefers-color-scheme: dark) {\n' + block(dark, '    ') + '\n  }';
    const scoped = new Map(
      [...dark.entries()].map(([sel, decls]) => [
        sel.split(',').map((s) => `section.dark ${s.trim()}, section.dark${s.trim()}`).join(', '),
        decls,
      ]),
    );
    out += '\n' + block(scoped, '  ');
  }
  out += '\n}';
  return out;
}

/**
 * Generate the fallback @supports block for one theme.
 * @param {string} themeName  theme file basename (e.g. 'indaco', 'indaco-dark')
 * @param {string} baseCss    the assembled base bundle (stands in for `@import
 *                            'lattice'`) — pass build-css.js's `bundle()` output
 * @returns {string} the @supports block (empty if nothing to flatten)
 */
function chartCompatCssForTheme(themeName, baseCss) {
  const themeCss = resolveThemeCascade(themeName);
  return serialize(buildRules(themeCss, baseCss));
}

/** Every chart/math colour declaration that USES a modern function — the coverage
 *  gate asserts each is represented in the generated fallback. */
function coverageSites() {
  const files = scannedFiles();
  const model = parseModel(files);
  return model.painters
    .filter((p) => MODERN_FN.test(p.value) || /var\(/.test(p.value))
    .map((p) => ({ selector: p.selector, prop: p.prop }));
}

module.exports = { chartCompatCssForTheme, coverageSites, scannedFiles, buildRules, SUPPORTS_GUARD };
