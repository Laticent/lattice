/**
 * lib/core/fence-opener.js replaces the fence-opener regex about ten readers wrote (HARD RULE #32, the regex census).
 * Each lead variant is held to the pattern it replaces by a seeded differential fuzz over lines drawn from the
 * characters a fence line is made of, plus the line terminators `.` cannot cross; the old patterns are recheck
 * `polynomial` and the reader must be linear by the census.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { fenceOpener } = require('../../../lib/core/fence-opener');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The old patterns (tests are outside the census, which reads lib/** only).
const OLD = {
  blank: /^([ \t]*)(`{3,}|~{3,})(.*)$/,
  space: /^(\s*)(`{3,}|~{3,})(.*)$/,
  none: /^(`{3,}|~{3,})(.*)$/,
  3: /^ {0,3}(`{3,}|~{3,})(.*)$/,
};
const ALPHABET = ['`', '`', '`', '~', '~', '~', ' ', ' ', '\t', 'a', 'j', 's', '{', '}', '#', '.', '\r', '\u2028', '\u2029', '\u00a0', '\v'];
const plain = (m) => (m ? [...m] : null);

describe('fenceOpener', () => {
  for (const [lead, re] of Object.entries(OLD)) {
    const mode = lead === '3' ? 3 : lead;
    test(`answers as ${re} did, over 20,000 seeded lines (seed 3045)`, () => {
      const rand = mulberry32(3045);
      const cases = ['```', '~~~js', '   ```', '    ```', '``~~', '```js `x`', '\t~~~~ ~', '```\r', '```js\u2028', ' \u00a0```', '', '``'];
      for (let n = 0; n < 20_000; n++) {
        let s = '';
        const len = Math.floor(rand() * 14);
        for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
        cases.push(s);
      }
      for (const line of cases) assert.deepEqual(plain(fenceOpener(line, mode)), plain(re.exec(line)), JSON.stringify(line));
    });
  }

  test('is linear by the census on the input the old pattern was quadratic on', () => {
    const hostile = `\`\`\`${'`'.repeat(5_000)}\u2028`;
    assertLinearRegexes(() => {
      for (const mode of ['blank', 'space', 'none', 3]) assert.equal(fenceOpener(hostile, mode), null);
    });
  });

  test('keeps the caller group numbers', () => {
    const m = fenceOpener('  ```js', 'blank');
    assert.deepEqual([m[1], m[2], m[3]], ['  ', '```', 'js']);
    const n = fenceOpener('~~~~ py', 'none');
    assert.deepEqual([n[1], n[2]], ['~~~~', ' py']);
  });
});
