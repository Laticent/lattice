// The inline-span tier's measurement, run by test/benchmark/engine-bench.mjs `inlineSpanTier` in a
// process of its own (that function's comment says why). Not a CLI of its own: it takes the
// fixture's path, times, and prints ONE line of JSON — `{ summary }`, or `{ skipped }` on a tree
// that lacks a piece.
//
//   node test/benchmark/inline-span-timer.mjs test/benchmark/fixtures/inline-spans.json
//
// THE METHOD is tools/parser-bakeoff/segno.mjs `timeSet`, copied rather than imported because
// that file is a script that runs its whole race on import: each row is timed in short slices that
// alternate between the shipped dispatcher and the retired pre-Segno kernel on the same spans, and
// the row's figure is the median of the per-slice ratios. Both halves of a pair run within a few
// hundred microseconds of each other, so the machine's drift cancels.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SLICES = 2000; // paired slices per row
const ROWS = {
  code: 'inline · ordinary code / retired kernel',
  directive: 'inline · directives / retired kernel',
};

let shipped;
let kernel;
try {
  shipped = require('../../lib/core/inline-code-directives.js');
  ({ reference: { inline: kernel } } = await import('../../tools/parser-bakeoff/reference.mjs'));
} catch {
  shipped = null;
}
if (typeof shipped?.escapedText !== 'function' || typeof shipped?.dispatches !== 'function' || typeof kernel !== 'function') {
  console.log(JSON.stringify({ skipped: 'this tree has no shipped dispatcher or retired kernel to time' }));
  process.exit(0);
}

const { spans } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// The job the markdown-it path asks first, for every span: is it escaped, and does a kind render
// it? `renderHtml` builds the result afterwards; that cost is the kinds', not the dispatcher's.
const shippedFn = (s) => shipped.escapedText(s) !== null || shipped.dispatches(s, null);

// TWO ROWS, because the cost is not spread evenly and one row would hide the cheap half. The spans
// that ARE directives (about 7%) carry about two thirds of the time, because `dispatches` really
// reads them: a 70-character avatar record costs microseconds. The other 93% are ordinary code,
// rejected in tens of nanoseconds by guards like `isDirective` — and a 15 ns regression there moved
// one combined row by about 5%, inside the band. The split is the SHIPPED path's own answer, so a
// change that turns a span into a directive (or back) moves the row counts and reads as WORKLOAD
// CHANGED.
const groups = { code: [], directive: [] };
for (const s of spans) groups[shippedFn(s) ? 'directive' : 'code'].push(s);

// One timer function per column: a shared one would have one `fn(s)` call site, and after the first
// column V8 would time the second through a megamorphic call.
const TIMER = `(fn, inputs, reps) => {
  const t = process.hrtime.bigint();
  for (let r = 0; r < reps; r++) for (const s of inputs) fn(s);
  return Number(process.hrtime.bigint() - t) / (reps * inputs.length);
}`;
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
let timers = 0;
const summary = [];
for (const [key, inputs] of Object.entries(groups)) {
  // A slice is one pass over the row's spans: about 100 µs for ordinary code, about 1 ms for the
  // directives — short enough that both halves of a pair see the same machine.
  const cols = [shippedFn, kernel].map((fn) => ({ fn, run: new Function(`return ${TIMER} // inline timer ${timers++}`)(), slices: [] }));
  for (const c of cols) c.run(c.fn, inputs, 200); // warm
  // Which column goes first rotates each slice, so neither always runs on the warmer half.
  for (let slice = 0; slice < SLICES; slice++) {
    for (let i = 0; i < cols.length; i++) { const c = cols[(slice + i) % cols.length]; c.slices.push(c.run(c.fn, inputs, 1)); }
  }
  const [live, old] = cols;
  summary.push({
    dataset: ROWS[key],
    spans: inputs.length,
    ratio: median(live.slices.map((t, i) => t / old.slices[i])),
    shippedNs: median(live.slices),
    kernelNs: median(old.slices),
  });
}
console.log(JSON.stringify({ summary }));
