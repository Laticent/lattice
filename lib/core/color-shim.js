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

const { parseRootVars } = require('./parse-root-vars');
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
  for (const m of String(value).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
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

/** Collect the text of every reachable `:root { … }` rule from the document's stylesheets. */
function defaultReadRootCss() {
  if (typeof document === 'undefined') return '';
  let out = '';
  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules;
    try {
      rules = sheet.cssRules; // can throw on a cross-origin sheet — skip those
    } catch {
      continue;
    }
    for (const rule of Array.from(rules || [])) {
      if (rule?.selectorText && /(^|,)\s*:root\b/.test(rule.selectorText)) {
        out += `${rule.cssText}\n`;
      }
    }
  }
  return out;
}

/** The active scheme: an explicit `data-lp-scheme` pin wins; otherwise the OS preference. */
function defaultIsDark() {
  if (typeof document !== 'undefined') {
    const pin = document.documentElement.getAttribute('data-lp-scheme');
    if (pin === 'dark') return true;
    if (pin === 'light') return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function defaultInject(css) {
  if (typeof document === 'undefined' || !css) return;
  const style = document.createElement('style');
  style.setAttribute('data-color-shim', '');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Install the shim. No-op on a modern engine. On an old engine: read `:root`, resolve the fragile
 * palette flat for the active scheme, inject it. Returns true iff a flat palette was injected.
 * All four environment touches are overridable for tests / non-DOM surfaces.
 */
function installColorShim(opts = {}) {
  const supportsModernColor = opts.supportsModernColor || defaultSupportsModernColor;
  if (supportsModernColor()) return false; // modern → native light-dark(), nothing to do
  const readRootCss = opts.readRootCss || defaultReadRootCss;
  const isDark = opts.isDark || defaultIsDark;
  const inject = opts.inject || defaultInject;

  const cssText = readRootCss();
  if (!cssText) return false;
  const palette = resolveFlatPalette(cssText, isDark());
  const css = flatPaletteCss(palette);
  if (!css) return false;
  inject(css);
  return true;
}

module.exports = {
  chainHasModernFn,
  resolveFlatPalette,
  flatPaletteCss,
  installColorShim,
  MODERN_FN,
};
