/**
 * Complexity guards for the relationship scanner: they assert SCALING, not correctness.
 *
 * COUNTED WHERE A COUNT EXISTS (HARD RULE #32). This arm used to time `labelOf`/`textOf` at two input sizes and assert a ratio
 * under 8 on the median of five runs. A ratio of two timings still fails on a loaded runner: its own measurement noted
 * 3 failures in 12 runs under heavy oversubscription. Now the first test counts work with `scanWork`
 * (test/helpers/work-count.js), which catches a scan that restarts from every candidate tag and does not depend on the
 * machine. The second guards the overlapping-quantifier regexes this file replaced. Backtracking inside one regex has
 * no count to read, so it is a hang guard sized by F4: the old shapes need minutes on its inputs, and its bounds sit
 * 25 to 75 times above today's cost. The file stays in the on-demand `npm run test:perf` tier.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { labelOf, textOf } = require('../../lib/core/relationship');
const { scanWork } = require('../helpers/work-count');
const { assertLinearRegexes } = require('../helpers/regex-trace');
const { mulberry32 } = require('../helpers/regex-differential');
const { firstClause, dropTrailingPunct, closePunctGaps } = require('../../lib/core/relationship');

describe('perf: relationship — the katex scan scales linearly', () => {
  // `<[a-zA-Z][\w-]*[^>]*>` has two overlapping quantifiers, so a tag with no `>` made the engine re-split the name at
  // every position: 6.0 s for a 40,000-character unclosed tag through `labelOf`. The katex search was
  // `<span[^>]*\sclass="…katex`, which re-read every candidate tag up to one far-away `>`: 7.0 s for 100,000
  // characters. The inputs MUST reach the katex scan: `stripMathMirror` returns early without `katex`, so
  // `'katex' + '<span x='.repeat(n) + '>'` (many candidate tags sharing one far `>`) is the shape that bites.
  const N = 40000;
  const unclosed = `<${'a'.repeat(N)}`;
  const candidates = `katex${'<span x='.repeat(N)}>`;

  test('a tag that never closes, and many candidate tags, cost linear work', () => {
    // Measured 11 and 8 characters searched per input character, the same at 10,000 and 40,000. A search that restarts
    // at every candidate tag and reads to the far `>` covers about N / 2 per character.
    const perChar = (fn, input) => scanWork(() => fn(input)).scanned / input.length;
    assert.ok(perChar(labelOf, unclosed) <= 16, 'labelOf searched past linear on an unclosed tag');
    assert.ok(perChar(textOf, candidates) <= 16, 'textOf searched past linear on many candidate tags');
  });

  test('the two old regex shapes would hang here; every regex the scanner runs now is linear', () => {
    // No clock (HARD RULE #32): the defect was backtracking inside one regex exec, which no count sees. So the guard asks
    // the census instead: every pattern `labelOf` and `textOf` run on these inputs must be one recheck calls linear
    // (test/helpers/regex-trace.js). The label's three slow patterns are rewritten as linear readers, held to the old
    // patterns by the fuzz below.
    assertLinearRegexes(() => labelOf(`<${'a'.repeat(400)}`));
    assertLinearRegexes(() => textOf(`katex${'<span x='.repeat(150)}>`));
    assertLinearRegexes(() => labelOf(`<li>Alpha${' '.repeat(400)}— beta: gamma. delta, ${' '.repeat(400)}x</li>`));
  });
});

describe('the label readers answer as the regexes they replaced (seeded differential fuzz, seed 3045)', () => {
  // The old patterns (tests are outside the census, which reads lib/** only).
  const OLD_BREAK = /\s+[—–]\s+|:\s+|(?<=[a-z]{3})\.\s+/;
  const OLD_TAIL = /[.:;,]+$/;
  const OLD_GAP = /\s+([,;:.])/g;
  const PIECES = [' ', ' ', '\t', '\n', '\u00a0', '\u2028', '—', '–', '-', ':', '.', ',', ';', 'a', 'b', 'c', 'Q', '1', 'ab', 'xyz'];
  const draw = (rand) => {
    let s = '';
    const len = Math.floor(rand() * 13);
    for (let i = 0; i < len; i++) s += PIECES[Math.floor(rand() * PIECES.length)];
    return s;
  };
  test('firstClause, dropTrailingPunct and closePunctGaps match split / replace on 30,000 draws', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 30000; i++) {
      const s = draw(rand);
      assert.equal(firstClause(s), s.split(OLD_BREAK)[0], `firstClause ${JSON.stringify(s)}`);
      assert.equal(dropTrailingPunct(s), s.replace(OLD_TAIL, ''), `dropTrailingPunct ${JSON.stringify(s)}`);
      assert.equal(closePunctGaps(s), s.replace(OLD_GAP, '$1'), `closePunctGaps ${JSON.stringify(s)}`);
    }
  });
  test('mutation arm: the trace fails the old patterns on the same kind of input', () => {
    assert.throws(() => assertLinearRegexes(() => 'a  b'.replace(OLD_GAP, '$1')), /polynomial|unknown|does not hold/);
    assert.throws(() => assertLinearRegexes(() => 'a.'.replace(OLD_TAIL, '')), /polynomial|unknown|does not hold/);
  });
});
