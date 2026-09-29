/**
 * parser-bakeoff speed — read beside correctness.mjs, never alone. Four measurements:
 *
 *   throughput  ns per input over the REAL corpus (every span the dispatcher sees, most of
 *               which it rejects) and over the ACCEPTED subset (the path that builds output).
 *   scaling     the pathological inputs from corpus.mjs at 2k / 8k / 32k characters. The
 *               kernels exist partly to be LINEAR on untrusted input in the browser linter
 *               (HARD RULE #22), so the number that matters is the growth ratio: ~4x per
 *               4x input is linear, ~16x is quadratic.
 *   cold        a fresh process importing the candidate: library load + grammar build, the
 *               cost every `node --test` file and every page load pays once.
 *   size        what the browser would ship: library runtime + grammars, minified + gzip.
 *
 * Every cell runs in its own process with a deadline, so one super-linear candidate cannot
 * stall the table or warm the JIT for the next one.
 *
 * Usage:  node tools/parser-bakeoff/speed.mjs [--only=peggy,ohm] [--json]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALL } from './candidates.mjs';
import { scaling } from './corpus.mjs';
import { precompile, SHIPPED } from './precompile.mjs';
import { TARGETS } from './reference.mjs';
import { sizeRows } from './size.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const names = arg('only')?.split(',') || ALL;
const CELL = fileURLToPath(new URL('./speed-cell.mjs', import.meta.url));
const DEADLINE_MS = 20000;

function cell(args) {
  const r = spawnSync(process.execPath, [CELL, ...args], { encoding: 'utf8', timeout: DEADLINE_MS });
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return { timeout: true };
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: (r.stderr || r.stdout).slice(0, 200) }; }
}

const out = { throughput: [], scaling: [], cold: [], size: [] };

const median = (runs) => {
  const ok = runs.filter((r) => typeof r.ms === 'number').map((r) => r.ms).sort((a, b) => a - b);
  return ok.length ? ok[Math.floor(ok.length / 2)] : null;
};
for (const n of names) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(cell(['cold', n]));
  // The shipped form: precompiled where the library has a build step, else the same module.
  const path = SHIPPED.includes(n) ? await precompile(n) : null;
  const shipped = path ? Array.from({ length: 5 }, () => cell(['coldShipped', n, path])) : runs;
  out.cold.push({ candidate: n, ms: median(runs), buildMs: runs[0]?.buildMs ?? null, shippedMs: median(shipped) });
}

for (const t of TARGETS) {
  for (const n of names) {
    const r = cell(['throughput', n, t]);
    out.throughput.push({ target: t, candidate: n, ...r });
    // One process per SHAPE, so a timeout names the input that caused it.
    const shapes = [];
    let missing = false;
    for (const [shape] of scaling(t, 1000)) {
      const r = cell(['scaling', n, t, shape]);
      if (r.missing) { missing = true; break; }
      shapes.push(r.timeout ? { shape, ms: [null, null, null], ratio: null, timeout: true } : r.shapes?.[0] ?? { shape, error: r.error });
    }
    out.scaling.push({ target: t, candidate: n, missing, shapes });
  }
}

out.size = await sizeRows(names);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const f = (x, d = 0) => (x == null ? '—' : x.toFixed(d));
console.log('\ncold import (median of 5, ms): dev form (grammar built at load) | shipped form (precompiled where possible)');
for (const r of out.cold) console.log(`  ${r.candidate.padEnd(11)} ${f(r.ms, 1).padStart(7)} (build ${f(r.buildMs, 1)}) | ${f(r.shippedMs, 1).padStart(7)}`);

console.log('\nthroughput (ns per input; all real spans | accepted only)');
for (const t of TARGETS) {
  console.log(`  ${t}`);
  for (const r of out.throughput.filter((x) => x.target === t)) {
    if (r.missing) { console.log(`    ${r.candidate.padEnd(11)} —`); continue; }
    console.log(`    ${r.candidate.padEnd(11)} ${f(r.allNs).padStart(8)} | ${f(r.posNs).padStart(8)}${r.timeout ? '  TIMEOUT' : ''}`);
  }
}

console.log('\nscaling (ms at 2k / 8k / 32k chars per shape; ratio 32k/8k — 4 is linear, 16 quadratic; DNF = the rung before took > 0.5s)');
for (const t of TARGETS) {
  console.log(`  ${t}`);
  for (const r of out.scaling.filter((x) => x.target === t)) {
    if (r.missing) { console.log(`    ${r.candidate.padEnd(11)} —`); continue; }
    const cellOf = (x) => (x.timeout ? `${x.shape}: TIMEOUT` : x.threw ? `${x.shape}: THREW (${x.threw})` : `${x.shape}: ${(x.ms || []).map((m) => (m == null ? 'DNF' : m.toFixed(1))).join('/')} x${f(x.ratio, 1)}`);
    console.log(`    ${r.candidate.padEnd(11)} ${r.shapes.map(cellOf).join('   ')}`);
  }
}

console.log('\nsize (min+gz bytes: runtime + grammars)');
for (const r of out.size) console.log(`  ${r.candidate.padEnd(11)} runtime ${String(r.runtime).padStart(7)}  grammars ${String(r.grammars).padStart(7)}  total ${String(r.total).padStart(7)}${r.note ? `  (${r.note})` : ''}`);
