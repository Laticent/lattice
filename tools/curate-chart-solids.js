#!/usr/bin/env node
/**
 * Curate every theme's chart SOLIDS: one flat color per chart concept that text sits on at 7:1.
 *
 * WHAT A SOLID IS. A chart mark — a bar, a gantt task, a state tile, a pill, a key swatch — is painted with ONE
 * color per concept, flat, with no gradient and no mix: the theme's curated seed (`--chart-catN` for the eight
 * categories, the base's `--pass` `--warn` `--fail` `--info` `--mute` for status, `--chart-neutral` for a mark with
 * neither).
 * Text on any solid is ONE ink per mode, the base's `--on-solid`. Before this, every chart mixed its own fill from a hue
 * (about 250 local `color-mix()` recipes and ten gradients), so the same category was a different color on the
 * gantt, the tower and the state chart, and no ink was curated for any of them (engineering/chart-styling.md §3).
 *
 * THE RECIPE. Per theme and per mode: the on-solid ink is white where the canvas is light and the canvas itself
 * where it is dark, so every chart's text is the same color. Each seed keeps its hue and chroma, and only its
 * OKLCH lightness moves — away from the ink, by `ensureContrast` in lib/theme/color.js, the repo's one
 * lightness-march — until the ink clears 7:1 (AAA) on it. A seed that already clears it is left exactly as the
 * theme author curated it. Measured before the first run, over 18 palettes x 2 modes x 14 seeds: 180 of 504 already
 * cleared 7:1, the median shift was 0.03 OKLab lightness, and none was infeasible. The status trio is the exception:
 * its INKS are the theme's and are left alone, and its light-face FILLS are solved as a trio (THE STATUS FILLS below).
 *
 * CURATED, NOT GENERATED. This rewrites the seed literals in the theme file that OWNS them, once. It is not part of
 * `npm run build`: a value an author hand-tunes afterwards stays tuned. What holds every theme to the bar is the
 * palette gate, test/unit/palette/chart-solids.test.js, which checks the ink at 7:1 on every solid, every solid at
 * 3:1 off the canvas, and that no member paints a chart fill any other way.
 *
 * Usage:
 *   node tools/curate-chart-solids.js            # re-curate the seeds that fall short, add the two new seeds
 *   node tools/curate-chart-solids.js --report   # print what would change, write nothing
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr');
const { contrastRatio, ensureContrast, hexToOklch, oklchToHex, oklabDistance } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { simulate, SIMULATED_TYPES, ACHROMATOPSIA } = require('../lib/theme/cvd.js');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const FAMILY = path.join(ROOT, 'lib', 'plugins', 'chart-family', 'chart-family.styles.css');

/** The bar text on a solid is held to, with a margin so a later round-trip through hex cannot land under it. */
const TEXT_ON_SOLID = 7;
const MARGIN = 0.05;

const CATS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat${n}`);
// The status solids are the BASE's (base.tokens.css): every component that shows a status reads them.
// `--pass` `--warn` `--fail` are the theme's status INKS and are not solved here; their light-face FILLS are (below).
// `--info` and `--mute` serve as both ink and fill.
const STATES = ['info', 'mute'];
const NEUTRAL = 'chart-neutral';
const ON_SOLID = 'on-solid';

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

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

/**
 * The chart family names each seed's ENGINE default inside its consumer (`--chart-cat-1-hue: var(--chart-cat1,
 * light-dark(...))`); a theme that declares no seed paints that default. Read it from there rather than repeat it.
 */
function familyDefault(seed) {
  const css = stripComments(fs.readFileSync(FAMILY, 'utf8'));
  const m = css.match(new RegExp(`var\\(--${seed},\\s*(light-dark\\([^;]*?\\))\\)\\s*;`));
  return m ? m[1] : null;
}

/** The ink for text on a solid, in one mode: white on a light canvas, the canvas itself on a dark one. */
function inkFor(bg) {
  return hexToOklch(bg).L >= 0.5 ? '#FFFFFF' : bg.toUpperCase();
}

/**
 * Solve one arm: `ink` on the solid at 7:1, plus any `surfaces` the solid must clear AS TEXT (4.5:1). A status solid
 * is also the status ink every other component paints on the slide (a KPI pill, a redline mark), so it carries both:
 * on concrete's mid-gray canvas a solid at 7:1 under white read only 3.3:1 as text on the slide. Every move is in one
 * direction (away from the ink, which is also away from the canvas), so meeting one bar never undoes another. The
 * component surfaces themselves (a status on its own tint) are measured by tools/composed-contrast.js, not modeled here.
 */
function solveArm(seed, ink, surfaces = []) {
  const target = TEXT_ON_SOLID + MARGIN;
  const dir = ink === '#FFFFFF' ? 'darken' : 'lighten';
  let out = seed;
  out = ensureContrast(out, ink, target, dir);
  for (const s of surfaces) out = ensureContrast(out, s, 4.5 + MARGIN, dir);
  if (contrastRatio(out, ink) < target) throw new Error(`cannot reach ${target}:1 for ${seed} against ${ink}`);
  for (const s of surfaces) if (contrastRatio(out, s) < 4.5) throw new Error(`cannot reach 4.5:1 for ${seed} as text on ${s}`);
  return out.toUpperCase();
}

/**
 * THE STATUS FILLS (base.tokens.css § STATUS, IN TWO JOBS). `--pass` `--warn` `--fail` are the status as INK on the
 * slide, curated by the theme and not touched here. On the light face a fill cannot be that ink: 7:1 under white needs
 * a deep fill, an amber that deep is brown, and three fills packed into the narrow band under white collapse for a
 * colorblind reader (the first pass here pushed them apart by lightness alone and turned red black and green white).
 * So the light-face fills are solved as their own trio: green and red deep under white, amber light under its own dark
 * ink (`--on-warn`), each at 7:1, apart under every condition test/unit/palette/cvd-trio-floor.test.js simulates, and
 * otherwise as close as the search can get to the theme's own hue at a vivid lightness. On the dark face a fill is the
 * status ink itself (`var(--X)`), at 4.5:1 under the dark canvas as ink.
 */
const TRIO = ['pass', 'warn', 'fail'];
const FILL = (s) => `${s}-solid`;
const ON_WARN = 'on-warn';
const cvdFloor = (type) => (type === ACHROMATOPSIA ? 0.11 : 0.15);
/** A small margin over the floor, so a hex round-trip cannot land under it. */
const FLOOR_MARGIN = 1.02;
/** Where a fill aims: the theme's hue at a vivid lightness and chroma (a forest green, a true amber, an oxblood). */
const AIM = { pass: { L: 0.46, C: 0.13 }, warn: { L: 0.78, C: 0.15 }, fail: { L: 0.44, C: 0.17 } };
/** The search keeps each member's nearest candidates to its aim; 400 finds a passing trio on every shipped palette. */
const KEEP = 400;
const NEAR_BLACK = '#1A1A1A';

/** The worst pair distance over every simulated condition, as a multiple of that condition's floor. */
function floorMultiple(a, b) {
  let worst = Infinity;
  for (const type of SIMULATED_TYPES) worst = Math.min(worst, oklabDistance(simulate(a, type), simulate(b, type)) / cvdFloor(type));
  return worst;
}

/** The amber's ink: the theme's own light-face heading if it clears 7:1 on the fill, else a neutral near-black. */
function warnInk(fill, heading) {
  return isHex(heading) && contrastRatio(fill, heading) >= TEXT_ON_SOLID + MARGIN ? heading.toUpperCase() : NEAR_BLACK;
}

/** Solve the three light-face fills from the hues of the theme's own status inks. */
function solveFills(hue) {
  const target = TEXT_ON_SOLID + MARGIN;
  const candidates = (s) => {
    const aim = oklchToHex({ L: AIM[s].L, C: AIM[s].C, h: hue[s] });
    const out = [];
    for (let L = 0.26; L <= 0.95; L += 0.01) {
      for (let C = 0.04; C <= 0.2; C += 0.02) {
        const x = oklchToHex({ L, C, h: hue[s] });
        if (Math.abs(hexToOklch(x).C - C) > 0.015) continue; // out of gamut: the hex is not the color asked for
        const ok = s === 'warn' ? contrastRatio(x, NEAR_BLACK) >= target : contrastRatio(x, '#FFFFFF') >= target;
        if (ok) out.push([x.toUpperCase(), oklabDistance(x, aim)]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]).slice(0, KEEP);
  };
  const P = candidates('pass');
  const W = candidates('warn');
  const F = candidates('fail');
  let best = null;
  for (const [p, dp] of P) {
    for (const [f, df] of F) {
      if (best && dp + df >= best.cost) continue;
      const pf = floorMultiple(p, f);
      if (pf < FLOOR_MARGIN) continue;
      for (const [w, dw] of W) {
        const cost = dp + dw + df;
        if (best && cost >= best.cost) break;
        if (Math.min(pf, floorMultiple(p, w), floorMultiple(w, f)) >= FLOOR_MARGIN) { best = { cost, pass: p, warn: w, fail: f }; break; }
      }
    }
  }
  if (!best) throw new Error('no status-fill trio clears the colorblind floors at 7:1');
  return best;
}

/**
 * Solve one theme's solids from its own chain. Returns { seed: 'light-dark(#L, #D)' } and, per seed, whether the
 * theme's own value already clears the bar in both modes (`kept`): such a seed is left exactly as written, so a
 * status seed linked to the theme's `--pass` stays linked.
 */
function solveTheme(theme) {
  const raw = declaredVars(theme);
  const ownFile = stripComments(fs.readFileSync(path.join(THEMES_DIR, theme, `${theme}.css`), 'utf8'));
  const ownsTrio = /--pass\s*:/.test(ownFile);
  const arms = {};
  const kept = {};
  for (const dark of [false, true]) {
    const key = dark ? 'dark' : 'light';
    const R = (expr) => resolveTokenExpr(expr, raw, dark);
    const bg = R(raw.bg);
    if (!isHex(bg)) throw new Error(`${theme}: --bg did not resolve (${key})`);
    const ink = inkFor(bg);
    (arms[ON_SOLID] ??= {})[key] = ink;
    const bgAlt = R(raw['bg-alt']);
    for (const seed of [...CATS, ...STATES]) {
      const expr = raw[seed] ?? familyDefault(seed);
      const v = expr && R(expr);
      if (!isHex(v)) throw new Error(`${theme}: --${seed} did not resolve (${key})`);
      const solved = solveArm(v, ink, STATES.includes(seed) ? [bg, bgAlt].filter(isHex) : []);
      (arms[seed] ??= {})[key] = solved;
      kept[seed] = (kept[seed] ?? true) && solved === v.toUpperCase();
    }
    const muted = R(raw['muted-mark'] ?? 'var(--text-muted)');
    if (!isHex(muted)) throw new Error(`${theme}: --muted-mark did not resolve (${key})`);
    (arms[NEUTRAL] ??= {})[key] = solveArm(muted, ink);
  }
  const out = {};
  for (const [seed, a] of Object.entries(arms)) out[seed] = `light-dark(${a.light}, ${a.dark})`;
  // The status FILLS, in both intensities, for a theme that owns its trio (one that inherits it wears its owner's).
  // A theme that already declares the full set keeps it exactly as written: the gates hold it, and a hand-tuned fill
  // stays tuned.
  if (ownsTrio) {
    const declared = FILL_SEEDS.every((seed) => new RegExp(`--${seed}\\s*:`).test(ownFile));
    for (const [seed, value] of Object.entries(solveStatusFills(theme, raw))) {
      out[seed] = value;
      kept[seed] = declared;
    }
  }
  return { solved: out, kept };
}

/** Every fill seed a trio-owning theme declares. */
const FILL_SEEDS = [...TRIO.map(FILL), ON_WARN, ...TRIO.map((t) => `${FILL(t)}-vivid`), `${ON_WARN}-vivid`];

/**
 * The dark-face fills for one intensity: each status's hue at the intensity's aim, the closest candidate that clears
 * 4.5:1 under the dark canvas as ink and as text on the canvas, with the three apart to normal vision. A brand theme's
 * dark fills are not held to the colorblind floors (the a11y palettes carry those, the owner's call); they are held to
 * their recorded separation by cvd-trio-floor.test.js.
 */
const DARK_AIM = {
  muted: { pass: { L: 0.74, C: 0.10 }, warn: { L: 0.78, C: 0.11 }, fail: { L: 0.68, C: 0.12 } },
  vivid: { pass: { L: 0.77, C: 0.19 }, warn: { L: 0.79, C: 0.17 }, fail: { L: 0.68, C: 0.20 } },
};
const DARK_SEPARATION = 0.10;
function solveDarkFills(hue, ink, surfaces, aim) {
  const candidates = (s) => {
    const target = oklchToHex({ L: aim[s].L, C: aim[s].C, h: hue[s] });
    const out = [];
    for (let L = 0.55; L <= 0.95; L += 0.01) {
      for (let C = 0.04; C <= 0.24; C += 0.02) {
        const x = oklchToHex({ L, C, h: hue[s] });
        if (Math.abs(hexToOklch(x).C - C) > 0.015) continue;
        if (contrastRatio(x, ink) < 4.55 || surfaces.some((sf) => contrastRatio(x, sf) < 4.55)) continue;
        out.push([x.toUpperCase(), oklabDistance(x, target)]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]).slice(0, 200);
  };
  const P = candidates('pass'); const W = candidates('warn'); const F = candidates('fail');
  let best = null;
  for (const [p, dp] of P) {
    for (const [f, df] of F) {
      if ((best && dp + df >= best.cost) || oklabDistance(p, f) < DARK_SEPARATION) continue;
      for (const [w, dw] of W) {
        const cost = dp + dw + df;
        if (best && cost >= best.cost) break;
        if (oklabDistance(p, w) >= DARK_SEPARATION && oklabDistance(w, f) >= DARK_SEPARATION) { best = { cost, pass: p, warn: w, fail: f }; break; }
      }
    }
  }
  if (!best) throw new Error('no dark status-fill trio clears 4.5:1 and stays apart');
  return best;
}

/**
 * The light-face MUTED fills: all three under one white ink at 7:1, nothing darker than 0.30 OKLCH lightness (below
 * that a red reads black), each at the theme's own hue and chroma, and the three as far apart for a colorblind reader
 * as that allows. On a light slide that is short of the floor for every brand theme; the a11y palettes carry it.
 */
const MUTED_FLOOR_L = 0.30;
function solveMutedLightFills(seeds) {
  const target = TEXT_ON_SOLID + MARGIN;
  const candidates = (s) => {
    const { C, h } = hexToOklch(seeds[s]);
    const out = [];
    for (let L = MUTED_FLOOR_L; L <= 0.6; L += 0.01) {
      const x = oklchToHex({ L, C: Math.max(C, 0.08), h });
      if (contrastRatio(x, '#FFFFFF') >= target) out.push(x.toUpperCase());
    }
    return out;
  };
  let best = null;
  for (const p of candidates('pass')) {
    for (const w of candidates('warn')) {
      for (const f of candidates('fail')) {
        const sep = Math.min(floorMultiple(p, w), floorMultiple(p, f), floorMultiple(w, f));
        if (!best || sep > best.sep) best = { sep, pass: p, warn: w, fail: f };
      }
    }
  }
  return best;
}

/**
 * The light-face VIVID fills: white text on all three, like muted (the owner's call), each hue at the most chroma
 * it reaches under white at 7:1. Amber is nudged toward orange (15 degrees, held to 45-60), because an amber at its
 * own hue that dark is brown, and a burnt orange still reads as caution.
 */
function solveVividLightFills(seeds) {
  const target = TEXT_ON_SOLID + MARGIN;
  const maxChroma = (h) => {
    let best = null;
    for (let L = 0.30; L <= 0.6; L += 0.005) {
      for (let C = 0.05; C <= 0.28; C += 0.005) {
        const x = oklchToHex({ L, C, h });
        if (Math.abs(hexToOklch(x).C - C) > 0.006 || contrastRatio(x, '#FFFFFF') < target) continue;
        if (!best || C > best.C + 1e-9 || (Math.abs(C - best.C) < 1e-9 && L > best.L)) best = { L, C, hex: x.toUpperCase() };
      }
    }
    return best.hex;
  };
  const hue = (s) => hexToOklch(seeds[s]).h;
  return { pass: maxChroma(hue('pass')), warn: maxChroma(Math.min(60, Math.max(45, hue('warn') - 15))), fail: maxChroma(hue('fail')) };
}

/** Both intensities' fills for a trio-owning theme, as the declarations it writes. */
function solveStatusFills(theme, raw) {
  const R = (expr, dark) => resolveTokenExpr(expr, raw, dark);
  const seedsLight = Object.fromEntries(TRIO.map((t) => [t, R(raw[t], false)]));
  const hueLight = Object.fromEntries(TRIO.map((t) => [t, hexToOklch(seedsLight[t]).h]));
  const vividLight = solveFills(hueLight);
  const vividInk = warnInk(vividLight.warn, R(raw['text-heading'], false));
  const out = {};
  if (theme.startsWith('a11y-')) {
    // A colorblind palette keeps ONE set, the one that clears every floor, in both intensities.
    for (const t of TRIO) {
      out[FILL(t)] = `light-dark(${vividLight[t]}, var(--${t}))`;
      out[`${FILL(t)}-vivid`] = `var(--${FILL(t)})`;
    }
    out[ON_WARN] = `light-dark(${vividInk}, var(--on-solid))`;
    out[`${ON_WARN}-vivid`] = `var(--${ON_WARN})`;
    return out;
  }
  const mutedLight = solveMutedLightFills(seedsLight);
  const vividWhite = solveVividLightFills(seedsLight);
  const bg = R(raw.bg, true); const bgAlt = R(raw['bg-alt'], true);
  const ink = inkFor(bg);
  const hueDark = Object.fromEntries(TRIO.map((t) => [t, hexToOklch(R(raw[t], true)).h]));
  const surfaces = [bg, bgAlt].filter(isHex);
  const mutedDark = solveDarkFills(hueDark, ink, surfaces, DARK_AIM.muted);
  const vividDark = solveDarkFills(hueDark, ink, surfaces, DARK_AIM.vivid);
  for (const t of TRIO) {
    out[FILL(t)] = `light-dark(${mutedLight[t]}, ${mutedDark[t]})`;
    out[`${FILL(t)}-vivid`] = `light-dark(${vividWhite[t]}, ${vividDark[t]})`;
  }
  out[ON_WARN] = 'light-dark(#FFFFFF, var(--on-solid))';
  out[`${ON_WARN}-vivid`] = 'light-dark(#FFFFFF, var(--on-solid))';
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
    const { solved, kept } = solveTheme(theme);
    let css = before;
    const mine = (seed) => new RegExp(`--${seed}\\s*:`).test(own);
    // A theme rewrites the seeds it already owns, and adds the two new ones after the last chart seed it owns.
    const owned = [...CATS, ...STATES].filter(mine);
    const seeds = [...owned, NEUTRAL, ON_SOLID, ...(solved[FILL('pass')] ? FILL_SEEDS : [])];
    const anchor = `--${owned[owned.length - 1]}`;
    for (const seed of seeds) {
      const current = (own.match(new RegExp(`--${seed}\\s*:\\s*([^;]+);`)) || [])[1]?.trim();
      total += 1;
      if (current === solved[seed] || (current && kept[seed])) continue;
      changed += 1;
      if (report) console.log(`${theme.padEnd(20)} --${seed.padEnd(18)} ${current ?? '(new)'}  ->  ${solved[seed]}`);
      else css = writeSeed(css, seed, solved[seed], anchor);
    }
    if (!report && css !== before) fs.writeFileSync(file, css);
  }
  console.log(`curate-chart-solids: ${owners.length} palettes, ${changed} of ${total} seeds ${report ? 'would change' : 'written'}`);
}

if (require.main === module) main();

module.exports = { solveTheme, solveFills, solveMutedLightFills, solveVividLightFills, solveDarkFills, solveStatusFills, inkFor, TEXT_ON_SOLID, CATS, STATES, NEUTRAL, ON_SOLID };
