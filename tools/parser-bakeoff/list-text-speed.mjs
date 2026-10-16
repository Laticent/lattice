/**
 * list-text-speed — time each list-text reader, the frozen regular expression against the
 * shipped kernel that walks the generated parser (Segno phase 3).
 *
 * Inputs are the corpus (every candidate string in the shipped decks and docs) and the seeded
 * fuzz from list-text.mjs. Each side runs in its OWN process, so neither inherits the other's JIT
 * state (the phase 3b timings found one shared process moved the second side by ~50 ns); the
 * best of seven rounds is reported, in nanoseconds per input.
 *
 * Usage:  node tools/parser-bakeoff/list-text-speed.mjs            (both sides, one table)
 *         node tools/parser-bakeoff/list-text-speed.mjs --side legacy|shipped   (one side, JSON)
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { listTextCorpus, listTextFuzz, READERS, shippedReaders } from './list-text.mjs';

const require = createRequire(import.meta.url);
const at = process.argv.indexOf('--side');
const side = at > 0 ? process.argv[at + 1] : null;

if (side) {
  const readers = side === 'legacy' ? require('../segno-legacy/list-text.js').readers : shippedReaders();
  const sets = { corpus: listTextCorpus(), fuzz: listTextFuzz(20_000) };
  const out = {};
  let sink = 0;
  for (const name of READERS) {
    for (const [set, inputs] of Object.entries(sets)) {
      const read = readers[name];
      let best = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 7; round++) {
        const t = process.hrtime.bigint();
        for (const s of inputs) if (read(s)) sink++;
        best = Math.min(best, Number(process.hrtime.bigint() - t) / inputs.length);
      }
      out[`${name} ${set}`] = best;
    }
  }
  if (sink < 0) console.log(sink);
  console.log(JSON.stringify(out));
} else {
  const self = fileURLToPath(import.meta.url);
  const run = (s) => JSON.parse(execFileSync(process.execPath, [self, '--side', s], { encoding: 'utf8' }));
  const legacy = run('legacy');
  const shipped = run('shipped');
  console.log('reader / inputs          regex ns   grammar ns   ratio');
  for (const k of Object.keys(legacy)) {
    console.log(`${k.padEnd(24)} ${legacy[k].toFixed(0).padStart(8)} ${shipped[k].toFixed(0).padStart(12)} ${(shipped[k] / legacy[k]).toFixed(2).padStart(7)}x`);
  }
}
