/**
 * parser-bakeoff correctness — does each candidate read every input EXACTLY as the
 * incumbent does? Parity is the bar: a migration that changes what a deck means is a
 * regression whatever the library's other merits.
 *
 * Usage:  node tools/parser-bakeoff/correctness.mjs [--only=peggy,ohm] [--show=5] [--json]
 */
import { isDeepStrictEqual } from 'node:util';
import { loadCandidates } from './candidates.mjs';
import { inputsFor } from './corpus.mjs';
import { positive, reference, TARGETS } from './reference.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const show = Number(arg('show') ?? 3);
const cands = await loadCandidates(arg('only')?.split(','));
const rows = [];

for (const target of TARGETS) {
  const { real, fuzz } = inputsFor(target);
  const want = { real: real.map(reference[target]), fuzz: fuzz.map(reference[target]) };
  for (const c of cands) {
    const fn = c.impl[target];
    const row = { target, candidate: c.name, real: 0, realN: real.length, fuzz: 0, fuzzN: fuzz.length, examples: [],
      // How many inputs the incumbent ACCEPTS: parity on rejects alone would be cheap.
      realPos: want.real.filter(positive).length, fuzzPos: want.fuzz.filter(positive).length };
    if (!fn) { rows.push({ ...row, missing: true }); continue; }
    for (const set of ['real', 'fuzz']) {
      const inputs = set === 'real' ? real : fuzz;
      inputs.forEach((s, i) => {
        let got;
        try { got = fn(s); } catch (e) { got = { threw: String(e.message).slice(0, 80) }; }
        if (isDeepStrictEqual(got, want[set][i])) row[set]++;
        else if (row.examples.length < show) row.examples.push({ set, input: s, want: want[set][i], got });
      });
    }
    rows.push(row);
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const pct = (a, n) => `${a === n ? '100' : ((100 * a) / n).toFixed(2)}%`;
  for (const r of rows) {
    if (r.missing) { console.log(`${r.target.padEnd(13)} ${r.candidate.padEnd(11)} —`); continue; }
    console.log(`${r.target.padEnd(13)} ${r.candidate.padEnd(11)} real ${pct(r.real, r.realN).padStart(7)} (${r.realN - r.real} off, ${r.realPos} accepted)  fuzz ${pct(r.fuzz, r.fuzzN).padStart(7)} (${r.fuzzN - r.fuzz} off, ${r.fuzzPos} accepted)`);
    for (const e of r.examples) console.log(`    ${e.set}: ${JSON.stringify(e.input).slice(0, 90)}\n      want ${JSON.stringify(e.want)?.slice(0, 160)}\n      got  ${JSON.stringify(e.got)?.slice(0, 160)}`);
  }
}
