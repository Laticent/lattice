/**
 * Metamorphic relations for `axisDrift` — the move-vs-grow discrimination
 * (tools/lib/jank-drift.js).
 *
 * WHY METAMORPHIC, AND NOT EXAMPLE-BASED. `check-jank`'s geometry is only reachable
 * through a real Chromium render, so every claim about it has been checked by reading a
 * table produced by the thing under test. That is how this defect survived: the rig said
 * `DRIFT 9.0px ✗` about a mark that had not moved, and nothing could contradict it,
 * because the only available oracle was the rig itself.
 *
 * A metamorphic relation needs no oracle. It does not ask "is 9.0px the right answer?" —
 * it asks "when the input changes THIS way, must the output change THAT way?", which is
 * checkable even where the correct answer is unknown. Every relation below is either a
 * defect that actually happened (MR7) or an over-correction that fixing it could have
 * introduced (MR8) — the two ways this function can be wrong.
 *
 * WHAT THIS FILE DOES NOT COVER, so nobody reads it as more than it is: that the RIG feeds
 * this function faithful section-relative edges. That is a browser claim and it belongs in
 * test/integration/invariants/jank-sweep.test.js, which measures a real render. These
 * relations pin the arithmetic only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { spread, axisDrift } = require('../../../tools/lib/jank-drift.js');

// The OLD measure, kept here as a literal so the regression relations can show the two
// disagreeing. Importing the current implementation to check itself would certify whatever
// it happens to believe today.
const oldMeasure = (near, far) => Math.max(spread(near), spread(far));

// A deterministic generator — no global RNG, so a failure reproduces from its seed alone.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const SEEDS = [1, 7, 42, 99, 1234, 65535];
function boxes(seed, steps = 8) {
  const r = rng(seed);
  const near = [];
  const far = [];
  let n = r() * 500;
  let w = 10 + r() * 200;
  for (let i = 0; i < steps; i++) {
    n += (r() - 0.5) * 60;
    w = Math.max(1, w + (r() - 0.5) * 40);
    near.push(+n.toFixed(2));
    far.push(+(n + w).toFixed(2));
  }
  return { near, far };
}

test('MR1 determinism — the same edges always give the same answer', () => {
  for (const seed of SEEDS) {
    const { near, far } = boxes(seed);
    assert.equal(axisDrift(near, far), axisDrift(near, far), `seed ${seed}`);
  }
});

// TRANSLATION INVARIANCE IS EXACT IN THE REALS AND NOT IN FLOAT64, and the relation says
// so rather than being quietly loosened. Shifting a coordinate by -1000 and subtracting it
// back lands 3e-14 away (measured: 54.715 became 54.71500000000003 at seed 1). EPS is nine
// orders of magnitude under the tool's own 2px drift limit, so it cannot mask a defect —
// a tolerance anywhere near a pixel would, which is why it is a named constant and not an
// inline fudge.
const EPS = 1e-9;

test('MR2 translation invariance — sliding the whole coordinate system changes nothing', () => {
  // Drift is a claim about SPREAD, so it must not depend on where the origin sits. A
  // measure that read absolute coordinates anywhere would move when the section did.
  for (const seed of SEEDS) {
    const { near, far } = boxes(seed);
    const base = axisDrift(near, far);
    for (const shift of [-1000, 0.5, 10000]) {
      const got = axisDrift(near.map((v) => v + shift), far.map((v) => v + shift));
      assert.ok(Math.abs(got - base) < EPS, `seed ${seed} shift ${shift}: ${got} vs ${base}`);
    }
  }
});

test('MR3 order invariance — the sweep order does not change the answer', () => {
  // Steps are a set of observations, not a sequence, for this measure. If the answer moved
  // when the steps were reordered, it would be reporting a trend rather than a spread.
  for (const seed of SEEDS) {
    const { near, far } = boxes(seed);
    const idx = near.map((_, i) => i).reverse();
    assert.equal(axisDrift(idx.map((i) => near[i]), idx.map((i) => far[i])), axisDrift(near, far), `seed ${seed}`);
  }
});

test('MR4 scale equivariance — scaling every coordinate scales the drift', () => {
  // The measure is a length, so it must carry its units. A measure with a baked-in
  // absolute term would break this and would silently mis-rank marks at other sizes.
  for (const seed of SEEDS) {
    const { near, far } = boxes(seed);
    const base = axisDrift(near, far);
    for (const k of [2, 10, 0.25]) {
      const got = axisDrift(near.map((v) => v * k), far.map((v) => v * k));
      assert.ok(Math.abs(got - base * k) < EPS * Math.max(1, k), `seed ${seed} k ${k}: ${got} vs ${base * k}`);
    }
  }
});

test('MR5 a pure translation is reported in full, at either edge or the middle', () => {
  // The relation the whole measure exists to preserve: when the box really moves, say so.
  for (const d of [0.5, 9, 604]) {
    assert.equal(axisDrift([0, d], [100, 100 + d]), d, `translation of ${d}`);
  }
});

test('MR6 growth alone is never movement, whichever reference is pinned', () => {
  // Pinned at the NEAR edge: the far edge runs away.
  assert.equal(axisDrift([100, 100, 100], [110, 150, 300]), 0);
  // Pinned at the FAR edge: the near edge runs back. This is the page number.
  assert.equal(axisDrift([100, 80, 20], [300, 300, 300]), 0);
  // Pinned at neither, but symmetric about a fixed CENTRE — the third reference, and the
  // reason two were not enough.
  assert.equal(axisDrift([100, 90, 80], [200, 210, 220]), 0);
});

test('MR7 the regression itself — the engine page number, measured', () => {
  // THE REAL NUMBERS. A 12-page deck, `span.lat-pagination`, section-relative edges: the
  // right inset is 30px on all twelve pages, and at page 10 the numeral gains a digit so
  // the left edge steps 8.99px. Section width 1280, so far = 1280 - 30 = 1250.
  const near = [1241.02, 1241.02, 1241.02, 1241.02, 1241.02, 1241.02, 1241.02, 1241.02, 1241.02,
    1232.03, 1232.03, 1232.03];
  const far = near.map((_, i) => (i < 9 ? 1250.00 : 1250.00));
  assert.equal(axisDrift(near, far), 0, 'a mark at a constant right inset has not moved');
  // And the measure it replaced disagreed — which is what shipped `DRIFT 9.0px ✗`, exit 1,
  // against a mark doing exactly what a page number should do.
  assert.ok(Math.abs(oldMeasure(near, far) - 8.99) < 0.011, `old measure said ${oldMeasure(near, far)}`);
});

test('MR8 the over-correction guard — a sideways walk is still caught in full', () => {
  // The measure this replaced was itself written for a defect: a mark that walked 604px
  // sideways, entirely off the slide, while the tool reported `0.0px ok`. Trading that
  // back for the page-number fix would be a strictly worse rig, so the old case is pinned
  // here on purpose, next to the new one.
  const near = [0, 200, 400, 604];
  const far = near.map((v) => v + 48);
  assert.equal(axisDrift(near, far), 604);
  assert.equal(axisDrift(near, far), oldMeasure(near, far), 'both measures agree on a true walk');
});

test('MR9 drift never exceeds either edge spread', () => {
  // A bound, not an equality: `min` can only ever report less than what it takes the
  // minimum of. If drift could exceed an edge's own spread the arithmetic is wrong
  // somewhere, whatever the inputs look like.
  for (const seed of SEEDS) {
    const { near, far } = boxes(seed);
    const d = axisDrift(near, far);
    assert.ok(d <= spread(near) + EPS && d <= spread(far) + EPS, `seed ${seed}`);
    assert.ok(d >= 0, `seed ${seed} produced a negative drift`);
  }
});

test('MR10 fewer than two observations is no claim at all', () => {
  // A one-step sweep has no spread to report. Returning 0 is right; throwing or NaN is not
  // — the caller prints this number, and `NaN > limit` is false, which is how a comparison
  // against a missing measurement reads as a pass.
  assert.equal(axisDrift([], []), 0);
  assert.equal(axisDrift([5], [10]), 0);
});

test('MR11 a measurement that did not happen is refused, never averaged', () => {
  // This tool's standing contract is that it must not produce a confident wrong number.
  // A non-finite coordinate is a missing measurement; silently skipping it would compute a
  // spread over the steps that DID resolve and report it as the whole sweep's.
  assert.throws(() => axisDrift([0, Number.NaN], [10, 20]), TypeError);
  assert.throws(() => axisDrift([0, 10], [10, Infinity]), TypeError);
  assert.throws(() => axisDrift([0, 1, 2], [10, 20]), TypeError);
});
