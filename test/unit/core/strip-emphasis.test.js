/**
 * lib/core/table-row-label.js `stripEmphasis` replaces `/[*_]{1,3}(?=\S)([\s\S]*?\S)[*_]{1,3}/g` in `cellText` (regex
 * PR 3, followups.d/3045-p2-regex-recheck-gate.md). A seeded differential fuzz holds it to the regex (HARD RULE #32).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');
const { stripEmphasis } = require('../../../lib/core/table-row-label');

test('stripEmphasis matches the emphasis regex (seeded differential fuzz)', () => {
  const SEED = Number(process.env.FUZZ_SEED || 3045);
  const rand = mulberry32(SEED);
  const pieces = ['*', '*', '_', '_', '**', '***', 'a', 'b', ' ', '\n', ' ', 'x y'];
  const hand = ['', '*a*', '**a**', '***a***', '****a****', '*a', 'a*', '* a*', '*a *', '***', '**', '*_a_*', '_a_ *b*', '*a**b*'];
  for (let i = 0; i < 50000; i++) {
    let s = '';
    const n = Math.floor(rand() * 12);
    for (let j = 0; j < n; j++) s += pieces[Math.floor(rand() * pieces.length)];
    hand.push(s);
  }
  for (const s of hand) assert.equal(stripEmphasis(s), s.replace(/[*_]{1,3}(?=\S)([\s\S]*?\S)[*_]{1,3}/g, '$1'), `seed ${SEED}, input ${JSON.stringify(s)}`);
});

test('many marks with no close run no regex', () => {
  const s = '*a '.repeat(100000);
  const { keys } = assertLinearRegexes(() => assert.equal(stripEmphasis(s), s));
  assert.equal(keys.size, 0);
});
