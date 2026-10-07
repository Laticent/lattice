/**
 * freeze-list-text — write test/unit/tools/fixtures/list-text.frozen.json, the oracle the list-text
 * grammar (lib/core/list-text-grammar.js) is held to now that it IS the kernel.
 *
 * Segno phase 3 replaced nine hand-written readers (the leading state marker in four shapes, the
 * bare marker cell, the matrix-grid cell and narration's two readings, `_track`) with readers that walk one generated parser.
 * Before it did, this script recorded what the old readers returned, read from their frozen copy
 * in tools/segno-legacy/list-text.js, so test/unit/tools/list-text-grammar.test.js compares
 * against something other than the grammar itself:
 *
 *   corpus   every distinct candidate string in the shipped decks and docs, and the literals of
 *            the tests that pin the readers, that at least one reader answered: all nine
 *            outputs, in full
 *   quiet    the near misses: every other candidate that LEADS with a bracket or a tag, input
 *            only, because each reader's answer is the empty one (`QUIET` in list-text.mjs)
 *   fuzz     listTextFuzz(20,000): one SHA-256 (16 hex characters) per block of 100 inputs
 *
 * CHANGING THE SYNTAX ON PURPOSE is the one reason to freeze from the SHIPPED readers instead:
 * `--from-shipped` reads lib/core and prints every input whose output changes. Paste that list
 * into the PR body. Never point the freeze at the shipped readers to make a red test pass.
 *
 * Usage:  node tools/parser-bakeoff/freeze-list-text.mjs [--from-shipped]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { answered, encode, FROZEN_BLOCK, listTextCorpus, listTextFuzz, shippedReaders } from './list-text.mjs';

const require = createRequire(import.meta.url);
const legacy = require('../segno-legacy/list-text.js').readers;
const SHIPPED = process.argv.includes('--from-shipped');
const readers = SHIPPED ? await shippedReaders() : legacy;
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../test/unit/tools/fixtures/list-text.frozen.json');

const read = (s) => encode(readers, s);
const fuzz = listTextFuzz(20_000);
const digest = (inputs) => {
  const out = [];
  for (let k = 0; k < inputs.length; k += FROZEN_BLOCK) {
    const h = createHash('sha256');
    for (const s of inputs.slice(k, k + FROZEN_BLOCK)) h.update(`${JSON.stringify(read(s))}\n`);
    out.push(h.digest('hex').slice(0, 16));
  }
  return out;
};

const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const frozen = {
  from: SHIPPED
    ? `lib/core list-text readers, re-frozen ${new Date().toISOString().slice(0, 10)} for an intended change (was: ${before?.from})`
    : "tools/segno-legacy/list-text.js (the regex readers at f75d280; the Compose editor's at 7a7ad30)",
  fuzz: digest(fuzz),
};
const all = listTextCorpus().sort().map((s) => [s, read(s)]);
frozen.corpus = all.filter(([s, out]) => answered(s, out));
frozen.quiet = all.filter(([s, out]) => !answered(s, out) && /^\s*[[<\\]/.test(s)).map(([s]) => s);

if (before) {
  const show = (x) => JSON.stringify(x);
  const changed = [];
  const old = new Map(before.corpus.map(([input, out]) => [input, show(out)]));
  for (const [input, out] of frozen.corpus) {
    const was = old.get(input);
    if (was !== undefined && was !== show(out)) changed.push(`corpus  ${show(input)}\n  was ${was}\n  now ${show(out)}`);
  }
  frozen.fuzz.forEach((d, b) => {
    if (before.fuzz[b] === d) return;
    for (const s of fuzz.slice(b * FROZEN_BLOCK, (b + 1) * FROZEN_BLOCK)) {
      const was = show(encode(legacy, s));
      if (was !== show(read(s))) changed.push(`fuzz block ${b}  ${show(s)}\n  legacy ${was}\n  now    ${show(read(s))}`);
    }
  });
  console.log(changed.length ? `[freeze-list-text] ${changed.length} changed input(s):\n${changed.join('\n')}` : '[freeze-list-text] no existing input changed');
}
// One entry per line, so a diff of this file reads as a list of inputs.
const lines = (xs) => `[\n${xs.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
writeFileSync(OUT, `{\n"from": ${JSON.stringify(frozen.from)},\n${['corpus', 'quiet', 'fuzz'].map((k) => `"${k}": ${lines(frozen[k])}`).join(',\n')}\n}\n`);
console.log(`[freeze-list-text] wrote ${path.relative(process.cwd(), OUT)}: ${frozen.corpus.length} answered + ${frozen.quiet.length} quiet corpus inputs, ${frozen.fuzz.length} fuzz blocks`);
