/**
 * parser-bakeoff errors — what each library says, out of the box, about an input it
 * refuses. The incumbent says nothing (it returns null) and lint-core writes every
 * diagnostic by hand, so this is the one axis where a library could hand us something free.
 * Shown on the value grammar, the only target where a strict "match or fail" grammar is the
 * natural shape; the other four accept-or-pass-through by design.
 *
 * Usage:  node tools/parser-bakeoff/errors.mjs
 */
const INPUTS = ['12 kgs of stuff', '$1.2.3M)x', '1e5'];

for (const n of ['peggy', 'chevrotain', 'ohm', 'nearley', 'parsimmon', 'lezer']) {
  let m;
  try { m = await import(`./impl/${n}.mjs`); } catch { continue; }
  console.log(`\n${n}`);
  for (const s of INPUTS) console.log(`  ${JSON.stringify(s).padEnd(18)} ${String(m.diagnose(s)).replace(/\s+/g, ' ').slice(0, 150)}`);
}
