#!/usr/bin/env node
/**
 * tools/audit-diagram-contrast.mjs — what Mermaid ACTUALLY paints, per palette,
 * per scheme, and which of its knobs we are actually turning.
 *
 * On-demand audit, not a gate. `diagram-ink-contrast.test.js` gates the INK tier
 * (text at AA 4.5:1) and does it well; this covers the two questions nothing
 * asks, and the second one is the reason it exists at all.
 *
 * ── 1. THE NON-TEXT TIER (`--report contrast`) ────────────────────────────────
 * WCAG 1.4.11 puts a 3:1 floor on a GRAPHICAL OBJECT that carries meaning — a
 * node's edge, a gantt grid line, an axis rule, a pie slice's boundary. No gate
 * in the tree measures one. The ink gate cannot: its whole design is ink key →
 * the surface that ink lands on, and a stroke is not ink.
 *
 * A shape is judged by DISCERNIBILITY rather than by any single pair, because a
 * node with an invisible border but a fill that separates from the canvas is
 * perfectly legible, and judging border-vs-fill alone would call it broken. The
 * test is whether ANY of its three candidate edges clears 3:1 — fill vs canvas,
 * border vs canvas, border vs its own fill. Failing all three is a shape with no
 * visible boundary at all, which is the defect worth reporting.
 *
 * A line on the canvas has no such fallback, so it is judged on the one pair.
 *
 * THE NUMBERS HERE ARE OPTIMISTIC ON PURPOSE, and that is worth knowing before
 * quoting one. They are the BAKED themeVariables, resolved offline. Two things
 * push the rendered result the wrong way: `mermaid.css` puts `stroke-opacity`
 * below 1 on several strokes (the radar graticule at 0.20, its axis lines at
 * 0.5), and a translucent stroke blends toward whatever is under it. So a pair
 * reported at 3.1:1 can still render below the floor. Nothing here reports a
 * failure that is not real; it under-reports.
 *
 * ── 2. THE LEVER CENSUS (`--report levers`) ───────────────────────────────────
 * The load-bearing question, and the one that is easy to get backwards: a key we
 * do not set is NOT automatically a key we cannot set. Mermaid derives a lot of
 * colors in `updateColors()`, and the folk answer ("mermaid mixes colors and
 * won't let us control them") predicts that many of our values get overwritten.
 *
 * Measured instead of assumed: send a sentinel for every color key mermaid
 * emits — alone, and again alongside our full themeVariables set — and see which
 * sentinels come back out. Whatever survives is a lever that exists.
 *
 * The census runs against mermaid's own `base.getThemeVariables`, reached
 * through whichever build chunk currently exports `themes_default`. It is found
 * by content rather than by filename because the chunk name carries a build hash
 * and changes on every mermaid upgrade.
 *
 * Usage:
 *   node tools/audit-diagram-contrast.mjs                     # both reports
 *   node tools/audit-diagram-contrast.mjs --report contrast
 *   node tools/audit-diagram-contrast.mjs --report levers
 *   node tools/audit-diagram-contrast.mjs --json out.json
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildDiagramTheme } = require(path.join(ROOT, 'lib/core/mermaid-theme-map.js'));
const { resolveTokenExpr } = require(path.join(ROOT, 'lib/core/resolve-token-expr.js'));

const argv = process.argv.slice(2);
const reportArg = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : 'all';
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;

// ── mermaid's own base theme, from whichever chunk exports it ────────────────
async function loadMermaidThemes() {
  const dir = path.join(ROOT, 'node_modules/mermaid/dist/chunks/mermaid.esm');
  const file = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'))
    .find((f) => /themes_default/.test(fs.readFileSync(path.join(dir, f), 'utf8').slice(-4000)));
  if (!file) throw new Error('no mermaid chunk exports themes_default — did mermaid restructure its build?');
  return (await import(path.join(dir, file))).themes_default;
}

// ── palette resolution, the offline twin of getComputedStyle ────────────────
const THEMES_DIR = path.join(ROOT, 'themes');
const LAYOUT_CSS = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8');
const THEMES = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css') && !f.includes('audit'))
  .map((f) => f.replace(/\.css$/, '')).sort();

function paletteSource(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  const file = path.join(THEMES_DIR, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${paletteSource(m[1], seen)}\n`;
  return out + css;
}
function declaredVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const m of stripped.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) vars[m[1]] = m[2].trim();
  return vars;
}

// ── color maths ────────────────────────────────────────────────────────────
function toRgb(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((c) => Number.parseInt(c + c, 16));
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (m) return [1, 2, 3].map((i) => Math.round(Number(m[i])));
  return null;
}
const lum = (rgb) => {
  const l = rgb.map((x) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
function contrast(a, b) {
  const [x, y] = [toRgb(a), toRgb(b)];
  if (!x || !y) return null;
  const [l1, l2] = [lum(x), lum(y)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const isCol = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v.trim());

// ── object walking ──────────────────────────────────────────────────────────
const flat = (obj, prefix = '') => {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flat(v, `${prefix}${k}.`));
    else out.push([`${prefix}${k}`, v]);
  }
  return out;
};
const getD = (o, d) => d.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setD = (o, d, v) => {
  const ps = d.split('.');
  let c = o;
  for (const p of ps.slice(0, -1)) { c[p] ??= {}; c = c[p]; }
  c[ps.at(-1)] = v;
};

/**
 * The graphical objects judged, and WHAT COUNTS AS THEIR EDGE.
 *
 * Each SHAPE lists its three candidate edges; clearing 3:1 on any one of them is
 * enough. Each LINE is judged on its single pair, because a line has no fill to
 * fall back on. The pairings state where mermaid actually draws the thing —
 * a fact about mermaid, not about our map, exactly as the ink gate's SITES table
 * is — so they are written out rather than derived from `MERMAID_VAR_MAP`.
 */
const SHAPES = [
  ['flowchart node', ['mainBkg', 'background'], ['nodeBorder', 'background'], ['nodeBorder', 'mainBkg']],
  ['gantt task bar', ['taskBkgColor', 'background'], ['taskBorderColor', 'background'], ['taskBorderColor', 'taskBkgColor']],
  ['pie slice', ['pie1', 'background'], ['pieOuterStrokeColor', 'background'], ['pieStrokeColor', 'pie1']],
  ['sequence actor', ['actorBkg', 'background'], ['actorBorder', 'background'], ['actorBorder', 'actorBkg']],
  ['sequence note', ['noteBkgColor', 'background'], ['noteBorderColor', 'background'], ['noteBorderColor', 'noteBkgColor']],
  ['subgraph cluster', ['clusterBkg', 'background'], ['clusterBorder', 'background'], ['clusterBorder', 'clusterBkg']],
];
const LINES = [
  ['flowchart edge', 'lineColor', 'background'],
  ['sequence signal arrow', 'signalColor', 'background'],
  ['sequence lifeline', 'actorLineColor', 'background'],
  ['gantt grid line', 'gridColor', 'background'],
  ['gantt today marker', 'todayLineColor', 'background'],
  ['quadrant frame', 'quadrantExternalBorderStrokeFill', 'background'],
  ['quadrant divider', 'quadrantInternalBorderStrokeFill', 'quadrant1Fill'],
  ['xy x-axis rule', 'xyChart.xAxisLineColor', 'xyChart.backgroundColor'],
  ['xy y-axis rule', 'xyChart.yAxisLineColor', 'xyChart.backgroundColor'],
  ['xy x-axis tick', 'xyChart.xAxisTickColor', 'xyChart.backgroundColor'],
  ['xy y-axis tick', 'xyChart.yAxisTickColor', 'xyChart.backgroundColor'],
];

const FLOOR = 3;

async function main() {
  const themes_default = await loadMermaidThemes();
  const result = { contexts: [], shapes: {}, lines: {}, levers: null };

  // ── contrast sweep ────────────────────────────────────────────────────────
  for (const theme of THEMES) {
    const rawVars = declaredVars(`${LAYOUT_CSS}\n${paletteSource(theme)}`);
    for (const dark of [false, true]) {
      const ctx = `${theme}/${dark ? 'dark' : 'light'}`;
      result.contexts.push(ctx);
      const ours = buildDiagramTheme((n) => resolveTokenExpr(rawVars[n], rawVars, dark) ?? '#000000');
      const final = themes_default.base.getThemeVariables(JSON.parse(JSON.stringify(ours)));

      for (const [name, ...edges] of SHAPES) {
        const ratios = edges.map(([a, b]) => contrast(getD(final, a), getD(final, b))).filter((r) => r !== null);
        if (!ratios.length) continue;
        const best = Math.max(...ratios);
        (result.shapes[name] ??= []).push({ ctx, best, edges: edges.map(([a, b], i) => `${a}/${b}=${ratios[i]?.toFixed(2)}`) });
      }
      for (const [name, a, b] of LINES) {
        const r = contrast(getD(final, a), getD(final, b));
        if (r === null) continue;
        (result.lines[name] ??= []).push({ ctx, r, av: getD(final, a), bv: getD(final, b) });
      }
    }
  }

  // ── lever census ──────────────────────────────────────────────────────────
  const bare = themes_default.base.getThemeVariables({});
  const emitted = flat(bare).filter(([, v]) => isCol(v)).map(([k]) => k);
  const ours = buildDiagramTheme(() => '#123456');
  const ourKeys = new Set(flat(ours).map(([k]) => k));
  const SENTINEL = '#ABCDEF';
  const honoredAlone = [], ignoredAlone = [], clobberedByUs = [];
  for (const k of emitted) {
    const solo = {};
    setD(solo, k, SENTINEL);
    const gotSolo = String(getD(themes_default.base.getThemeVariables(solo), k)).toLowerCase();
    (gotSolo === SENTINEL.toLowerCase() ? honoredAlone : ignoredAlone).push(k);
    if (ourKeys.has(k)) continue;
    const withOurs = JSON.parse(JSON.stringify(ours));
    setD(withOurs, k, SENTINEL);
    if (String(getD(themes_default.base.getThemeVariables(withOurs), k)).toLowerCase() !== SENTINEL.toLowerCase()) clobberedByUs.push(k);
  }
  const fullOut = themes_default.base.getThemeVariables(JSON.parse(JSON.stringify(ours)));
  const ourKeysOverridden = flat(ours)
    .filter(([k, v]) => isCol(v) && String(getD(fullOut, k)).toLowerCase() !== String(v).toLowerCase())
    .map(([k]) => k);
  result.levers = {
    emitted: emitted.length,
    weSet: flat(ours).filter(([, v]) => isCol(v)).length,
    unused: emitted.filter((k) => !ourKeys.has(k)),
    ignoredAlone, clobberedByUs, ourKeysOverridden,
  };

  // ── print ─────────────────────────────────────────────────────────────────
  const n = result.contexts.length;
  if (reportArg === 'all' || reportArg === 'contrast') {
    console.log(`\n=== NON-TEXT CONTRAST · ${THEMES.length} palettes x 2 schemes = ${n} contexts · floor ${FLOOR}:1 ===\n`);
    console.log('SHAPES — no candidate edge clears the floor (fill/canvas, border/canvas, border/fill):\n');
    for (const [name, list] of Object.entries(result.shapes)) {
      const bad = list.filter((e) => e.best < FLOOR).sort((a, b) => a.best - b.best);
      console.log(`  ${String(bad.length).padStart(2)}/${n}  ${name}${bad.length ? `   worst ${bad[0].best.toFixed(2)}:1 ${bad[0].ctx}` : '   clean'}`);
    }
    console.log('\nLINES — the one pair, no fallback:\n');
    for (const [name, list] of Object.entries(result.lines)) {
      const bad = list.filter((e) => e.r < FLOOR).sort((a, b) => a.r - b.r);
      console.log(`  ${String(bad.length).padStart(2)}/${n}  ${name}${bad.length ? `   worst ${bad[0].r.toFixed(2)}:1 ${bad[0].ctx} (${bad[0].av} on ${bad[0].bv})` : '   clean'}`);
    }
  }
  if (reportArg === 'all' || reportArg === 'levers') {
    const L = result.levers;
    console.log(`\n=== LEVER CENSUS ===\n`);
    console.log(`  mermaid emits            ${L.emitted} color themeVariables`);
    console.log(`  Lattice sets             ${L.weSet}`);
    console.log(`  unused (a lever exists)  ${L.unused.length}`);
    console.log(`  mermaid IGNORES          ${L.ignoredAlone.length}  <- keys with no lever at all`);
    console.log(`  our own keys overridden  ${L.ourKeysOverridden.length}`);
    console.log(`  unused keys our own set would clobber  ${L.clobberedByUs.length}\n`);
    const groups = {};
    for (const k of L.unused) (groups[k.replace(/\d+$/, 'N')] ??= []).push(k);
    console.log('  UNUSED, grouped:');
    for (const [g, ks] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`    ${String(ks.length).padStart(2)}  ${g}`);
    }
  }
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(result, null, 1));
    console.log(`\nwrote ${jsonOut}`);
  }
}
main();
