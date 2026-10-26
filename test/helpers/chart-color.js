/**
 * Test helper: resolve a palette's chart tokens to real colors, the way the chart palette gates need them.
 * `light-dark()`, `var()` with a fallback and `color-mix(in oklab, …)` resolve here; the theme's @import chain is
 * followed so a variant is scored with the base it extends. Moved out of chart-contrast.test.js so the solid-tier
 * on-ink gate (chart-on-ink.test.js) reads one resolver, not a copy.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', '..', 'themes');

// Collect every `--name: value` custom-property declaration in the file,
// regardless of selector — the palette tokens live in `:root` (theme) but the
// chart recipe (`--catN-hue`, `--catN-fill`, `--state-*-fill`) lives on
// `section.chart-frame` / `section.word-cloud` in the bundle. Later
// declarations (theme loaded after the engine) override earlier ones. No
// light-dark/color-mix collapsing here — resolve() does that per-expression so
// a token serves both modes.
function parseVars(content) {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const d of (stripped.match(/--[a-z0-9-]+\s*:\s*[^;{}]+/gi) || [])) {
    const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

// Load a theme plus the tokens it @imports from lattice (the engine fallback
// spectrum lives there). Theme declarations win (parsed last).
// Follow `@import` so a derived variant is scored with the base it extends.
// Without this the four a11y variants resolve to the ENGINE defaults — every
// slot identical across all four palettes and both modes, which is how a first
// attempt at this arm reported a clean 0 of 64.
function importChain(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  let css = '';
  try { css = fs.readFileSync(path.join(THEMES_DIR, name, `${name}.css`), 'utf8'); } catch { return []; }
  const out = [];
  for (const m of css.matchAll(/@import\s+['"]([a-z0-9-]+)['"]/gi)) out.push(...importChain(m[1], seen));
  out.push(name);
  return out;
}

function loadTheme(name) {
  const order = ['../dist/lattice.css', `themes/${name}/${name}.css`];
  let vars = {};
  for (const rel of order) {
    const p = rel.startsWith('themes/')
      ? path.join(THEMES_DIR, name, `${name}.css`)
      : path.join(THEMES_DIR, '..', 'dist', 'lattice.css');
    try { vars = { ...vars, ...parseVars(fs.readFileSync(p, 'utf8')) }; } catch { /* skip */ }
  }
  return vars;
}

/** A theme plus every theme it @imports, base first so the variant wins. */
function loadThemeChain(name) {
  let vars = parseVars(fs.readFileSync(path.join(THEMES_DIR, '..', 'dist', 'lattice.css'), 'utf8'));
  for (const t of importChain(name)) {
    try { vars = { ...vars, ...parseVars(fs.readFileSync(path.join(THEMES_DIR, t, `${t}.css`), 'utf8')) }; } catch { /* skip */ }
  }
  return vars;
}

// ── Color math (sRGB ↔ OKLab, WCAG luminance) ──────────────────────────────
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function encode(c) { c = clamp01(c); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; }

function rgbToOklab({ r, g, b }) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}
function oklabToRgb({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return { r: Math.round(encode(r) * 255), g: Math.round(encode(g) * 255), b: Math.round(encode(bb) * 255) };
}
function relLum({ r, g, b }) { return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b); }
function contrast(c1, c2) {
  const l1 = relLum(c1), l2 = relLum(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function oklabDist(c1, c2) {
  const a = rgbToOklab(c1), b = rgbToOklab(c2);
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

// Split a comma list at top level (ignores commas inside nested parens).
function splitTop(s) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim());
}

// Resolve a CSS color expression to {r,g,b}. Handles hex, white/black,
// var(--x[, fallback]), light-dark(L, D) (by mode), color-mix(in oklab, …).
function resolve(expr, vars, mode, depth = 0) {
  if (expr == null || depth > 24) return null;
  expr = expr.trim();
  let m = expr.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  if (/^white$/i.test(expr)) return { r: 255, g: 255, b: 255 };
  if (/^black$/i.test(expr)) return { r: 0, g: 0, b: 0 };
  if (/^transparent$/i.test(expr)) return null;

  m = expr.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i);
  if (m) {
    if (vars[m[1]] != null) return resolve(vars[m[1]], vars, mode, depth + 1);
    return m[2] ? resolve(m[2], vars, mode, depth + 1) : null;
  }
  m = expr.match(/^light-dark\(\s*([\s\S]+)\)$/i);
  if (m) {
    const parts = splitTop(m[1]);
    return resolve(mode === 'dark' ? parts[1] : parts[0], vars, mode, depth + 1);
  }
  m = expr.match(/^color-mix\(\s*in oklab\s*,\s*([\s\S]+)\)$/i);
  if (m) {
    const [p1, p2] = splitTop(m[1]);
    const w = (p) => { const wm = p.match(/\s(\d+(?:\.\d+)?)%\s*$/); return wm ? parseFloat(wm[1]) : null; };
    const colr = (p) => p.replace(/\s\d+(?:\.\d+)?%\s*$/, '').trim();
    const w1 = w(p1), w2 = w(p2);
    const c1 = resolve(colr(p1), vars, mode, depth + 1);
    const c2 = resolve(colr(p2), vars, mode, depth + 1);
    if (!c1 || !c2) return null;
    // CSS color-mix weight of c1: explicit, else 100-w2, else 50.
    const f = (w1 != null ? w1 : (w2 != null ? 100 - w2 : 50)) / 100;
    const A = rgbToOklab(c1), B = rgbToOklab(c2);
    return oklabToRgb({ L: A.L * f + B.L * (1 - f), a: A.a * f + B.a * (1 - f), b: A.b * f + B.b * (1 - f) });
  }
  return null;
}

module.exports = { THEMES_DIR, parseVars, importChain, loadTheme, loadThemeChain, rgbToOklab, oklabToRgb, relLum, contrast, oklabDist, resolve };
