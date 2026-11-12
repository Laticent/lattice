/**
 * Boot the browser runtime in a jsdom window and return once it has no work left: a signal, not a duration.
 *
 * The runtime's first pass is synchronous, but it finishes on later turns: the deck front matter settles through a
 * promise, a plugin pass waits for its library, and the MutationObserver debounces the next pass by 150 ms. Tests
 * used to cover all of that with `await new Promise((r) => setTimeout(r, 300))` (or 1000), which is the F2 shape in
 * engineering/decisions/2026-11-06-flaky-tests.md: on a loaded runner the pass can still be pending when the sleep
 * ends, and on a fast one the test waits for nothing.
 *
 * Here the window gets a VIRTUAL clock before the bundle runs. `setTimeout`, `setInterval` and
 * `requestAnimationFrame` queue their callbacks instead of arming real timers, and `settle()` alternates two moves
 * until both are empty-handed: drain the promise and observer jobs (a `setImmediate` turn), then fire the earliest
 * queued callback. When nothing is queued after a drain, the runtime is done. A runtime that keeps re-arming work
 * forever is a defect, and `settle()` says so after `maxSteps` callbacks instead of hanging.
 *
 * A pinned clock is also the F8 fix: the runtime's timers and its `performance.now()` / `Date.now()` reads see the same
 * time on every machine.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');

/** One macrotask turn: every queued promise job and jsdom observer callback runs before it resolves. */
const turn = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Replace the window's timers with a queue the test drives. Returns `settle()`.
 * @param {import('jsdom').DOMWindow} win
 */
function virtualClock(win) {
  let now = 0;
  let nextId = 1;
  const queue = new Map(); // id → { at, fn, args, every }
  const add = (fn, ms, args, every) => {
    const id = nextId++;
    const delay = Math.max(0, Number(ms) || 0);
    queue.set(id, { at: now + delay, seq: id, fn, args, every: every ? Math.max(1, delay) : 0 });
    return id;
  };
  win.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  win.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  win.clearTimeout = win.clearInterval = (id) => { queue.delete(id); };
  win.requestAnimationFrame = (fn) => add(() => fn(now), 16, [], false);
  win.cancelAnimationFrame = (id) => { queue.delete(id); };
  // The runtime also READS the clock (its fit scheduler's max-wait checks `performance.now()`), so a loaded runner would
  // send it down a different branch. Both clocks read the virtual time, but ONLY where the window owns them: a jsdom
  // window made without `runScripts` shares Node's own `Date`, and pinning that froze `Date.now()` for every later test
  // in the file (F7). Such a window runs no page script, so nothing in it reads the clock anyway.
  const epoch = Date.UTC(2026, 0, 1);
  if (win.performance && win.performance !== globalThis.performance) win.performance.now = () => now;
  if (win.Date && win.Date !== Date) win.Date.now = () => epoch + now;

  /**
   * Run the runtime until it has nothing queued. Resolves with the number of callbacks fired.
   * `onStep()`, when given, runs at every resting point: once the job queue has drained after each callback (and before
   * the first). A test that must see an invariant hold THROUGHOUT a run, not only at its end, checks it there; that is
   * every state a frame could paint, where a sampling loop on a real clock saw whichever ones its ticks happened to hit.
   *
   * Two ways to stop before the queue is empty, for code whose own timers ARE the behavior under test (a debounce, a
   * watchdog), where running every timer would skip past the state the test means to read:
   * - `done()`: stop at the first resting point where it returns true (the signal a polling loop used to wait for);
   * - `until`: a virtual time; stop before firing any callback due after it, and move the clock there. `advance(ms)`
   *   is `settle({ until: now + ms })`, the virtual form of a sleep: every timer that would have fired in `ms` fires,
   *   in order, and none that would not.
   */
  async function settle({ maxSteps = 500, onStep, done, until } = {}) {
    let steps = 0;
    for (;;) {
      await turn();
      await turn();
      if (onStep) onStep();
      if (done?.()) return steps;
      let pick = null;
      for (const [id, t] of queue) if (!pick || t.at < pick[1].at || (t.at === pick[1].at && t.seq < pick[1].seq)) pick = [id, t];
      if (!pick || (until != null && pick[1].at > until)) {
        if (done) throw new Error(`settle: nothing left to run${until != null ? ` before ${until} ms` : ''} and done() is still false`);
        if (until != null) now = Math.max(now, until);
        return steps;
      }
      if (steps >= maxSteps) {
        throw new Error(`the runtime still had ${queue.size} callback(s) queued after ${maxSteps}: it never settles`);
      }
      const [id, t] = pick;
      now = Math.max(now, t.at);
      if (t.every) t.at = now + t.every;
      else queue.delete(id);
      steps++;
      if (typeof t.fn === 'function') t.fn(...t.args);
    }
  }
  return { settle, advance: (ms) => settle({ until: now + ms }), now: () => now };
}

/**
 * Inject the runtime bundle into `dom` and wait until it settles.
 * @param {import('jsdom').JSDOM} dom created with `runScripts: 'dangerously'`
 * @param {{ bundle?: string, maxSteps?: number }} [opts] `bundle` is the script text (default: dist/lattice-runtime.js)
 */
async function bootRuntime(dom, { bundle, maxSteps } = {}) {
  const clock = virtualClock(dom.window);
  const el = dom.window.document.createElement('script');
  el.textContent = bundle ?? fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  await clock.settle({ maxSteps });
  return clock;
}

module.exports = { bootRuntime, virtualClock, RUNTIME_BUNDLE };
