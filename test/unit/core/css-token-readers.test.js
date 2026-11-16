/**
 * `cssString` (lib/core/css-token-readers.js) copies plain characters a run at a time (PR #3153). It used to append them
 * one by one, which on a 4.5 MB data URL built a chain of 4.5 M strings per read (349 ms a read in Node, 278 ms of it
 * garbage collection), once per element the Studio's export swept. This reader sits on the security spine (HARD RULE #22),
 * so the run copy must read every string exactly as the one-by-one version did. This holds the two equal: the old reader
 * is kept below verbatim as the oracle, and a seeded draw (seed printed in each test name, HARD RULE #32) of strings rich
 * in escapes, every newline form, a trailing backslash, both quotes and astral characters is read by both.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { cssString, cssEscape, isCssNewline, newlineLength } = require('../../../lib/core/css-token-readers.js');
const { mulberry32 } = require('../../helpers/regex-differential');

/** The reader as it was before the run copy, character by character: the oracle. */
function cssStringOneByOne(s, at) {
  const q = s[at];
  let v = '';
  let j = at + 1;
  while (j < s.length && s[j] !== q && !isCssNewline(s[j])) {
    if (s[j] !== '\\') v += s[j++];
    else if (j + 1 >= s.length) j++;
    else if (isCssNewline(s[j + 1])) j += 1 + newlineLength(s, j + 1);
    else {
      const [d, n] = cssEscape(s, j);
      v += d;
      j = n;
    }
  }
  return [v, s[j] === q ? j + 1 : j];
}

// Pieces that matter to the tokenizer, and plain text between them.
const PIECES = ['\\', '\\\\', '\\"', "\\'", '\\\n', '\\\r\n', '\\\r', '\\\f', '\n', '\r', '\r\n', '\f', '"', "'", '\\72 ', '\\0', '\\110000', '\\D800 ', '\\1F600', '😀', 'é', ' ', '\t', 'abc', 'url(', ')', 'data:image/png;base64,', 'QUJD+/=='];

function draw(rnd) {
  const n = 1 + Math.floor(rnd() * 24);
  let out = '';
  for (let i = 0; i < n; i++) out += PIECES[Math.floor(rnd() * PIECES.length)];
  return out;
}

describe('cssString reads a run at a time exactly as it read one character at a time', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    test(`seed ${seed}: 2,000 drawn strings, from each quote`, () => {
      const rnd = mulberry32(seed);
      for (let k = 0; k < 2000; k++) {
        const q = rnd() < 0.5 ? '"' : "'";
        const s = `${rnd() < 0.3 ? 'x' : ''}${q}${draw(rnd)}${rnd() < 0.8 ? q : ''}${draw(rnd)}`;
        const at = s.indexOf(q);
        assert.deepEqual(cssString(s, at), cssStringOneByOne(s, at), `seed ${seed}, case ${k}: ${JSON.stringify(s)}`);
      }
    });
  }

  test('fixed cases: a backslash at the end of the input, an escaped quote, an escape that ends the string', () => {
    for (const s of ['"ab\\', '"a\\"b"', '"ab\\72"', "'a\\\nb'", '"\\', '""']) {
      assert.deepEqual(cssString(s, 0), cssStringOneByOne(s, 0), JSON.stringify(s));
    }
  });

  test('a photo-sized data URL reads the same', () => {
    const b64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo+/'.repeat(120_000);
    const s = `"data:image/jpeg;base64,${b64}=="`;
    assert.deepEqual(cssString(s, 0), cssStringOneByOne(s, 0));
    assert.equal(cssString(s, 0)[0].length, s.length - 2);
  });
});
