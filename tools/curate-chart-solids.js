#!/usr/bin/env node
/**
 * Curate every theme's chart SOLIDS: one flat color per chart concept, and the ink that reads on it.
 *
 * ONE INK. Every chart fill carries WHITE text (`--on-solid`, and `--on-status` on a status), so two charts side by side
 * never wear two text colors (engineering/chart-styling.md §3):
 *
 *   - a CATEGORY (`--chart-catN`) or the neutral (`--chart-neutral`) is a DEEP fill: 7:1 under white on the light face;
 *     on the dark face a mid-tone that white still clears at 4.6:1 and that stands off the dark slide.
 *   - a STATUS (`--pass-solid` … `--mute-solid`) is deep too, in its own hue at its own chroma: done a quiet sage, at
 *     risk a burnt orange, blocked a crimson, info a deep cyan-blue, deferred a deep gray, in two intensities
 *     (`chart-finish: pigment muted|vivid`; vivid makes done an emerald).
 *
 * A status that shares a category's hue is told apart by what the chart family adds to it, not by its fill: every
 * status carries its drawn MARK (lib/core/status-marks.js), and the two exceptions, at risk and blocked, carry a
 * SIGNAL ring (`--warn-solid-signal`, `--fail-solid-signal`): the bright amber and coral-red, 3:1 off their fill. Each
 * status also has an EDGE (`--X-solid-edge`): its own hue at 4.6:1 off the slide, for a status drawn as a line or text.
 *
 * Each move keeps a seed's hue and moves lightness (and chroma, only down, when a hue leaves the sRGB gamut). The
 * category and neutral hues are the theme's own; the status hues are the theme's own status inks (`--pass` …), with
 * each held to its band (lib/theme/chart-solids.js `HUE_BAND`; cyan is reserved for info). The a11y palettes share one
 * design: on the dark face every chart fill is BRIGHT under a near-black ink (still one ink per slide), and they solve
 * their status fills as a trio that clears every colorblind floor (test/unit/palette/cvd-trio-floor.test.js).
 *
 * CURATED, NOT GENERATED. This rewrites the seed literals in the theme file that OWNS them. It is not part of
 * `npm run build`; the palette gates (test/unit/palette/chart-solids.test.js, chart-one-ink.test.js) hold every
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

/** The solvers and their bars are shared with the Studio's generator (lib/theme/chart-solids.js). */
const { deepFill, midFill, brightFill, solveStatusSet, DARK_INK, TEXT_ON_SOLID, CAT_DARK } = require('../lib/theme/chart-solids.js');

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
const SIGNAL_OF = (s) => `${s}-solid-signal`;
const STATUS_SEEDS = [ON_STATUS, ...STATES.map(FILL), ...['pass', 'warn', 'fail', 'info'].map(VIVID), ...STATES.map(EDGE_OF), ...['warn', 'fail'].map(SIGNAL_OF)];
/** Retired: amber is no longer the one status with its own ink. */
const RETIRED = ['on-warn', 'on-warn-vivid'];

/**
 * THE THEME'S CHARACTER, so a status set is on brand rather than one set for every palette. Two measurements of the
 * theme's own palette:
 *   - STRENGTH: its categories' mean light-face chroma against a typical 0.11, held to 0.75-1.2. A quiet palette
 *     (ardesia, onyx) gets calmer status fills, a saturated one (carbone, indaco) richer ones.
 *   - WARMTH: pass and fail lean 20% of the way toward the theme's accent hue, at most 18 degrees, so a leather
 *     palette's green is olive-sage and a frost palette's red is a cool rose. Warn does not lean, and an achromatic
 *     accent (chroma under 0.05) leans nothing. Each hue is then held to its band (`HUE_BAND`).
 */
const TYPICAL_CHROMA = 0.11;
const STRENGTH = [0.75, 1.2];
const LEAN = 0.2;
const LEAN_MAX = 18;
function lean(h, toward) {
  const d = ((toward - h + 540) % 360) - 180;
  return (h + Math.max(-LEAN_MAX, Math.min(LEAN_MAX, d * LEAN)) + 360) % 360;
}
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
/**
 * THE COLORBLIND TRIO (the a11y palettes only): pass, warn and fail, each deep under white at `min` and 3:1 off the
 * slide (`surfaces`: a fill stands off the slide by itself, chart-solids.test.js), as far apart under the palette's own condition as its floor
 * asks, and each as close to the scheme's own fill (`aim`) as that allows.
 */
function solveCvdTrio(hue, aim, min, type, surfaces, ink = WHITE) {
  if (!SIMULATED_TYPES.includes(type)) throw new Error(`unknown condition ${type}`);
  const candidates = (s) => {
    const out = [];
    for (let L = 0.2; L <= 0.99; L += 0.01) {
      for (let C = 0; C <= 0.24; C += 0.02) {
        const x = oklchToHex({ L, C, h: hue[s] });
        if (C > 0.012 && !inGamut(x, C)) continue;
        if (contrastRatio(x, ink) >= min && surfaces.every((bg) => contrastRatio(x, bg) >= 3.05)) out.push([x.toUpperCase(), oklabDistance(x, aim[s])]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]);
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
  if (!best) throw new Error(`no status trio clears the ${type} floor at ${min}:1 under ${ink}`);
  return best;
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

  // Categories and the neutral: deep under white on the light face, the matching mid-tone on the dark face. A colorblind
  // palette's dark face is BRIGHT under the near-black ink (lib/theme/chart-solids.js `DARK_INK`): its own hue at 7:1,
  // and a gray mirrored in lightness, so a monochrome palette's grays keep their spacing.
  const a11y = theme.startsWith('a11y-');
  const brightFace = (light) => {
    const { h, C, L } = hexToOklch(light);
    if (C >= 0.02) return brightFill(h, C, DARK_INK, TEXT_ON_SOLID);
    const floor = hexToOklch(brightFill(h, C, DARK_INK, TEXT_ON_SOLID)).L;
    return oklchToHex({ L: Math.min(0.97, Math.max(floor, 1.12 - L)), C, h }).toUpperCase();
  };
  for (const seed of [...CATS.filter(owns), NEUTRAL]) {
    const light = deepFill(arm(seed, false));
    out[seed] = `light-dark(${light}, ${a11y ? brightFace(light) : midFill(light, CAT_DARK)})`;
  }
  out[ON_SOLID] = a11y ? `light-dark(${WHITE}, ${DARK_INK})` : WHITE;

  // Status: only a theme that owns its trio declares fills; one that inherits wears its owner's. One ink: the status
  // fills carry the same ink as the categories, so `--on-status` is `--on-solid`; it stays a token so a palette can
  // still differ. A colorblind palette always declares its set, `a11y-base` included: it turns the dark face around
  // (bright fills under a near-black ink), so the brand set it would inherit from its parent would carry the wrong ink.
  if (owns('pass') || a11y) {
    const face = (dark) => [R(raw.bg, dark), R(raw['bg-alt'], dark)].filter(isHex);
    out[ON_STATUS] = out[ON_SOLID];
    const hue = Object.fromEntries(['pass', 'warn', 'fail', 'info', 'mute'].map((s) => [s, hexToOklch(arm(s, false)).h]));
    const accent = R(raw.accent, false);
    if (!a11y && isHex(accent) && hexToOklch(accent).C >= 0.05) for (const s of ['pass', 'fail']) hue[s] = lean(hue[s], hexToOklch(accent).h);
    const meanC = CATS.slice(0, 6).reduce((sum, seed) => sum + hexToOklch(arm(seed, false)).C, 0) / 6;
    const strength = a11y ? 1 : Math.min(STRENGTH[1], Math.max(STRENGTH[0], meanC / TYPICAL_CHROMA));
    const darkInk = a11y ? DARK_INK : WHITE;
    let set = solveStatusSet({ hue, strength, light: face(false), dark: face(true), darkInk });
    if (a11y && theme !== 'a11y-base') {
      // A colorblind palette solves its trio against its own condition, near the scheme's own fills, on each face; the
      // trio's hues are its own (a colorblind palette picks hues for its condition, not for a band). One set serves
      // both intensities.
      const type = theme.slice('a11y-'.length);
      const trio = [false, true].map((dark) => solveCvdTrio(hue, Object.fromEntries(TRIO.map((s) => [s, set[FILL(s)][dark ? 1 : 0]])), TEXT_ON_SOLID, type, [R(raw.bg, dark)], dark ? darkInk : WHITE));
      const override = Object.fromEntries(TRIO.map((s) => [s, [trio[0][s], trio[1][s]]]));
      set = solveStatusSet({ hue, strength, light: face(false), dark: face(true), override, darkInk });
    }
    for (const [token, [l, d]] of Object.entries(set)) out[token] = `light-dark(${l}, ${d})`;
    if (a11y) for (const s of ['pass', 'warn', 'fail', 'info']) out[VIVID(s)] = `var(--${FILL(s)})`;
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
    let statusAnchor = mine('fail-solid-vivid') ? '--fail-solid-vivid:' : mine('fail-solid') ? '--fail-solid:' : '--on-solid:';
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

module.exports = { solveTheme, solveCvdTrio, CATS, STATES, NEUTRAL, ON_SOLID, ON_STATUS, STATUS_SEEDS };
