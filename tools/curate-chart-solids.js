#!/usr/bin/env node
/**
 * Curate every theme's chart SOLIDS: one flat color per chart concept that text sits on at 7:1.
 *
 * WHAT A SOLID IS. A chart mark — a bar, a gantt task, a state tile, a pill, a key swatch — is painted with ONE
 * color per concept, flat, with no gradient and no mix: the theme's curated seed (`--chart-catN` for the eight
 * categories, `--chart-state-{pass,warn,fail,info,mute}` for status, `--chart-neutral` for a mark with neither).
 * Text on any solid is ONE ink per mode, `--chart-on-solid`. Before this, every chart mixed its own fill from a hue
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
const { contrastRatio, ensureContrast, hexToOklch } = require('../lib/theme/color.js');
const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');

const ROOT = path.join(__dirname, '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const FAMILY = path.join(ROOT, 'lib', 'plugins', 'chart-family', 'chart-family.styles.css');

/** The bar text on a solid is held to, with a margin so a later round-trip through hex cannot land under it. */
const TEXT_ON_SOLID = 7;
const MARGIN = 0.05;

const CATS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat${n}`);
const STATES = ['pass', 'warn', 'fail', 'info', 'mute'].map((s) => `chart-state-${s}`);
const NEUTRAL = 'chart-neutral';
const ON_SOLID = 'chart-on-solid';

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

function solveArm(seed, ink) {
  const target = TEXT_ON_SOLID + MARGIN;
  if (contrastRatio(seed, ink) >= target) return seed.toUpperCase();
  // Darken toward the dark end against a white ink, lighten against a dark one.
  const out = ensureContrast(seed, ink, target, ink === '#FFFFFF' ? 'darken' : 'lighten');
  if (contrastRatio(out, ink) < target) throw new Error(`cannot reach ${target}:1 for ${seed} against ${ink}`);
  return out.toUpperCase();
}

/**
 * Solve one theme's solids from its own chain. Returns { seed: 'light-dark(#L, #D)' } and, per seed, whether the
 * theme's own value already clears the bar in both modes (`kept`): such a seed is left exactly as written, so a
 * status seed linked to the theme's `--pass` stays linked.
 */
function solveTheme(theme) {
  const raw = declaredVars(theme);
  const arms = {};
  const kept = {};
  for (const dark of [false, true]) {
    const key = dark ? 'dark' : 'light';
    const R = (expr) => resolveTokenExpr(expr, raw, dark);
    const bg = R(raw.bg);
    if (!isHex(bg)) throw new Error(`${theme}: --bg did not resolve (${key})`);
    const ink = inkFor(bg);
    (arms[ON_SOLID] ??= {})[key] = ink;
    for (const seed of [...CATS, ...STATES]) {
      const expr = raw[seed] ?? familyDefault(seed);
      const v = expr && R(expr);
      if (!isHex(v)) throw new Error(`${theme}: --${seed} did not resolve (${key})`);
      const solved = solveArm(v, ink);
      (arms[seed] ??= {})[key] = solved;
      kept[seed] = (kept[seed] ?? true) && solved === v.toUpperCase();
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
    return fs.existsSync(f) && /--chart-(cat1|state-pass)\s*:/.test(stripComments(fs.readFileSync(f, 'utf8')));
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
