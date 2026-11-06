// lib/core/chart-values.js — NUMERIC_PILL stays linear on a long whitespace run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NUMERIC_PILL, isValuePill } = require('../../../lib/core/chart-values.js');

test('NUMERIC_PILL accepts a wholly numeric pill and refuses prose', () => {
  for (const t of ['12', '$1,200', '-$0.8M', '($5M)', '62%', '3 ‰', '41 TB', '+ 12 M ', '−4.2bn']) {
    assert.equal(NUMERIC_PILL.test(t), true, t);
  }
  for (const t of ['PROJ-42', 'EMEA', '12 apples!', '$$$$1', '1 x!', '']) {
    assert.equal(NUMERIC_PILL.test(t), false, t);
  }
});

test('a failing match on a long tab run does not hang', () => {
  // A hang guard, not a speed test (HARD RULE #32, F4). The older pattern put a `\s*` run either side of an optional
  // unit, so the engine tried every split of the tab run: quadratic, about 150 s on this input. Linear time is about
  // 2 ms. The 5 s bound only has to catch the hang; speed lives in `npm run bench`.
  const input = `1${'\t'.repeat(250_000)}x!`;
  const start = process.hrtime.bigint();
  assert.equal(NUMERIC_PILL.test(input), false, 'NUMERIC_PILL');
  assert.equal(isValuePill(input), false, 'isValuePill');
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms on 250,000 tabs`); // flaky-ok: hang guard — linear 2 ms, the old shape ~150 s at this size
});
