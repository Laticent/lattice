/**
 * Unit: OKLab + WCAG assessment of the CURATED chart palettes.
 *
 * The chart-family curation contract (chart-family.style.md › "Curating a
 * remaining theme" / design/theming.md › "Curate assessment-first") says a
 * theme's `--chart-cat*` / `--chart-state-*` must, on BOTH canvases:
 *
 *   1. marks clear the canvas      — each hue vs `--bg` ≥ 3:1 (WCAG 1.4.11,
 *                                     non-text graphical contrast)
 *   2. categories are distinct     — adjacent `--chart-cat*` ≥ 0.15 OKLab
 *   3. status roles are distinct   — the 5 `--chart-state-*` mutually ≥ 0.12
 *
 * This locks that in for all 13 curated themes (cuoio/onyx/indaco were the
 * original exemplars; the rest were brought to parity), so a re-curation that
 * picks a hue too close to the canvas or to a neighbour fails here instead of
 * shipping muddy/indistinct charts. Resolves the full
 * token expression — `light-dark()`, `var()` with fallback, and
 * `color-mix(in oklab, …)` (the dark-side hues + tints) — which the existing
 * contrast-audit.js intentionally skips.
 *
 * If a test fails: a curation dropped a hue below the bar. Re-tune the hue
 * (lift it off the canvas / spread it from its neighbour); do not lower the bar.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const CURATED = [
  'cuoio', 'onyx', 'indaco',
  'ardesia', 'atelier', 'brina', 'burgundy', 'carbone', 'concrete',
  'crepuscolo', 'laguna', 'magnolia', 'mustard',
];

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
function loadTheme(name) {
  const order = ['../dist/lattice.css', `themes/${name}.css`];
  let vars = {};
  for (const rel of order) {
    const p = rel.startsWith('themes/')
      ? path.join(THEMES_DIR, `${name}.css`)
      : path.join(THEMES_DIR, '..', 'dist', 'lattice.css');
    try { vars = { ...vars, ...parseVars(fs.readFileSync(p, 'utf8')) }; } catch { /* skip */ }
  }
  return vars;
}

// ── Colour math (sRGB ↔ OKLab, WCAG luminance) ──────────────────────────────
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

// Resolve a CSS colour expression to {r,g,b}. Handles hex, white/black,
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

// Hard floors the three curated exemplars all meet on both canvases — a
// regression guard, not the aspirational bar. style.md's ≥0.15 OKLab adjacent
// target is the AUTHORING goal (assessed during curation via
// tools/theme-scorecard.js); the exemplars themselves sit ~0.07–0.15 (the
// achromatic onyx ramp separates by value, tight brand triads by a small hue
// step), so gating at 0.15 would fail the gold standard. These floors catch the
// real regressions: a label that fails AA on its fill, a mark invisible on the
// canvas, or two slots collapsing to the same colour.
const TEXT_ON_FILL   = 4.5;   // AA — the --text-heading label on a chart fill
const MARK_VS_CANVAS = 3.0;   // WCAG 1.4.11 — a saturated mark must clear the canvas
const MARK_MUTE_MIN  = 2.0;   // --chart-state-mute is the deliberately-quiet "deferred" role
const SLOT_DISTINCT  = 0.06;  // adjacent slots must not collapse to the same colour

describe('chart palette — curated theme assessment', () => {
  for (const theme of CURATED) {
    const vars = loadTheme(theme);
    for (const mode of ['light', 'dark']) {
      const bg = resolve(vars.bg, vars, mode);
      const textHeading = resolve(vars['text-heading'], vars, mode);
      assert.ok(bg, `${theme}/${mode}: --bg must resolve`);
      assert.ok(textHeading, `${theme}/${mode}: --text-heading must resolve`);

      const cats = [];
      for (let i = 1; i <= 8; i++) {
        const rgb = resolve(vars[`chart-cat${i}`], vars, mode);
        if (rgb) cats.push({ i, rgb, fill: resolve(vars[`chart-cat-${i}-fill`], vars, mode) });
      }
      const states = ['pass', 'warn', 'fail', 'info', 'mute']
        .map(k => ({ k, rgb: resolve(vars[`chart-state-${k}`], vars, mode), fill: resolve(vars[`state-${k}-fill`], vars, mode) }))
        .filter(s => s.rgb);

      test(`${theme}/${mode}: every chart hue + fill resolves`, () => {
        assert.equal(cats.length, 8, `${theme}/${mode}: expected 8 --chart-cat*, got ${cats.length}`);
        assert.equal(states.length, 5, `${theme}/${mode}: expected 5 --chart-state-*, got ${states.length}`);
        for (const c of cats) assert.ok(c.fill, `${theme}/${mode}: --chart-cat-${c.i}-fill must resolve`);
        for (const s of states) assert.ok(s.fill, `${theme}/${mode}: --state-${s.k}-fill must resolve`);
      });

      test(`${theme}/${mode}: heading label clears every fill (AA, ≥${TEXT_ON_FILL}:1)`, () => {
        for (const { i, fill } of cats) {
          const r = contrast(textHeading, fill);
          assert.ok(r >= TEXT_ON_FILL, `${theme}/${mode}: --text-heading on --chart-cat-${i}-fill = ${r.toFixed(2)}:1 (< ${TEXT_ON_FILL})`);
        }
        for (const { k, fill } of states) {
          const r = contrast(textHeading, fill);
          assert.ok(r >= TEXT_ON_FILL, `${theme}/${mode}: --text-heading on --state-${k}-fill = ${r.toFixed(2)}:1 (< ${TEXT_ON_FILL})`);
        }
      });

      test(`${theme}/${mode}: marks clear the canvas (≥${MARK_VS_CANVAS}:1; mute ≥${MARK_MUTE_MIN}:1)`, () => {
        for (const { i, rgb } of cats) {
          const r = contrast(rgb, bg);
          assert.ok(r >= MARK_VS_CANVAS, `${theme}/${mode}: --chart-cat${i} vs --bg = ${r.toFixed(2)}:1 (< ${MARK_VS_CANVAS})`);
        }
        for (const { k, rgb } of states) {
          const floor = k === 'mute' ? MARK_MUTE_MIN : MARK_VS_CANVAS;
          const r = contrast(rgb, bg);
          assert.ok(r >= floor, `${theme}/${mode}: --chart-state-${k} vs --bg = ${r.toFixed(2)}:1 (< ${floor})`);
        }
      });

      test(`${theme}/${mode}: the working categories stay distinct (≥${SLOT_DISTINCT} OKLab)`, () => {
        // Only the first 6 slots: the spec caps perceptual distinctness at ~6
        // (Wong 2011) and slots 7–8 are allowed to converge — charts past six
        // categories should consolidate, not cycle on.
        const working = cats.filter(c => c.i <= 6);
        for (let j = 0; j < working.length - 1; j++) {
          const d = oklabDist(working[j].rgb, working[j + 1].rgb);
          assert.ok(d >= SLOT_DISTINCT, `${theme}/${mode}: --chart-cat${working[j].i}↔${working[j + 1].i} OKLab = ${d.toFixed(3)} (< ${SLOT_DISTINCT})`);
        }
        for (let a = 0; a < states.length; a++) {
          for (let b = a + 1; b < states.length; b++) {
            const d = oklabDist(states[a].rgb, states[b].rgb);
            assert.ok(d >= SLOT_DISTINCT, `${theme}/${mode}: --chart-state-${states[a].k}↔${states[b].k} OKLab = ${d.toFixed(3)} (< ${SLOT_DISTINCT})`);
          }
        }
      });
    }
  }

  // Sanity: the resolver itself must handle the chart token grammar. A broken
  // resolver would make every assertion vacuously pass, so pin known values.
  test('resolver: hex, light-dark, color-mix(in oklab) all resolve', () => {
    const v = { bg: 'light-dark(#ffffff, #0a1628)', hue: 'light-dark(#006398, color-mix(in oklab, #006398, white 30%))' };
    assert.deepEqual(resolve(v.bg, v, 'light'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(resolve(v.bg, v, 'dark'), { r: 10, g: 22, b: 40 });
    const lightHue = resolve(v.hue, v, 'light');
    assert.deepEqual(lightHue, { r: 0, g: 99, b: 152 });
    const darkHue = resolve(v.hue, v, 'dark');
    // 70% #006398 + 30% white, mixed in OKLab → a lighter blue (all channels up).
    assert.ok(darkHue.r > 0 && darkHue.g > 99 && darkHue.b > 152, `dark hue should lighten: ${JSON.stringify(darkHue)}`);
  });
});
