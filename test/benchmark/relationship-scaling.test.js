/**
 * ON-DEMAND perf tier — complexity guards that assert SCALING, not correctness.
 *
 * WHY THESE ARE NOT IN `npm test`. A wall-clock arm in the blocking unit suite is
 * a flake generator: `node --test` runs files in parallel, and this arm's own
 * measurement notes 3 failures in 12 runs under heavy oversubscription against 0
 * in 35 otherwise. CI is the oversubscribed case. It also cost 406ms of
 * `relationship.test.js`'s 954ms — 43% of the file's runtime for one test.
 *
 * That is the posture HARD RULE #19 already sets for `bench:check`: "on-demand,
 * not a blocking CI gate; the wall-clock band would be flaky in the merge train."
 * These live in the same tier for the same reason, beside `engine-bench.mjs`.
 *
 * Run them with `npm run test:perf`. Reach for that when you touch a scanner or a
 * regex on a hot path — the guards are cheap to run and they fail loudly when an
 * innocuous-looking regex change reintroduces a quadratic.
 *
 * These assert a RATIO, never a wall clock, which is what makes them meaningful
 * off the machine that wrote them: quadratic gives ~16x for 4x the input, linear
 * gives ~4x.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { labelOf, textOf } = require('../../lib/core/relationship');

describe('perf: relationship — the katex scan scales linearly', () => {
test('a tag that never closes costs LINEAR time, not quadratic', () => {
  // `<[a-zA-Z][\w-]*[^>]*>` has two overlapping quantifiers, so a tag with no `>` made the engine
  // re-split the name at every position — twice over, because the `<strong>` path repeats the run
  // `{1,3}` times. Measured through `labelOf`: 6.0s for a 40,000-character unclosed tag before,
  // 1ms after. The bound is deliberately loose (a wall clock in a merge train is not a stopwatch)
  // and still leaves a 3x margin UNDER the old cost, which is what makes it a regression guard
  // rather than a benchmark.
  // A RATIO, not a wall clock. The first cut of this arm asserted `< 2000ms` and claimed a "3x
  // margin under the old cost"; re-measured on the sandbox runner the old cost was 2254ms, so the
  // margin was 1.13x and hardware 15% faster would have passed the exact regression it names.
  // Scaling is the property that actually matters and it is machine-independent: quadratic gives
  // ~16x for 4x the input, linear gives ~4x. (HARD RULE #25 checker, third pass.)
  // The inputs MUST reach the katex scan. The first cut used `<` + 40,000 `a`s and `<span` + spaces
  // — both short-circuit on `stripMathMirror`'s `if (!html.includes('katex')) return html`, so the
  // arm never touched the code it was written to guard, and reverting `findKatexSpan` to the exact
  // quadratic regex it replaced passed all 9302 tests. `'katex' + '<span x='.repeat(n) + '>'` is
  // the shape that bites: MANY candidate tags sharing one far-away `>`, not one long tag.
  const once = (n) => {
    const at = process.hrtime.bigint();
    labelOf(`<${'a'.repeat(n)}`);
    textOf(`katex${'<span x='.repeat(n)}>`);
    return Number(process.hrtime.bigint() - at) / 1e6;
  };
  // MEDIAN of five, not one sample. A single `hrtime` pair over a ~1ms workload is one scheduler
  // preemption away from a 30x reading, and `node --test` runs files in parallel — measured at
  // 3 failures in 12 runs under heavy oversubscription, 0 in 35 otherwise.
  const cost = (n) => {
    const runs = [];
    for (let i = 0; i < 5; i += 1) runs.push(once(n));
    return runs.sort((a, b) => a - b)[2];
  };
  cost(2000);
  const small = Math.max(cost(10000), 0.05);
  const big = cost(40000);
  assert.ok(big / small < 8, `4x the input cost ${(big / small).toFixed(1)}x the time — superlinear`);
});
});
