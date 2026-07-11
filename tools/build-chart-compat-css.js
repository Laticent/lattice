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
 * WHAT. For every chart declaration whose value uses those functions, emit a
 * FLAT-literal twin inside `@supports not (color: light-dark(#000,#fff))` — a
 * block a modern engine evaluates to FALSE and never applies (so modern output
 * is byte-identical), and an old engine applies (so it gets a parseable colour).
 * Light values are the default; dark values ride `@media (prefers-color-scheme:
 * dark)` + `section.dark`, so the fallback still flips per canvas with no JS and
 * no flash. Every generated rule is `!important` — harmless (the block is inert
 * on modern engines) and, on an old engine, enough to override an inline broken
 * paint (a pie wedge's `fill:url(#gradient)` whose stops are unparseable).
 *
 * HOW. Themes are NOT touched. The generator READS the authored chart CSS +
 * `chart-family.css` + `math.styles.css`, resolves each colour declaration to a
 * literal with the shared offline evaluator (lib/core/resolve-token-expr.js —
 * the same twin of getComputedStyle the Mermaid bridge uses) against each theme's
 * token map, and appends the `@supports` block per theme. The recipe stays in the
 * authored CSS; this only mirrors it flattened, so it can't drift (a parity test
 * pins each literal to the browser's computed value).
 *
 * Custom-property indirection (a painter reads `var(--fill-hue)`, set per status
 * by a `[data-s]` rule) is resolved by JOINING each painter with the rules that
 * set the locals it reads — derived from the CSS, never a hand-kept colour table.
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
const { resolveDeclarationValue } = require('../lib/core/resolve-token-expr');
const { parseRootVars, isDarkScheme } = require('../lib/core/parse-root-vars');

const ROOT = path.resolve(__dirname, '..');

// The @supports guard. `light-dark()` shipped LAST of the two functions
// (Chromium 123, Mar 2024) — any engine missing color-mix() also misses this,
// so one probe is the tightest single gate. An engine in the narrow window that
// has color-mix() but not light-dark() also takes the fallback (flattened, still
// correct), which is fine.
const SUPPORTS_GUARD = 'not (color: light-dark(#000, #fff))';

// A declaration is a colour declaration worth flattening if, once its value is
// substituted against the token map, a modern colour function remains. We also
// treat a raw literal value (already a hex) as nothing to do.
const MODERN_FN = /\blight-dark\(|\bcolor-mix\(/;

// The map choropleth ramp degrades to a representative flat tone (the ramp's
// upper-mid intensity) — the agreed coarse-flat on-brand degradation for the one
// continuous per-instance fill. Categorical (highlight) map regions keep their
// per-category colour via the kernel's data-cat hook.
const MAP_RAMP_REPRESENTATIVE_MIX = 65;

/**
 * Which authored CSS files the fallback covers. The whole chart bucket (every
 * chart is an HTML+SVG hybrid) plus math (the one non-chart component that
 * re-colours SVG — function-plot traces — through themed tokens).
 */
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
  // The shared chart-family kernel CSS (token defs + .chart-status painter) has
  // a non-standard name (chart-family.css, not *.styles.css) — include it
  // explicitly; it holds the --chart-cat-* / --state-* token definitions the
  // rest of the family consumes.
  out.push(path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-family.css'));
  out.push(path.join(ROOT, 'lib', 'components', 'math', 'math', 'math.styles.css'));
  return [...new Set(out)].filter((p) => fs.existsSync(p)).sort();
}

/** A selector is a variant-SETTER scope (refines an element by state) rather
 *  than a token-definition block. Its custom props are LOCAL (joined per
 *  variant), not global tokens. */
function isVariantSelector(sel) {
  return /\[data-|:nth-of-type|:nth-child|--on\b|--hl\b|\.heatmap|\.weighted|\.swimlane/.test(sel);
}

/**
 * Parse the scanned CSS once into a rule model:
 *   painters — { file, selector, prop, value }  declarations that carry colour
 *   setters  — Map varName → [{ selector, value }]  local custom-prop bindings
 *   localVarNames — Set of custom-prop names that are set by a variant selector
 * plus the chart-family token declarations that belong in the GLOBAL map.
 */
function parseModel(files) {
  const painters = [];
  const setters = new Map();
  const localVarNames = new Set();
  const globalTokenDecls = {}; // name -> raw value (chart-scoped tokens, e.g. --chart-cat-1-hue)

  for (const file of files) {
    const css = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    let rootAst;
    try { rootAst = postcss.parse(css); } catch { continue; }
    rootAst.walkRules((rule) => {
      const sel = rule.selector.replace(/\s+/g, ' ').trim();
      const variant = isVariantSelector(sel);
      rule.walkDecls((decl) => {
        const prop = decl.prop;
        const value = decl.value;
        if (prop.startsWith('--')) {
          const name = prop.slice(2);
          if (variant) {
            localVarNames.add(name);
            if (!setters.has(name)) setters.set(name, []);
            setters.get(name).push({ selector: sel, value });
          } else if (/^chart-|^state-|^journey-|^diagram-|^map-/.test(name)) {
            // A chart-scoped GLOBAL token (defined in a token block, not a
            // variant). Feed the resolver's map.
            globalTokenDecls[name] = value;
          } else {
            // Other non-variant local (e.g. --fill-hue default on a painter
            // element itself) — still a local, but its per-variant binding
            // comes from the variant setters above.
            localVarNames.add(name);
          }
          return;
        }
        // A paint declaration. Only colour-bearing props matter.
        if (!/^(fill|stroke|stop-color|background|background-color|background-image|border|border-color|border-top-color|border-left-color|color)$/.test(prop)) return;
        if (!MODERN_FN.test(value) && !/var\(/.test(value)) return;
        painters.push({ file: rel, selector: sel, prop, value });
      });
    });
  }
  return { painters, setters, localVarNames, globalTokenDecls };
}

/** Build the light + dark global token maps for one theme. */
function themeMaps(themeCss, baseCss, chartTokenDecls) {
  const combined = `${baseCss}\n${themeCss}`;
  const base = parseRootVars(combined);
  // Layer the chart-scoped tokens on top (they are defined on section.chart-frame,
  // not :root, so parseRootVars misses them — add explicitly).
  const vars = { ...base, ...chartTokenDecls };
  const declaredDark = isDarkScheme(combined);
  // A `*-dark` theme declares `color-scheme: dark`, so even its DEFAULT (non
  // media-query) fallback rules should resolve light-dark() to the dark branch;
  // proper per-theme default-scheme handling is part of the remaining wire-in.
  return {
    light: { vars, isDark: declaredDark },
    dark: { vars, isDark: true },
    declaredDark,
  };
}

/** Resolve a painter value against a map, with local vars bound from `locals`. */
function flatten(value, vars, isDark, locals) {
  const map = locals ? { ...vars, ...locals } : vars;
  return resolveDeclarationValue(value, map, isDark);
}

/**
 * Produce the flattened fallback rules (as {selector, prop, lightVal, darkVal})
 * for one painter declaration, joining local-var setters where needed.
 */
function fallbackRules(painter, vars, setters, localVarNames) {
  const usedLocals = [...new Set(
    (painter.value.match(/var\(\s*--([a-z0-9-]+)/gi) || [])
      .map((m) => m.replace(/var\(\s*--/i, ''))
      .filter((n) => localVarNames.has(n) && !(n in vars)),
  )];

  const emit = (selector, locals) => {
    const lightVal = flatten(painter.value, vars, false, locals);
    const darkVal = flatten(painter.value, vars, true, locals);
    if (MODERN_FN.test(lightVal) || MODERN_FN.test(darkVal)) return null; // unresolved — skip, gate will flag
    return { selector, prop: painter.prop, lightVal, darkVal };
  };

  if (usedLocals.length === 0) {
    const r = emit(painter.selector, null);
    return r ? [r] : [];
  }

  // The map choropleth ramp: --mix is set inline per region (no setter rule).
  // Degrade to a representative flat tone.
  if (usedLocals.includes('mix') && !setters.has('mix')) {
    const locals = { mix: `${MAP_RAMP_REPRESENTATIVE_MIX}%` };
    const r = emit(painter.selector, locals);
    return r ? [r] : [];
  }

  // Join with each combination of setter selectors that bind the used locals.
  // In the chart family the locals a painter reads are set together on ONE
  // variant selector (a status/mood/section refinement of the same element), so
  // enumerate the setter selectors of the first used local and bind all locals
  // from the matching selector.
  const anchor = usedLocals.find((n) => setters.has(n));
  if (!anchor) return [];
  const out = [];
  for (const setter of setters.get(anchor)) {
    const locals = {};
    for (const n of usedLocals) {
      const binding = (setters.get(n) || []).find((s) => s.selector === setter.selector);
      if (binding) locals[n] = binding.value;
    }
    // Combined target: the variant selector is the specific form of the same
    // element the painter styles, so it is the fallback target.
    const r = emit(setter.selector, locals);
    if (r) out.push(r);
  }
  return out;
}

/** Serialize fallback rules into an @supports block (light default + dark). */
function emitSupportsBlock(rules) {
  if (!rules.length) return '';
  const lightDecls = new Map();  // selector -> [ "prop: val !important" ]
  const darkDecls = new Map();
  for (const r of rules) {
    if (!lightDecls.has(r.selector)) lightDecls.set(r.selector, []);
    lightDecls.get(r.selector).push(`${r.prop}: ${r.lightVal} !important`);
    if (r.darkVal !== r.lightVal) {
      if (!darkDecls.has(r.selector)) darkDecls.set(r.selector, []);
      darkDecls.get(r.selector).push(`${r.prop}: ${r.darkVal} !important`);
    }
  }
  const ruleText = (map) => [...map.entries()]
    .map(([sel, decls]) => `  ${sel} { ${decls.join('; ')} }`).join('\n');

  let out = `@supports ${SUPPORTS_GUARD} {\n`;
  out += ruleText(lightDecls) + '\n';
  if (darkDecls.size) {
    // Dark canvas via OS preference AND the explicit section.dark opt-in.
    out += '  @media (prefers-color-scheme: dark) {\n' + ruleText(darkDecls).replace(/^/gm, '  ') + '\n  }\n';
    const darkScoped = new Map(
      [...darkDecls.entries()].map(([sel, decls]) => [`section.dark ${sel}, section.dark${sel}`, decls]),
    );
    out += ruleText(darkScoped) + '\n';
  }
  out += '}';
  return out;
}

/**
 * Generate the fallback @supports block for one theme.
 * @param {string} themeCss  the theme's CSS text
 * @param {string} baseCss   base.tokens.css (+ any :root defaults) text
 * @returns {string} the @supports block (empty string if nothing to flatten)
 */
function chartCompatCssForTheme(themeCss, baseCss) {
  const files = scannedFiles();
  const model = parseModel(files);
  const maps = themeMaps(themeCss, baseCss, model.globalTokenDecls);
  const allRules = [];
  for (const painter of model.painters) {
    allRules.push(...fallbackRules(painter, maps.dark.vars, model.setters, model.localVarNames));
  }
  return emitSupportsBlock(allRules);
}

/** Enumerate every chart/math colour declaration that USES a modern function —
 *  the coverage gate asserts each is represented in the generated fallback. */
function coverageSites() {
  const files = scannedFiles();
  const model = parseModel(files);
  return model.painters
    .filter((p) => MODERN_FN.test(p.value) || /var\(/.test(p.value))
    .map((p) => ({ file: p.file, selector: p.selector, prop: p.prop }));
}

module.exports = { chartCompatCssForTheme, coverageSites, scannedFiles, SUPPORTS_GUARD };
