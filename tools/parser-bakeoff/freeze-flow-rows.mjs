/**
 * freeze-flow-rows — write test/unit/tools/fixtures/flow-rows.frozen.json, the oracle the
 * flowchart row grammar is held to now that it IS the kernel.
 *
 * Segno phase 3 replaced `splitRow`'s hand-written scan with a generated parser
 * (lib/core/flowchart-row-grammar.js). Before it did, this script recorded what the old scan
 * returned, read from its frozen copy in tools/segno-legacy/flowchart-row.js, so
 * test/unit/tools/flow-row-grammar.test.js can compare against something other than the grammar
 * itself:
 *
 *   corpus    every distinct flowchart and state-chart text row in the shipped decks, in full
 *   segments  every row whose segments are more than one text run, in full
 *   text      flowFuzz(20,000): one SHA-256 (16 hex characters) per block of 100 rows
 *   segFuzz   segFuzz(20,000):  the same
 *
 * The fuzz is stored as digests because its full outputs run to 900 KB; both generators are
 * seeded, so the test regenerates the inputs and a failing block names its rows. Run it plain to
 * add cases: the legacy copy never changes, so every existing entry reproduces.
 *
 * CHANGING THE ROW SYNTAX ON PURPOSE (a new arrow form, a fixed label rule) is the one reason to
 * freeze from the SHIPPED reader instead: `--from-shipped` reads lib/core/flowchart-grammar.js's
 * `splitRow` and prints every row whose output changes (corpus and segment rows in full; in a
 * changed fuzz block, the rows that differ from the legacy scan). Paste that list into the PR
 * body: it is the review of the change, and without it the fixture would become a snapshot of
 * whatever the grammar does. Never point the freeze at the shipped reader to make a red test pass.
 *
 * Usage:  node tools/parser-bakeoff/freeze-flow-rows.mjs [--from-shipped]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { flowCorpus, flowSegCorpus } from './corpus.mjs';
import { encodeRow, FROZEN_BLOCK, flowFuzz, segFuzz } from './flow-row-grammar.mjs';

const require = createRequire(import.meta.url);
const legacy = require('../segno-legacy/flowchart-row.js');
const SHIPPED = process.argv.includes('--from-shipped');
const { splitRow } = SHIPPED ? require('../../lib/core/flowchart-grammar.js') : legacy;
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../test/unit/tools/fixtures/flow-rows.frozen.json');

const read = (segs) => encodeRow(splitRow(segs));
const digest = (inputs) => {
  const out = [];
  for (let k = 0; k < inputs.length; k += FROZEN_BLOCK) {
    const h = createHash('sha256');
    for (const segs of inputs.slice(k, k + FROZEN_BLOCK)) h.update(`${JSON.stringify(read(segs))}\n`);
    out.push(h.digest('hex').slice(0, 16));
  }
  return out;
};
const text = (s) => [{ kind: 'text', value: s }];

const fuzz = { text: flowFuzz(20_000).map(text), segFuzz: segFuzz(20_000) };
const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const frozen = {
  from: SHIPPED
    ? `lib/core/flowchart-grammar.js splitRow, re-frozen ${new Date().toISOString().slice(0, 10)} for an intended change (was: ${before?.from})`
    : 'tools/segno-legacy/flowchart-row.js (splitRow at a4fb527)',
  corpus: [...new Set(flowCorpus())].map((s) => [s, read(text(s))]),
  segments: flowSegCorpus().map((segs) => [segs, read(segs)]),
  text: digest(fuzz.text),
  segFuzz: digest(fuzz.segFuzz),
};

// What changed against the fixture on disk, row by row, for the PR body.
if (before) {
  const show = (x) => JSON.stringify(x);
  const changed = [];
  for (const key of ['corpus', 'segments']) {
    const old = new Map(before[key].map(([input, out]) => [show(input), show(out)]));
    for (const [input, out] of frozen[key]) {
      const was = old.get(show(input));
      if (was !== undefined && was !== show(out)) changed.push(`${key}  ${show(input)}\n  was ${was}\n  now ${show(out)}`);
    }
  }
  for (const key of ['text', 'segFuzz']) {
    frozen[key].forEach((d, b) => {
      if (before[key][b] === d) return;
      for (const segs of fuzz[key].slice(b * FROZEN_BLOCK, (b + 1) * FROZEN_BLOCK)) {
        const was = show(encodeRow(legacy.splitRow(segs)));
        if (was !== show(read(segs))) changed.push(`${key} block ${b}  ${show(segs)}\n  legacy ${was}\n  now    ${show(read(segs))}`);
      }
    });
  }
  console.log(changed.length ? `[freeze-flow-rows] ${changed.length} changed row(s):\n${changed.join('\n')}` : '[freeze-flow-rows] no existing row changed');
}
// One entry per line, so a diff of this file reads as a list of rows.
const lines = (xs) => `[\n${xs.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
writeFileSync(OUT, `{\n"from": ${JSON.stringify(frozen.from)},\n${['corpus', 'segments', 'text', 'segFuzz'].map((k) => `"${k}": ${lines(frozen[k])}`).join(',\n')}\n}\n`);
console.log(`[freeze-flow-rows] wrote ${path.relative(process.cwd(), OUT)}: ${frozen.corpus.length} corpus rows, ${frozen.segments.length} segment rows, ${frozen.text.length} + ${frozen.segFuzz.length} fuzz blocks`);
