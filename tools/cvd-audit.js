#!/usr/bin/env node
/**
 * Color-vision-deficiency (CVD) collapse audit for Lattice themes.
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
 * palettes exist to solve (engineering/decisions/2026-06-16-color-blindness-
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
/**
 * Where palettes are read from. `--themes-dir <path>` overrides it.
 *
 * WHY IT IS OVERRIDABLE. The per-group floor (`MONO_FLOOR_BY_GROUP`) is the arm's
 * sharpest rule and the shipped tree can no longer WITNESS it: once the status trio
 * was respaced to clear 0.11 on all 32 palettes, no committed pair sits in the
 * [0.065, 0.11) band that separates the trio floor from the crowded-group one, so a
 * test over `themes/` cannot tell the two apart any more. It passes either way — which
 * is the shape of a gate that has quietly stopped gating. A synthetic palette in a
 * temp directory is the witness, and this flag is how the test hands it over.
 */
const THEMES_DIR = (() => {
  const i = process.argv.indexOf('--themes-dir');
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'themes');
})();

// ΔE under a deficiency below this = "these two categories have collapsed".
// Mirrors tools/contrast-audit.js: 0.15 ≈ "just about distinct"; well-designed
// categorical palettes target ≥ 0.20 for adjacent slots.
const COLLAPSE = 0.15;

/**
 * THE COLLAPSE FLOOR IS PER-CONDITION **AND PER-GROUP**, and it has to be both.
 *
 * 0.15 is calibrated for a DICHROMACY, where two axes survive: lightness plus the one
 * chromatic axis the condition leaves. Under ACHROMATOPSIA only lightness survives.
 *
 * THE REDUCTION IS ABOUT HOW CROWDED THE GROUP IS, NOT ABOUT THE CONDITION. That
 * distinction is the whole of this block, and getting it wrong is how the first cut of
 * this arm shipped a green tick over green-vs-red. N tokens mutually >= F on ONE axis
 * need (N-1)·F of lightness range:
 *
 *   12 categorical fills at 0.15  ->  1.65 of range. Impossible; L only spans 0..1.
 *   12 categorical marks at 0.15  ->  1.65. Impossible.
 *    8 chart hues       at 0.15  ->  1.05. Impossible.
 *    3 status signals   at 0.15  ->  0.30. ENTIRELY REACHABLE — and `a11y-achromatopsia`
 *                                    reaches it, spreading pass/warn/fail across
 *                                    #4d4d4d / #6e6e6e / #2e2e2e for a min pairwise
 *                                    0.1180.
 *
 * So the monochromacy reduction is right for the three crowded groups and WRONG for the
 * status trio. Applied to the trio it waved through 29 pairs whose simulated grays sit at
 * 1.29:1 to 1.86:1 — ardesia's `--pass` #005535 and `--fail` #70001d both render #494949
 * / #353535, 1.36:1, and the group printed ✓. That is the exact defect this arm exists to
 * find, certified clean by the arm.
 *
 * TWO FLOORS, EACH RATCHETED FROM WHAT THE PURPOSE-BUILT PALETTE ACHIEVES — the method
 * `checkHljsSeparation` used (tools/check-ownership.js, #1715), applied per population:
 *
 *   CROWDED GROUPS -> 0.065. `a11y-achromatopsia` cannot calibrate these: its cycle is a
 *   monotone value ramp, so the simulation is the identity on it and NO pair is induced
 *   at any floor. The number instead transposes the ratio this repo already measured and
 *   shipped one tier down — `checkHljsSeparation` holds twelve small-text syntax roles to
 *   0.11 under a dichromacy and 0.048 under monochromacy, 0.436x — onto this tool's 0.15:
 *   0.15 x 0.436 = 0.0655. Legitimate here precisely BECAUSE the hljs family is also a
 *   crowded twelve-way set boxed into a narrow band, so the crowding the ratio encodes is
 *   the crowding these groups have.
 *
 *   THE STATUS TRIO -> 0.11, ratcheted just under the 0.1180 `a11y-achromatopsia`'s own
 *   trio achieves under its own condition. No transposition needed: the palette built for
 *   the condition measures this group directly.
 *
 * The report stays legible on the tree, which is the check rather than the derivation:
 * 731 induced, 59% of groups flagged, 2 palettes all-✗ — inside the band the three
 * dichromacy arms occupy (48-64% of groups, 2-7 all-✗). A flat 0.15 everywhere gives
 * 1229 / 66% / 7 and ranks nothing; a flat 0.065 everywhere gives 711 / 54% / 2 and
 * lies about the trio.
 */
const COLLAPSE_BY_TYPE = Object.freeze({
  protanopia: COLLAPSE,
  deuteranopia: COLLAPSE,
  tritanopia: COLLAPSE,
  achromatopsia: 0.065,
  normal: COLLAPSE,
});

/**
 * Groups that are small enough to REACH the dichromacy floor on lightness alone, so the
 * monochromacy reduction above does not apply to them. Keyed by the group label in
 * `tokenGroups()`; a group absent here takes its condition's floor.
 */
const MONO_FLOOR_BY_GROUP = Object.freeze({ 'semantic signals': 0.11 });

/**
 * The NORMAL-VISION half of the induced test keeps 0.15 for EVERY condition and EVERY
 * group, and this is the half it is easy to lower by reflex along with the other one.
 *
 * `dn >= NORMAL_DISTINCT` asks "could a normal-sighted viewer tell these apart?". That
 * is a property of the palette as designed, measured with no simulation in it, so it
 * cannot depend on which condition is being simulated or on how crowded the group is.
 * Lowering it for achromatopsia would count pairs that were never distinct as collapses
 * the condition induced.
 *
 * Measured rather than asserted: dropping this half to 0.065 as well adds 996 pairs,
 * every one of them with `dn` in [0.065, 0.15) — e.g. ardesia `cat-1-fill^cat-3-fill`
 * at dn 0.0780, a pair of pale L≈87 fills a sighted reader already cannot separate by
 * hue. Those are exactly what the `analyzeGroup` docblock below excludes by design and
 * what `tools/contrast-audit.js` covers instead.
 */
const NORMAL_DISTINCT = COLLAPSE;

/**
 * The collapse floor for one condition, optionally for one GROUP within it. Called with
 * no label it returns the condition's default — which is what the banner prints, and what
 * the per-group overrides are stated relative to. Unknown names fall back to 0.15.
 */
function collapseFloor(type, groupLabel) {
  if (type === 'achromatopsia' && groupLabel && MONO_FLOOR_BY_GROUP[groupLabel] != null) {
    return MONO_FLOOR_BY_GROUP[groupLabel];
  }
  return COLLAPSE_BY_TYPE[type] ?? COLLAPSE;
}

/** The `label < floor` overrides in play for one condition, for the report header. */
function floorOverrides(type) {
  return Object.keys(MONO_FLOOR_BY_GROUP)
    .filter((label) => collapseFloor(type, label) !== collapseFloor(type))
    .map((label) => `${label} < ${collapseFloor(type, label)}`);
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
 * (ΔE < the floor for that condition AND group). Pairs that are already indistinct to
 * everyone (e.g. the pale L≈87 fills, whose distinction comes from
 * marks/labels/position, not fill hue) are NOT a CVD bug and are excluded —
 * tools/contrast-audit.js already covers normal distinctness.
 *
 * THE TWO HALVES TAKE DIFFERENT NUMBERS, on purpose. Both used to read the one
 * global `COLLAPSE`. The simulated half is now per-condition (`collapseFloor`)
 * because the reachable ΔE under a monochromacy is arithmetically smaller; the
 * normal-vision half stays at `NORMAL_DISTINCT` for every condition AND every group,
 * because it measures the palette, not the condition. See both docblocks above — the
 * per-GROUP half is what the first cut of this arm got wrong.
 *
 * Returns `{ count, minNormal, minCvd, induced: [...] }`, or null if fewer than
 * two tokens resolve to hex. NOTE `minCvd` is the group MINIMUM over every pair,
 * including pairs that are not induced collapses — the report prints it as the
 * group's headline number, so it is not the ΔE of any particular flagged pair.
 */
function analyzeGroup(hexByToken, tokens, type, groupLabel) {
  const present = tokens
    .map(t => ({ t, hex: hexByToken[t] }))
    .filter(({ hex }) => hex);
  if (present.length < 2) return null;

  const floor = collapseFloor(type, groupLabel);
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
  return { count: present.length, minNormal, minCvd, induced };
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
  !a.startsWith('-') && args[i - 1] !== '--type' && args[i - 1] !== '--themes-dir');

const allThemes = fs.readdirSync(THEMES_DIR)
  .filter(f => f.endsWith('.css'))
  .map(f => f.replace('.css', ''))
  .sort();
const themes = themeArgs.length ? themeArgs : allThemes;

let totalCollapsed = 0;
const uncovered = []; // requested themes that yielded no measurable tokens

console.log('');
console.log('  Lattice · Color-Vision-Deficiency Audit (Machado 2009)');
console.log('  ══════════════════════════════════════════════════════════════');
// The floor is per-condition now, so the banner cannot state one number. It prints
// each condition with the floor it is actually measured against — a report that
// silently applies a different threshold per row would be worse than the old one.
console.log(`  distinct to normal vision: OKLab ΔE >= ${NORMAL_DISTINCT}  (all conditions)`);
console.log(`  collapse under the condition: ${types.map((t) => {
  const ov = floorOverrides(t);
  return `${t} < ${collapseFloor(t)}${ov.length ? ` (${ov.join('; ')})` : ''}`;
}).join('  ·  ')}`);
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
      const r = analyzeGroup(hexByToken, tokens, type, label);
      if (!r) continue;
      measured++;
      totalCollapsed += r.induced.length;
      const flag = r.induced.length ? '✗' : '✓';
      // TWO DIFFERENT NUMBERS, and printing only the first is how a reader gets it
      // wrong. `minCvd` is the group MINIMUM over every pair — it can come from a pair
      // that is NOT an induced collapse (one already indistinct to normal vision), so
      // reading it as "the collapsed pair sits here" is a category error. concrete is
      // the live example: the group prints ΔE 0.000 from `pass^warn`, which is not
      // flagged, while the pair that IS flagged (`pass^fail`) sits at 0.004. So when
      // there are induced pairs, name the WORST INDUCED one too.
      const worstInduced = r.induced.length
        ? Math.min(...r.induced.map((p) => p.dc)) : null;
      // A group measured against a DIFFERENT floor than the condition header states says
      // so on its own line. A report that silently applied a different threshold per row
      // would be worse than the single-floor one it replaced.
      const own = collapseFloor(type, label);
      const marked = own !== collapseFloor(type) ? `  [floor ${own}]` : '';
      lines.push(
        `       ${flag} ${label.padEnd(18)} ΔE ${r.minCvd.toFixed(3)} (normal ${r.minNormal.toFixed(3)})` +
        (r.induced.length
          ? `  ${r.induced.length} collapsed by CVD, worst ${worstInduced.toFixed(3)}`
          : '') + marked,
      );
    }
    const ov = floorOverrides(type);
    console.log(`     ${type}  (collapse < ${collapseFloor(type)}${ov.length ? `; ${ov.join('; ')}` : ''})`);
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
