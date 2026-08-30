#!/usr/bin/env node
/**
 * Theme scorecard — token-parity + palette-quality scoring for every theme.
 *
 * Two jobs, one tool:
 *
 *   1. TOKEN PARITY (the contract gate). design/theming.md § "The variable
 *      contract" says *every palette must define every variable* — no falling
 *      through to the lattice.css cascade root. This tool flags any contract
 *      token a theme leans on the engine fallback for.
 *
 *   2. QUALITY SCORE. Above the hard pass/fail floors (which
 *      test/unit/palette/chart-contrast.test.js gates), it grades the HEADROOM
 *      each theme carries on five axes — token completeness, categorical
 *      distinctness, text-on-fill AA, mark-vs-canvas, state separation — both
 *      canvases. The score is diagnostic (an aspirational bar), not a floor.
 *
 * Usage:
 *   node tools/theme-scorecard.js            # print the scorecard table
 *   node tools/theme-scorecard.js --json     # machine-readable
 *   node tools/theme-scorecard.js --check    # exit 1 on any contract gap
 *                                            # (the durable parity gate)
 *
 * The color math (sRGB↔OKLab, WCAG) mirrors chart-contrast.test.js exactly so
 * the two never disagree. See engineering/decisions for the curation history.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const DIST = path.join(ROOT, 'dist', 'lattice.css');

// SCOPE COMES FROM THE MANIFESTS. The hardcoded array this replaces named 13 themes
// and omitted `carta`, so `scorecard:check` never scored a shipped base palette. See
// engineering/decisions/2026-08-09-theme-token-contract.md.
const THEMES = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.manifest.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf8')))
  .filter((m) => m.role === 'base')
  .map((m) => m.name)
  .sort();

// ── The variable contract (design/theming.md). The curated seams a palette
// must self-define; engine-derived tiers (--on-accent-secondary/ghost/…,
// --accent-soft-body) are excluded — they derive from a seam the theme owns. ──
const CONTRACT = [
  // surfaces + ink
  'bg', 'bg-alt', 'surface-inverse', 'border', 'text-display', 'text-heading',
  'text-body', 'text-secondary', 'text-label', 'text-muted', 'accent',
  'accent-soft', 'on-accent', 'code-text',
  // semantic signals
  'pass', 'fail', 'warn', 'pass-bg', 'fail-bg', 'warn-bg',
  // dark variant
  'scheme-dark-bg', 'scheme-dark-bg-alt', 'scheme-dark-border', 'scheme-dark-text-heading',
  'scheme-dark-text-body', 'scheme-dark-text-display', 'scheme-dark-text-secondary',
  'scheme-dark-text-label', 'scheme-dark-text-muted',
  // highlight.js
  'hljs-comment', 'hljs-keyword', 'hljs-built_in', 'hljs-number',
  'hljs-literal', 'hljs-string', 'hljs-title', 'hljs-type', 'hljs-variable',
  'hljs-params', 'hljs-tag', 'hljs-punctuation',
  // categorical band scale (12 paired slots) + role tokens
  ...Array.from({ length: 12 }, (_, i) => [`cat-${i + 1}-fill`, `cat-${i + 1}-mark`]).flat(),
  'diagram-stroke', 'diagram-line', 'cat-on-fill', 'cat-on-mark', 'diagram-active',
  'diagram-active-mark', 'diagram-done', 'diagram-done-mark', 'diagram-critical', 'diagram-today', 'diagram-note',
  'c-container', 'c-subcontainer',
  // The sequential ramp's anchor. The other nine stops derive from it in
  // lattice.css, so this is a curated seam and not an engine-derived tier: the
  // base's `--seq-500: var(--accent)` fallback keeps a palette painting, but the
  // dark --accent is near-white by design and the derived stops then land
  // 1.08-1.90:1 apart (#1697). A palette owns its own anchor.
  'seq-500',
  // chart family
  'chart-cat1', 'chart-cat2', 'chart-cat3', 'chart-cat4', 'chart-cat5',
  'chart-cat6', 'chart-cat7', 'chart-cat8', 'chart-state-pass',
  'chart-state-warn', 'chart-state-fail', 'chart-state-info', 'chart-state-mute',
];

// ── Color math (identical to chart-contrast.test.js) ───────────────────────
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const encode = (c) => { c = clamp01(c); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
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
  return {
    r: Math.round(encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255),
    g: Math.round(encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255),
    b: Math.round(encode(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s) * 255),
  };
}
const relLum = ({ r, g, b }) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const contrast = (c1, c2) => { const a = relLum(c1), b = relLum(c2); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const oklabDist = (c1, c2) => { const a = rgbToOklab(c1), b = rgbToOklab(c2); return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b); };
function hexToRgb(h) {
  h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// ── CSS var parsing + resolution (hex, var(), light-dark(), color-mix oklab) ──
function parseVars(content) {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const d of (stripped.match(/--[a-z0-9_-]+\s*:\s*[^;{}]+/gi) || [])) {
    const m = d.match(/--([a-z0-9_-]+)\s*:\s*(.+)$/i);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}
function ownTokens(name) {
  const stripped = fs.readFileSync(path.join(THEMES_DIR, `${name}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const s = new Set();
  for (const m of stripped.matchAll(/--([a-z0-9_-]+)\s*:/gi)) s.add(m[1]);
  return s;
}
function splitTop(s) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim());
}
function resolve(expr, vars, mode, depth = 0) {
  if (expr == null || depth > 24) return null;
  expr = expr.trim();
  let m = expr.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) return hexToRgb(expr);
  if (/^white$/i.test(expr)) return { r: 255, g: 255, b: 255 };
  if (/^black$/i.test(expr)) return { r: 0, g: 0, b: 0 };
  if (/^transparent$/i.test(expr)) return null;
  m = expr.match(/^var\(\s*--([a-z0-9_-]+)\s*(?:,\s*([\s\S]+))?\)$/i);
  if (m) return vars[m[1]] != null ? resolve(vars[m[1]], vars, mode, depth + 1) : (m[2] ? resolve(m[2], vars, mode, depth + 1) : null);
  m = expr.match(/^light-dark\(\s*([\s\S]+)\)$/i);
  if (m) { const p = splitTop(m[1]); return resolve(mode === 'dark' ? p[1] : p[0], vars, mode, depth + 1); }
  m = expr.match(/^color-mix\(\s*in oklab\s*,\s*([\s\S]+)\)$/i);
  if (m) {
    const [p1, p2] = splitTop(m[1]);
    const w = (p) => { const wm = p.match(/\s(\d+(?:\.\d+)?)%\s*$/); return wm ? parseFloat(wm[1]) : null; };
    const colr = (p) => p.replace(/\s\d+(?:\.\d+)?%\s*$/, '').trim();
    const w1 = w(p1), w2 = w(p2);
    const c1 = resolve(colr(p1), vars, mode, depth + 1), c2 = resolve(colr(p2), vars, mode, depth + 1);
    if (!c1 || !c2) return null;
    const f = (w1 != null ? w1 : (w2 != null ? 100 - w2 : 50)) / 100;
    const A = rgbToOklab(c1), B = rgbToOklab(c2);
    return oklabToRgb({ L: A.L * f + B.L * (1 - f), a: A.a * f + B.a * (1 - f), b: A.b * f + B.b * (1 - f) });
  }
  return null;
}

const clampScore = (x) => Math.max(0, Math.min(100, x));

function scoreTheme(name, dist) {
  const own = ownTokens(name);
  const missing = CONTRACT.filter((t) => !own.has(t));
  const completeness = (CONTRACT.length - missing.length) / CONTRACT.length * 100;

  const vars = { ...dist, ...parseVars(fs.readFileSync(path.join(THEMES_DIR, `${name}.css`), 'utf8')) };
  let minTextAA = Infinity, minMark = Infinity, minCatAdj = Infinity, minState = Infinity;
  for (const mode of ['light', 'dark']) {
    const bg = resolve(vars.bg, vars, mode), th = resolve(vars['text-heading'], vars, mode);
    if (!bg || !th) continue;
    const cats = [];
    for (let i = 1; i <= 8; i++) {
      const rgb = resolve(vars[`chart-cat${i}`], vars, mode);
      if (rgb) cats.push({ i, rgb, fill: resolve(vars[`cat${i}-fill`], vars, mode) });
    }
    const states = ['pass', 'warn', 'fail', 'info', 'mute']
      .map((k) => ({ k, rgb: resolve(vars[`chart-state-${k}`], vars, mode), fill: resolve(vars[`state-${k}-fill`], vars, mode) }))
      .filter((s) => s.rgb);
    for (const c of cats) { if (c.fill) minTextAA = Math.min(minTextAA, contrast(th, c.fill)); minMark = Math.min(minMark, contrast(c.rgb, bg)); }
    for (const s of states) { if (s.fill && s.k !== 'mute') minTextAA = Math.min(minTextAA, contrast(th, s.fill)); if (s.k !== 'mute') minMark = Math.min(minMark, contrast(s.rgb, bg)); }
    const wk = cats.filter((c) => c.i <= 6);
    for (let j = 0; j < wk.length - 1; j++) minCatAdj = Math.min(minCatAdj, oklabDist(wk[j].rgb, wk[j + 1].rgb));
    for (let a = 0; a < states.length; a++) for (let b = a + 1; b < states.length; b++) minState = Math.min(minState, oklabDist(states[a].rgb, states[b].rgb));
  }
  const sTok = clampScore(completeness);
  const sText = clampScore((minTextAA - 4.5) / 2.5 * 60 + 40 * (minTextAA >= 4.5 ? 1 : 0));
  const sMark = clampScore((minMark - 3.0) / 3.0 * 60 + 40 * (minMark >= 3.0 ? 1 : 0));
  const sCat = clampScore((minCatAdj - 0.06) / 0.12 * 70 + 30 * (minCatAdj >= 0.06 ? 1 : 0));
  const sState = clampScore((minState - 0.06) / 0.19 * 70 + 30 * (minState >= 0.06 ? 1 : 0));
  const composite = sTok * 0.25 + sText * 0.20 + sMark * 0.15 + sCat * 0.25 + sState * 0.15;
  return { name, completeness, missing, minTextAA, minMark, minCatAdj, minState, composite };
}

function grade(c) { return c >= 90 ? 'A' : c >= 80 ? 'B' : c >= 70 ? 'C' : c >= 60 ? 'D' : 'F'; }

function main() {
  // Tolerate a closed pipe (e.g. `… | head`) without a stack trace.
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });
  const args = process.argv.slice(2);
  const dist = parseVars(fs.readFileSync(DIST, 'utf8'));
  const rows = THEMES.map((t) => scoreTheme(t, dist)).sort((a, b) => b.composite - a.composite);

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    return;
  }

  if (args.includes('--check')) {
    const gaps = rows.filter((r) => r.missing.length > 0);
    if (gaps.length) {
      process.stderr.write('theme-scorecard --check FAILED: contract tokens missing (no fallback allowed):\n');
      for (const r of gaps) process.stderr.write(`  ${r.name}: missing ${r.missing.map((t) => `--${t}`).join(', ')}\n`);
      process.exit(1);
    }
    process.stdout.write(`OK — all ${THEMES.length} themes self-define the full ${CONTRACT.length}-token contract.\n`);
    return;
  }

  const p = (x, n = 2) => x.toFixed(n);
  process.stdout.write('THEME        | Tok% | txtAA | mark | catΔ  | stΔ   || Score | Grade\n');
  process.stdout.write('-------------|------|-------|------|-------|-------||-------|------\n');
  for (const r of rows) {
    process.stdout.write(
      `${r.name.padEnd(12)} | ${p(r.completeness, 0).padStart(3)}% | ${p(r.minTextAA).padStart(5)} | ` +
      `${p(r.minMark).padStart(4)} | ${p(r.minCatAdj, 3)} | ${p(r.minState, 3)} || ` +
      `${p(r.composite, 1).padStart(5)} | ${grade(r.composite)}\n`);
  }
}

main();
