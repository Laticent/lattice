/**
 * dom-bakeoff throughput — how long each candidate takes on THIS repo's markup.
 *
 * Read this table with the correctness table beside it. On its own it argues for
 * whichever library is fastest, which is exactly the reading that nearly shipped a
 * parser that lowercases SVG element names.
 *
 * THREE INPUT SIZES, because the answer changes across them and that IS the finding:
 * the gap is widest on a single slide and narrowest on a whole deck, which says
 * jsdom's cost is mostly FIXED PER PARSE rather than proportional to the bytes. A
 * bake-off run at one size would have reported a number three to sixteen times off.
 *
 * Also measured here: COLD MODULE LOAD, which turns out to matter more than any of
 * this. `node --test` forks a process per file, so every test file that requires
 * jsdom pays that cost again before it parses a byte.
 *
 * Each cell runs in its own process (see speed-cell.mjs for why).
 *
 * Usage:  node tools/dom-bakeoff/speed.mjs [--json]
 *         npm i --no-save happy-dom linkedom node-html-parser cheerio   # the field
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadAdapters } from './adapters.mjs';

const adapters = await loadAdapters();
const names = Object.keys(adapters);
const OPS = ['parse', 'parse + serialize', 'parse + query + mutate + serialize'];
const INPUTS = ['median slide', 'heaviest slide', 'whole deck'];
const CELL = new URL('./speed-cell.mjs', import.meta.url).pathname;

// ── cold module load: the cost `node --test` pays once per file ─────────────
const LOAD_SAMPLES = 5;
const loadMs = {};
for (const n of names) {
  const runs = [];
  for (let i = 0; i < LOAD_SAMPLES; i++) {
    const r = spawnSync(process.execPath, ['-e', `const t=process.hrtime.bigint();require(${JSON.stringify(n)});console.log(Number(process.hrtime.bigint()-t)/1e6)`], { encoding: 'utf8' });
    const v = Number(String(r.stdout).trim());
    if (Number.isFinite(v)) runs.push(v);
  }
  loadMs[n] = runs.length ? runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] : null;
}

// ── the matrix ──────────────────────────────────────────────────────────────
const cells = [];
for (const n of names) {
  for (let op = 0; op < OPS.length; op++) {
    for (let inp = 0; inp < INPUTS.length; inp++) {
      const r = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=3500', CELL, n, String(op), String(inp)], { encoding: 'utf8' });
      let parsed = null;
      try { parsed = JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch { /* crashed */ }
      cells.push(parsed || { lib: n, opIdx: op, inIdx: inp, op: OPS[op], input: INPUTS[inp], ms: null, err: 'out of memory or crash' });
    }
  }
}

const find = (lib, op, inp) => cells.find((c) => c.lib === lib && c.opIdx === op && c.inIdx === inp);

console.log('\n' + '='.repeat(30 + names.length * 18));
console.log('DOM BAKE-OFF · THROUGHPUT   ' + names.map((n) => `${n}@${adapters[n].version}`).join('  '));
if (names.length < 6) console.log('(install the rest of the field: npm i --no-save happy-dom linkedom node-html-parser cheerio)');
console.log('='.repeat(30 + names.length * 18));

console.log('\n-- cold module load, median of ' + LOAD_SAMPLES + ' fresh processes (ms) ' + '-'.repeat(18));
console.log('   ' + ''.padEnd(31) + names.map((n) => n.slice(0, 16).padStart(18)).join(''));
console.log('   ' + 'require() cost'.padEnd(31) + names.map((n) => (loadMs[n] == null ? '—' : loadMs[n].toFixed(1)).padStart(18)).join(''));

for (let op = 0; op < OPS.length; op++) {
  console.log(`\n-- ${OPS[op]} — ms per operation, p50 ${'-'.repeat(Math.max(0, 40 - OPS[op].length))}`);
  console.log('   ' + ''.padEnd(31) + names.map((n) => n.slice(0, 16).padStart(18)).join(''));
  for (let inp = 0; inp < INPUTS.length; inp++) {
    const base = find('jsdom', op, inp);
    const label = `${INPUTS[inp]} (${((find(names[0], op, inp)?.bytes ?? 0) / 1024).toFixed(0)}KB)`;
    console.log('   ' + label.padEnd(31) + names.map((n) => {
      const c = find(n, op, inp);
      if (!c || c.ms == null) return (c?.err ? c.err.slice(0, 16) : '—').padStart(18);
      const rel = base?.ms && n !== 'jsdom' ? ` (${(base.ms / c.ms).toFixed(1)}x)` : '';
      return (c.ms.toFixed(3) + rel).padStart(18);
    }).join(''));
  }
}

const notes = cells.filter((c) => c.ms == null);
if (notes.length) {
  console.log('\n-- unsupported or failed ' + '-'.repeat(40));
  for (const c of notes) console.log(`   ${c.lib.padEnd(18)} ${String(c.op).padEnd(36)} ${c.input}: ${c.err}`);
}

if (process.argv.includes('--json')) {
  writeFileSync(new URL('./speed.json', import.meta.url), JSON.stringify({ versions: Object.fromEntries(names.map((n) => [n, adapters[n].version])), loadMs, cells }, null, 2));
  console.log('\nwrote tools/dom-bakeoff/speed.json');
}
