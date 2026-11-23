/**
 * chart-frame.js `trailingFooterMatch` and `trailingParagraphMatch` replace `/\s*<footer\b[\s\S]*?<\/footer>\s*$/` and
 * `/<p([^>]*)>([\s\S]*?)<\/p>\s*$/` in the caption lift (regex PR 3, followups.d/3045-p2-regex-recheck-gate.md). A seeded
 * differential fuzz holds each to its regex (HARD RULE #32: the seed is in every failure).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');
const { trailingFooterMatch, trailingParagraphMatch } = require('../../../lib/transformers/chart-frame');

const SEED = Number(process.env.FUZZ_SEED || 3045);
const shape = (m) => m && { index: m.index, m: [...m] };
function cases(pieces, hand, seed) {
  const rand = mulberry32(seed);
  const out = [...hand];
  for (let i = 0; i < 30000; i++) {
    let s = '';
    const n = Math.floor(rand() * 9);
    for (let j = 0; j < n; j++) s += pieces[Math.floor(rand() * pieces.length)];
    out.push(s);
  }
  return out;
}

test('trailingFooterMatch matches the footer regex (seeded differential fuzz)', () => {
  const pieces = ['<footer>', '</footer>', '<footer', '<footers>', ' ', '\n', ' ', 'x', '<p>', '>', '<footer_', '<footer-'];
  const hand = ['', '<footer></footer>', ' <footer>a</footer> ', 'x <footer>a</footer>\n', '<footer>a</footer> x', '<footers></footer>', '<footer>a</footer><footer>b</footer>'];
  for (const s of cases(pieces, hand, SEED)) {
    assert.deepEqual(shape(trailingFooterMatch(s)), shape(s.match(/\s*<footer\b[\s\S]*?<\/footer>\s*$/)), `seed ${SEED}, input ${JSON.stringify(s)}`);
  }
});

test('trailingParagraphMatch matches the caption regex (seeded differential fuzz)', () => {
  const pieces = ['<p>', '</p>', '<p', '<p class="a">', '<pre>', '>', ' ', '\n', 'x', '<em>', '</em>'];
  const hand = ['', '<p></p>', '<p>a</p> ', '<p a>b</p><p>c</p>', '<pre>x</p>', '<p>a</p>x', '<p</p>', 'x<p>a</p>\n\n'];
  for (const s of cases(pieces, hand, SEED + 1)) {
    assert.deepEqual(shape(trailingParagraphMatch(s)), shape(s.match(/<p([^>]*)>([\s\S]*?)<\/p>\s*$/)), `seed ${SEED + 1}, input ${JSON.stringify(s)}`);
  }
});

test('many unclosed openers run no regex', () => {
  const { keys } = assertLinearRegexes(() => {
    assert.equal(trailingFooterMatch('<footer '.repeat(100000)), null);
    assert.equal(trailingParagraphMatch('<p '.repeat(100000)), null);
  });
  assert.equal(keys.size, 0);
});
