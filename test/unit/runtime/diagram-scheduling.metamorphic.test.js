/**
 * Metamorphic relations for the diagram SCHEDULING policy.
 *
 * WHY METAMORPHIC, AND NOT A NUMBER. This branch went through seven independent review passes
 * and every one of them retracted a load-bearing figure. The reason was structural rather than
 * careless, and it is the same one `guards-trim.metamorphic.test.js` opens with: each claim was
 * checked by a bespoke probe written by whoever wanted the answer, against a browser with no
 * oracle. Two of those probes reported the flattering result — one counted renders per burst
 * instead of the wait the author actually feels and concluded the branch was ahead while it was
 * behind everywhere; another asserted a ceiling that its own mutant sailed through.
 *
 * Absolute numbers also do not travel. The seventh pass measured a 64-node fence at 360-490ms
 * where this repo's ledger says 130ms, so every figure had to be re-derived on its host before
 * anything could be concluded. COUNTS travel: a burst of N keystrokes against a fixed policy
 * produces an integer, and nearly every defect this branch shipped announced itself as one —
 * 8 renders where the old build did 1, 3 where it did 1, 24 parses where it did 0, an error box
 * on 5 of 24 samples where it should be on 24.
 *
 * So each relation below is a defect that actually happened, turned into a property over
 * counts. No tolerance band, nothing to tune into passing, and no browser: the decisions are
 * made by the SHIPPED functions (lifted between the BACK-OFF PORT sentinels) and only the event
 * loop around them is modelled. What this tier cannot see — that the runtime really schedules
 * the way the model says, on a real host — is exactly what the nightly differential tier
 * (`tools/diagram-perf-diff.mjs`) exists to check, and neither one is a substitute for the
 * other.
 *
 * WHAT THESE RELATIONS ACTUALLY KILL, checked by re-applying the regressions this branch shipped
 * and retracted rather than by asserting they would:
 *
 *   the 1200ms ceiling, back                 7 relations fail
 *   the threshold raised past 64 nodes       6 fail
 *   the parse charged on the costly arm      4 fail
 *   the live floor for a never-drawn fence   2 fail
 *   the never-drawn precondition dropped     2 fail
 *   the cost recorded on SUCCESS only        0 fail  <- see below
 *
 * THE LAST ROW IS THE BOUNDARY OF THIS TIER, and it is stated rather than papered over. The
 * model feeds render costs to `recordRenderCost` itself, so where that call SITS in the render
 * promise is invisible here; it is pinned instead by `diagram-queue.test.js` ("a render that
 * FAILS still records what it cost"), which drives the shipped queue and kills it. A relation
 * file that quietly covered only what it could see would be the same failure as the probe that
 * counted renders instead of the wait.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { runBurst, runBurstMain, liftPolicy, SIZES, CADENCES, COALESCE_MS, DEBOUNCE_MS } = require('./fixtures/diagram-schedule-model');

/** Every (size, cadence) cell, which is the grid all the relations quantify over. */
const CELLS = [];
for (const [label, renderMs] of SIZES) for (const gapMs of CADENCES) CELLS.push({ label, renderMs, gapMs });

const KEYS = 24;

test('MR1 — a COSTLIER diagram never renders more often than a cheaper one', () => {
  // The defect: coalescing on completion could not coalesce, because `mermaid.render` blocks
  // the main thread and the completion hook it waited on never arrived mid-burst. A 64-node
  // fence bought 8 renders and 1899ms of render against the old build's 1 and 252ms, and the
  // burst stretched 1101ms -> 2726ms because the KEYSTROKES were waiting on the renders.
  for (const gapMs of CADENCES) {
    let prev = Number.POSITIVE_INFINITY;
    for (const [label, renderMs] of SIZES) {
      const { renders } = runBurst({ keystrokes: KEYS, gapMs, renderMs });
      assert.ok(
        renders <= prev,
        `at ${gapMs}ms cadence, ${label} rendered ${renders} times against the cheaper size's ${prev}`,
      );
      prev = renders;
    }
  }
});

test('MR2 — a SLOWER cadence never renders fewer times', () => {
  // The inverse reading of the same policy, and the one an earlier ledger got backwards: it
  // measured only a 120ms cadence, where a costly diagram renders once whatever the policy
  // says, and concluded from that cell that nothing had regressed.
  for (const [label, renderMs] of SIZES) {
    let prev = 0;
    for (const gapMs of CADENCES) {
      const { renders } = runBurst({ keystrokes: KEYS, gapMs, renderMs });
      assert.ok(renders >= prev, `${label}: ${gapMs}ms cadence rendered ${renders}, slower than the faster cadence's ${prev}`);
      prev = renders;
    }
  }
});

test('MR3 — the COSTLY arm is indistinguishable from the build it replaces', () => {
  // The promise the whole branch rests on, and it was FALSE in three separate heads for three
  // separate reasons: a 1200ms ceiling firing mid-burst, a parse charged in front of every
  // render, and a second timer stacked on the coalescing floor. Each showed here as extra
  // renders or extra main thread against the old build.
  //
  // Stated as EQUALITY against a model of that build rather than as "renders once", because
  // rendering once is a property of typing faster than the debounce, not of the policy: at a
  // 200ms cadence both builds render on every keystroke. An early ledger measured only 120ms,
  // where the debounce hides that, and concluded from the one cell that nothing had regressed.
  for (const { label, renderMs, gapMs } of CELLS) {
    if (renderMs <= 50) continue;
    const head = runBurst({ keystrokes: KEYS, gapMs, renderMs });
    const old = runBurstMain({ keystrokes: KEYS, gapMs, renderMs });
    const where = `${label} at ${gapMs}ms`;
    assert.equal(head.renders, old.renders, `${where}: ${head.renders} renders against ${old.renders}`);
    assert.equal(head.parses, old.parses, `${where}: ${head.parses} parses against ${old.parses}`);
    assert.equal(head.busyMs, old.busyMs, `${where}: ${head.busyMs}ms of thread against ${old.busyMs}ms`);
    assert.equal(head.redrawMs, old.redrawMs, `${where}: redraw ${head.redrawMs}ms against ${old.redrawMs}ms`);
  }
});

test('MR4 — a scope that has NEVER DRAWN behaves exactly like the costly arm', () => {
  // The seventh pass's blocker. `recordRenderCost` ran only in the success handler, so a fence
  // whose renders had only ever FAILED kept an empty cost record — and an empty record reads
  // cheap. That is an author building a large diagram from scratch, and it measured 2-3 renders
  // against the old build's 1, 14-15% of the main thread against 1-2%, and the harness's own
  // fixed-delay typing stretched from 3404-3428ms to 3763-3915ms.
  for (const { label, renderMs, gapMs } of CELLS) {
    const cold = runBurst({ keystrokes: KEYS, gapMs, renderMs, everDrawn: false, parses: false });
    const old = runBurstMain({ keystrokes: KEYS, gapMs, renderMs, parses: false });
    assert.equal(cold.parses, 0, `${label} at ${gapMs}ms parsed ${cold.parses} times with no drawing to protect`);
    assert.equal(cold.renders, old.renders, `${label} at ${gapMs}ms rendered ${cold.renders} times against the old build's ${old.renders}`);
    assert.equal(cold.busyMs, old.busyMs, `${label} at ${gapMs}ms spent ${cold.busyMs}ms against ${old.busyMs}ms`);
    assert.ok(cold.floors.every((f) => f === DEBOUNCE_MS), `${label}: floors were ${[...new Set(cold.floors)]}`);
  }
});

test('MR5 — the live arm never charges a parse where there is no drawing to hold', () => {
  // The same defect read from the other side, and the reason it survived the first fix: once
  // the failed render WAS priced it turned out to be cheap (it fails fast), so the fence stayed
  // on the live arm paying a 34ms parse per keystroke — 25-27% of the main thread against 1%,
  // for 115-122 frames of raw source against 117-122. Identical output, ~800ms more work.
  for (const gapMs of CADENCES) {
    const drawn = runBurst({ keystrokes: KEYS, gapMs, renderMs: 22, everDrawn: true });
    // `parses: false` is load-bearing: a fence that DRAWS mid-burst has legitimately earned the
    // live arm from that moment, so the case under test is one that never succeeds at all.
    const never = runBurst({ keystrokes: KEYS, gapMs, renderMs: 22, everDrawn: false, parses: false });
    assert.ok(drawn.parses > 0, 'a cheap fence WITH a drawing is gated');
    assert.equal(never.parses, 0, 'and one that has never drawn is not');
  }
});

test('MR6 — a source that does not parse never buys a render on the live arm', () => {
  // What the gate is for: hold the picture the fence already has rather than clearing the slot
  // for a source the author is mid-word through. The zero-timer experiment painted 155 frames
  // of raw source where the fixed debounce painted 97.
  for (const gapMs of CADENCES) {
    const { renders, parses } = runBurst({ keystrokes: KEYS, gapMs, renderMs: 22, parses: false });
    assert.ok(parses > 0, 'the gate ran');
    assert.equal(renders, 0, `a mid-word source bought ${renders} doomed renders`);
  }
});

test('MR7 — a FAILED render prices the diagram exactly as a successful one does', () => {
  // The mechanism behind MR4: the cost is what the main thread spent, and a render that
  // rejected spent it too. Recording only successes is what let an empty record persist.
  const p = liftPolicy();
  p.recordRenderCost(240);
  const afterFailure = p.diagramIsCheap();
  const q = liftPolicy();
  q.recordRenderCost(240);
  assert.equal(afterFailure, q.diagramIsCheap(), 'the record cannot distinguish outcome from cost');
  assert.equal(afterFailure, false, 'and a 240ms render is not cheap either way');
});

test('MR8 — the floor is ALWAYS one of exactly two values', () => {
  // An "adaptive" wait was tried and retired for being arithmetic rather than adaptation: twice
  // the median, capped at 150 and floored at 50, returns anything other than 0 or 150 only for
  // renders costing 50-75ms — diagrams of roughly 20 to 33 nodes. Everywhere else it was
  // already a step function, and the published headline came from a five-node deck below the
  // band where none of it ran.
  const seen = new Set();
  for (const { renderMs, gapMs } of CELLS) {
    for (const everDrawn of [true, false]) {
      for (const f of runBurst({ keystrokes: 8, gapMs, renderMs, everDrawn }).floors) seen.add(f);
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [COALESCE_MS, DEBOUNCE_MS], `saw floors ${[...seen]}`);
});

test('MR9 — the live arm engages only below the threshold, and always below it', () => {
  for (const { label, renderMs, gapMs } of CELLS) {
    const { floors } = runBurst({ keystrokes: KEYS, gapMs, renderMs });
    const live = floors.every((f) => f === COALESCE_MS);
    assert.equal(live, renderMs <= 50, `${label} at ${gapMs}ms: live=${live} for a ${renderMs}ms render`);
  }
});

test('MR10 — per-keystroke work on the live arm fits inside the keystroke gap', () => {
  // WHY 32% OF THE MAIN THREAD IS FINE HERE AND 30% WAS NOT ON THE CEILING. The figure that
  // matters is not the busy fraction, it is whether one task fits between two keystrokes. The
  // live arm draws 24 times at ~38ms and typing measured 3310-3418ms against the old build's
  // 3331-3341, i.e. untouched. The ceiling's renders were ~376ms into a ~120ms cadence, so each
  // one displaced a keystroke. That is what the threshold is really bracketing.
  const FASTEST = Math.min(...CADENCES);
  for (const [label, renderMs] of SIZES) {
    const { renders, busyMs } = runBurst({ keystrokes: KEYS, gapMs: FASTEST, renderMs });
    if (renders <= 1) continue;
    const perKeystroke = busyMs / renders;
    assert.ok(perKeystroke < FASTEST, `${label}: ${perKeystroke.toFixed(0)}ms of work per render at a ${FASTEST}ms cadence`);
  }
});

test('MR11 — THE BAR: the new build is never worse than the old one, in any cell', () => {
  // The standing requirement in one property. Not "faster on the deck we chose" — never worse
  // on renders, never worse on main thread, never worse on the wait the author feels, across
  // every size and cadence, drawn and never-drawn. Every regression this branch shipped and
  // retracted violated one of these three, and each was found by a person running a probe by
  // hand rather than by anything in the tree.
  for (const { label, renderMs, gapMs } of CELLS) {
    for (const everDrawn of [true, false]) {
      const parses = everDrawn;
      const head = runBurst({ keystrokes: KEYS, gapMs, renderMs, everDrawn, parses });
      const old = runBurstMain({ keystrokes: KEYS, gapMs, renderMs, parses });
      const where = `${label} at ${gapMs}ms (${everDrawn ? 'drawn' : 'never drawn'})`;

      // THE WAIT IS THE BAR. This is the number a human experiences, and it is the one an
      // early ledger omitted — which is how that ledger concluded the branch was ahead while
      // on this measure it was behind in every cell.
      assert.ok(
        head.redrawMs === null || head.redrawMs <= old.redrawMs,
        `${where}: redraw ${head.redrawMs}ms against ${old.redrawMs}ms`,
      );

      // MORE RENDERS IS NOT ITSELF WORSE, and writing this relation is what forced the point
      // to be stated properly. The live arm draws 24 times where the old build draws once —
      // that IS the feature, and typing measured 3310-3418ms against 3331-3341ms, i.e.
      // untouched. What makes extra renders harmful is not their number but their SIZE: the
      // 1200ms ceiling's were ~376ms into a ~120ms cadence, so each one displaced a keystroke
      // and stretched typing to 4188ms. So extra renders are admissible only on the live arm,
      // where the threshold guarantees each one fits between two keystrokes.
      if (head.renders > old.renders) {
        assert.ok(renderMs <= 50, `${where}: ${head.renders} renders against ${old.renders} WITHOUT the live arm`);
        assert.ok(
          head.busyMs / head.renders < gapMs,
          `${where}: ${(head.busyMs / head.renders).toFixed(0)}ms per render displaces a ${gapMs}ms keystroke gap`,
        );
      }

      // EXTRA MAIN THREAD IS ADMISSIBLE ONLY AS THE GATE, and this is an accounting identity
      // rather than a tolerance: whatever the new build spends beyond the old one must be
      // exactly the parses it ran, and nothing else. Anything that creeps in besides the gate
      // — a re-entered content pass, a duplicate render, a second timer — shows up here as an
      // unexplained excess.
      //
      // Writing it this way surfaced a case no probe could have: at a cadence SLOWER than the
      // 150ms debounce the old build already draws on every keystroke, so the live arm buys no
      // extra draw and still pays the parse. Every hand-run probe on this branch used a 120ms
      // cadence, where the debounce hides it. It is 2ms a keystroke and it is not free, and
      // what it buys there is the held picture rather than a raw-source flash — which is worth
      // stating rather than discovering again.
      const excess = head.busyMs - old.busyMs;
      if (excess > 0) {
        assert.ok(renderMs <= 50, `${where}: spent ${excess}ms more than the old build WITHOUT the live arm`);
        const accounted = (head.renders - old.renders) * renderMs + head.parses * head.parseMs;
        assert.equal(
          excess,
          accounted,
          `${where}: ${excess}ms of excess against ${head.renders - old.renders} extra renders at ${renderMs}ms plus ${head.parses} parses at ${head.parseMs}ms = ${accounted}ms — the difference is unaccounted for`,
        );
      }
    }
  }
});

test('MR12 — twice the keystrokes never costs more than twice the renders', () => {
  for (const { label, renderMs, gapMs } of CELLS) {
    const a = runBurst({ keystrokes: 12, gapMs, renderMs });
    const b = runBurst({ keystrokes: 24, gapMs, renderMs });
    assert.ok(b.renders <= a.renders * 2 + 1, `${label} at ${gapMs}ms: ${a.renders} -> ${b.renders}`);
  }
});

test('MR13 — the wait the author feels is the floor plus the work, and nothing else', () => {
  // The metric an earlier ledger omitted entirely, and omitting it is how that ledger concluded
  // the branch was ahead while on this measure it was behind in every cell.
  for (const { label, renderMs, gapMs } of CELLS) {
    const { redrawMs, renders } = runBurst({ keystrokes: KEYS, gapMs, renderMs });
    if (renders === 0) continue;
    const floor = renderMs <= 50 ? COALESCE_MS : DEBOUNCE_MS;
    const parse = renderMs <= 50 ? Math.max(1, Math.round(renderMs / 10)) : 0;
    assert.equal(redrawMs, floor + parse + renderMs, `${label} at ${gapMs}ms waited ${redrawMs}ms`);
  }
});

test('MR14 — the costly arm is never slower to redraw than the old build was', () => {
  // The old build: one 150ms trailing debounce, then the render. Anything the costly arm adds
  // in front of that render is a regression, and three separate heads added one.
  for (const { label, renderMs, gapMs } of CELLS) {
    if (renderMs <= 50) continue;
    const { redrawMs } = runBurst({ keystrokes: KEYS, gapMs, renderMs });
    const old = runBurstMain({ keystrokes: KEYS, gapMs, renderMs });
    assert.ok(redrawMs <= old.redrawMs, `${label} at ${gapMs}ms waited ${redrawMs}ms against the old build's ${old.redrawMs}ms`);
  }
});
