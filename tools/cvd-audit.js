#!/usr/bin/env node
/**
 * Colour-vision-deficiency (CVD) collapse audit for Lattice themes.
 *
 * For every theme, simulate each condition — the three dichromacies (protanopia /
 * deuteranopia / tritanopia) and ACHROMATOPSIA, the total monochromacy — on the
 * meaning-bearing token groups: the categorical cycle (`--cat-N-fill` /
 * `--cat-N-mark`), the chart spectrum, and the semantic signals
 * (`--pass`/`--warn`/`--fail`). It measures whether adjacent categories stay
 * perceptually distinct *under* that condition (OKLab ΔE). Two colors that
 * read as distinct to a normal-sighted viewer but collapse to the same color
 * under a condition score near 0 and are flagged.
 *
 * THE ACHROMATOPSIA ARM (#1715 §9). `lib/theme/cvd.js` gained the primitive when
 * `checkHljsSeparation` needed it, and this CLI — the one a human runs — could not
 * reach it. It loops `SIMULATED_TYPES` now, not `CVD_TYPES`; `CVD_TYPES` stays the
 * three Machado matrices, because achromatopsia is a monochromacy, not a dichromacy,
 * and a unit test pins that list at exactly three.
 *
 * This is a DIAGNOSTIC, not a gate: the shipped brand themes encode meaning in
 * hue and *will* collapse here — that is the problem the curated accessibility
 * palettes exist to solve (engineering/decisions/2026-06-16-colour-blindness-
 * accessibility.md). It exits 0 by default so it never breaks CI on the brand
 * themes; pass `--strict` to exit non-zero on any collapse (used by the
 * accessibility palettes' regression test once they exist).
 *
 * Usage:
 *   node tools/cvd-audit.js                       # all themes, all four conditions
 *   node tools/cvd-audit.js indaco                # one theme
 *   node tools/cvd-audit.js --type deuteranopia   # one condition
 *   node tools/cvd-audit.js --type achromatopsia  # the monochromacy arm alone
 *   node tools/cvd-audit.js a11y-deuteranopia --strict --type deuteranopia
 *                                                 # gate one palette against the
 *                                                 # condition it is NAMED for
 *
 * NOTE on `--strict` since the achromatopsia arm landed: with no `--type` it now
 * spans all FOUR conditions, so `--strict` on a dichromacy palette measures it under
 * monochromacy too — and the a11y dichromacy palettes DO collapse there (their status
 * trio is separated by hue, which monochromacy erases). That is a true reading, not a
 * regression: `a11y-achromatopsia` is the palette for that reader. Gate a palette
 * against its own condition with `--type`, as above.
 */

const fs   = require('fs');
const path = require('path');

const { resolveVars } = require('../lib/theme/contrast.js');
const { simulate, canonicalType, SIMULATED_TYPES } = require('../lib/theme/cvd.js');
const { oklabDistance, normalizeHex } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT       = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');

// ΔE under a deficiency below this = "these two categories have collapsed".
// Mirrors tools/contrast-audit.js: 0.15 ≈ "just about distinct"; well-designed
// categorical palettes target ≥ 0.20 for adjacent slots.
const COLLAPSE = 0.15;

/**
 * THE COLLAPSE FLOOR IS PER-CONDITION, and it has to be.
 *
 * 0.15 is calibrated for a DICHROMACY, where two axes survive: lightness plus the one
 * chromatic axis the condition leaves. Under ACHROMATOPSIA only lightness survives, so
 * the reachable ΔE is arithmetically much smaller and a single global floor stops
 * measuring the palette and starts measuring the condition. Measured on this tree
 * (32 palettes x 4 groups x every pair, 4880 pairs):
 *
 *   floor 0.15 -> 1229 induced collapses, 1.91x the worst dichromacy arm (deuteranopia
 *                 at 645), 66% of all groups flagged, and SEVEN palettes where every
 *                 single group reads ✗. A report with no ✓ in it ranks nothing.
 *   floor 0.065 ->  711 induced, 1.10x deuteranopia, 54% of groups, and TWO all-✗
 *                 palettes — the same count tritanopia produces at 0.15. The arm sits
 *                 inside the band the three dichromacy arms already occupy (48-64% of
 *                 groups, 2-7 all-✗ palettes) instead of dominating it.
 *   floor 0.048 ->  604 induced, 0.94x deuteranopia, 44% of groups — now the QUIETEST
 *                 arm, under tritanopia's 48%. Over-corrected.
 *
 * 0.065 is not curve-fitted to those counts; they are the check on it. It comes from
 * the ratio this repo has ALREADY measured and shipped for the same question one tier
 * down: `checkHljsSeparation` (tools/check-ownership.js, #1715) holds the syntax family
 * to 0.11 under a dichromacy and 0.048 under monochromacy — 0.436x — after measuring
 * both on the four a11y palettes. 0.15 x 0.436 = 0.0655. The independent reading agrees:
 * the median per-group ratio of the achromatopsia reachable ceiling to the best
 * dichromacy ceiling, over every palette in the tree, is 0.644 for the categorical and
 * chart groups but 0.303 for the semantic trio, and 0.436 sits between them.
 *
 * WHAT DID *NOT* CALIBRATE IT, stated because it is the obvious candidate and it is
 * empty: `a11y-achromatopsia` reports ZERO induced collapses at 0.15 as well as at
 * 0.065, so it puts no upper bound on the floor. Its cycle is already achromatic, which
 * makes the simulation the identity function on it — the palette is unfalsifiable under
 * its own condition by construction, not evidence that a high floor is safe.
 */
const COLLAPSE_BY_TYPE = Object.freeze({
  protanopia: COLLAPSE,
  deuteranopia: COLLAPSE,
  tritanopia: COLLAPSE,
  achromatopsia: 0.065,
  normal: COLLAPSE,
});

/**
 * The NORMAL-VISION half of the induced test keeps 0.15 for EVERY condition, and this
 * is the half it is easy to lower by reflex along with the other one.
 *
 * `dn >= NORMAL_DISTINCT` asks "could a normal-sighted viewer tell these apart?". That
 * is a property of the palette as designed, measured with no simulation in it, so it
 * cannot depend on which condition is being simulated. Lowering it for achromatopsia
 * would count pairs that were never distinct as collapses the condition induced.
 *
 * Measured rather than asserted: dropping this half to 0.065 as well adds 996 pairs,
 * every one of them with `dn` in [0.065, 0.15) — e.g. ardesia `cat-1-fill^cat-3-fill`
 * at dn 0.0780, a pair of pale L≈87 fills a sighted reader already cannot separate by
 * hue. Those are exactly what the `analyzeGroup` docblock below excludes by design and
 * what `tools/contrast-audit.js` covers instead.
 */
const NORMAL_DISTINCT = COLLAPSE;

/** The collapse floor for one condition. Unknown names fall back to the dichromacy floor. */
function collapseFloor(type) {
  return COLLAPSE_BY_TYPE[type] ?? COLLAPSE;
}

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
 * viewer can tell apart (ΔE ≥ NORMAL_DISTINCT) that a CVD viewer cannot
 * (ΔE < the floor FOR THAT CONDITION). Pairs that are already indistinct to
 * everyone (e.g. the pale L≈87 fills, whose distinction comes from
 * marks/labels/position, not fill hue) are NOT a CVD bug and are excluded —
 * tools/contrast-audit.js already covers normal distinctness.
 *
 * THE TWO HALVES TAKE DIFFERENT NUMBERS, on purpose. Both used to read the one
 * global `COLLAPSE`. The simulated half is now per-condition (`collapseFloor`)
 * because the reachable ΔE under a monochromacy is arithmetically smaller; the
 * normal-vision half stays at `NORMAL_DISTINCT` for every condition because it
 * measures the palette, not the condition. See both docblocks above.
 *
 * Returns `{ count, minNormal, minCvd, floor, induced: [...] }`, or null if fewer
 * than two tokens resolve to hex.
 */
function analyzeGroup(hexByToken, tokens, type) {
  const present = tokens
    .map(t => ({ t, hex: hexByToken[t] }))
    .filter(({ hex }) => hex);
  if (present.length < 2) return null;

  const floor = collapseFloor(type);
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
      if (dn >= NORMAL_DISTINCT && dc < floor) induced.push({ a: present[i].t, b: present[j].t, dn, dc });
    }
  }
  return { count: present.length, minNormal, minCvd, floor, induced };
}

// ── Runner ───────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const strict = args.includes('--strict');

// `--type X` — validated & canonicalized up front so a typo is a clean usage
// error, not a stack trace deep in the per-pair loop, and so the report labels
// print the canonical name rather than a passed alias.
const VALID_TYPES = [...SIMULATED_TYPES, 'normal'];
let types = SIMULATED_TYPES;
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
// The floor is per-condition now, so the banner cannot state one number. It prints
// each condition with the floor it is actually measured against — a report that
// silently applies a different threshold per row would be worse than the old one.
console.log(`  distinct to normal vision: OKLab ΔE >= ${NORMAL_DISTINCT}  (all conditions)`);
console.log(`  collapse under the condition: ${types.map(t => `${t} < ${collapseFloor(t)}`).join('  ·  ')}`);
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
    console.log(`     ${type}  (collapse < ${collapseFloor(type)})`);
    for (const l of lines) console.log(l);
  }
  if (measured === 0) uncovered.push(theme);
  console.log('');
}

console.log('  ══════════════════════════════════════════════════════════════');
console.log(`  ${totalCollapsed} CVD-induced collapse(s) across ${themes.length} theme(s) × ${types.length} type(s)`);
console.log(`  (pairs at ΔE >= ${NORMAL_DISTINCT} to normal vision that fall under the condition's own floor)`);
if (uncovered.length) {
  console.log(`  ⚠ ${uncovered.length} requested theme(s) had no measurable tokens: ${uncovered.join(', ')}`);
}
console.log('');

// --strict: fail on any induced collapse OR any requested theme that produced
// nothing — the latter stops a step-3 regression gate from passing vacuously
// when a palette is missing, misnamed, or defines none of the audited tokens.
if (strict && (totalCollapsed > 0 || uncovered.length > 0)) process.exit(1);
