/**
 * The field. `incumbent` is the shipped kernel itself, run through the same harness so its
 * own row is the control (it must read 100% against itself, or the harness is wrong).
 * Challengers load lazily and are skipped when not installed:
 *
 *     npm i --no-save peggy@5 nearley@2 moo ohm-js@17 parsimmon @lezer/generator @lezer/lr
 *
 * (chevrotain is already in the tree, under mermaid \u2192 langium.) None is a dependency: a
 * devDependency would imply a support commitment the bake-off has not earned.
 */
import { reference } from './reference.mjs';

export const ALL = ['incumbent', 'peggy', 'chevrotain', 'ohm', 'nearley', 'parsimmon', 'lezer'];

export async function loadCandidates(only) {
  const out = [];
  for (const n of only || ALL) {
    if (n === 'incumbent') { out.push({ name: n, impl: reference, buildMs: 0 }); continue; }
    try {
      const m = await import(`./impl/${n}.mjs`);
      out.push({ name: n, impl: m.impl, buildMs: m.buildMs, grammarFiles: m.grammarFiles });
    } catch (e) {
      if (e.code !== 'ERR_MODULE_NOT_FOUND' || !String(e.message).includes(`impl/${n}.mjs`)) console.error(`[${n}] failed to load: ${e.message}`);
    }
  }
  return out;
}
