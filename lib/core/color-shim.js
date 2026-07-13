/**
 * Old-browser colour shim (2026-07-13-old-browser-color-shim.md).
 *
 * Every theme colour is authored `--t: light-dark(L, D)` / `color-mix(...)`. Engines below the
 * light-dark (Safari 17.5) / color-mix (16.2) floor DROP the whole declaration when it is
 * substituted into a real property → text and drawings fall to black. Instead of hand-flattening
 * the fragile spots and policing them, this shim runs ONCE at load: on a modern engine it is a
 * no-op; on an old engine it resolves the whole `:root` palette to flat literals for the active
 * scheme (with the SAME resolver the build trusts) and injects them, so every consumer — HTML text,
 * chart SVG, Mermaid, math — reads a plain literal.
 *
 * The core (`resolveFlatPalette`) is pure and reuses `parse-root-vars` + `resolve-token-expr`,
 * both already unit-tested; the browser wiring (`installColorShim`) is thin and fully seamed for
 * testing (every environment touch — feature detection, reading `:root`, the scheme, injection — is
 * an injectable option, defaulting to the real DOM only when actually called in a browser).
 */

const { parseRootVars, isDarkScheme } = require('./parse-root-vars');
const { resolveDeclarationValue } = require('./resolve-token-expr');

// A colour FUNCTION an old engine (Safari < 16.2 / old smart-TV Chromium) drops when it is
// substituted into a real property. Plain `var()`/`calc()`/gradients are old-safe and NOT here —
// only the functions that black out. Matches `resolvesThroughModern` in the build compiler.
const MODERN_FN =
  /light-dark\(|color-mix\(|\boklch\(|\boklab\(|\blab\(|\blch\(|\bhwb\(|\bcolor\(|\b(?:rgba?|hsla?)\(\s*from\b/i;

/**
 * True when `value` (a token's authored value) would be DROPPED by an old engine — either it uses
 * a modern colour function directly, or it `var()`s through a token that does. A token already a
 * flat literal (or one that only chains through flat literals / old-safe functions) is left alone.
 * Cycle-guarded.
 */
function chainHasModernFn(value, vars, seen = new Set()) {
  if (value == null) return false;
  if (MODERN_FN.test(value)) return true;
  // exec-loop, not String.matchAll (Chrome 73 / Safari 13) — this runs on the OLD engine, which
  // may predate matchAll; a fresh regex each call keeps lastIndex local under recursion.
  const re = /var\(\s*(--[a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(String(value))) !== null) {
    const name = m[1].slice(2);
    if (seen.has(name)) continue;
    seen.add(name);
    if (chainHasModernFn(vars[name], vars, seen)) return true;
  }
  return false;
}

/**
 * Resolve the fragile subset of a `:root` palette to flat literals for one scheme.
 * @param {string} cssText  CSS holding one or more `:root { … }` blocks (theme + base tokens).
 * @param {boolean} isDark  resolve the dark branch of every `light-dark()`.
 * @returns {Object<string,string>} `{ tokenName: flatLiteral }` — ONLY tokens that (a) would break
 *   on an old engine and (b) resolve cleanly to a flat value. Tokens already old-safe are omitted
 *   (re-declaring them is pointless), as are any that fail to fully flatten (left for review, never
 *   shipped half-resolved).
 */
function resolveFlatPalette(cssText, isDark) {
  const vars = parseRootVars(cssText);
  const out = {};
  for (const name of Object.keys(vars)) {
    if (!chainHasModernFn(vars[name], vars)) continue; // old-safe already
    const flat = resolveDeclarationValue(`var(--${name})`, vars, isDark);
    if (flat && !MODERN_FN.test(flat) && !/var\(/.test(flat)) out[name] = flat;
  }
  return out;
}

/** Serialize a flat palette into an injectable rule. */
function flatPaletteCss(palette, selector = ':root') {
  const body = Object.keys(palette)
    .map((n) => `--${n}: ${palette[n]}`)
    .join('; ');
  return body ? `${selector} { ${body} }` : '';
}

/**
 * Build the FULL shim stylesheet: the declared scheme on `:root`, plus every scheme-switch path a
 * deck can take. Because custom properties inherit by TREE DEPTH (a closer ancestor wins over a
 * farther one, regardless of selector specificity), setting the palette on the structural ancestors
 * — `:root`, the per-slide `section.dark`/`.light`, the player's `[data-lp-scheme]` pin — lets the
 * cascade pick the right scheme per subtree exactly the way native `light-dark()` would. Mirrors the
 * static compiler's plane anchors, but at the ancestor level (not the consuming element), so no
 * restore-base gymnastics are needed. The OS arm is STRICT — it only reaches a deck explicitly set
 * to follow the system (`data-lp-scheme=system`), so a pinned export is never flipped by the viewer's
 * OS. `prefers-color-scheme` ships far below the light-dark floor (Safari 12.1), so old engines honor it.
 * @param {string} cssText  the theme + base `:root` token source.
 * @param {boolean} declaredDark  the deck's declared/base scheme (its `:root` default).
 */
function buildShimCss(cssText, declaredDark) {
  const light = resolveFlatPalette(cssText, false);
  const dark = resolveFlatPalette(cssText, true);
  const base = declaredDark ? dark : light;
  return [
    flatPaletteCss(base, ':root'),
    // Per-slide scheme pin — a section that declares its own scheme wins for its subtree.
    flatPaletteCss(light, 'section.light'),
    flatPaletteCss(dark, 'section.dark'),
    // Player / Read·Article explicit pin on an ancestor.
    flatPaletteCss(light, '[data-lp-scheme=light]'),
    flatPaletteCss(dark, '[data-lp-scheme=dark]'),
    // OS-follow — strict: only a deck set to follow the system, never a pinned export.
    `@media (prefers-color-scheme: dark) { ${flatPaletteCss(dark, ':root[data-lp-scheme=system]')} }`,
    `@media (prefers-color-scheme: light) { ${flatPaletteCss(light, ':root[data-lp-scheme=system]')} }`,
  ]
    .filter((r) => r && !/\{\s*\}\s*$/.test(r))
    .join('\n');
}

// ── Browser wiring ──────────────────────────────────────────────────────────
// Every environment touch is a default fn referenced lazily, so `require`-ing this module in Node
// never touches `document`/`CSS`/`window`; the defaults only run if `installColorShim` is called in
// a browser. Tests pass stubs for all four seams.

function defaultSupportsModernColor() {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('color', 'light-dark(#000, #fff)') &&
    CSS.supports('color', 'color-mix(in oklab, red, blue)')
  );
}

/**
 * Collect the text of every reachable `:root { … }` rule across all loaded stylesheets — RECURSING
 * into `@import`ed sheets. This recursion is load-bearing: every `*-dark` theme is `@import "<light>"`
 * + `color-scheme: dark`, so its core palette lives in the imported sheet, not its own file. Imports
 * precede other rules (CSS requires it) and are walked first, so the concatenation is base-first /
 * theme-last — the source order `parseRootVars` expects. Cross-origin sheets (whose `cssRules`
 * throws) are skipped.
 */
function defaultReadRootCss() {
  if (typeof document === 'undefined') return '';
  const seen = new Set();
  let out = '';
  const walk = (sheet) => {
    if (!sheet || seen.has(sheet)) return;
    seen.add(sheet);
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    for (const rule of Array.from(rules || [])) {
      if (rule.styleSheet) { walk(rule.styleSheet); continue; } // CSSImportRule → the imported sheet
      if (rule?.selectorText && /(^|,)\s*:root\b/.test(rule.selectorText)) {
        out += `${rule.cssText}\n`;
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets || [])) walk(sheet);
  return out;
}

function defaultInject(css) {
  if (typeof document === 'undefined' || !css) return;
  const style = document.createElement('style');
  style.setAttribute('data-color-shim', '');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Install the shim. No-op on a modern engine. On an old engine: read `:root`, build the full scoped
 * shim stylesheet (every scheme-switch path), inject it. Returns true iff a stylesheet was injected.
 * The deck's declared scheme is read from the CSS (`isDarkScheme`) unless overridden. Every
 * environment touch is an injectable seam for tests / non-DOM surfaces.
 */
function installColorShim(opts = {}) {
  const supportsModernColor = opts.supportsModernColor || defaultSupportsModernColor;
  if (supportsModernColor()) return false; // modern → native light-dark(), nothing to do
  const readRootCss = opts.readRootCss || defaultReadRootCss;
  const inject = opts.inject || defaultInject;

  const cssText = readRootCss();
  if (!cssText) return false;
  const declaredDark = opts.declaredDark != null ? opts.declaredDark : isDarkScheme(cssText);
  const css = buildShimCss(cssText, declaredDark);
  if (!css) return false;
  inject(css);
  return true;
}

module.exports = {
  chainHasModernFn,
  resolveFlatPalette,
  flatPaletteCss,
  buildShimCss,
  installColorShim,
  MODERN_FN,
};
