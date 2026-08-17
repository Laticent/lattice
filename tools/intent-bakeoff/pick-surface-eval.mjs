#!/usr/bin/env node

/**
 * pick-surface-eval.mjs — how much retrieval signal does `components.pick.md` carry
 * compared with the full `components.json`?
 *
 * Why this exists. #1701 routed component PICKING to a one-line-per-component surface
 * (3.8k tokens) and told agents not to load the 95k catalog to choose. The artifacts
 * were verified; the OUTCOME — does an agent still find the right component? — was not.
 * This is the cheapest honest proxy: the repo's own FIT corpus (every `whenToUse` body
 * is a described task whose component is ground truth; every redirecting `antiPattern`
 * names a better component), scored by the repo's own lexical ranker, over two evidence
 * sets:
 *
 *   FULL  description + purpose + tags + whenToUse + antiPatterns — what a reader of
 *         components.json has.
 *   PICK  name, bucket, the three axes, tags, the see-also neighbors, and the FIRST
 *         SENTENCE of purpose — exactly what a pick row carries.
 *
 * WHAT IT MEASURES, AND WHAT IT DOES NOT. It measures indexable signal for a lexical
 * ranker answering one query. It does NOT measure how an agent actually picks: the pick
 * list is 61 rows an agent reads whole, then follows `see also` and opens the chosen
 * component's `.docs.md` (HARD RULE #6). A gap here is not by itself evidence that
 * picking got worse — and no shipped surface ranks over the pick list (the Studio's
 * search indexes the full catalog, untouched). Treat the number as the cost of the
 * REMOVED TEXT, which is the same thing the grep-recall note records.
 *
 * LEAKAGE IS THE TRAP, and this file exists partly to keep the answer honest. A corpus
 * query is `title + body` of a whenToUse entry, so ANY index containing that entry is
 * scoring string equality. `fit-corpus.mjs` supplies `excludeKey` for leave-one-out;
 * a variant that smuggles whenToUse text into another field escapes that guard and
 * scores ~30 points too high. Measured: indexing whenToUse TITLES without leave-one-out
 * reads 71.6% top-1; with the guard applied it is 42.0% — identical to carrying no
 * whenToUse at all. Any future variant must keep the whenToUse STRUCTURE so excludeKey
 * still bites.
 *
 * Usage:
 *   node tools/intent-bakeoff/pick-surface-eval.mjs
 *   node tools/intent-bakeoff/pick-surface-eval.mjs --json
 *
 * Spends nothing: local ranker, local corpus, no model calls (HARD RULE #24).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFitCorpus } from './fit-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const JSON_OUT = process.argv.includes('--json');

const raw = JSON.parse(readFileSync(join(ROOT, 'dist/docs/components.json'), 'utf8')).components;

/** The fields both evidence sets share — axes and budgets, not prose. */
const base = (c) => ({
  name: c.name,
  bucket: c.bucket,
  function: c.function || '',
  form: c.form || '',
  substance: c.substance || '',
  family: '',
  familyLabel: '',
  capacity: c.capacity ?? null,
  density: c.density ?? null,
  slots: c.slots ?? {},
});

const FULL = raw.map((c) => ({
  ...base(c),
  description: c.description || '',
  purpose: c.purpose || '',
  tags: Array.isArray(c.tags) ? c.tags : [],
  whenToUse: c.whenToUse ?? [],
  antiPatterns: c.antiPatterns ?? [],
}));

// The same first-sentence rule `renderPickMd` applies, so this stays a faithful model
// of the row rather than a flattering one.
const firstSentence = (s) => String(s || '').match(/^(.{20,}?[.!?])(\s|$)/)?.[1] ?? String(s || '');

const PICK = raw.map((c) => ({
  ...base(c),
  description: '',
  purpose: firstSentence(c.purpose || c.description),
  tags: [
    ...(Array.isArray(c.tags) ? c.tags : []),
    ...(Array.isArray(c.related) ? c.related.map((r) => (typeof r === 'string' ? r : r?.name)).filter(Boolean) : []),
  ],
  whenToUse: [],
  antiPatterns: [],
}));

// Variants that keep the whenToUse STRUCTURE, so leave-one-out still removes the entry
// that generated the query. Both are recorded because both look like obvious remedies
// for a thin row, and both turn out to buy nothing once the leak is closed.
const PICK_TITLES = raw.map((c, i) => ({ ...PICK[i], whenToUse: (c.whenToUse ?? []).map((w) => ({ title: w?.title ?? '', body: '' })) }));
const PICK_ONE_SENTENCE = raw.map((c, i) => ({
  ...PICK[i],
  whenToUse: (c.whenToUse ?? []).map((w) => ({ title: w?.title ?? '', body: firstSentence(w?.body) })),
}));

const tmp = mkdtempSync(join(tmpdir(), 'pick-surface-eval-'));
let fit;
try {
  const out = join(tmp, 'fit-search.mjs');
  execFileSync('npx', ['esbuild', join(ROOT, 'tools/intent-bakeoff/fit-search.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'], {
    cwd: join(ROOT, 'docs'),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  fit = await import(pathToFileURL(out).href);

  const corpus = buildFitCorpus(FULL);

  /** Rank every case; leave-one-out is mandatory for any catalog carrying whenToUse. */
  const run = (catalog) => {
    let top1 = 0;
    let top3 = 0;
    const misses = [];
    for (const c of corpus) {
      const want = new Set(Array.isArray(c.expect) ? c.expect : [c.expect]);
      const index = fit.buildFitIndex(catalog, c.excludeKey ? { excludeKey: c.excludeKey } : {});
      const hits = fit.scoreFit(index, c.query).map((h) => h.name);
      if (want.has(hits[0])) top1 += 1;
      else misses.push({ kind: c.kind, want: [...want].join('/'), got: hits.slice(0, 3) });
      if (hits.slice(0, 3).some((h) => want.has(h))) top3 += 1;
    }
    return { n: corpus.length, top1, top3, misses };
  };

  const results = {
    full: run(FULL),
    pick: run(PICK),
    pickPlusTitles: run(PICK_TITLES),
    pickPlusOneSentence: run(PICK_ONE_SENTENCE),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ cases: results.full.n, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { top1: v.top1, top3: v.top3, n: v.n }])) }, null, 2));
  } else {
    const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
    const row = (label, r) => `${label.padEnd(28)} ${pct(r.top1, r.n).padEnd(9)} ${pct(r.top3, r.n)}`;
    console.log(`FIT corpus: ${results.full.n} cases\n`);
    console.log(`${''.padEnd(28)} top-1     top-3`);
    console.log(row('FULL catalog', results.full));
    console.log(row('PICK surface', results.pick));
    console.log(row('  + whenToUse titles', results.pickPlusTitles));
    console.log(row('  + 1st whenToUse sentence', results.pickPlusOneSentence));
    const d1 = ((results.pick.top1 - results.full.top1) / results.full.n) * 100;
    console.log(`\nPICK vs FULL: ${d1.toFixed(1)} pts top-1.`);
    console.log('Adding whenToUse text to the row does not close it — see the header on leakage.');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
