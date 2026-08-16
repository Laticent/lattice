// The docs suite's two wall-clock budgets, in ONE place — imported by
// `vitest.config.ts` (the outer, per-test budget), `vitest.setup.ts` (the inner,
// per-query budget), and `scripts/check-test-margin.mjs` (the report that says how
// close we're running to them).
//
// WHY THIS FILE EXISTS (#1324). Both budgets used to be library defaults —
// vitest's `testTimeout: 5000` and Testing Library's `asyncUtilTimeout: 1000` —
// and both are sized for a test that does almost no work on an idle machine.
// The Studio component tests do the opposite: each one renders the whole
// StudioShell and waits out a 400 ms assessment debounce, costing 1–2 s of real
// wall-clock EVEN IDLE. Measured on an idle 4-core box at a71508e:
//
//   studio.findings-fix  "cycles progress in the pill"   1.6–1.8 s idle  (5 s budget)
//   studio.controls      "Manifest JSON view two-way"    4.3 s           (5 s budget)
//   present-autoplay-chain "chains THROUGH two slides"   4.5 s           (5 s budget)
//   → of the tests running on the DEFAULT budget: 20 were within 2× of it,
//     65 within 3×. (The half-dozen above 5 s already carry a hand-written
//     per-test timeout — see below.)
//
// Vitest then runs the suite's own files in PARALLEL (pool `forks`): a full run
// spends 373 s of test-time inside 242 s of wall-clock, so tests are routinely
// competing with each other for the same cores. A test with a 2.8× margin idle
// does not have a 2.8× margin under that.
//
// So a run kills whichever test happened to be scheduled against peak
// contention — a DIFFERENT one each time, every one of them passing in
// isolation. That is the whole of #1324: two consecutive full runs on this
// tree killed `studio.findings-fix` and then `StudioShell`, neither reproducible
// alone. It is NOT cross-file state leaking (vitest runs `isolate: true` +
// `pool: 'forks'`, so each file gets its own process and its own jsdom — there
// is no shared state to leak) and it is NOT one bad test (fixing the one that
// died today just promotes the next-slowest).
//
// A timeout is a budget for a MACHINE, not an assertion about the product: no
// user-visible behavior is pinned by "this renders in under a second in jsdom on
// a contended CI box." The assertions themselves are untouched and still fail
// when the product breaks; a genuinely hung test still fails, just later. What
// these budgets buy is that a red docs-build means something is WRONG rather
// than something was SLOW.
//
// This also retires a workaround that had been spreading one call site at a
// time: `}, 60_000)` on the fuzz tests, `{ timeout: 25_000 }` in deictic,
// `{ timeout: 5000 }` in studio.controls, `{ timeout: 3000 }` in StudioShell.
// Those were each a correct local read of a global problem. The ones above the
// new default still earn their keep and stay; the rest are now redundant.
//
// Sized from the measurements above: ~4× headroom over the slowest ordinary
// test (4.5 s), against an observed contention stretch of ≥2.8×.

/** Outer budget: how long one `it()` may take before vitest kills it. */
export const TEST_TIMEOUT_MS = 20_000;

/** Same, for `beforeEach`/`afterEach` — a Studio render happens in setup too. */
export const HOOK_TIMEOUT_MS = 20_000;

/**
 * Inner budget: how long a single `findBy*` / `waitFor` polls before giving up.
 * Deliberately well under TEST_TIMEOUT_MS so a query that really can't find its
 * element fails with Testing Library's "Unable to find an element …" message —
 * which names the query and prints the DOM — instead of the outer timeout's
 * bare "Test timed out in …", which names nothing.
 */
export const ASYNC_UTIL_TIMEOUT_MS = 5_000;

/**
 * The THIRD budget, and the one that is easy to miss: `vi.waitFor` is vitest's own
 * API, not Testing Library's, and it carries its own hardcoded 1 s default
 * (`vitest/dist/chunks/vi.*.js`: `const { interval = 50, timeout = 1e3 }`). No
 * config option reaches it — `configure({ asyncUtilTimeout })` governs
 * `@testing-library/dom` alone — so the only way to move it is to pass it at the
 * call site.
 *
 * Same value as ASYNC_UTIL_TIMEOUT_MS deliberately: they are the same kind of
 * budget doing the same job, and a reader should not have to know which library a
 * given `waitFor` came from to know how long it waits.
 */
export const VI_WAIT_FOR_TIMEOUT_MS = 5_000;

/**
 * For a test that waits out REAL animation frames rather than a render.
 *
 * The vetrina deictic gestures are driven by `requestAnimationFrame` and polled
 * a frame at a time — `for (let i = 0; i < 1200 && !settled; i++) await
 * frames(1)`. At jsdom's ~16 ms a frame, that loop's own declared worst case is
 * ~19 s BEFORE the mount and the gesture setup, so the hand-written 20–25 s
 * budgets those tests carried had no headroom at all; one of them was under the
 * bound the test itself permits. They spent 5.4–9.4 s idle and died together
 * the first time a full run got busy.
 *
 * Pass it explicitly — `it('…', { timeout: ANIMATION_TEST_TIMEOUT_MS }, …)` — so a
 * reader can see which tests are paying for real motion.
 *
 * DO NOT treat this number as what keeps those tests honest. The measured
 * contention stretch is ~7×, not the ~3× the other budgets are sized against, so
 * even 60 s has been observed within ~12% of its wall. What actually protects them
 * is `watchGesture()` in `deictic.test.ts`, which reports whether its sampling
 * window covered the whole gesture and fails when it did not — otherwise a
 * half-watched path silently satisfies a "the cursor never went there" bound. The
 * budget is the safety valve; the guard is the oracle.
 */
export const ANIMATION_TEST_TIMEOUT_MS = 60_000;

/**
 * Report threshold: a test at or above this is running close enough to
 * TEST_TIMEOUT_MS that contention could still reach it. Not a gate — see
 * `scripts/check-test-margin.mjs` for why this reports rather than fails.
 */
export const SLOW_TEST_MS = 5_000;
