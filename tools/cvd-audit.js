#!/usr/bin/env node
/**
 * Colour-vision-deficiency (CVD) collapse audit for Lattice themes.
 *
 * For every theme, simulate each dichromacy (protanopia / deuteranopia /
 * tritanopia) on the meaning-bearing token groups — the categorical cycle
 * (`--cat-N-fill` / `--cat-N-mark`) and the semantic signals
 * (`--pass`/`--warn`/`--fail`) — and measure whether adjacent categories stay
 * perceptually distinct *under* that deficiency (OKLab ΔE). Two colours that
 * read as distinct to a normal-sighted viewer but collapse to the same colour
 * under a deficiency score near 0 and are flagged.
 *
 * This is a DIAGNOSTIC, not a gate: the shipped brand themes encode meaning in
 * hue and *will* collapse here — that is the problem the curated accessibility
 * palettes exist to solve (engineering/decisions/2026-06-16-colour-blindness-
 * accessibility.md). It exits 0 by default so it never breaks CI on the brand
 * themes; pass `--strict` to exit non-zero on any collapse (used by the
 * accessibility palettes' regression test once they exist).
 *
 * Usage:
 *   node tools/cvd-audit.js                       # all themes, all types
 *   node tools/cvd-audit.js indaco                # one theme
 *   node tools/cvd-audit.js --type deuteranopia   # one deficiency
 *   node tools/cvd-audit.js a11y-deuteranopia --strict   # gate one palette
 */

const fs   = require('fs');
const path = require('path');

const { resolveVars } = require('../lib/theme/contrast.js');
const { simulate, canonicalType, CVD_TYPES } = require('../lib/theme/cvd.js');
const { oklabDistance, normalizeHex } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT       = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');

// ΔE under a deficiency below this = "these two categories have collapsed".
// Mirrors tools/contrast-audit.js: 0.15 ≈ "just about distinct"; well-designed
// categorical palettes target ≥ 0.20 for adjacent slots.
const COLLAPSE = 0.15;

// ── Palette loader ───────────────────────────────────────────────────────────
//
// A theme plus everything it extends, PARENT-FIRST — the cascade order every palette
// is authored against. The chain comes from the MANIFEST (`extends`, baked into
// `THEME_EDGES`), not from regexing `@import` out of the stylesheet: the CSS directive
// is Marp's copy of the same edge. See
// engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
//
// `lattice` (the engine base) is not a theme edge and is absent from the graph — which
// is what this audit wants: it measures the color tokens, which live in themes.

function paletteChainCss(theme) {
  return themeChain(theme, THEME_EDGES)
    .map((n) => path.join(THEMES_DIR, `${n}.css`))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

/** Parse every `:root { … }` block into a flat `{ name: value }` map. */
function parseVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const block of (stripped.match(/:root\s*\{[^}]*\}/g) || [])) {
    for (const d of (block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || [])) {
      const mm = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (mm) vars[mm[1]] = mm[2].trim();
    }
  }
  return vars;
}

function isDarkTheme(css) {
  return /:root\b[^{}]*\{[^}]*color-scheme\s*:\s*dark\b/.test(
    css.replace(/\/\*[\s\S]*?\*\//g, ''),
  );
}

const asHex = v => {
  try { return normalizeHex(v); } catch { return null; }
};

// ── Token groups the audit measures ─────────────────────────────────────────

function tokenGroups() {
  const fills = Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-fill`);
  const marks = Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-mark`);
  const chart = Array.from({ length: 8 }, (_, i) => `chart-cat${i + 1}`);
  return [
    { label: 'categorical fills', tokens: fills },
    { label: 'categorical marks', tokens: marks },
    // The chart-family spectrum override hooks (design/theming.md). Untuned
    // brand themes inherit these from chart-family.css and so resolve to
    // nothing here (group skipped); a curated palette — including the a11y
    // palettes — declares them and is measured.
    { label: 'chart spectrum', tokens: chart },
    { label: 'semantic signals', tokens: ['pass', 'warn', 'fail'] },
  ];
}

/**
 * For a resolved {name: hex} map and a CVD type, measure pairwise distinctness
 * within a token group both for normal vision and under the deficiency.
 *
 * The meaningful readout is CVD-*induced* collapse: a pair a normal-sighted
 * viewer can tell apart (ΔE ≥ COLLAPSE) that a CVD viewer cannot (ΔE < COLLAPSE).
 * Pairs that are already indistinct to everyone (e.g. the pale L≈87 fills, whose
 * distinction comes from marks/labels/position, not fill hue) are NOT a CVD bug
 * and are excluded — tools/contrast-audit.js already covers normal distinctness.
 *
 * Returns `{ count, minNormal, minCvd, induced: [...] }`, or null if fewer than
 * two tokens resolve to hex.
 */
function analyzeGroup(hexByToken, tokens, type) {
  const present = tokens
    .map(t => ({ t, hex: hexByToken[t] }))
    .filter(({ hex }) => hex);
  if (present.length < 2) return null;

  let minNormal = Infinity;
  let minCvd = Infinity;
  const induced = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const dn = oklabDistance(present[i].hex, present[j].hex);
      const dc = type === 'normal'
        ? dn
        : oklabDistance(simulate(present[i].hex, type), simulate(present[j].hex, type));
      if (dn < minNormal) minNormal = dn;
      if (dc < minCvd) minCvd = dc;
      if (dn >= COLLAPSE && dc < COLLAPSE) induced.push({ a: present[i].t, b: present[j].t, dn, dc });
    }
  }
  return { count: present.length, minNormal, minCvd, induced };
}

// ── Runner ───────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const strict = args.includes('--strict');

// `--type X` — validated & canonicalized up front so a typo is a clean usage
// error, not a stack trace deep in the per-pair loop, and so the report labels
// print the canonical name rather than a passed alias.
const VALID_TYPES = [...CVD_TYPES, 'normal'];
let types = CVD_TYPES;
const typeIdx = args.indexOf('--type');
if (typeIdx >= 0) {
  const raw = args[typeIdx + 1];
  if (!raw || raw.startsWith('-')) {
    console.error(`  cvd-audit: --type needs a value (one of: ${VALID_TYPES.join(', ')})`);
    process.exit(2);
  }
  try {
    types = [canonicalType(raw)];
  } catch {
    console.error(`  cvd-audit: unknown --type "${raw}" (expected one of: ${VALID_TYPES.join(', ')})`);
    process.exit(2);
  }
}
const themeArgs = args.filter((a, i) =>
  !a.startsWith('-') && args[i - 1] !== '--type');

const allThemes = fs.readdirSync(THEMES_DIR)
  .filter(f => f.endsWith('.css'))
  .map(f => f.replace('.css', ''))
  .sort();
const themes = themeArgs.length ? themeArgs : allThemes;

let totalCollapsed = 0;
const uncovered = []; // requested themes that yielded no measurable tokens

console.log('');
console.log('  Lattice · Colour-Vision-Deficiency Audit (Machado 2009)');
console.log('  ══════════════════════════════════════════════════════════════');
console.log(`  collapse threshold: OKLab ΔE < ${COLLAPSE}  ·  types: ${types.join(', ')}`);
console.log('');

for (const theme of themes) {
  const cssFile = path.join(THEMES_DIR, `${theme}.css`);
  if (!fs.existsSync(cssFile)) {
    console.log(`  [skip] ${theme} — file not found`);
    uncovered.push(theme);
    continue;
  }
  const css  = paletteChainCss(theme);
  const mode = isDarkTheme(css) ? 'dark' : 'light';
  const resolved = resolveVars(parseVars(css), mode);
  const hexByToken = {};
  for (const [k, v] of Object.entries(resolved)) {
    const h = asHex(v);
    if (h) hexByToken[k] = h;
  }

  console.log(`  ── ${theme} [${mode}] ${'─'.repeat(Math.max(1, 48 - theme.length - mode.length))}`);
  let measured = 0;
  for (const type of types) {
    const lines = [];
    for (const { label, tokens } of tokenGroups()) {
      const r = analyzeGroup(hexByToken, tokens, type);
      if (!r) continue;
      measured++;
      totalCollapsed += r.induced.length;
      const flag = r.induced.length ? '✗' : '✓';
      lines.push(
        `       ${flag} ${label.padEnd(18)} ΔE ${r.minCvd.toFixed(3)} (normal ${r.minNormal.toFixed(3)})` +
        (r.induced.length ? `  ${r.induced.length} collapsed by CVD` : ''),
      );
    }
    console.log(`     ${type}`);
    for (const l of lines) console.log(l);
  }
  if (measured === 0) uncovered.push(theme);
  console.log('');
}

console.log('  ══════════════════════════════════════════════════════════════');
console.log(`  ${totalCollapsed} CVD-induced collapse(s) across ${themes.length} theme(s) × ${types.length} type(s)`);
console.log('  (pairs distinct to normal vision that collapse under a deficiency)');
if (uncovered.length) {
  console.log(`  ⚠ ${uncovered.length} requested theme(s) had no measurable tokens: ${uncovered.join(', ')}`);
}
console.log('');

// --strict: fail on any induced collapse OR any requested theme that produced
// nothing — the latter stops a step-3 regression gate from passing vacuously
// when a palette is missing, misnamed, or defines none of the audited tokens.
if (strict && (totalCollapsed > 0 || uncovered.length > 0)) process.exit(1);
