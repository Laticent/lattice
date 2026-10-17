/**
 * Grades the writer test (criterion 5). Each writer file is {S1: {"1": text, ...}, ...}; labels map to candidates
 * through sheets.mjs. A slide counts only if the candidate's strict reader returns EXACTLY the canonical records with
 * no diagnostics. Writes writers.json.
 */
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, toRecords } from './candidates.mjs';
import { LABELS } from './sheets.mjs';
import { chooseTwelve } from './slides.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || '/tmp/claude-0/-home-user-lattice/6c14a229-d3f1-57bb-a80a-15db20763a55/scratchpad/writers';
const slides = chooseTwelve();
const by = Object.fromEntries(CANDIDATES.map((c) => [c.id, c]));
const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };

const out = { writers: [], candidates: {} };
for (const c of CANDIDATES) out.candidates[c.id] = { exact: 0, withDiagnostics: 0, wrong: 0, missing: 0, of: 0, errors: [] };
for (const n of [1, 2, 3]) {
  const file = path.join(DIR, `writer-${n}.json`);
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, 'utf8')); out.writers.push(n);
  for (const [label, id] of Object.entries(LABELS)) {
    const tally = out.candidates[id];
    slides.forEach((s, i) => {
      tally.of++;
      const text = data[label]?.[String(i + 1)];
      if (typeof text !== 'string') { tally.missing++; return; }
      const r = by[id].scan(text);
      const exact = same(toRecords(r.items), s.records);
      if (exact && !r.diagnostics.length) tally.exact++;
      else if (exact) tally.withDiagnostics++;
      else { tally.wrong++; tally.errors.push({ writer: n, slide: i + 1, category: s.category, diagnostics: r.diagnostics.map((d) => d.kind) }); }
    });
  }
}
writeFileSync(path.join(HERE, 'writers.json'), `${JSON.stringify(out, null, 2)}\n`);
for (const [id, t] of Object.entries(out.candidates)) console.log(id, `exact ${t.exact}/${t.of}`, `diag-only ${t.withDiagnostics}`, `wrong ${t.wrong}`, `missing ${t.missing}`);
