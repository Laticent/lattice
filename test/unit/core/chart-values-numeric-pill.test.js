// lib/core/chart-values.js — NUMERIC_PILL stays linear on a long whitespace run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NUMERIC_PILL, isValuePill } = require('../../../lib/core/chart-values.js');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

test('NUMERIC_PILL accepts a wholly numeric pill and refuses prose', () => {
  for (const t of ['12', '$1,200', '-$0.8M', '($5M)', '62%', '3 ‰', '41 TB', '+ 12 M ', '−4.2bn']) {
    assert.equal(NUMERIC_PILL.test(t), true, t);
  }
  for (const t of ['PROJ-42', 'EMEA', '12 apples!', '$$$$1', '1 x!', '']) {
    assert.equal(NUMERIC_PILL.test(t), false, t);
  }
});

test('a failing match on a long tab run does not hang', () => {
  // The older pattern put a `\s*` run either side of an optional unit, so the engine tried every split of the tab run:
  // quadratic, about 150 s on 250,000 tabs. Every regex these two calls run must be one recheck calls linear
  // (test/helpers/regex-trace.js over tools/regex-census.json), which needs no clock (HARD RULE #32).
  const input = `1${'\t'.repeat(2_000)}x!`;
  // NUMERIC_PILL is composed from parts at load, so the census (literals only) cannot hold it.
  const allow = { [String(NUMERIC_PILL)]: 'built at load from string parts; `npm run regex:census -- --check` (recheck 4.6.2): safe' };
  assertLinearRegexes(
    () => {
      assert.equal(NUMERIC_PILL.test(input), false, 'NUMERIC_PILL');
      assert.equal(isValuePill(input), false, 'isValuePill');
    },
    { allow },
  );
});
