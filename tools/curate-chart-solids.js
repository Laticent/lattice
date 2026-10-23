#!/usr/bin/env node
/**
 * Curate every theme's chart SOLIDS: one flat color per chart concept, and the ink that reads on it.
 *
 * TEXT COLOR CARRIES THE KIND. A chart paints two kinds of color, and the text on a fill says which one the reader is
 * looking at (engineering/chart-styling.md §3, "Polarity"):
 *
 *   - a CATEGORY (`--chart-catN`) or the neutral (`--chart-neutral`) is a DEEP fill under WHITE text (`--on-solid`):
 *     7:1 on the light face; on the dark face a mid-tone that white still clears at 4.6:1 and that stands off the
 *     dark slide.
 *   - a STATUS (`--pass-solid` … `--mute-solid`) is a BRIGHT fill under near-black text (`--on-status`): 7:1 on the
 *     light face, 9:1 on the dark face, in two intensities (`chart-finish: pigment muted|vivid`). The same hue may
 *     appear as a category and as a status; the polarity keeps them apart.
 *
 * A bright status fill sits under 3:1 on a light slide, so each status also has an EDGE (`--X-solid-edge`): its own
 * hue, deep enough to clear 4.6:1 off both slide surfaces. The chart family draws it round every status shape on the
 * light face and uses it wherever a status is a line or text (a slope, a waterfall step, a kanban header). On the dark
 * face the edge is the muted fill itself.
 *
 * Each move keeps a seed's hue and moves lightness (and chroma, only down, when a hue leaves the sRGB gamut). The
 * category and neutral hues are the theme's own; the status hues are the theme's own status inks (`--pass` …), with
 * info held in the cyan band (the owner's call: cyan is reserved for info). The a11y palettes solve their status fills
 * as a trio that clears every colorblind floor (test/unit/palette/cvd-trio-floor.test.js).
 *
 * CURATED, NOT GENERATED. This rewrites the seed literals in the theme file that OWNS them. It is not part of
 * `npm run build`; the palette gates (test/unit/palette/chart-solids.test.js, chart-polarity.test.js) hold every
 * theme to the bar, so a value an author hand-tunes afterwards stays tuned as long as it clears them. After a run,
 * regenerate the category inks with `node tools/derive-chart-cat-ink.js`.
 *
 * Usage:
 *   node tools/curate-chart-solids.js            # write every solid
 *   node tools/curate-chart-solids.js --report   # print what would change, write nothing
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr');
const { contrastRatio, hexToOklch, oklchToHex, oklabDistance } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { simulate, SIMULATED_TYPES, ACHROMATOPSIA } = require('../lib/theme/cvd.js');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const FAMILY = path.join(ROOT, 'lib', 'plugins', 'chart-family', 'chart-family.styles.css');

/** The solvers and their bars are shared with the Studio's generator (lib/theme/polarity.js). */
const A11Y_CAT_DARK = 5.5;
const { deepFill, midFill, brightFill, edgeFor, STATUS_BAR, TEXT_ON_SOLID, CAT_DARK, STATUS_DARK } = require('../lib/theme/polarity.js');

const CATS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat${n}`);
const NEUTRAL = 'chart-neutral';
const ON_SOLID = 'on-solid';
const ON_STATUS = 'on-status';
const TRIO = ['pass', 'warn', 'fail'];
const STATES = [...TRIO, 'info', 'mute'];
const FILL = (s) => `${s}-solid`;
const VIVID = (s) => `${s}-solid-vivid`;
const EDGE_OF = (s) => `${s}-solid-edge`;
/** Every status seed a trio-owning theme declares. `--mute-solid` has no vivid: a neutral has no intensity. */
const STATUS_SEEDS = [ON_STATUS, ...STATES.map(FILL), ...['pass', 'warn', 'fail', 'info'].map(VIVID), ...STATES.map(EDGE_OF)];
/** Retired by the polarity scheme: amber is no longer the one status with its own ink. */
const RETIRED = ['on-warn', 'on-warn-vivid'];

/**
 * Chroma per intensity, for a palette of average saturation. Muted is calm enough for a deck of status charts; vivid
 * is rich and stops short of neon. Each theme scales both by its own CHARACTER (below).
 */
const CHROMA = { muted: { light: 0.10, dark: 0.12 }, vivid: { light: 0.16, dark: 0.16 } };
/**
 * THE THEME'S CHARACTER, so a status set is on brand rather than one set for every palette. Two measurements of the
 * theme's own palette:
 *   - STRENGTH: its categories' mean light-face chroma against a typical 0.11, held to 0.6-1.2. A quiet palette
 *     (ardesia, onyx) gets calmer status fills, never so calm that amber stops reading as a warning,; a saturated one (carbone, indaco) richer ones.
 *   - WARMTH: pass and fail lean 20% of the way toward the theme's accent hue, at most 18 degrees, so a leather
 *     palette's green is olive-sage and a frost palette's red is a cool rose. Amber does not lean (toward a blue accent
 *     it turns olive, and an amber that is not amber is not a warning), info stays in its band, and an achromatic
 *     accent (chroma under 0.05) leans nothing.
 */
const TYPICAL_CHROMA = 0.11;
const STRENGTH = [0.75, 1.2];
const LEAN = 0.2;
const LEAN_MAX = 18;
const PASS_BAND = [120, 165];
function lean(h, toward) {
  const d = ((toward - h + 540) % 360) - 180;
  return (h + Math.max(-LEAN_MAX, Math.min(LEAN_MAX, d * LEAN)) + 360) % 360;
}
/** Info lives in the cyan band, so it never reads as a category blue or a pass green. */
const INFO_HUE = [200, 235];
const NEAR_BLACK = '#1A1A1A';
const WHITE = '#FFFFFF';

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
const inGamut = (x, C) => Math.abs(hexToOklch(x).C - C) <= 0.012;

/** Every declaration in the engine base, the chart family's defaults, and the theme's chain, in cascade order. */
function declaredVars(theme) {
  const files = [
    path.join(ROOT, 'lib', 'base', 'base.tokens.css'),
    FAMILY,
    ...themeChain(theme, THEME_EDGES).map((n) => path.join(THEMES_DIR, n, `${n}.css`)),
  ].filter((f) => fs.existsSync(f));
  const vars = {};
  for (const css of files.map((f) => fs.readFileSync(f, 'utf8'))) {
    for (const m of stripComments(css).matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

/** The chart family names each category seed's ENGINE default inside its consumer; a theme with no seed paints it. */
function familyDefault(seed) {
  const css = stripComments(fs.readFileSync(FAMILY, 'utf8'));
  const m = css.match(new RegExp(`var\\(--${seed},\\s*(light-dark\\([^;]*?\\))\\)\\s*;`));
  return m ? m[1] : null;
}





/** The ink on a status fill: the theme's own light-face heading where it is near-black, else a neutral near-black. */
function statusInk(heading) {
  return isHex(heading) && hexToOklch(heading).L <= 0.3 && hexToOklch(heading).L >= hexToOklch(NEAR_BLACK).L - 0.02
    ? heading.toUpperCase()
    : NEAR_BLACK;
}

/**
 * THE COLORBLIND TRIO (the a11y palettes only). The three status fills, bright under the ink, as far apart under the
 * palette's OWN condition as its floor asks (the gate's rule, cvd-trio-floor.test.js), each as close to its own hue as that allows.
 */
const cvdFloor = (type) => (type === ACHROMATOPSIA ? 0.11 : 0.15);
const FLOOR_MARGIN = 1.02;
/** The pair distance under the palette's OWN condition, as a multiple of that condition's floor. */
function floorMultiple(a, b, type) {
  return oklabDistance(simulate(a, type), simulate(b, type)) / cvdFloor(type);
}
function solveCvdTrio(hue, ink, min, type) {
  if (!SIMULATED_TYPES.includes(type)) throw new Error(`unknown condition ${type}`);
  const candidates = (s) => {
    const aim = brightFill(hue[s], 0.12, ink, min);
    const out = [];
    for (let L = 0.6; L <= 0.99; L += 0.01) {
      for (let C = 0; C <= 0.24; C += 0.02) {
        const x = oklchToHex({ L, C, h: hue[s] });
        if (C > 0.012 && !inGamut(x, C)) continue;
        if (contrastRatio(x, ink) >= min) out.push([x.toUpperCase(), oklabDistance(x, aim)]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]).slice(0, 600);
  };
  const P = candidates('pass'); const W = candidates('warn'); const F = candidates('fail');
  let best = null;
  for (const [p, dp] of P) {
    for (const [f, df] of F) {
      if (best && dp + df >= best.cost) continue;
      const pf = floorMultiple(p, f, type);
      if (pf < FLOOR_MARGIN) continue;
      for (const [w, dw] of W) {
        const cost = dp + dw + df;
        if (best && cost >= best.cost) break;
        if (Math.min(pf, floorMultiple(p, w, type), floorMultiple(w, f, type)) >= FLOOR_MARGIN) { best = { cost, pass: p, warn: w, fail: f }; break; }
      }
    }
  }
  if (!best) throw new Error(`no bright status trio clears the colorblind floors at ${min}:1`);
  return best;
}

/** The colorblind trio at the first bar in `bars` (highest first) that admits one. */
function solveCvdTrioStepping(hue, ink, bars, type) {
  for (const [i, bar] of bars.entries()) {
    try { return solveCvdTrio(hue, ink, bar, type); } catch (err) { if (i === bars.length - 1) throw err; }
  }
  return null;
}

/** Solve one theme's solids from its own chain. Returns { seed: value } for every seed the theme should declare. */
function solveTheme(theme) {
  const raw = declaredVars(theme);
  const own = stripComments(fs.readFileSync(path.join(THEMES_DIR, theme, `${theme}.css`), 'utf8'));
  const owns = (seed) => new RegExp(`--${seed}\\s*:`).test(own);
  const R = (expr, dark) => resolveTokenExpr(expr, raw, dark);
  const out = {};
  const arm = (seed, dark) => {
    const expr = raw[seed] ?? familyDefault(seed);
    const v = expr && R(expr, dark);
    if (!isHex(v)) throw new Error(`${theme}: --${seed} did not resolve (${dark ? 'dark' : 'light'})`);
    return v;
  };

  // Categories and the neutral: deep under white on the light face, the matching mid-tone on the dark face. A
  // colorblind palette's dark trio cannot reach 9:1 and still clear its floor (achromatopsia needs 0.22 of lightness
  // range), so its dark categories sit one step deeper instead, keeping the two kinds 2:1 apart; on its near-black
  // slide they still stand off by more than 3:1.
  const catDark = theme.startsWith('a11y-') ? A11Y_CAT_DARK : CAT_DARK;
  for (const seed of [...CATS.filter(owns), NEUTRAL]) {
    const light = deepFill(arm(seed, false));
    out[seed] = `light-dark(${light}, ${midFill(light, catDark)})`;
  }
  out[ON_SOLID] = WHITE;

  // Status: only a theme that owns its trio declares fills; one that inherits wears its owner's.
  if (owns('pass')) {
    const surfaces = [R(raw.bg, false), R(raw['bg-alt'], false)].filter(isHex);
    const ink = statusInk(R(raw['text-heading'], false));
    out[ON_STATUS] = ink;
    const hue = Object.fromEntries(['pass', 'warn', 'fail', 'info', 'mute'].map((s) => [s, hexToOklch(arm(s, false)).h]));
    hue.info = Math.min(INFO_HUE[1], Math.max(INFO_HUE[0], hue.info));
    const accent = R(raw.accent, false);
    const a11yPalette = theme.startsWith('a11y-');
    if (!a11yPalette && isHex(accent) && hexToOklch(accent).C >= 0.05) for (const s of ['pass', 'fail']) hue[s] = lean(hue[s], hexToOklch(accent).h);
    // Pass stays GREEN after its lean: leaned into teal it crowds info, which owns the cyan band.
    if (!a11yPalette) hue.pass = Math.min(PASS_BAND[1], Math.max(PASS_BAND[0], hue.pass));
    const meanC = CATS.slice(0, 6).reduce((sum, seed) => sum + hexToOklch(arm(seed, false)).C, 0) / 6;
    const strength = a11yPalette ? 1 : Math.min(STRENGTH[1], Math.max(STRENGTH[0], meanC / TYPICAL_CHROMA));
    const a11y = theme.startsWith('a11y-');
    const fills = {};
    for (const intensity of ['muted', 'vivid']) {
      for (const dark of [false, true]) {
        const min = dark ? STATUS_DARK : TEXT_ON_SOLID;
        const C = CHROMA[intensity][dark ? 'dark' : 'light'] * strength;
        // A colorblind trio on the dark face aims for 9:1 like every palette, and steps down only as far as its floor
        // forces (achromatopsia needs 0.22 of lightness range, which 9:1 leaves no room for); its deeper dark
        // categories keep the two kinds 2:1 apart (chart-polarity.test.js).
        const set = a11y && intensity === 'muted' ? solveCvdTrioStepping(hue, ink, dark ? [STATUS_DARK, 8.5, 8, 7.5, TEXT_ON_SOLID] : [min], theme.slice('a11y-'.length)) : {};
        for (const s of ['pass', 'warn', 'fail', 'info']) {
          const arms = ((fills[intensity] ??= {})[s] ??= {});
          let fill = set[s] ?? brightFill(hue[s], C, ink, STATUS_BAR[s][dark ? 1 : 0]);
          // At the gamut's edge one fill can clear both faces' bars; the dark face then steps one notch brighter, so
          // the pair stays a pair (a theme never flattens a base light-dark() token, paired-token-parity.test.js).
          if (dark && fill === arms.light) fill = brightFill(hue[s], C, ink, contrastRatio(fill, ink) + 0.3);
          arms[dark ? 'dark' : 'light'] = fill;
        }
      }
    }
    const muteHue = hexToOklch(arm('mute', false));
    const mute = { light: brightFill(muteHue.h, 0.012, ink, TEXT_ON_SOLID), dark: brightFill(muteHue.h, 0.012, ink, STATUS_DARK) };
    for (const s of ['pass', 'warn', 'fail', 'info']) {
      const m = fills.muted[s];
      out[FILL(s)] = `light-dark(${m.light}, ${m.dark})`;
      // A colorblind palette keeps ONE set, the one that clears every floor, in both intensities.
      out[VIVID(s)] = a11y ? `var(--${FILL(s)})` : `light-dark(${fills.vivid[s].light}, ${fills.vivid[s].dark})`;
      out[EDGE_OF(s)] = `light-dark(${edgeFor(m.light, surfaces)}, ${m.dark})`;
    }
    out[FILL('mute')] = `light-dark(${mute.light}, ${mute.dark})`;
    out[EDGE_OF('mute')] = `light-dark(${edgeFor(mute.light, surfaces)}, ${mute.dark})`;
  }
  return out;
}

/** Replace `--seed: <value>;` in place, keeping any trailing comment; or append the declaration after `anchor`. */
function writeSeed(css, seed, value, anchor) {
  const re = new RegExp(`(\\n(\\s*)--${seed}\\s*:\\s*)([^;]+)(;)`);
  if (re.test(css)) return css.replace(re, (_, head, _ws, _old, semi) => `${head}${value}${semi}`);
  const at = css.indexOf(anchor);
  if (at === -1) throw new Error(`no anchor ${anchor} to add --${seed} after`);
  const lineEnd = css.indexOf('\n', at);
  return `${css.slice(0, lineEnd + 1)}  --${seed}: ${value};\n${css.slice(lineEnd + 1)}`;
}

/** Remove a retired `--seed: …;` declaration and its line. */
function dropSeed(css, seed) {
  return css.replace(new RegExp(`\\n[ \\t]*--${seed}\\s*:[^;]*;[^\\n]*`), '');
}

function main() {
  const report = process.argv.includes('--report');
  const owners = fs.readdirSync(THEMES_DIR).filter((d) => {
    const f = path.join(THEMES_DIR, d, `${d}.css`);
    return fs.existsSync(f) && /--(chart-cat1|pass)\s*:/.test(stripComments(fs.readFileSync(f, 'utf8')));
  }).sort();
  let changed = 0;
  let total = 0;
  for (const theme of owners) {
    const file = path.join(THEMES_DIR, theme, `${theme}.css`);
    const before = fs.readFileSync(file, 'utf8');
    const own = stripComments(before);
    const solved = solveTheme(theme);
    let css = before;
    const mine = (seed) => new RegExp(`--${seed}\\s*:`).test(own);
    // A new category or neutral seed lands after the last chart seed the theme owns; a new status seed after its fills.
    const lastCat = [...CATS].reverse().find(mine);
    let catAnchor = lastCat ? `--${lastCat}:` : null;
    let statusAnchor = mine('fail-solid-vivid') ? '--fail-solid-vivid:' : '--fail-solid:';
    for (const [seed, value] of Object.entries(solved)) {
      const current = (own.match(new RegExp(`--${seed}\\s*:\\s*([^;]+);`)) || [])[1]?.trim();
      total += 1;
      if (current === value) continue;
      changed += 1;
      if (report) { console.log(`${theme.padEnd(20)} --${seed.padEnd(18)} ${current ?? '(new)'}  ->  ${value}`); continue; }
      const isStatus = STATUS_SEEDS.includes(seed);
      css = writeSeed(css, seed, value, isStatus ? statusAnchor : (catAnchor ?? '--on-solid:'));
      // A new seed lands after the one written before it, so the block reads in the solver's order.
      if (!current && isStatus) statusAnchor = `--${seed}:`;
      else if (!current) catAnchor = `--${seed}:`;
    }
    for (const seed of RETIRED) if (mine(seed)) { changed += 1; total += 1; if (!report) css = dropSeed(css, seed); }
    if (!report && css !== before) fs.writeFileSync(file, css);
  }
  console.log(`curate-chart-solids: ${owners.length} palettes, ${changed} of ${total} seeds ${report ? 'would change' : 'written'}`);
}

if (require.main === module) main();

module.exports = { solveTheme, statusInk, solveCvdTrio, CATS, STATES, NEUTRAL, ON_SOLID, ON_STATUS, STATUS_SEEDS };
