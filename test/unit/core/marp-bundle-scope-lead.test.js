/**
 * lib/core/marp-bundle-scope.js reads a line's container prefix with a walker, `commentLeadEnd`, in place of an
 * exponential regex (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). The walker is held to the old pattern by a
 * seeded differential fuzz (seed 3045, printed in every failure) and to linear work by a character-read count.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { __commentLeadEndForTest: commentLeadEnd, __unquoteForTest: unquote, withMarpScope } = require('../../../lib/core/marp-bundle-scope');
const { mulberry32 } = require('../../helpers/regex-differential');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The pattern the walker replaced. Tests sit outside the census, which reads lib/** only.
const OLD = /^((?:[ ]{0,3}(?:>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+))*[ ]{0,3})(<!--.*?-->)/;
const old = (line) => {
  const m = OLD.exec(line);
  return m ? m[1].length : -1;
};

// Every piece the pattern reasons about, and the ones that sit on its edges: a tenth digit, a tab where only a space
// may go, a fourth space, a comment that closes after a line separator.
const PIECES = ['>', '> ', '>\t', ' ', ' ', '  ', '\t', '-', '* ', '+\t', '1', '9', '0', '123456789', '.', ')', '. ', ') ',
  '<!--', '-->', '<!-- x -->', '<!--->', '<', '!', 'a', ' ', '\r'];

describe('commentLeadEnd answers as the regex it replaced', () => {
  test('a seeded fuzz: 100,000 short lines, no line where old and new disagree (seed 3045)', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 100000; i++) {
      let s = '';
      const len = Math.floor(rand() * 12);
      for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
      assert.equal(commentLeadEnd(s), old(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
    }
  });

  test('unquote answers as /^([\'"])(.*)\\1$/ did: 50,000 short values (seed 3045)', () => {
    const OLD_UNQUOTE = (v) => String(v ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    const pieces = ['"', "'", ' ', '\t', 'a', 'b c', '\n', '\u2028', '"x"', "'y'"];
    const rand = mulberry32(3045);
    for (let i = 0; i < 50000; i++) {
      let s = '';
      const len = Math.floor(rand() * 8);
      for (let j = 0; j < len; j++) s += pieces[Math.floor(rand() * pieces.length)];
      assert.equal(unquote(s), OLD_UNQUOTE(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
    }
  });

  test('the cases worth reading by name', () => {
    assert.equal(commentLeadEnd('<!-- _paginate: false -->'), 0);
    assert.equal(commentLeadEnd('> > - 1. <!-- _class: lead -->'), 9);
    assert.equal(commentLeadEnd('    <!-- x -->'), -1, 'four spaces is code, not a prefix');
    assert.equal(commentLeadEnd('1234567890. <!-- x -->'), -1, 'a list number has at most nine digits');
    assert.equal(commentLeadEnd('-<!-- x -->'), -1, 'a bullet needs a blank after it');
    assert.equal(commentLeadEnd('<!-- open'), -1, 'the comment must close on the line');
    assert.equal(commentLeadEnd('<!-- a\u2028b -->'), -1, 'a line separator ends the line, as `.` does');
  });
});

describe('commentLeadEnd is linear on the line its regex choked on', () => {
  test('a line of n quote markers with no comment reads O(n) characters, at 1,000 and 4,000 levels', () => {
    const work = (n) => charReads(() => commentLeadEnd('> '.repeat(n) + 'x') + commentLeadEnd('-    '.repeat(n) + 'x')).reads;
    const small = work(1000);
    const large = work(4000);
    // Linear: four times the line costs about four times the reads (the old pattern tried 2^n splits).
    assert.ok(large <= 4 * small + 16, `reads grew from ${small} to ${large} for 4x the line`);
    assert.ok(small <= 4 * 7000, `${small} reads for 7,000 characters of lines`);
  });

  test('withMarpScope runs only regexes the census calls linear on that line', () => {
    assertLinearRegexes(() => withMarpScope(`# A\n\n${'> '.repeat(20)}x\n`));
  });
});
