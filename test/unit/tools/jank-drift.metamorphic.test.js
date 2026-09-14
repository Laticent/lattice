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
 * checkable even where the correct answer is unknown.
 *
 * THEY ARE NOT ALL EQUALLY STRONG, and an earlier version of this header claimed they were
 * ("every relation below is either a defect that actually happened or an over-correction") —
 * false of most of them. Read them in three tiers:
 *   · MR6/MR6b/MR7/MR7b/MR8 are the load-bearing ones: each is a defect that happened or a
 *     mutant that survived. MR7b and MR6b were both added after an independent checker
 *     found the suite could not tell `(near+far)/2` from `near+far`, and that the generator
 *     never produced a pinned edge at all.
 *   · MR2/MR3/MR4/MR5 are genuine properties, but exercised only over free-floating boxes.
 *   · MR1 is close to vacuous for a pure function, and MR9 is an axiom for `Math.min`.
 *     Both still kill non-`min` mutants, so they earn their place — but neither is evidence
 *     the measure is RIGHT.
 *   · MR12/MR13 are the WEAKEST pair here, and an earlier version of this note called MR13
 *     load-bearing, which a checker disproved. MR13's inner assertion is a tautology for any
 *     min-of-three implementation; what fails under the `Math.max` mutant is its corpus
 *     guard. MR12 kills no mutant this suite did not already kill. Both are kept for what
 *     they record rather than what they catch: MR12 pins exactness over generated shapes
 *     where MR5 pins three literals, and both carry the stronger claims they started as,
 *     which were false. Read them as documentation with an executable check attached.
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

/**
 * Free-floating boxes: both edges wander. Measured across all six seeds, the smallest
 * reference spread is 44.37px — no column is ever constant, so these NEVER produce the
 * pinned-edge shape MR6 is about. That was a real gap: for a while MR6 rested entirely on
 * three hand-written triples while the seeded relations exercised only this shape, which
 * every spread-based formula satisfies by construction. `pinnedBoxes` below closes it.
 */
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

/**
 * A box PINNED at one edge that only changes size — the page number's shape, and the one
 * the whole change is about. `which` picks which edge holds still.
 */
function pinnedBoxes(seed, which, steps = 8) {
  const r = rng(seed);
  const fixed = 100 + r() * 400;
  const sizes = Array.from({ length: steps }, () => +(5 + r() * 300).toFixed(2));
  return which === 'far'
    ? { near: sizes.map((w) => +(fixed - w).toFixed(2)), far: Array(steps).fill(fixed) }
    : { near: Array(steps).fill(fixed), far: sizes.map((w) => +(fixed + w).toFixed(2)) };
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

test('MR6b growth alone is never movement — over generated pinned boxes, both edges', () => {
  // The seeded half of MR6. `boxes()` cannot produce this shape at all, so without this the
  // pinned case was three literals and nothing else.
  for (const seed of SEEDS) {
    for (const which of ['near', 'far']) {
      const { near, far } = pinnedBoxes(seed, which);
      assert.equal(axisDrift(near, far), 0, `seed ${seed} pinned ${which}`);
      // And the measure it replaced called every one of these movement, which is the defect.
      assert.ok(oldMeasure(near, far) > 0, `seed ${seed} pinned ${which}: nothing to catch`);
    }
  }
});

test('MR6 growth alone is never movement, whichever reference is pinned', () => {
  // Pinned at the NEAR edge: the far edge runs away.
  assert.equal(axisDrift([100, 100, 100], [110, 150, 300]), 0);
  // Pinned at the FAR edge: the near edge runs back. This is the page number.
  assert.equal(axisDrift([100, 80, 20], [300, 300, 300]), 0);
  // Pinned at neither, but symmetric about a fixed CENTER — the third reference, and the
  // reason two were not enough.
  assert.equal(axisDrift([100, 90, 80], [200, 210, 220]), 0);
});

test('MR7 the regression itself — the engine page number, as the rig reports it', () => {
  // THE RIG'S OWN COLUMNS, not a reconstruction. Dumped out of `check-jank` on a 12-page
  // deck (`content`, wide, indaco, `paginate: true`, `--anchor 'span.lat-pagination'`):
  //
  //   L [1241 x9, 1232 x3]      R [1250 x12]
  //
  // The far edge is constant across all twelve pages; at page 10 the numeral gains a digit
  // and the near edge steps back. These are the values `axisDrift` actually receives —
  // `check-jank` rounds every coordinate to ONE DECIMAL before the measure sees it, so a
  // two-decimal figure cannot come from this rig at all. An earlier draft of this test
  // carried 1241.02 / 1232.03 / 8.99, which are the raw DOM insets read with a separate
  // browser probe. True numbers, wrong instrument, presented as this one's — in a file
  // whose whole thesis is that the rig's only oracle was itself.
  const near = [...Array(9).fill(1241), ...Array(3).fill(1232)];
  const far = Array(12).fill(1250);
  assert.equal(axisDrift(near, far), 0, 'a mark at a constant far edge has not moved');
  // And the measure it replaced disagreed — which is what shipped `DRIFT 9.0px` and exit 1
  // against a mark doing exactly what a page number should do. Exact, not approximate:
  // these are 1-dp values, so the subtraction is exact.
  assert.equal(oldMeasure(near, far), 9);
});

test('MR7b the third reference is the MIDPOINT, not the sum of the edges', () => {
  // A SURVIVING MUTANT, found by an independent checker. Dropping the `/ 2` — using
  // `near + far` instead of `(near + far) / 2` — passed all eleven other relations, because
  // MR4's scale equivariance and MR5's symmetric shapes are both blind to a constant factor
  // on one of the three columns. It is not cosmetic: it changes verdicts at the limit.
  //
  // The witness is the smallest case that separates them. near [0,10], far [100,94]:
  // the midpoints are 50 and 52, spread 2 — at the default 2px limit, a pass. Under the
  // mutant the sums are 100 and 104, spread 4 — a fail on a box whose midpoint moved 2px.
  assert.equal(axisDrift([0, 10], [100, 94]), 2);
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

/**
 * MR12/MR13 are the pair that turns "an adversary looked for a masked translation and did
 * not find one" into a statement about what CAN happen. The measure is a minimum over three
 * references, so a case that reads 0 is a case where SOME reference never moved — and the
 * three references are exactly the three ways a mark holds position while it grows: pinned
 * at its near edge, pinned at its far edge, or centered. That is the design intent, and
 * these two relations pin both halves of it.
 *
 * They are property-style rather than example-based: each runs over the seeded generators
 * plus the adversarial shapes below, so neither rests on a literal somebody chose.
 */

// Offset sequences for MR12 — monotone, oscillating, and negative-going.
const OFFSETS = [
  [0, 5, 10, 15, 20, 25, 30, 35],
  [0, 604, 0, 604, 0, 604, 0, 604],
  [0, -0.5, -1, -1.5, -2, -2.5, -3, -3.5],
];

// Shapes an adversary would reach for when trying to make a real translation read zero:
// oscillation, a single late step, opposite-direction edges, a degenerate box.
const ADVERSARIAL = [
  { near: [0, 50, 0, 50], far: [80, 130, 80, 130] },
  { near: [0, 0, 0, 90], far: [40, 40, 40, 130] },
  { near: [0, 30, 60], far: [200, 170, 140] },
  { near: [10, 10, 10], far: [10, 10, 10] },
  { near: [0, -25, -50], far: [60, 35, 10] },
  { near: [0, 1e-3, 2e-3], far: [5, 5.001, 5.002] },
];

function everyShape() {
  const out = [];
  for (const seed of SEEDS) {
    out.push({ label: `boxes(${seed})`, ...boxes(seed) });
    out.push({ label: `pinnedBoxes(${seed},near)`, ...pinnedBoxes(seed, 'near') });
    out.push({ label: `pinnedBoxes(${seed},far)`, ...pinnedBoxes(seed, 'far') });
  }
  ADVERSARIAL.forEach((s, i) => { out.push({ label: `adversarial[${i}]`, ...s }); });
  return out;
}

test('MR12 a rigid translation of a STATIC box reports the offset exactly', () => {
  // MR5 states this over three hand-written pairs; here it is over generated positions,
  // sizes and offset shapes. Near, far and midpoint are each the constant plus the offset,
  // so all three spreads equal the offset's and the minimum of them is exact — the half
  // that matters for a measure which only ever moves a verdict toward PASS.
  //
  // THE FIRST VERSION OF THIS RELATION CLAIMED MORE AND WAS FALSE: that adding the same
  // per-step offset to ANY box sequence reports at least the offset's spread. It does not.
  // Over `boxes(1)` an offset spreading 35 reported 34.92, because the box's own wander can
  // partly cancel the offset — `spread(a + b)` is not `spread(b)` once `a` varies. The
  // general truth is MR13's direction, not this one; stating it this way would have pinned
  // a property the measure does not have.
  for (const seed of SEEDS) {
    const r = rng(seed);
    for (const base of OFFSETS) {
      const at = +(r() * 400).toFixed(2);
      const w = +(5 + r() * 300).toFixed(2);
      const off = base.map((v) => +(v * (0.5 + r())).toFixed(2));
      const got = axisDrift(off.map((o) => at + o), off.map((o) => at + w + o));
      assert.ok(Math.abs(got - spread(off)) <= EPS,
        `seed ${seed}: offset spreading ${spread(off)} reported ${got}`);
    }
  }
});

test('MR13 a ZERO verdict always names a reference that held still', () => {
  // WHAT THIS DOES AND DOES NOT PIN, because the first version of this comment overstated it
  // and the doc quoting it inherited the overstatement. The inner assertion CANNOT fail for
  // any implementation that returns the min of exactly these three spreads: min <= EPS
  // implies some spread <= EPS, unconditionally, for any corpus (checked over 300,000
  // randomized shapes, zero inner failures). So this is not a search for a counter-example —
  // there is none to find, and that is the point worth recording.
  //
  // What it does pin is narrower and still worth having: that the function never returns
  // something SMALLER than the min of its three references, and that the corpus still
  // contains genuinely pinned shapes. The second half is the `informative` guard below, and
  // it is what fails under the `Math.max` mutant — so "MR13 kills that mutant" is a fact
  // about the guard, not about the direction the relation advertises. MR6b kills it directly.
  let informative = 0;
  const kinds = new Set();
  for (const { label, near, far } of everyShape()) {
    if (axisDrift(near, far) > EPS) continue;
    const mid = near.map((n, i) => (n + far[i]) / 2);
    const spreads = [
      ['near edge', spread(near)],
      ['far edge', spread(far)],
      ['midpoint', spread(mid)],
    ];
    const held = spreads.filter(([, sp]) => sp <= EPS);
    assert.ok(held.length > 0,
      `${label}: reported 0 drift while all three references moved `
      + `(near ${spread(near)}, far ${spread(far)}, mid ${spread(mid)})`);
    // A DEGENERATE zero carries no information: `adversarial[3]` is a box that never moves
    // and never grows, which every conceivable formula returns 0 for. Record WHICH reference
    // held instead of just counting, because the property this relation is quoted for is
    // that the three references are the three ways a mark holds position — and a scalar
    // floor cannot pin that. The corpus has 6 near-pinned, 6 far-pinned and exactly ONE
    // centered shape, so deleting that one would leave a count-based guard green with the
    // centered case gone entirely.
    if (spreads.some(([, sp]) => sp > EPS)) {
      informative += 1;
      for (const [kind] of held) kinds.add(kind);
    }
  }
  // AN EARLIER VERSION ASSERTED `informative >= 4`, and both halves were wrong: 4 was not
  // derived from anything (the corpus yields 13, and the `Math.max` mutant yields 0, so any
  // threshold >= 1 separates them), and the comment justifying it described "two free zeros"
  // keeping the guard green when the corpus contains exactly one degenerate shape. Requiring
  // all three kinds is the assertion the prose actually claims, and it still fails under the
  // mutant — which drives `informative` to 0 and `kinds` to empty.
  assert.deepEqual([...kinds].sort(), ['far edge', 'midpoint', 'near edge'],
    `the corpus must still exercise all three ways a mark holds position; saw ${[...kinds].sort().join(', ') || 'none'}`);
  assert.ok(informative > 0, 'no shape read 0 while something moved — the relation says nothing');
});
