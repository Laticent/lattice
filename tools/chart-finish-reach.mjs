#!/usr/bin/env node
/**
 * chart-finish-reach — which chart marks does each finish actually REACH, and what does the
 * finish do to a ramp's range?
 *
 * Now that a finish is always on (`chart-finish:` has no `off`; resolve-chart-finish.js), a mark a
 * finish misses is not "left as designed", it is a mark that looks like no finish at all beside
 * its neighbors: the progress bar with no status keeps its own pale gradient under all three
 * finishes while its sibling bars change. This tool names every such mark, per member.
 *
 * It reads the REAL engine output: renders the chart gallery deck once per theme x mode, loads the
 * HTML in Chrome, and flips the finish by swapping the `chart-finish-*` class on every section
 * (the unfinished paint is the same page with the class removed: each member's own CSS is still in
 * the sheet, and it is the BASELINE every number below is measured against). Paint is read with
 * getComputedStyle, so `color-mix()` / `light-dark()` / gradients resolve in a real engine
 * (chart-finish-coherence.mjs paid for that once).
 *
 * Five arms:
 *   REACH   for every mark class a chart manifest declares (kernel.marks, paint != none), does the
 *           paint of each element change under pigment / etch / tone? An element whose paint is
 *           identical in all three is UNREACHED; the report groups them by class and by the
 *           attribute that distinguishes them (`:not([data-s])`, ...).
 *   KEPT    a mark whose paint changed but still shows a gradient (an HTML mark's `background-image`
 *           sits on top of the color a finish sets): the finish reached it and did not own its body.
 *   SPAN    a ramp's range (heatmap top step against its empty cell): the contrast between them
 *           under each finish, as a ratio of the baseline's. A finish that flattens the ramp loses
 *           the magnitude channel, which no per-finish number notices.
 *   RUNS    every text run in the gallery, measured with the repo's own probe, under the unfinished
 *           paint and under each finish. A REGRESSION is a run a finish pushes under its threshold that
 *           the unfinished paint cleared: the floor chart-styling.md §3 states, measured on every chart.
 *   TEXT    a heatmap value against its own cell, worst over every cell, against the 4.5:1 text floor.
 *           A finish may take a wider band than the member ships only because the value picks its own
 *           ink (`inkOn`), and this is the measurement of that claim.
 *
 * A diagnostic with a gate mode. `--check` exits 1 when a mark is unreached and not sanctioned (the
 * two lists below, each entry with its reason, each failing when stale), a reached mark keeps a
 * gradient, the DEFAULT finish keeps under --span-floor of the baseline's range, or a heatmap value
 * falls under --text-floor against its own cell on ANY finish, or ANY finish regresses a text run the
 * unfinished paint cleared (RUNS). Etch and tone's ranges are reported but
 * not gated: their quieter ramps are their identity.
 *
 * Usage:
 *   node tools/chart-finish-reach.mjs [--theme indaco ...] [--all-themes] [--modes light,dark,print]
 *                                     [--span-floor 0.9] [--text-floor 4.5] [--check] [--freeze] [--json out.json]
 *
 * Needs a built `dist/` and Chrome (CHROME_PATH). One gallery render per theme x mode, so
 * --all-themes is a few minutes, not a CI step.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const nodeRequire = createRequire(import.meta.url);
const { CHART_FINISH_DEFAULT } = nodeRequire('../lib/core/resolve-chart-finish.js');
// The one WCAG measurement the repo owns (tools/check-slide-contrast.js), so this tool never has a
// second, drifting copy of the arithmetic.
const { PROBE } = nodeRequire('./check-slide-contrast.js');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY = path.join(REPO, 'lib/components/chart/chart.gallery.md');
// The unfinished heatmap contrast, FROZEN per theme and mode (see BASELINE below).
const BASELINE_FILE = path.join(REPO, 'test/fixtures/chart-finish-baseline.json');
const FINISHES = ['pigment', 'etch', 'tone'];

/**
 * UNREACHED BY DESIGN, per mark class. Each entry needs its reason; the check fails on a stale
 * entry (one no longer unreached) so the list cannot rot into a blanket waiver, the same rule as
 * every allowlist in tools/check-ownership.js.
 *
 * NEUTRAL: a mark that is flat and neutral on purpose, or an ink rather than a body. A finish moves
 * a body's color and never adds one (chart-styling.md §3), and none of these is a body the finish
 * could move without inventing a hue the data does not carry.
 */
const SANCTIONED_NEUTRAL = [
  ['waterfall', 'waterfall-bar', 'a TOTAL column is a neutral anchor on purpose: its fill is mixed toward --bg so it reads as standing on the slide (waterfall.styles.css)'],
  ['hub-spoke', 'hub-spoke-halo', 'an alarm halo is drawn in the status INK, and a finish never recolors an ink'],
  ['hub-spoke', 'hub-spoke-neck', 'a connector line, not a body'],
  ['heatmap', 'heatmap-cell', 'the EMPTY cell is the absence of a datum: neutral by definition, and the ramp is measured against it'],
  ['gantt', 'gantt-bar-accent', 'the 4px leading stripe is the bar\'s own solid, the member\'s, so it marks a hollow deferred bar\'s start under every finish'],
  ['state-chart', 'state-node-accent', 'the leading stripe is the tile\'s own solid, the member\'s, so it marks a hollow deferred tile\'s start under every finish'],
  ['state-chart', 'state-edge-arrow', 'an edge arrowhead is the head of a connector line, drawn in the edge ink, not a body'],
  ['flowchart', 'fc-head', 'an edge arrowhead is the head of a connector line, drawn in the edge ink, not a body'],
  ['flowchart', 'fc-key-swatch', 'a key swatch with no status keys an edge STYLE (a line), and a body behind a line would be a box'],
  ['risk-matrix', 'risk-marker', 'a risk disc is the heading ink with the canvas color for its number, the one pairing that holds over every band in both modes (risk-matrix.styles.css)'],
  ['risk-matrix', 'risk-key-marker', 'the key twin of the risk disc, for the same reason'],
  ['tower', 'chart-key-swatch', 'the `open` and `retained` swatches key the tower\'s two neutral segments, which carry no hue to finish (tower.styles.css)'],
];

/**
 * WHOLE CHARTS no finish reaches yet. Their data marks are not on the mark contract (`data-hue` /
 * `data-encodes` / `data-paint`, slot-contract.md), so a finish cannot find them, and they keep
 * their own paint under every finish: consistent inside the chart, but not with a finished deck.
 * That is the convergence work recorded in followups.d/chart-finish-reach-whole-charts.md; naming
 * them here is what keeps it from being forgotten, and the check fails the day one is reached.
 */
const WHOLE_CHARTS = ['kanban', 'slope', 'map', 'journey'];

function parseArgs(argv) {
  const out = { themes: [], all: false, modes: ['light', 'dark', 'print'], spanFloor: 0.9, textFloor: 4.5, check: false, freeze: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--theme') out.themes.push(argv[++i]);
    else if (a === '--all-themes') out.all = true;
    else if (a === '--modes') out.modes = argv[++i].split(',');
    else if (a === '--span-floor') out.spanFloor = parseFloat(argv[++i]);
    else if (a === '--text-floor') out.textFloor = parseFloat(argv[++i]);
    else if (a === '--check') out.check = true;
    else if (a === '--freeze') out.freeze = true;
    else if (a === '--json') out.json = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (out.all) {
    out.themes = fs.readdirSync(path.join(REPO, 'themes'))
      .filter((d) => fs.existsSync(path.join(REPO, 'themes', d, `${d}.css`)) && d !== 'a11y-base');
  }
  if (!out.themes.length) out.themes = ['indaco'];
  return out;
}

/** Mark classes the chart manifests declare, minus the ones that paint nothing (strokes, text-only). */
function declaredMarkClasses() {
  const dir = path.join(REPO, 'lib/components/chart');
  const classes = new Map();
  for (const member of fs.readdirSync(dir)) {
    const file = path.join(dir, member, `${member}.manifest.json`);
    if (!fs.existsSync(file)) continue;
    const marks = JSON.parse(fs.readFileSync(file, 'utf8'))?.kernel?.marks;
    for (const m of marks || []) {
      if (m.paint && m.paint !== 'none') classes.set(m.class, member);
    }
  }
  return classes;
}

function renderGallery(theme, mode) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-reach-'));
  const deck = path.join(tmp, 'deck.md');
  const html = path.join(tmp, 'deck.html');
  const body = fs.readFileSync(GALLERY, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  fs.writeFileSync(deck, `---\nmarp: true\ntheme: ${theme}\ncolor-mode: ${mode}\n---\n\n${body}`);
  execFileSync('node', [path.join(REPO, 'dist/lattice.js'), deck, html, '-q'], { stdio: ['ignore', 'ignore', 'inherit'], cwd: REPO });
  return html;
}

/** Runs in the page. Returns, per marked element, its paint under baseline + each finish. */
function measureInPage(markClasses, finishes, memberNames) {
  const sel = markClasses.map((c) => `.${c}`).join(',');
  const els = [...document.querySelectorAll(`section ${sel}`)];
  const sections = [...document.querySelectorAll('section')];
  const setFinish = (f) => {
    for (const s of sections) {
      for (const c of [...s.classList]) if (c.startsWith('chart-finish-')) s.classList.remove(c);
      if (f) s.classList.add(`chart-finish-${f}`);
    }
  };
  const paint = (el) => {
    const cs = getComputedStyle(el);
    return el instanceof SVGElement
      ? `${cs.fill}|${cs.fillOpacity}|${cs.stroke}`
      : `${cs.backgroundColor}|${cs.backgroundImage}|${cs.borderTopColor}`;
  };
  // What a `url(#id)` fill points at. A PATTERN is the a11y themes' texture channel, which wins over
  // every finish on purpose (a colorblind reader tells categories apart by it); a GRADIENT is a
  // member's own body, which a finish is meant to replace.
  const fillTarget = (el) => {
    const m = /^url\(["']?#([^"')]+)["']?\)/.exec(getComputedStyle(el).fill);
    return m ? document.getElementById(m[1])?.tagName.toLowerCase() || '' : '';
  };
  const gradient = (el) => (el instanceof SVGElement
    ? /gradient/.test(fillTarget(el))
    : getComputedStyle(el).backgroundImage.includes('gradient'));
  const textured = (el) => el instanceof SVGElement && fillTarget(el) === 'pattern';
  const states = {};
  const grads = {};
  const texture = [];
  for (const f of [null, ...finishes]) {
    setFinish(f);
    states[f || 'base'] = els.map(paint);
    grads[f || 'base'] = els.map(gradient);
    if (f) els.forEach((el, i) => { if (textured(el)) texture[i] = true; });
  }
  const attrsOf = (el) => [...el.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')).sort().join(',');
  // The chart an element belongs to is the component its SLIDE names, not the member that declared the
  // class: `chart-key-swatch` is declared by eight members and a class map can only name one of them.
  const memberOf = (el) => {
    const slide = el.closest('section');
    return memberNames.find((m) => slide?.classList.contains(m)) || '';
  };
  const result = els.map((el, i) => ({
    member: memberOf(el),
    cls: markClasses.find((c) => el.classList.contains(c)),
    attrs: attrsOf(el),
    paint: Object.fromEntries(Object.keys(states).map((k) => [k, states[k][i]])),
    grad: Object.fromEntries(Object.keys(grads).map((k) => [k, grads[k][i]])),
    texture: !!texture[i],
  }));

  // SPAN: the heatmap's top step against its empty cell, as a WCAG ratio, per state.
  const toRgb = (v) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    // A sentinel first: a canvas IGNORES an unparseable color, so without it an invalid `v` would read back as
    // whatever fill the canvas held before, not as an obvious off value.
    cx.fillStyle = '#010203';
    cx.fillStyle = v;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const span = {};
  const top = document.querySelector('section .heatmap-cell[data-step="5"]');
  const low = document.querySelector('section .heatmap-cell[data-step="1"]');
  const empty = document.querySelector('section .heatmap-cell--empty');
  if (top && low && empty) {
    for (const f of [null, ...finishes]) {
      setFinish(f);
      const c = (el) => toRgb(getComputedStyle(el).fill);
      span[f || 'base'] = { topVsEmpty: ratio(c(top), c(empty)), topVsStep1: ratio(c(top), c(low)) };
    }
  }
  // TEXT: every heatmap value against its own cell. A finish that takes a wider band than the member
  // ships is only safe because the value picks its ink from the cell (`inkOn`), so measure the claim.
  const text = {};
  const pairs = [...document.querySelectorAll('section .heatmap-value[data-mark-for]')].map((t) => ({
    t, c: t.closest('svg')?.querySelector(`.heatmap-cell[data-mark="${t.getAttribute('data-mark-for')}"]`),
  })).filter((p) => p.c);
  if (pairs.length) {
    for (const f of [null, ...finishes]) {
      setFinish(f);
      text[f || 'base'] = Math.min(...pairs.map((p) => ratio(toRgb(getComputedStyle(p.t).fill), toRgb(getComputedStyle(p.c).fill))));
    }
  }
  setFinish(null);
  return { result, span, text };
}

const args = parseArgs(process.argv.slice(2));
// THE BASELINE IS FROZEN, NOT LIVE. The span arm compares a finish with the unfinished paint, which is
// the member's own CSS with the finish class removed. That reference exists only while each member keeps
// its own paint, and the day someone converges it onto pigment (or deletes it as dead code) a live
// baseline becomes pigment measured against pigment: ratio 1.0, a pass by construction. So the numbers
// are committed (`--freeze` rewrites them, as a deliberate act), the check measures against THEM, and
// a live baseline that has moved is reported as DRIFT rather than followed.
const baselineFile = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null;
const frozen = baselineFile?.entries || {};
const liveBaseline = {};
const drift = [];
const markClasses = declaredMarkClasses();
const memberNames = [...new Set(markClasses.values())];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const unreached = new Map(); // `${member}.${class}[attrs]` -> {count, total, themes:Set}
const members = new Map(); // member -> {total, un}: which charts are reached wholly, partly, or not at all
const kept = new Map(); // the same key -> elements still showing a gradient under pigment
const spans = [];
const texts = []; // heatmap value vs its cell, worst per theme x mode x finish
const regressions = []; // a text run a finish pushes under its threshold that the unfinished paint cleared
const runMismatch = []; // a finish that changed the NUMBER of text runs, which the comparison cannot align
const runTotals = {};
let failures = 0;
let texturedCount = 0; // marks an a11y theme's pattern fill paints over the finish, on purpose

for (const theme of args.themes) {
  for (const mode of args.modes) {
    const html = renderGallery(theme, mode);
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    // networkidle0 plus a beat: the state chart draws its SVG in the runtime's layout pass, after `load`, and a
    // measurement taken before it sees the member's own gradient (a finish looked like it kept one).
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 180000 });
    await new Promise((r) => setTimeout(r, 1500));
    const { result, span, text } = await page.evaluate(measureInPage, [...markClasses.keys()], FINISHES, memberNames);
    // RUNS: the same probe the contrast gate uses, once per state, compared run by run (DOM order is
    // stable across a class swap, so the index is the identity).
    const swap = (f) => page.evaluate((f) => {
      for (const sec of document.querySelectorAll('section')) {
        for (const c of [...sec.classList]) if (c.startsWith('chart-finish-')) sec.classList.remove(c);
        if (f) sec.classList.add(`chart-finish-${f}`);
      }
    }, f);
    const probeRows = {};
    for (const f of [null, ...FINISHES]) {
      await swap(f);
      probeRows[f || 'base'] = await page.evaluate(PROBE);
    }
    await swap(null);
    const baseRows = probeRows.base;
    for (const f of FINISHES) {
      const rows = probeRows[f];
      if (rows.length !== baseRows.length) { runMismatch.push(`${theme}/${mode}/${f}: ${rows.length} runs vs ${baseRows.length}`); continue; }
      rows.forEach((r, i) => {
        const b = baseRows[i];
        if (r.r < r.need && b.r >= b.need && !r.imgBackdrop) {
          regressions.push({ theme, mode, finish: f, cls: r.cls, tag: r.tag, text: String(r.text).slice(0, 24), now: r.r, was: b.r, need: r.need, page: r.page });
        }
      });
    }
    runTotals[`${theme}/${mode}`] = baseRows.length;
    await page.close();
    fs.rmSync(path.dirname(html), { recursive: true, force: true });

    const tally = new Map();
    for (const e of result) {
      const key = `${e.member || markClasses.get(e.cls)}/.${e.cls} [${e.attrs || 'no data-*'}]`;
      const t = tally.get(key) || { total: 0, un: 0 };
      t.total++;
      const mem = members.get(e.member || markClasses.get(e.cls)) || { total: 0, un: 0 };
      mem.total++;
      if (!e.texture && FINISHES.every((f) => e.paint[f] === e.paint.base)) mem.un++;
      members.set(e.member || markClasses.get(e.cls), mem);
      if (e.texture) { texturedCount++; }
      else if (FINISHES.every((f) => e.paint[f] === e.paint.base)) t.un++;
      else if (FINISHES.some((f) => e.grad[f])) t.kept = (t.kept || 0) + 1;
      tally.set(key, t);
    }
    for (const [key, t] of tally) {
      if (t.kept) {
        const k = kept.get(key) || { n: 0, total: 0, where: new Set() };
        k.n += t.kept; k.total += t.total; k.where.add(`${theme}/${mode}`);
        kept.set(key, k);
      }
      if (!t.un) continue;
      const u = unreached.get(key) || { un: 0, total: 0, where: new Set() };
      u.un += t.un; u.total += t.total; u.where.add(`${theme}/${mode}`);
      unreached.set(key, u);
    }
    for (const f of FINISHES) if (text[f] != null) texts.push({ theme, mode, finish: f, min: text[f], base: text.base });
    if (Object.keys(span).length) {
      liveBaseline[`${theme}/${mode}`] = { topVsEmpty: +span.base.topVsEmpty.toFixed(3), heatmapText: text.base == null ? null : +text.base.toFixed(3) };
      const pin = frozen[`${theme}/${mode}`];
      if (pin && Math.abs(span.base.topVsEmpty - pin.topVsEmpty) / pin.topVsEmpty > 0.02) {
        drift.push(`${theme}/${mode}: the unfinished heatmap contrast is ${span.base.topVsEmpty.toFixed(2)}:1, frozen ${pin.topVsEmpty.toFixed(2)}:1`);
      }
      const base = pin ? { topVsEmpty: pin.topVsEmpty } : span.base;
      for (const f of FINISHES) {
        const r = span[f].topVsEmpty / base.topVsEmpty;
        spans.push({ theme, mode, finish: f, base: base.topVsEmpty, finishRatio: span[f].topVsEmpty, kept: r });
      }
    }
  }
}
await browser.close();

const unreachedKey = (key) => {
  const m = /^([\w-]+)\/\.([\w-]+) /.exec(key);
  return { member: m[1], cls: m[2] };
};
const sanctionedFor = ({ member, cls }) => {
  if (WHOLE_CHARTS.includes(member)) return { kind: 'whole chart', why: 'not on the mark contract yet' };
  const hit = SANCTIONED_NEUTRAL.find(([m, c]) => m === member && c === cls);
  return hit ? { kind: 'neutral', why: hit[2] } : null;
};
const sanctionedHits = new Set();
const unsanctioned = [];
console.log('\nMEMBERS: marks reached by a finish, per chart (WHOLE = none reached, so the chart keeps its own paint; PARTIAL = a mixed look)');
for (const [m, v] of [...members].sort()) {
  const state = v.un === 0 ? 'reached' : v.un === v.total ? 'WHOLE' : 'PARTIAL';
  if (state !== 'reached') console.log(`  ${m.padEnd(12)} ${state.padEnd(8)} ${v.un}/${v.total} unreached${WHOLE_CHARTS.includes(m) ? '  (sanctioned: whole chart)' : ''}`);
}

console.log(`\nREACH: marks whose paint is identical under ${FINISHES.join(', ')} (${args.themes.length} theme(s) x ${args.modes.join('/')})`);
const rows = [...unreached].sort((a, b) => b[1].un - a[1].un);
for (const [key, u] of rows) {
  const id = unreachedKey(key);
  const ok = sanctionedFor(id);
  if (ok) sanctionedHits.add(WHOLE_CHARTS.includes(id.member) ? `whole:${id.member}` : `neutral:${id.member}.${id.cls}`);
  else unsanctioned.push(key);
  console.log(`  ${ok ? '  ok' : 'FAIL'}  ${key}  ${u.un}/${u.total}${ok ? `  [${ok.kind}]` : ''}`);
}
if (!rows.length) console.log('  none');
// A sanction is stale only if the mark is unreached in NONE of the combinations swept, which a run
// that leaves out light or dark cannot say (print reaches a waterfall total that light does not).
const canJudgeStale = args.modes.includes('light') && args.modes.includes('dark');
const stale = !canJudgeStale ? [] : [
  ...WHOLE_CHARTS.filter((m) => !sanctionedHits.has(`whole:${m}`)).map((m) => `whole chart "${m}" is no longer unreached: remove it from WHOLE_CHARTS`),
  ...SANCTIONED_NEUTRAL.filter(([m, c]) => !sanctionedHits.has(`neutral:${m}.${c}`)).map(([m, c]) => `neutral entry ${m}.${c} is no longer unreached: remove it from SANCTIONED_NEUTRAL`),
];
for (const msg of stale) console.log(`  STALE  ${msg}`);

console.log(`\nTEXTURE: ${texturedCount} mark(s) wear an a11y pattern fill that wins over every finish, by design`);

console.log('\nKEPT: reached, but still a gradient under at least one finish');
const keptRows = [...kept].sort((a, b) => b[1].n - a[1].n);
if (!keptRows.length) console.log('  none');
for (const [key, k] of keptRows) console.log(`  ${key}  ${k.n}/${k.total}`);

console.log(`\nSPAN: heatmap top step vs empty cell, contrast kept relative to the unfinished paint${baselineFile ? ' (FROZEN baseline)' : ' (live baseline: none frozen yet)'}`);
const worst = {};
for (const s of spans) if (!worst[s.finish] || s.kept < worst[s.finish].kept) worst[s.finish] = s;
for (const f of FINISHES) {
  const w = worst[f];
  if (!w) continue;
  const gated = f === CHART_FINISH_DEFAULT;
  const low = w.kept < args.spanFloor;
  console.log(`  ${f.padEnd(8)} worst ${w.kept.toFixed(2)}x  (${w.finishRatio.toFixed(2)} vs ${w.base.toFixed(2)})  at ${w.theme}/${w.mode}${gated ? `  <- the default, floor ${args.spanFloor}x${low ? '  FAIL' : ''}` : ''}`);
  if (gated && low) failures++;
}
console.log(`\nRUNS: text runs a finish pushes under their threshold that the unfinished paint cleared (${Object.values(runTotals).reduce((a, b) => a + b, 0)} runs per state, ${Object.keys(runTotals).length} theme x mode)`);
for (const f of FINISHES) {
  const mine = regressions.filter((r) => r.finish === f);
  const byMark = new Map();
  for (const r of mine) { const k = `${r.cls} ${r.tag}`; byMark.set(k, [...(byMark.get(k) || []), r]); }
  console.log(`  ${f.padEnd(8)} ${mine.length} regression(s)${f === CHART_FINISH_DEFAULT ? '  <- the default, none allowed' : ''}`);
  for (const [k, rs] of [...byMark].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    const w = rs.sort((a, b) => a.now - b.now)[0];
    console.log(`      ${k.padEnd(34)} ${String(rs.length).padStart(4)}x  worst ${w.now.toFixed(2)}:1 (was ${w.was.toFixed(2)}, need ${w.need}) at ${w.theme}/${w.mode} "${w.text}"`);
  }
  if (f === CHART_FINISH_DEFAULT) failures += mine.length;
}
for (const m of runMismatch.slice(0, 5)) console.log(`  MISALIGNED  ${m}`);
if (runMismatch.length) failures += runMismatch.length;

console.log(`\nTEXT: a heatmap value against its own cell, worst over every cell (floor ${args.textFloor}:1)`);
for (const f of FINISHES) {
  const rows = texts.filter((t) => t.finish === f).sort((a, b) => a.min - b.min);
  if (!rows.length) continue;
  const w = rows[0];
  const low = w.min < args.textFloor;
  console.log(`  ${f.padEnd(8)} worst ${w.min.toFixed(2)}:1  at ${w.theme}/${w.mode}  (unfinished ${w.base.toFixed(2)}:1)${low ? '  FAIL' : ''}`);
  if (low) failures++;
}
if (args.freeze) {
  const entries = Object.fromEntries(Object.entries(liveBaseline).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({
    note: 'The UNFINISHED heatmap contrast per theme and mode, frozen by `node tools/chart-finish-reach.mjs --all-themes --freeze`. tools/chart-finish-reach.mjs measures every finish against THESE numbers, so the span gate keeps its reference after a member converges its own paint onto a finish. Re-freeze only on purpose, with the reason in the commit.',
    modes: args.modes,
    entries,
  }, null, 1)}\n`);
  console.log(`\nFROZEN: ${Object.keys(entries).length} theme x mode entries written to ${path.relative(REPO, BASELINE_FILE)}`);
}
for (const d of drift.slice(0, 6)) console.log(`  DRIFT  ${d}`);
if (drift.length) {
  console.log(`  ${drift.length} live baseline(s) moved from the frozen numbers: the member's own paint changed. If that was the point, re-freeze with --freeze and say why in the commit.`);
  failures += drift.length;
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify({ unreached: rows.map(([k, u]) => ({ mark: k, ...u, where: [...u.where] })), kept: keptRows.map(([k, u]) => ({ mark: k, ...u, where: [...u.where] })), spans, regressions }, null, 1));
if (args.check && (unsanctioned.length || stale.length || keptRows.length || failures)) process.exit(1);
