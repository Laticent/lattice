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

const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT       = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');

// ── CSS loader ────────────────────────────────────────────────────────────
//
// A theme plus everything it extends, PARENT-FIRST — the cascade order every
// palette is authored against. The chain comes from the MANIFEST (`extends`,
// baked into `THEME_EDGES`), not from regexing `@import` out of the stylesheet:
// the CSS directive is Marp's copy of the same edge, and re-deriving it here was
// a private regex to keep in step with three others. See
// engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
//
// `lattice` (the engine base) is not a theme edge and is absent from the graph,
// which is what this audit wants anyway — it scores theme-owned tokens, and takes
// the one thing it needs from the base sheet (the on-dark ramp) directly, below.

function paletteChainCss(theme) {
  return themeChain(theme, THEME_EDGES)
    .map((n) => path.join(THEMES_DIR, `${n}.css`))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
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

// Universal on-dark opacity ramp — READ from base.tokens.css, not copied from it.
// This tool loads only the theme chain (it audits theme-owned tokens), so it needs
// the base ramp's alphas; it used to hardcode them. That copy silently went stale
// the moment the ramp moved, and a stale alpha here does not fail loudly — it makes
// the gate score an ink the engine no longer paints, which is how a rung sat at
// 2.49:1 under a passing audit. Parsed from the one declaration site instead, so
// the two cannot disagree. A theme may still override any rung in its own :root
// (cuoio does), which `resolveTranslucent` already prefers over these defaults.
const ON_DARK_DEFAULTS = (() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'base', 'base.tokens.css'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const m of src.matchAll(
    /--(on-dark-(?:primary|secondary|ghost|watermark))\s*:\s*color-mix\(\s*in srgb,\s*white\s+(\d+(?:\.\d+)?)%/g,
  )) out[m[1]] = parseFloat(m[2]) / 100;
  const want = ['on-dark-primary', 'on-dark-secondary', 'on-dark-ghost', 'on-dark-watermark'];
  const missing = want.filter((k) => out[k] == null);
  // Refuse to run half-blind: a rung this can't read is a rung it would skip, and a
  // skipped pair reads as a pass. Fail with the reason instead.
  if (missing.length) {
    throw new Error(
      `contrast-audit: could not read ${missing.join(', ')} from lib/base/base.tokens.css — ` +
      'the on-dark ramp moved off the `color-mix(in srgb, white N%, transparent)` form. ' +
      'Update this reader; do not re-hardcode the alphas.',
    );
  }
  return out;
})();

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
  ['on-dark-secondary', 'surface-inverse', 'bookend: subtitle / eyebrow / dek on dark panel'],
  // The RULE/DIVIDER rung on the same panel, at WCAG 1.4.11's 3:1 rather than AA:
  // the metric panel's row accent and heading hairline (split-panel.styles.css).
  // Uncovered until now, and it showed — the rung sat at 2.49–2.90:1 on all 14
  // palettes while this table reported "all checks pass". Ghost carries no text;
  // if it ever does again, it owes 4.5 and this row must move up with it.
  ['on-dark-ghost',     'surface-inverse', 'panel: rule / hairline on dark panel', 3.0],
  // (The bold accent rail's text rung is --on-accent vs --accent, already covered
  // further down this table. split-panel.watermark's eyebrow + h5 now name that
  // curated rung directly instead of a 70% derivation of it, which measured
  // 3.34–4.41:1 on 4 of 5 sampled palettes — so what the gate scores is now what
  // the slide renders.)
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
  // NOT audited HERE, but no longer unaudited: status ink over its OWN-hue tint —
  // policy-recommendation `--stance` on `--stance-bg`, redline ins/del on
  // `--pass-bg`/`--fail-bg`, obligation-matrix's `.heat` cell washes. This table
  // scores an ink against the opaque canvases a PALETTE declares, and a same-hue
  // wash is not one of those; the bar was proposed here once and reverted on the
  // ground that it could not be met without damaging the curated hues. #1640
  // measured that claim and it was half right: the dominant cost was not the hues
  // but two `opacity` washes in redline, which dragged the ink and its own-hue band
  // toward the backdrop together (removing them cleared 39 composed runs and cut the
  // curated re-tunes roughly in half). Those surfaces now have their own gate —
  // `tools/composed-contrast.js` + test/unit/palette/composed-surface-contrast.test.js
  // — which composes the stack, resolves base-derived inks, and scores both cascade
  // orders. One gate per invariant, no drift (HARD RULE #15). NB `--bg-alt` is a touch DARKER than `--bg` on light
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

  // ── The muted tier — the ONE --text-* role this table never scored ─────
  // `--text-muted` is not decoration. It is the declared ink for the running
  // header, the running footer and the pagination counter on EVERY slide of
  // EVERY deck (`base.tokens.css` --marp-slide-header-color / -footer-color /
  // -pagination-color, consumed by `section header` / `section footer` in
  // base.modifiers.css), plus the section-rail dots. Every other --text-* role
  // was audited on both backdrops; this one was not, and the omission was
  // invisible because all 32 theme files assert the result in a comment —
  // "de-emphasized TEXT — AA on --bg and --bg-alt (#1715)" — that nothing read.
  // A hand-written claim standing in for a gate is exactly the silent-drift
  // shape this table exists to remove, so the claim is now scored.
  //
  // 4.5, not 3.0. The chrome renders at --fs-meta, and the large-text allowance
  // is not available to it: `2026-08-18-contrast-floor-deck-scale.md` settled
  // that a deck's canvas-unit size says nothing about the size a human sees
  // (43.4px on a nominally 3840px canvas is ~14px on a 1280px projection), and
  // the rendered prober stopped granting the allowance for that reason. This
  // table grades a theme's tokens with no viewing size at all, so the small-text
  // floor is the only honest bar here.
  //
  // All 32 themes clear both pairs today (#1715 re-tuned them), so this seeds
  // green and its whole job is to keep it that way.
  ['text-muted',     'bg',     'slide: muted chrome ink (running header / footer / pagination) on canvas'],
  ['text-muted',     'bg-alt', 'slide: muted chrome ink on card'],
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

  const css  = paletteChainCss(theme);
  const vars = parsePaletteVars(css);
  const fails = [];
  const missing = [];
  let checks = 0;

  for (const [fg, bg, ctx, minRatio = 4.5] of PAIRS) {
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
    // `minRatio` (the 4th PAIRS element) was documented at the head of the table
    // from the start but never read — every pair was scored at 4.5 regardless.
    // That is why no non-text pair could be listed here: a 3:1 rule or hairline
    // would have reported a false failure on all 14 palettes, so the whole
    // graphical-contrast class stayed out of the table and out of the gate. Now
    // honored, defaulting to AA body text.
    if (ratio < minRatio) fails.push({ ctx, fgHex, bgHex, ratio, minRatio });
  }

  const isDark = /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/
    .test(css.replace(/\/\*[\s\S]*?\*\//g, ''));

  return { theme, fails, missing, checks, isDark };
}

// `paletteChainCss` + `parsePaletteVars` are exported for tools/palette-sweep.js, which
// needs BOTH: the flattened chain to inject into a rendered page, and the static
// resolution of the same chain to check the browser against. Exported rather than
// copied — a second @import flattener that drifted from this one would give the sweep
// a different palette than every analytic gate scores (HARD RULE #15).
module.exports = { auditTheme, listAllThemes, PAIRS, paletteChainCss, parsePaletteVars };

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
        console.log(`     ✗ ${f.ratio.toFixed(2).padStart(5)}:1 (need ${f.minRatio})  ${f.fgHex} on ${f.bgHex}`);
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
