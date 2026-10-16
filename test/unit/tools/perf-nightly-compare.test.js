/**
 * tools/perf-nightly-compare.mjs's inline-span arm (followup 2718-p4). The nightly reads its exit code:
 * 0 is a clean night, 1 files the rolling perf issue, 2 is a wiring bug. So each verdict below is pinned
 * through the real CLI on two hand-built `engine-bench --json` payloads, the shape the nightly writes.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const TOOL = join(__dirname, '../../../tools/perf-nightly-compare.mjs');
const render = { summary: [{ dataset: 'normal (jargon)', slides: 58, ms: 100, rmePct: 1 }] };
const exp = { summary: [{ dataset: 'export · normal', slides: 58, ms: 9000, rmePct: 5 }] };
const inlineRows = (code, directive) => ({
  summary: [
    { dataset: 'inline · ordinary code / retired kernel', spans: 4946, ratio: code, shippedNs: code * 12, kernelNs: 12 },
    { dataset: 'inline · directives / retired kernel', spans: 368, ratio: directive, shippedNs: directive * 60, kernelNs: 60 },
  ],
  skipped: null,
});

function compare(base, head) {
  const dir = mkdtempSync(join(tmpdir(), 'perf-compare-'));
  try {
    // A real dump carries the bench's tables above the object and "Done." after it.
    const dump = (o) => `=== tables ===\n${JSON.stringify(o, null, 2)}\nDone.\n`;
    writeFileSync(join(dir, 'base.json'), dump(base));
    writeFileSync(join(dir, 'head.json'), dump(head));
    const md = join(dir, 'engine-perf.md');
    const r = spawnSync(process.execPath, [TOOL, '--base', join(dir, 'base.json'), '--head', join(dir, 'head.json'), '--md', md], { encoding: 'utf8' });
    return { code: r.status, md: readFileSync(md, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const row = (md, name) => md.split('\n').find((l) => l.includes(name)) ?? '';

test('a clean night shows both inline rows for both arms and exits 0', () => {
  const { code, md } = compare({ render, export: exp, inline: inlineRows(2.7, 44.8) }, { render, export: exp, inline: inlineRows(2.74, 44.5) });
  assert.equal(code, 0, md);
  assert.match(md, /### Inline span/);
  assert.match(row(md, 'inline · ordinary code'), /2\.700× \| 2\.740× \| \+1\.5 \| ±12 \| ok/);
  assert.match(row(md, 'inline · directives'), /44\.800× \| 44\.500× .* ok/);
  assert.match(md, /Tiers measured: render, export, inline/);
});

test('a per-span regression past the 12% band files, where a cliff band would have passed it', () => {
  // +29%: what a per-span `includes` at the top of `dispatches` read (engineering/workflow.md).
  const { code, md } = compare({ render, export: exp, inline: inlineRows(2.7, 44.8) }, { render, export: exp, inline: inlineRows(3.48, 44.8) });
  assert.equal(code, 1);
  assert.match(row(md, 'inline · ordinary code'), /\+28\.9 \| ±12 \| \*\*REGRESSION\*\*/);
});

test('a tier only one arm ran is drift, a re-split fixture is a changed workload, and neither passes', () => {
  const drift = compare({ render, export: exp, inline: { summary: [], skipped: 'absent' } }, { render, export: exp, inline: inlineRows(2.7, 44.8) });
  assert.equal(drift.code, 1);
  assert.match(row(drift.md, 'inline · ordinary code'), /DATASET DRIFT/);
  assert.match(drift.md, /The base arm's timer reported `absent`/);
  const resplit = inlineRows(2.7, 44.8);
  resplit.summary[0] = { ...resplit.summary[0], spans: 4945 };
  const workload = compare({ render, export: exp, inline: inlineRows(2.7, 44.8) }, { render, export: exp, inline: resplit });
  assert.equal(workload.code, 1);
  assert.match(row(workload.md, 'inline · ordinary code'), /WORKLOAD CHANGED/);
});

test('an inline tier that broke on both arms is an alarm, not an absence', () => {
  const failed = { summary: [], skipped: 'failed' };
  const { code, md } = compare({ render, export: exp, inline: failed }, { render, export: exp, inline: failed });
  assert.equal(code, 1);
  assert.match(md, /SHOULD HAVE RUN PRODUCED NOTHING: `inline`/);
});

test('a ratio that collapsed is not a win', () => {
  const { code, md } = compare({ render, export: exp, inline: inlineRows(2.7, 44.8) }, { render, export: exp, inline: inlineRows(0.2, 44.8) });
  assert.equal(code, 1);
  assert.match(row(md, 'inline · ordinary code'), /WORKLOAD COLLAPSED/);
});
