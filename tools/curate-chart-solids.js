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
 * cleared 7:1, the median shift was 0.03 OKLab lightness, and none was infeasible.
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
const { contrastRatio, ensureContrast, hexToOklch, withLightness, oklabDistance } = require('../lib/theme/color.js');
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
const STATES = ['pass', 'warn', 'fail', 'info', 'mute'];
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
 * THE STATUS TRIO MUST STAY APART TO A COLORBLIND READER. Solving each status alone to 7:1 under one ink packs all three
 * into the same narrow lightness band (under white every light-mode solid sits at or below about 0.47 OKLCH lightness),
 * and lightness is the channel a dichromat leans on and the only one a monochromat has: 142 trio pairs fell through the
 * floor test/unit/palette/cvd-trio-floor.test.js holds (0.15 under a dichromacy, 0.11 under achromatopsia). So the trio
 * is then pushed apart: while a pair is under its floor, the member already further from the ink moves further, which
 * keeps every contrast bar above met (moving away from the ink is also moving away from the canvas and the tint).
 */
const TRIO = ['pass', 'warn', 'fail'];
const cvdFloor = (type) => (type === ACHROMATOPSIA ? 0.11 : 0.15);
/**
 * The bar each pair is held to is the gate's own: its floor, or, for a pair the frozen table already records BELOW the
 * floor (a monochrome palette's grays cannot reach 0.15 under every condition at once), that recorded separation.
 * Read from the test's frozen table so the solver and the gate cannot disagree about it.
 */
const CVD_FROZEN = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'test', 'unit', 'palette', 'cvd-trio-floor.test.js'), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/\['([a-z0-9-]+\|(?:light|dark)\|[a-z]+\^[a-z]+\|[a-z]+)', ([0-9.]+)\]/g)) out.set(m[1], Number(m[2]));
  return out;
})();
function trioBar(theme, mode, a, b, type) {
  const floor = cvdFloor(type);
  let bar = floor + 0.003; // a small margin over the floor, so a hex round-trip cannot land under it
  for (const t of [theme, `${theme}-dark`]) {
    for (const m of ['light', 'dark']) {
      if (t === theme && m !== mode) continue;
      // A pair already below the floor is held where it is (the gate's erosion tolerance is 0.002).
      const frozen = CVD_FROZEN.get(`${t}|${m}|${a}^${b}|${type}`);
      if (frozen !== undefined && frozen < floor) bar = Math.min(bar, frozen - 0.001);
    }
  }
  return bar;
}
function spreadTrio(arm, ink, theme, mode, ok) {
  const dir = ink === '#FFFFFF' ? -1 : 1;
  const floorsMet = (c) => TRIO.every((x, i) => TRIO.slice(i + 1).every((y) => SIMULATED_TYPES.every(
    (type) => oklabDistance(simulate(c[x], type), simulate(c[y], type)) >= trioBar(theme, mode, x, y, type))));
  if (floorsMet(arm)) return true;
  // Each member's room: how near the ink it may sit and still clear every contrast bar (`ok`). The trio is laid out
  // from there, `step` apart in lightness and in its own order, and the step widens until every pair clears its bar.
  const nearest = (x) => {
    let L = hexToOklch(arm[x]).L;
    while (ok(withLightness(arm[x], L - dir * 0.005))) L -= dir * 0.005;
    return L;
  };
  // Every ordering of the three is tried, nearest-to-ink first, and the passing layout that moves the colors least
  // wins: the order a palette shipped with is not always the one with room (a light amber pushed to the top of the
  // band washes toward white and collides with a light blue under protanopia).
  const room = Object.fromEntries(TRIO.map((x) => [x, nearest(x)]));
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((o) => o.map((i) => TRIO[i]));
  let best = null;
  for (const order of orders) {
    for (let step = 0; step <= 0.45; step += 0.005) {
      const c = { ...arm };
      let prev = null;
      for (const x of order) {
        const L = prev === null ? room[x] : (dir < 0 ? Math.min(room[x], prev + dir * step) : Math.max(room[x], prev + dir * step));
        c[x] = withLightness(arm[x], L).toUpperCase();
        prev = L;
      }
      if (order.some((x) => { const L = hexToOklch(c[x]).L; return L <= 0.03 || L >= 0.995; })) break;
      if (order.every((x) => ok(c[x])) && floorsMet(c)) {
        const cost = TRIO.reduce((t, x) => t + Math.abs(hexToOklch(c[x]).L - hexToOklch(arm[x]).L), 0);
        if (!best || cost < best.cost) best = { c, cost };
        break;
      }
    }
  }
  if (best) { Object.assign(arm, best.c); return true; }
  return false;
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
    const arm = Object.fromEntries(TRIO.map((t) => [t, arms[t][key]]));
    const okStatus = (hex) => contrastRatio(hex, ink) >= TEXT_ON_SOLID + MARGIN
      && [bg, bgAlt].filter(isHex).every((sf) => contrastRatio(hex, sf) >= 4.5 + MARGIN);
    // Only a theme that OWNS its trio spreads it; one that inherits it (a11y-base from onyx) wears its owner's.
    if (ownsTrio && !spreadTrio(arm, ink, theme, key, okStatus)) throw new Error(`${theme}: the status trio cannot be spread apart for a colorblind reader (${key})`);
    for (const t of TRIO) {
      if (arm[t] !== arms[t][key]) { arms[t][key] = arm[t]; kept[t] = false; }
    }
    const muted = R(raw['muted-mark'] ?? 'var(--text-muted)');
    if (!isHex(muted)) throw new Error(`${theme}: --muted-mark did not resolve (${key})`);
    (arms[NEUTRAL] ??= {})[key] = solveArm(muted, ink);
  }
  const out = {};
  for (const [seed, a] of Object.entries(arms)) out[seed] = `light-dark(${a.light}, ${a.dark})`;
  return { solved: out, kept };
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
    const seeds = [...owned, NEUTRAL, ON_SOLID];
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

module.exports = { solveTheme, inkFor, TEXT_ON_SOLID, CATS, STATES, NEUTRAL, ON_SOLID };
