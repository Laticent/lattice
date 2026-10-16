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

test('a failing match on 50,000 tabs takes milliseconds, not seconds', () => {
  // The older pattern put two `\s*` runs either side of optional pieces, so the engine tried
  // every split of the tab run: this input took about 3 s. Linear time runs it in well under 1 ms;
  // the 200 ms ceiling only has to catch the quadratic shape, not time a machine.
  const input = `1${'\t'.repeat(50_000)}x!`;
  for (const [name, check] of [
    ['NUMERIC_PILL', (s) => NUMERIC_PILL.test(s)],
    ['isValuePill', (s) => isValuePill(s)],
  ]) {
    const start = process.hrtime.bigint();
    assert.equal(check(input), false, name);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.ok(ms < 200, `${name} took ${ms.toFixed(1)} ms on the tab-run input`);
  }
});
