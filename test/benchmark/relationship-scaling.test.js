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

  test('the two old regex shapes would hang here; the scanner does not', () => {
    // A hang guard, sized by F4: nothing counts backtracking inside one regex exec (test/helpers/work-count.js says
    // why), so each input is large enough that its old pattern needs minutes, with the bound far above today's cost.
    // Measured 2026-11-06: the unclosed tag 45 ms at 400,000 characters, against the old tag regex's 72 ms at 10,000
    // growing with the square (about 115 s here); the candidate tags 204 ms at 150,000, against the old katex search's
    // 3.2 s at 20,000 (about 180 s here).
    const time = (fn) => { const t0 = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t0) / 1e6; };
    const tag = time(() => labelOf(`<${'a'.repeat(400000)}`));
    assert.ok(tag < 5000, `an unclosed tag took ${tag.toFixed(0)} ms`); // flaky-ok: hang guard — linear 45 ms, the old shape about 115 s at this size
    const spans = time(() => textOf(`katex${'<span x='.repeat(150000)}>`));
    assert.ok(spans < 15000, `candidate tags took ${spans.toFixed(0)} ms`); // flaky-ok: hang guard — linear 204 ms, the old shape about 180 s at this size
  });
});
