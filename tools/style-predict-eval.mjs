#!/usr/bin/env node
/**
 * How well does reading a deck's MARKDOWN predict the style modules its rendered HTML needs?
 *
 * The Playground's style loader finds a deck's modules by scanning the HTML the engine rendered, which costs a second
 * render when the first one used too few modules. `scanMarkdown` (lib/core/style-needs-scan.mjs) guesses the same set
 * from the source, so the modules can be fetched and registered BEFORE the first render. This script measures the guess
 * against the truth on every example deck, counting only modules beyond the start-up floor (the floor loads for every
 * deck, so a guess about it changes nothing):
 *
 *   missed   needed by the rendered HTML, not predicted   -> the host must scan, fetch and render again
 *   wasted   predicted, not needed                        -> bytes fetched for nothing
 *   perfect  decks with zero missed modules               -> decks that would skip the second render
 *
 * Usage: node tools/style-predict-eval.mjs [--list] [--no-implies] [deck.md ...]   (needs `npm run css:build`)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neededModules, scanDocument, scanMarkdown } from '../lib/core/style-needs-scan.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require('jsdom');
const latticeEngine = require('../lib/engine');
const { buildLatticeIndex, impliesFor, runtimeTokensFor } = require('./style-needs-lattice.js');

const argv = process.argv.slice(2);
const list = argv.includes('--list');
let decks = argv.filter((a) => !a.startsWith('--'));
if (!decks.length) decks = fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).sort().map((f) => path.join('examples', f));

const built = buildLatticeIndex({ verified: false });
const idx = built.index;
const runtime = runtimeTokensFor(idx);
const bytes = built.modules.map((m) => m.bytes);
const implies = argv.includes('--no-implies') ? {} : await impliesFor(built);
const engine = latticeEngine.createEngine({});
engine.addThemes([
  { name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice-min.css'), 'utf8') },
  { name: 'indaco', css: fs.readFileSync(path.join(ROOT, 'dist/themes/indaco-min.css'), 'utf8') },
]);

// The floor: unconditional modules, the common list, and what they `require`.
const floor = new Set(built.floor);
idx.forEach((m, i) => {
  if (m.always) floor.add(i);
});
for (const i of floor) for (const j of idx[i].requires) floor.add(j);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const rows = [];
for (const f of decks) {
  const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let html;
  try {
    html = engine.render(md, 'indaco').html;
  } catch {
    continue;
  }
  const truth = neededModules(idx, scanDocument(new JSDOM(html).window.document.documentElement), undefined, runtime);
  const gtok = scanMarkdown(md);
  const guess = neededModules(idx, gtok, undefined, runtime);
  for (const w of gtok.c) for (const i of implies[w] || []) guess[i] = true;
  const missed = [];
  const wasted = [];
  idx.forEach((m, i) => {
    if (floor.has(i)) return;
    if (truth[i] && !guess[i]) missed.push(i);
    if (guess[i] && !truth[i]) wasted.push(i);
  });
  const sum = (xs) => xs.reduce((a, i) => a + bytes[i], 0);
  rows.push({ f, needed: idx.filter((_m, i) => truth[i] && !floor.has(i)).length, missed, wasted, missedB: sum(missed), wastedB: sum(wasted) });
}

const perfect = rows.filter((r) => !r.missed.length);
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
console.log(`${rows.length} decks, modules beyond the floor`);
console.log(`needed per deck        median ${med(rows.map((r) => r.needed))}`);
console.log(`perfect (0 missed)     ${perfect.length} of ${rows.length} decks`);
console.log(`missed modules         median ${med(rows.map((r) => r.missed.length))}, bytes median ${kb(med(rows.map((r) => r.missedB)))}, worst ${kb(Math.max(...rows.map((r) => r.missedB)))}`);
console.log(`wasted modules         median ${med(rows.map((r) => r.wasted.length))}, bytes median ${kb(med(rows.map((r) => r.wastedB)))}, worst ${kb(Math.max(...rows.map((r) => r.wastedB)))}`);
const freq = new Map();
for (const r of rows) for (const i of r.missed) freq.set(i, (freq.get(i) || 0) + 1);
console.log('most-missed modules (decks missing it):');
for (const [i, n] of [...freq].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(3)}  ${built.modules[i].id}  ${kb(bytes[i])}`);
if (list) for (const r of rows) console.log(`${r.f}  needed ${r.needed}  missed ${r.missed.map((i) => built.modules[i].id).join(', ') || '-'}  wasted ${r.wasted.length}`);
