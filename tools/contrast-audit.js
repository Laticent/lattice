#!/usr/bin/env node
/**
 * Contrast audit for all Lattice themes.
 *
 * Checks WCAG AA contrast (4.5:1) for every critical text-on-surface pair in the
 * slide layouts (headings, body, status ink, secondary text on the canvas and the
 * card). The mermaid/chart categorical label-on-fill contrast is gated at its own
 * source — `checkCatContrast` in tools/check-ownership.js (via build:check) for the
 * curated --cat-*-fill/--cat-on-fill, and test/unit/palette/chart-contrast.test.js
 * for the DERIVED --chart-cat-* fills (color-mix in oklab) + slot-distinctness — so
 * this theme-scoped report deliberately does not mirror them.
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
    if (name === 'lattice') continue; // layout CSS; color tokens live in themes
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

// ── Color math ───────────────────────────────────────────────────────────

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
  // Foreground inks that actually render ON the accent-soft panel (key-insight
  // callout, split-compare .verdict, verdict-grid / compare-prose winner card,
  // pricing / glossary pill). --on-accent-soft resolves to --accent and
  // --accent-soft-body to --text-body in base.tokens.css, and no THEME overrides
  // either — so on a normal slide the ink IS --accent / --text-body. (Print mode,
  // base.modifiers.css, remaps these to --print-* — out of scope for this
  // slide-surface audit; print contrast is gated in contrast.test.js's print band.)
  // This tool skips the `lattice` import, so we audit the theme-owned resolved
  // tokens the ink equals: --accent and --text-body. #1167.
  // (Deliberately NOT text-secondary on accent-soft: no component renders secondary
  // text on an accent-soft fill, so gating it would police a surface that doesn't
  // exist — unlike the proactive warn-on-bg-alt bar, which HAS a large-text consumer.)
  ['text-body',      'accent-soft', 'slide: body prose on accent-soft (key-insight / split-compare verdict / converge)'],
  ['accent',         'accent-soft', 'slide: accent ink on accent-soft (verdict-grid / pricing / glossary / compare-prose winner)'],
  ['on-accent',    'accent',     'slide: on-accent on accent'],
  ['bg',           'fail',       'slide: bg on fail (error chip)'],

  // ── Mermaid / chart categorical node fills — NOT re-audited here ──────
  // The engine paints mermaid nodes / gantt tasks / pie sections / kanban lanes
  // with the theme's curated --cat-N-fill (12 slots) and the label ink with
  // --cat-on-fill (= --text-heading). That label-on-fill AA (--cat-on-fill vs
  // --cat-1..12-fill, both modes, ≥4.5:1) is ALREADY the authoritative gate
  // `checkCatContrast` in tools/check-ownership.js (run in `build:check`) — which
  // also checks mark-vs-canvas (≥3:1) and fill≠mark collapse, fails CLOSED on an
  // unresolvable token, and has a coverage backstop. The native SVG chart-family's
  // DERIVED fills (--chart-cat-N-fill / --state-*-fill, color-mix in oklab) + their
  // OKLab slot-distinctness are gated in test/unit/palette/chart-contrast.test.js.
  // So this theme-scoped contrast report deliberately does NOT mirror those pairs —
  // one gate per invariant, no drift (HARD RULE #15). Historically the matrix here
  // carried PLACEHOLDER names (`chart-1..6`, `mermaid-primary-color`) that no theme
  // declares, so they never resolved and were silently skipped; #1165 removed them.

  // ── Edge labels ───────────────────────────────────────────────────────
  ['text-heading', 'bg', 'mermaid: edge label text on canvas bg'],

  // ── Foreground status INK on both slide surfaces ──────────────────────
  // POLICY: hold all three status inks (pass/warn/fail) to AA small-text (4.5:1)
  // on BOTH real backdrops a theme declares — the canvas (--bg) and the card
  // (--bg-alt) — as a DELIBERATE proactive-safety margin. The point is that any
  // future component rendering small status text on a card is already safe,
  // without a per-color re-audit. This is a proactive bar, not a claim that every
  // pairing has a small-text consumer today. What actually consumes these inks now:
  //   • on --bg, small text — regulatory-update diff-band headings
  //     (`color:var(--pass|warn|fail)` at --fs-meta, on the .cell-stage canvas).
  //   • on --bg-alt, small text — redline's numbered-rationale rows put --pass/--fail
  //     ink at --fs-meta on a near-bg-alt surface (a 4% own-hue tint over --bg-alt).
  //   • --warn on --bg-alt has NO small-text consumer today — its only card use is
  //     the large KPI number (kpi.ops, --fs-h1), whose bar is large-text 3:1, which
  //     these ambers clear with margin. We still hold it to 4.5 here, on purpose,
  //     so a future small warn-on-card is covered ahead of need.
  // NOT audited (deliberately): status ink over its OWN-hue tint — policy-recommendation
  // `--stance` on `--stance-bg`, redline ins/del on `--pass-bg`/`--fail-bg`,
  // obligation-matrix `--state-color` as a mark FILL. A same-hue decorative wash isn't
  // a distinct background; that bar was reviewed and reverted (it can't be met without
  // damaging the curated hues). NB `--bg-alt` is a touch DARKER than `--bg` on light
  // themes (indaco #F2F5FA vs #FFFFFF), so it is the stricter of the two backdrops.
  ['pass', 'bg',     'slide: pass status ink on canvas'],
  ['warn', 'bg',     'slide: warn status ink on canvas'],
  ['fail', 'bg',     'slide: fail status ink on canvas'],
  ['pass', 'bg-alt', 'slide: pass status ink on card'],
  ['warn', 'bg-alt', 'slide: warn status ink on card (proactive; no small-text consumer today)'],
  ['fail', 'bg-alt', 'slide: fail status ink on card'],

  // ── Secondary text roles on the card surface (bg-alt) ─────────────────
  // Only heading-on-bg-alt was checked before; body/secondary/label render on
  // cards too (captions, eyebrows, list bodies inside bg-alt containers).
  ['text-body',      'bg-alt', 'slide: body on card'],
  ['text-secondary', 'bg-alt', 'slide: secondary text on card'],
  ['text-label',     'bg-alt', 'slide: label / eyebrow on card'],
];

// Every backdrop (bg) token in PAIRS resolves from a theme file (or its @import
// chain). (The only NON-theme tokens are the on-dark-* ink FOREGROUNDS, resolved
// via the built-in ON_DARK_DEFAULTS ramp since this tool skips the `lattice`
// import.) So there is no allowlist of "expected skips": any pair the resolver
// can't reduce to hex is a real coverage hole and is recorded in `missing`. The
// old placeholder mermaid/chart pairs (`chart-1..6`, `mermaid-*-color`) that no
// theme declared were removed in #1165 — that contrast is gated at its own
// source (checkCatContrast in check-ownership.js; chart-contrast.test.js), see above.

// ── Per-theme audit (pure; shared by the CLI runner AND the unit gate) ──────

function listAllThemes() {
  return fs.readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => f.replace('.css', ''))
    .sort();
}

/** Audit one theme against PAIRS. Returns { fails, missing, checks, isDark } —
 *  or null if the theme file is absent. Pure: no console, no process state, so a
 *  test can assert on it and the CLI can print it. */
function auditTheme(theme) {
  const cssFile = path.join(THEMES_DIR, `${theme}.css`);
  if (!fs.existsSync(cssFile)) return null;

  const css  = loadPaletteWithImports(cssFile);
  const vars = parsePaletteVars(css);
  const fails = [];
  const missing = [];
  let checks = 0;

  for (const [fg, bg, ctx] of PAIRS) {
    // Every PAIRS backdrop (bg) is theme-owned (or resolved via its @import chain
    // — the on-dark-* ink foregrounds resolve via ON_DARK_DEFAULTS), so a bg we
    // can't reduce to hex is a real coverage hole — record it in `missing` (the
    // gate asserts missing===0) rather than silently dropping the pair.
    const bgHex = vars[bg];
    if (!bgHex || !parseHex(bgHex)) {
      missing.push({ ctx, fg: vars[fg] ?? `--${fg}`, bg: bgHex ?? `--${bg} (absent)` });
      continue;
    }
    // fg: plain hex, or a translucent on-dark ink composited over bg.
    const fgHex = parseHex(vars[fg]) ? vars[fg] : resolveTranslucent(fg, vars, bgHex);
    if (!fgHex) {
      missing.push({ ctx, fg: vars[fg] ?? `--${fg} (absent)`, bg: bgHex });
      continue;
    }
    checks++;
    const ratio = contrastRatio(fgHex, bgHex);
    if (ratio < 4.5) fails.push({ ctx, fgHex, bgHex, ratio });
  }

  const isDark = /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/
    .test(css.replace(/\/\*[\s\S]*?\*\//g, ''));

  return { theme, fails, missing, checks, isDark };
}

module.exports = { auditTheme, listAllThemes, PAIRS };

// ── CLI runner ──────────────────────────────────────────────────────────────

if (require.main === module) {
  const args      = process.argv.slice(2);
  const failsOnly = args.includes('--fails-only');
  const themeArgs = args.filter(a => !a.startsWith('-'));
  const themes    = themeArgs.length ? themeArgs : listAllThemes();

  let totalFails = 0;
  let totalMissing = 0;
  let totalChecks = 0;

  console.log('');
  console.log('  Lattice · Contrast Audit');
  console.log('  ══════════════════════════════════════════════════════════════');
  console.log('  WCAG AA = 4.5:1 · AAA = 7:1');
  console.log('');

  for (const theme of themes) {
    const res = auditTheme(theme);
    if (!res) { console.log(`  [skip] ${theme} — file not found`); continue; }

    totalFails += res.fails.length;
    totalMissing += res.missing.length;
    totalChecks += res.checks;
    const { fails, missing } = res;
    const hasIssues = fails.length || missing.length;
    if (!hasIssues && failsOnly) continue;

    const dark = res.isDark ? ' [dark]' : '';
    console.log(`  ── ${theme}${dark} ${'─'.repeat(Math.max(1, 52 - theme.length - dark.length))}`);

    if (!hasIssues) {
      console.log('     ✓ all checks pass');
    } else {
      for (const f of fails) {
        console.log(`     ✗ ${f.ratio.toFixed(2).padStart(5)}:1  ${f.fgHex} on ${f.bgHex}`);
        console.log(`          ${f.ctx}`);
      }
      for (const u of missing) {
        console.log(`     ?  unresolved pair [${u.ctx}]`);
        console.log(`          fg=${u.fg}  bg=${u.bg}`);
      }
    }
    console.log('');
  }

  console.log('  ══════════════════════════════════════════════════════════════');
  console.log(`  ${totalFails} contrast failures · ${totalMissing} unresolved · ${totalChecks} pairs checked across ${themes.length} themes`);
  console.log('');
  // Unresolved pairs are a coverage hole, not a pass — exit non-zero so automation
  // can't read "0 failures" while pairs were silently skipped.
  process.exitCode = (totalFails || totalMissing) ? 1 : 0;
}
