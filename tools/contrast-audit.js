#!/usr/bin/env node
/**
 * Contrast and colour-theory audit for all Lattice themes.
 *
 * Checks WCAG AA contrast (4.5:1) for every critical text-on-fill pair
 * that appears in Mermaid diagrams and slide layouts. Also reports OKLab
 * pairwise distances between chart-1..6 to flag perceptual similarity.
 *
 * Usage:
 *   node tools/contrast-audit.js               # all themes
 *   node tools/contrast-audit.js indaco cuoio  # specific themes
 *   node tools/contrast-audit.js --fails-only  # suppress passing themes
 */



const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');

// ── CSS loader (mirrors emulator's loadPaletteWithImports) ────────────────

function loadPaletteWithImports(filePath, seen = new Set()) {
  if (seen.has(filePath) || !fs.existsSync(filePath)) return '';
  seen.add(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const dir     = path.dirname(filePath);
  const importRe = /@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g;
  let imported = '';
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const name = m[1];
    if (name === 'lattice') continue; // layout CSS; colour tokens live in themes
    const imp = path.join(dir, `${name}.css`);
    if (fs.existsSync(imp)) imported += loadPaletteWithImports(imp, seen) + '\n';
  }
  return imported + content;
}

// ── Token resolver (mirrors emulator's parsePaletteVars) ─────────────────

function parsePaletteVars(content) {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  // Collect all :root blocks; later declarations override earlier ones.
  for (const block of (stripped.match(/:root\s*\{[^}]*\}/g) || [])) {
    for (const d of (block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || [])) {
      const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  // Collapse light-dark() to the correct side. The `:root\b[^{}]*\{` shape
  // (rather than `:root\s*\{`) also matches the `:where(:root) { color-scheme:
  // dark }` zero-specificity form carbone uses to pin its dark canvas — without
  // it, carbone was mis-read as light and its light-dark() tokens resolved to
  // the wrong (light) branch, producing a phantom error-chip contrast failure.
  const isDark = /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/.test(stripped);
  for (const k of Object.keys(vars)) {
    const ld = vars[k].match(/^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
    if (ld) vars[k] = (isDark ? ld[2] : ld[1]).trim();
  }
  // Resolve var() one level (handles brand-axis refs like var(--brand-wine-mid)).
  for (const k of Object.keys(vars)) {
    const ref = vars[k].match(/^var\(--([a-z0-9-]+)\)$/i);
    if (ref && vars[ref[1]]) vars[k] = vars[ref[1]];
  }
  // Second pass: resolve any var() that was itself a light-dark() result.
  for (const k of Object.keys(vars)) {
    const ref = vars[k].match(/^var\(--([a-z0-9-]+)\)$/i);
    if (ref && vars[ref[1]]) vars[k] = vars[ref[1]];
  }
  return vars;
}

// ── Colour math ───────────────────────────────────────────────────────────

function parseHex(hex) {
  if (!hex) return null;
  hex = hex.trim().replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function toLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return 0.2126 * toLinear(rgb.r)
       + 0.7152 * toLinear(rgb.g)
       + 0.0722 * toLinear(rgb.b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  if (l1 === null || l2 === null) return null;
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Universal on-dark opacity ramp (base.tokens.css; not loaded by this tool
// because it skips the `lattice` import). White ink at these alphas, themes
// may override via their own --on-dark-* color-mix declarations.
const ON_DARK_DEFAULTS = {
  'on-dark-primary': 0.92, 'on-dark-secondary': 0.68,
  'on-dark-ghost': 0.32, 'on-dark-watermark': 0.12,
};

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
}

// Composite a translucent white ink (alpha 0..1) over an opaque hex backdrop.
function compositeWhiteOver(alpha, bgHex) {
  const bg = parseHex(bgHex);
  if (!bg) return null;
  return rgbToHex({
    r: alpha * 255 + (1 - alpha) * bg.r,
    g: alpha * 255 + (1 - alpha) * bg.g,
    b: alpha * 255 + (1 - alpha) * bg.b,
  });
}

// Resolve a translucent fg token to the hex it renders as over `bgHex`.
// Handles `color-mix(in srgb, white N%, transparent)` and the on-dark
// defaults above. Returns null when the token isn't a known translucent.
function resolveTranslucent(token, vars, bgHex) {
  const val = vars[token];
  if (val && /transparent/.test(val)) {
    const m = val.match(/white\s+(\d+(?:\.\d+)?)%/);
    if (m) return compositeWhiteOver(parseFloat(m[1]) / 100, bgHex);
  }
  if (ON_DARK_DEFAULTS[token] != null) {
    return compositeWhiteOver(ON_DARK_DEFAULTS[token], bgHex);
  }
  return null;
}

function _wcagGrade(ratio) {
  if (ratio === null)  return 'N/A  ';
  if (ratio >= 7.0)    return 'AAA  ';
  if (ratio >= 4.5)    return 'AA   ';
  return                      'FAIL ';
}

// OKLab conversion for perceptual distance checks.
function toOKLab(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = toLinear(rgb.r), g = toLinear(rgb.g), b = toLinear(rgb.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L:  0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a:  1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b:  0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabDist(hex1, hex2) {
  const a = toOKLab(hex1), b = toOKLab(hex2);
  if (!a || !b) return null;
  return Math.sqrt((a.L-b.L)**2 + (a.a-b.a)**2 + (a.b-b.b)**2);
}

// ── Audit definition ──────────────────────────────────────────────────────

// Each entry: [fgToken, bgToken, context, minRatio]
// minRatio defaults to 4.5 (AA body text). Large/decorative text passes at 3.0.
const PAIRS = [
  // ── Slide layout (baseline) ──────────────────────────────────────────
  ['text-heading',   'bg',       'slide: heading on canvas'],
  ['text-body',      'bg',       'slide: body on canvas'],
  ['text-secondary', 'bg',       'slide: secondary text (subtitle/caption) on canvas'],
  ['text-label',     'bg',       'slide: label / eyebrow on canvas'],
  // ── Dark bookends (title/closing/divider) — translucent on-dark ink ───
  // on-dark-* are color-mix(white N%, transparent); composited over surface-inverse.
  ['on-dark-primary',   'surface-inverse', 'bookend: heading on dark panel'],
  ['on-dark-secondary', 'surface-inverse', 'bookend: subtitle on dark panel'],
  ['text-heading', 'bg-alt',     'slide: heading on card'],
  ['text-heading', 'accent-soft','slide: heading on accent-soft'],
  ['on-accent',    'accent',     'slide: on-accent on accent'],
  ['bg',           'fail',       'slide: bg on fail (error chip)'],

  // ── Mermaid node fills ────────────────────────────────────────────────
  // Current state: mermaid-primary-color (may be inherited pale blue)
  ['text-heading', 'mermaid-primary-color',   'mermaid: heading on primary node fill'],
  ['text-heading', 'mermaid-secondary-color', 'mermaid: heading on secondary node fill'],

  // Proposed state after refactor: accent-soft / bg-alt as node fills
  ['text-heading', 'accent-soft', 'mermaid (post): heading on primary node fill'],
  ['text-heading', 'bg-alt',      'mermaid (post): heading on cluster fill'],

  // ── Mermaid chart fills (pie, active gantt, quadrant) ─────────────────
  // text-heading on mid-tone chart colours — high risk
  ['text-heading', 'chart-1', 'mermaid: heading on chart-1 (pie/gantt)'],
  ['text-heading', 'chart-2', 'mermaid: heading on chart-2'],
  ['text-heading', 'chart-3', 'mermaid: heading on chart-3'],
  ['text-heading', 'chart-4', 'mermaid: heading on chart-4'],
  ['text-heading', 'chart-5', 'mermaid: heading on chart-5'],
  ['text-heading', 'chart-6', 'mermaid: heading on chart-6'],

  // on-accent on mid-tone chart colours — alternative for pie text
  ['on-accent', 'chart-1', 'mermaid: on-accent on chart-1'],
  ['on-accent', 'chart-2', 'mermaid: on-accent on chart-2'],
  ['on-accent', 'chart-3', 'mermaid: on-accent on chart-3'],
  ['on-accent', 'chart-4', 'mermaid: on-accent on chart-4'],
  ['on-accent', 'chart-5', 'mermaid: on-accent on chart-5'],
  ['on-accent', 'chart-6', 'mermaid: on-accent on chart-6'],

  // ── Edge labels ───────────────────────────────────────────────────────
  ['text-heading', 'bg', 'mermaid: edge label text on canvas bg'],

  // ── Foreground status INK on both slide surfaces ──────────────────────
  // pass/warn/fail are consumed as TEXT / --state-color / --stamp-color / --stance
  // ink (obligation-matrix state cells, policy-recommendation stance, status-cards,
  // regulatory stamps) — on the canvas AND on card/table surfaces (bg-alt). They
  // were historically tuned against --bg only; a card is bg-alt, a touch lighter,
  // so a warn amber that clears bg can slip under AA on bg-alt. Held to 4.5 (ink).
  ['pass', 'bg',     'slide: pass status ink on canvas'],
  ['warn', 'bg',     'slide: warn status ink on canvas'],
  ['fail', 'bg',     'slide: fail status ink on canvas'],
  ['pass', 'bg-alt', 'slide: pass status ink on card'],
  ['warn', 'bg-alt', 'slide: warn status ink on card'],
  ['fail', 'bg-alt', 'slide: fail status ink on card'],

  // ── Secondary text roles on the card surface (bg-alt) ─────────────────
  // Only heading-on-bg-alt was checked before; body/secondary/label render on
  // cards too (captions, eyebrows, list bodies inside bg-alt containers).
  ['text-body',      'bg-alt', 'slide: body on card'],
  ['text-secondary', 'bg-alt', 'slide: secondary text on card'],
  ['text-label',     'bg-alt', 'slide: label / eyebrow on card'],
];

const CHART_TOKENS = ['chart-1','chart-2','chart-3','chart-4','chart-5','chart-6'];
// OKLab distance threshold: 0.15 ≈ "just about distinct" for categorical use.
// Well-designed palettes target ≥ 0.20 for adjacent slots.
const OKLAB_THRESHOLD = 0.15;

// ── Per-theme audit (pure; shared by the CLI runner AND the unit gate) ──────

function listAllThemes() {
  return fs.readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => f.replace('.css', ''))
    .sort();
}

/** Audit one theme against PAIRS. Returns { fails, missing, weakPairs, checks,
 *  chartHexes, isDark } — or null if the theme file is absent. Pure: no console,
 *  no process state, so a test can assert on it and the CLI can print it. */
function auditTheme(theme) {
  const cssFile = path.join(THEMES_DIR, `${theme}.css`);
  if (!fs.existsSync(cssFile)) return null;

  const css  = loadPaletteWithImports(cssFile);
  const vars = parsePaletteVars(css);
  const fails = [];
  const missing = [];
  let checks = 0;

  for (const [fg, bg, ctx] of PAIRS) {
    const bgHex = vars[bg];
    // bg must resolve to a plain hex (it's the composite backdrop too).
    if (!bgHex || !parseHex(bgHex)) {
      if (vars[fg] && bgHex) missing.push({ ctx, fg: vars[fg], bg: bgHex });
      continue;
    }
    // fg: plain hex, or a translucent on-dark ink composited over bg.
    const fgHex = parseHex(vars[fg]) ? vars[fg] : resolveTranslucent(fg, vars, bgHex);
    if (!fgHex) {
      if (vars[fg]) missing.push({ ctx, fg: vars[fg], bg: bgHex });
      continue;
    }
    checks++;
    const ratio = contrastRatio(fgHex, bgHex);
    if (ratio < 4.5) fails.push({ ctx, fgHex, bgHex, ratio });
  }

  // Chart palette: OKLab pairwise distinctness.
  const chartHexes = CHART_TOKENS.map(t => vars[t]).filter(h => parseHex(h));
  const weakPairs = [];
  for (let i = 0; i < chartHexes.length; i++) {
    for (let j = i + 1; j < chartHexes.length; j++) {
      const d = oklabDist(chartHexes[i], chartHexes[j]);
      if (d !== null && d < OKLAB_THRESHOLD) {
        weakPairs.push({ a: `chart-${i+1}(${chartHexes[i]})`, b: `chart-${j+1}(${chartHexes[j]})`, d });
      }
    }
  }

  const isDark = /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/
    .test(css.replace(/\/\*[\s\S]*?\*\//g, ''));

  return { theme, fails, missing, weakPairs, checks, chartHexes, isDark };
}

module.exports = { auditTheme, listAllThemes, PAIRS };

// ── CLI runner ──────────────────────────────────────────────────────────────

if (require.main === module) {
  const args      = process.argv.slice(2);
  const failsOnly = args.includes('--fails-only');
  const themeArgs = args.filter(a => !a.startsWith('-'));
  const themes    = themeArgs.length ? themeArgs : listAllThemes();

  let totalFails = 0;
  let totalChecks = 0;

  console.log('');
  console.log('  Lattice · Contrast & Colour-Theory Audit');
  console.log('  ══════════════════════════════════════════════════════════════');
  console.log('  WCAG AA = 4.5:1 · AAA = 7:1 · OKLab ΔE threshold = 0.15');
  console.log('');

  for (const theme of themes) {
    const res = auditTheme(theme);
    if (!res) { console.log(`  [skip] ${theme} — file not found`); continue; }

    totalFails += res.fails.length;
    totalChecks += res.checks;
    const { fails, missing, weakPairs, chartHexes } = res;
    const hasIssues = fails.length || weakPairs.length || missing.length;
    if (!hasIssues && failsOnly) continue;

    const dark = res.isDark ? ' [dark]' : '';
    console.log(`  ── ${theme}${dark} ${'─'.repeat(Math.max(1, 52 - theme.length - dark.length))}`);

    if (!hasIssues) {
      const minDist = chartHexes.length >= 2
        ? Math.min(...CHART_TOKENS.slice(0, chartHexes.length).flatMap((_, i) =>
            CHART_TOKENS.slice(i+1, chartHexes.length).map((__, j) => {
              const d = oklabDist(chartHexes[i], chartHexes[i+1+j]);
              return d ?? Infinity;
            })
          ))
        : Infinity;
      const distStr = Number.isFinite(minDist) ? `  chart min ΔE ${minDist.toFixed(3)}` : '';
      console.log(`     ✓ all checks pass${distStr}`);
    } else {
      for (const f of fails) {
        console.log(`     ✗ ${f.ratio.toFixed(2).padStart(5)}:1  ${f.fgHex} on ${f.bgHex}`);
        console.log(`          ${f.ctx}`);
      }
      for (const w of weakPairs) {
        console.log(`     ⚠ chart ΔE ${w.d.toFixed(3)}  ${w.a} ↔ ${w.b}`);
      }
      for (const u of missing) {
        console.log(`     ?  unresolved pair [${u.ctx}]`);
        console.log(`          fg=${u.fg}  bg=${u.bg}`);
      }
    }
    console.log('');
  }

  console.log('  ══════════════════════════════════════════════════════════════');
  console.log(`  ${totalFails} contrast failures · 0 warnings · ${totalChecks} pairs checked across ${themes.length} themes`);
  console.log('');
  process.exitCode = totalFails ? 1 : 0;
}
