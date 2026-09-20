/**
 * One (library, operation, input) measurement per process.
 *
 * Isolated deliberately: jsdom's windows do not fully free on `close()`, so a
 * long-lived process measuring it fills the heap and dies part-way through the
 * matrix (it did, twice, while this harness was being written). Isolation also
 * stops one candidate's GC pressure from taxing the next one's numbers.
 *
 * Driven by speed.mjs — not usually run by hand.
 */
import { closeWindow, loadAdapters } from './adapters.mjs';
import { fixtures } from './fixtures.mjs';

const [lib, opIdx, inIdx] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const adapters = await loadAdapters();
const a = adapters[lib];
if (!a) { console.log(JSON.stringify({ lib, ms: null, err: 'not installed' })); process.exit(0); }

const FIX = await fixtures();
const INPUTS = [
  ['median slide', FIX.slideMedian, 120],
  ['heaviest slide', FIX.slideHeaviest, 15],
  ['whole deck', FIX.deck, 4],
];
const OPS = [
  ['parse', (html) => () => { const { root, window } = a.parse(html); const ok = !!root; closeWindow(window); return ok; }],
  ['parse + serialize', (html) => () => { const { root, window } = a.parse(html); const n = root.innerHTML.length; closeWindow(window); return n; }],
  ['parse + query + mutate + serialize', (html) => () => {
    const { root, doc, window } = a.parse(html);
    // Array.from, not `for...of`: domino's NodeList has no Symbol.iterator, and timing
    // my own iteration idiom instead of the library's query would measure the wrong thing.
    for (const s of Array.from(root.querySelectorAll('section'))) {
      const h = s.querySelector('h1, h2');
      if (h) { const b = doc.createElement('span'); b.className = 'mark'; h.appendChild(b); }
    }
    const n = root.innerHTML.length; closeWindow(window); return n;
  }],
];

const [opName, make] = OPS[opIdx];
const [label, html, iters] = INPUTS[inIdx];
const p50 = (x) => x.slice().sort((m, n) => m - n)[Math.floor(x.length / 2)];

let ms = null; let err = null;
try {
  const fn = make(html);
  fn(); // probe support before timing, so an unsupported op reports rather than skews
  for (let i = 0; i < Math.max(2, Math.ceil(iters / 3)); i++) fn(); // warm
  const means = [];
  for (let s = 0; s < 5; s++) {
    if (global.gc) global.gc();
    const t = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    means.push(Number(process.hrtime.bigint() - t) / 1e6 / iters);
  }
  ms = p50(means);
} catch (e) { err = String(e.message).slice(0, 64); }

console.log(JSON.stringify({ lib, version: a.version, op: opName, opIdx, input: label, inIdx, bytes: html.length, iters, ms, err }));
