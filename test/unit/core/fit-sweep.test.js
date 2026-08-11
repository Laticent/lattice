/**
 * Unit: lib/core/fit-sweep.js — WHEN the overflow probes run and over WHICH
 * slides.
 *
 * This is the policy that replaced `schedulePostMutation(check)`, and it is
 * pinned here rather than only in the runtime because the runtime's own watcher
 * needs a live browser: the previous scheduling decision lived inside the
 * bootstrap IIFE, was one line long, and had no test at all — which is how a
 * whole-document per-frame scan survived long enough to defeat the preview's
 * virtualization.
 *
 * The suite is written against the two failure directions that actually matter,
 * because they are not symmetrical:
 *
 *   · MEASURING TOO MUCH is a performance defect — the one being fixed.
 *   · MEASURING TOO LITTLE is a CORRECTNESS defect, and a silent one: an
 *     unmeasured slide has no ring, which is indistinguishable from a slide
 *     that fits. Every "skip" path below therefore gets a test proving it
 *     cannot fire on a slide whose geometry is unknown (#1299 is what that
 *     costs).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SWEEP_BAND_RATIO,
  inSweepBand,
  fitStateIsCurrent,
  planFitSweep,
} = require('../../../lib/core/fit-sweep');

const rect = (top, height = 720) => ({ top, bottom: top + height });

describe('inSweepBand — what counts as "in play"', () => {
  test('a slide on screen is in band', () => {
    assert.equal(inSweepBand(rect(0), 900), true);
    assert.equal(inSweepBand(rect(400), 900), true);
  });

  test('a slide within one viewport either side is in band', () => {
    // The margin exists so the verdict lands BEFORE the slide is looked at.
    assert.equal(inSweepBand(rect(-1000), 900), true, 'just above');
    assert.equal(inSweepBand(rect(1500), 900), true, 'just below');
  });

  test('a slide beyond the band is out', () => {
    assert.equal(inSweepBand(rect(-2000), 900), false, 'well above');
    assert.equal(inSweepBand(rect(2000), 900), false, 'well below');
  });

  test('the band is one viewport either side', () => {
    assert.equal(SWEEP_BAND_RATIO, 1);
    // A tighter band is a legitimate change; a band of zero is not, because the
    // measurement would then race the paint of the slide that triggered it.
    assert.ok(SWEEP_BAND_RATIO > 0, 'a zero band measures a slide only once it is already visible');
  });

  // ── The "cannot tell" cases. All must FAIL TOWARD MEASURING. ──────────────
  test('an unmeasurable rect is in band, never out', () => {
    assert.equal(inSweepBand(null, 900), true, 'no rect at all');
  });

  test('a degenerate all-zero rect is in band', () => {
    // What a section reports in jsdom, in a display:none host, and before first
    // layout. "I cannot see it" must not be reported as "it fits".
    assert.equal(inSweepBand({ top: 0, bottom: 0 }, 900), true);
  });

  test('no viewport height means measure everything', () => {
    assert.equal(inSweepBand(rect(9999), 0), true);
    assert.equal(inSweepBand(rect(9999), undefined), true);
  });
});

describe('fitStateIsCurrent — the per-slide cache key', () => {
  test('same generation and same box → already measured', () => {
    assert.equal(fitStateIsCurrent({ gen: 3, w: 1280, h: 720 }, 3, 1280, 720), true);
  });

  test('a new generation invalidates', () => {
    assert.equal(fitStateIsCurrent({ gen: 3, w: 1280, h: 720 }, 4, 1280, 720), false);
  });

  test('a changed box invalidates INSIDE a generation', () => {
    // The reason the box is part of the key at all: a lazily-decoded image or a
    // late chart can resize one slide with nothing bumping the generation, and
    // that slide's verdict is then stale while every other slide's is fine.
    assert.equal(fitStateIsCurrent({ gen: 3, w: 1280, h: 720 }, 3, 1280, 900), false, 'height moved');
    assert.equal(fitStateIsCurrent({ gen: 3, w: 1280, h: 720 }, 3, 1000, 720), false, 'width moved');
  });

  test('a slide never measured is not current', () => {
    assert.equal(fitStateIsCurrent(undefined, 0, 1280, 720), false);
    assert.equal(fitStateIsCurrent(null, 0, 1280, 720), false);
  });
});

describe('planFitSweep — the plan a triggered sweep acts on', () => {
  // A filmstrip: 10 stacked 720px slides, a 900px viewport scrolled to the top.
  const deck = (n = 10) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const plan = (sections, { generation = 1, state = new Map(), boxes = new Map() } = {}) =>
    planFitSweep({
      sections,
      generation,
      viewportH: 900,
      rectOf: (s) => rect(s.id * 720),
      boxOf: (s) => boxes.get(s) || { w: 1280, h: 720 },
      stateOf: (s) => state.get(s),
    });

  test('measures only the slides in the band', () => {
    const secs = deck();
    const out = plan(secs);
    // Band is -900…1800 against 720px slides at 0, 720, 1440, 2160, …
    assert.deepEqual(out.measure.map((m) => m.section.id), [0, 1, 2]);
    assert.equal(out.skipped.offBand, 7);
    assert.equal(out.total, 10);
  });

  test('skips slides already measured this generation', () => {
    const secs = deck();
    const state = new Map([[secs[0], { gen: 1, w: 1280, h: 720 }]]);
    const out = plan(secs, { state });
    assert.deepEqual(out.measure.map((m) => m.section.id), [1, 2]);
    assert.equal(out.skipped.current, 1);
  });

  test('a new generation re-measures everything in band', () => {
    const secs = deck();
    const state = new Map(secs.map((s) => [s, { gen: 1, w: 1280, h: 720 }]));
    const out = plan(secs, { generation: 2, state });
    assert.deepEqual(out.measure.map((m) => m.section.id), [0, 1, 2]);
    assert.equal(out.skipped.current, 0);
  });

  test('reports the box it measured at, so the caller can record the key', () => {
    const secs = deck(1);
    const out = plan(secs);
    assert.deepEqual(out.measure[0], { section: secs[0], w: 1280, h: 720 });
  });

  test('a box that changed is re-measured even inside one generation', () => {
    const secs = deck(1);
    const state = new Map([[secs[0], { gen: 1, w: 1280, h: 720 }]]);
    const boxes = new Map([[secs[0], { w: 1280, h: 900 }]]);
    const out = plan(secs, { state, boxes });
    assert.equal(out.measure.length, 1, 'a resized slide is stale even at the same generation');
  });

  test('is PURE — calling twice gives the same plan', () => {
    // The caller records the state, not this function; that is what makes the
    // plan inspectable by a bench or a debug overlay without side effects.
    const secs = deck();
    assert.deepEqual(plan(secs).measure.map((m) => m.section.id),
      plan(secs).measure.map((m) => m.section.id));
  });

  test('an unmeasurable deck is measured WHOLE, not skipped', () => {
    // jsdom, a hidden host, pre-layout. The skip paths must never be the reason
    // a slide goes unringed.
    const secs = deck();
    const out = planFitSweep({
      sections: secs,
      generation: 1,
      viewportH: 0,
      rectOf: () => null,
      boxOf: () => ({ w: 0, h: 0 }),
      stateOf: () => undefined,
    });
    assert.equal(out.measure.length, 10);
    assert.equal(out.skipped.offBand, 0);
  });

  test('counts what it passed over rather than silently truncating', () => {
    // HARD RULE #25: a sweep that covers 3 of 117 must be able to say so.
    const out = plan(deck(117));
    assert.equal(out.measure.length + out.skipped.offBand + out.skipped.current, out.total);
  });

  test('an empty deck plans nothing and reports nothing', () => {
    const out = plan([]);
    assert.deepEqual(out.measure, []);
    assert.equal(out.total, 0);
  });
});
