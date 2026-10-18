/**
 * Combines results.json, writers.json and rubrics.mjs with the PRE-REGISTERED weights (pre-registration §3) and applies
 * the gates (§7). One scoring rule was under-specified there and is fixed here, in the open:
 *   criterion 2 = 15 x (0.6 x (1 - min(meanExtraVisibleChars / 200, 1)) + 0.4 x structureIntactRate)
 * (an absolute scale, because the pre-registered "best gets full points" divides by zero when two candidates show no
 * visible junk at all).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC } from './rubrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(path.join(HERE, 'results.json'), 'utf8')).candidates;
const WP = path.join(HERE, 'writers.json');
const W = existsSync(WP) ? JSON.parse(readFileSync(WP, 'utf8')) : null;
const ids = Object.keys(R);

const prop = (get, higherBetter, max) => {
  const vals = Object.fromEntries(ids.map((i) => [i, get(i)]));
  const best = higherBetter ? Math.max(...Object.values(vals)) : Math.min(...Object.values(vals));
  return Object.fromEntries(ids.map((i) => [i, best === 0 ? max : max * (higherBetter ? vals[i] / best : best / vals[i])]));
};
const sizeScore = () => {
  const lines = prop((i) => R[i].c4_size.medianLines, false, 1); const chars = prop((i) => R[i].c4_size.medianChars, false, 1);
  return Object.fromEntries(ids.map((i) => [i, 10 * (0.5 * lines[i] + 0.5 * chars[i])]));
};
const speedBase = R.C0.c9_speed.medianMs;

const pts = {
  '1 parser pains (20)': prop((i) => R[i].c1_parser.passed / R[i].c1_parser.of, true, 20),
  '2 rendering outside Lattice (15)': Object.fromEntries(ids.map((i) => [i, 15 * (0.6 * (1 - Math.min(R[i].c2_rendering.meanExtraVisibleChars / 200, 1)) + 0.4 * R[i].c2_rendering.structureIntactRate)])),
  '3 jank (15)': prop((i) => R[i].c3_jank.passed / R[i].c3_jank.of, true, 15),
  '4 authoring size (10)': sizeScore(),
  '5 authoring correctness (15)': W?.writers.length ? prop((i) => W.candidates[i].exact / W.candidates[i].of, true, 15) : Object.fromEntries(ids.map((i) => [i, null])),
  '6 validation and completion (10)': Object.fromEntries(ids.map((i) => [i, RUBRIC[i].c6.filter((x) => x.yes).length])),
  '7 house style and LFM fit (5)': Object.fromEntries(ids.map((i) => [i, RUBRIC[i].c7.filter((x) => x.yes).length])),
  '8 Marp bridge (5)': prop((i) => R[i].c8_marp.passed / R[i].c8_marp.of, true, 5),
  '9 speed (5)': Object.fromEntries(ids.map((i) => [i, R[i].c9_speed.medianMs > 2 * speedBase ? 5 * (speedBase / R[i].c9_speed.medianMs) : 5])),
};
const gates = Object.fromEntries(ids.map((i) => [i, {
  'G1 lossless notes': R[i].gate1_lossless_notes,
  'G2 line-preserving': R[i].gate2_line_preserving,
  'G3 no silent loss': R[i].gate3_no_silent_loss.passed === R[i].gate3_no_silent_loss.of,
}]));
const total = Object.fromEntries(ids.map((i) => [i, Object.values(pts).reduce((a, p) => a + (p[i] ?? 0), 0)]));

const f = (x) => (x === null ? 'n/a' : x.toFixed(1));
const lines = [];
lines.push(`| Criterion | ${ids.map((i) => `${i} ${R[i].name}`).join(' | ')} |`, `|---|${ids.map(() => '---').join('|')}|`);
for (const [k, v] of Object.entries(pts)) lines.push(`| ${k} | ${ids.map((i) => f(v[i])).join(' | ')} |`);
lines.push(`| **Total (100)** | ${ids.map((i) => `**${f(total[i])}**`).join(' | ')} |`);
lines.push('', '| Gate | ' + ids.join(' | ') + ' |', `|---|${ids.map(() => '---').join('|')}|`);
for (const g of Object.keys(gates.C0)) lines.push(`| ${g} | ${ids.map((i) => (gates[i][g] ? 'pass' : '**FAIL**')).join(' | ')} |`);
const out = { total, points: pts, gates, writersGraded: W?.writers || [] };
writeFileSync(path.join(HERE, 'scores.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(lines.join('\n'));
