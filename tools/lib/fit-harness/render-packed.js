#!/usr/bin/env node
/**
 * render-packed — run the CLI with today's split builders packing K members a page instead of one,
 * so the fit harness can score the packed hybrid (2026-10-27-fluid-layout-library.md §13.1) before
 * P2 builds it.
 *
 *   node tools/lib/fit-harness/render-packed.js <K> <deck.md> <out.html> [CLI flags…]
 *
 * It replaces `@laticent/fluido`'s `planSlide` in the require cache before the engine loads, so a
 * `paginate` move asks for K members a page; the envelope and the plain partition build the pages
 * exactly as they do today. A component with its own split recipe keeps its manifest's pacing, so
 * this packs the generic path only.
 */
const path = require('node:path');

const K = Number(process.argv[2]);
if (!Number.isInteger(K) || K < 1) {
  console.error('usage: render-packed.js <K> <deck.md> <out.html> [CLI flags…]');
  process.exit(2);
}
const resolved = require.resolve('@laticent/fluido', { paths: [path.join(__dirname, '../../..')] });
const fluido = require(resolved);
// Count the calls, so a swap that stops taking effect (the engine loaded first, a bundled CLI, an
// ESM build) fails loudly instead of quietly scoring today's split under a packed name.
let calls = 0;
require.cache[resolved].exports = {
  ...fluido,
  planSlide: (facts, readSeam) => {
    calls++;
    const move = fluido.planSlide(facts, readSeam);
    return move.kind === 'paginate' ? { ...move, perPage: K } : move;
  },
};
process.on('exit', (code) => {
  if (code === 0 && calls === 0) {
    process.stderr.write('render-packed: the split never asked the replaced planSlide; nothing was packed\n');
    process.exitCode = 3;
  }
});
process.argv.splice(1, 2, path.join(__dirname, '../../../lattice.js'));
require('../../../lattice.js');
