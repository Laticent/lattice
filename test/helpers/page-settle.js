/**
 * Wait until a real page has no work left: a signal, not a duration (HARD RULE #32).
 *
 * The browser twin of `runtime-boot.js`'s `settle()`. Tests that opened an exported deck slept a fixed 1.5 to 2.5 s
 * "for any pass to act", which is the F2 shape in engineering/decisions/2026-11-06-flaky-tests.md: on a loaded runner
 * a pass can still be pending when the sleep ends, and on a fast one the test waits for nothing. An ABSENCE check
 * ("no diagram drew", "no request left") is the worst case, because a pass that has not run yet passes it.
 *
 * `trackPageWork(page)` must be called BEFORE the page navigates. It keeps a ledger of the timers and animation frames
 * the page has queued (`setTimeout`, `setInterval`, `requestAnimationFrame`) and of the requests in flight. Then
 * `settled()` resolves once, at the same moment, no timer is queued, no request is in flight and the fonts are loaded:
 * nothing the page has started can still change it. A page that keeps re-arming work forever is a defect, and the
 * wait says so when its deadline passes, naming what was still queued, instead of hanging.
 *
 * Two options ask for more, for a page whose last work is not on any queue the ledger sees:
 *   - `frames: N` also waits for N animation frames IN A ROW with nothing queued. A resize the page has not laid out
 *     yet reaches a `ResizeObserver` only after a frame's layout, so the first quiet moment after a `setViewport` can
 *     come before the work the resize schedules.
 *   - `images: true` also waits until every `<img>` is complete. An `<img>` that is still decoding has no request in
 *     flight and no timer queued. An `<img loading="lazy">` that never scrolls into view never completes, so the wait
 *     fails at its deadline rather than passing.
 *
 * A string timer (`setTimeout("code", n)`) is handed to the browser untouched and is NOT on the ledger: wrapping it
 * would change what the page under test runs. A page that queues work that way settles before that work runs.
 *
 * Use `page.evaluate`, not `page.waitForFunction`, around a ledger page: puppeteer's frame polling queues animation
 * frames in the page's own world, so it would always find one queued.
 */

/** The in-page ledger. Self-contained: it is serialized into the page before any of the page's own scripts run. */
function installLedger() {
  if (window.__testWork) return;
  const queued = new Map(); // id → what queued it, for the failure message
  const waiters = [];
  const kick = () => {
    // A callback may queue its successor synchronously, so judge on a later turn of the job queue.
    Promise.resolve().then(() => {
      if (queued.size) return;
      for (const w of waiters.splice(0)) w();
    });
  };
  const real = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };
  const key = (kind, id) => `${kind}:${id}`;
  window.setTimeout = (fn, ms, ...args) => {
    // A string timer is code the page's policy judges; hand it on untouched rather than change what runs.
    if (typeof fn !== 'function') return real.setTimeout(fn, ms, ...args);
    let id;
    const run = () => {
      queued.delete(key('t', id));
      try {
        fn(...args);
      } finally {
        kick();
      }
    };
    id = real.setTimeout(run, ms);
    queued.set(key('t', id), `setTimeout(${Number(ms) || 0})`);
    return id;
  };
  window.clearTimeout = (id) => {
    real.clearTimeout(id);
    if (queued.delete(key('t', id))) kick();
  };
  window.setInterval = (fn, ms, ...args) => {
    const id = real.setInterval(fn, ms, ...args);
    queued.set(key('i', id), `setInterval(${Number(ms) || 0})`);
    return id;
  };
  window.clearInterval = (id) => {
    real.clearInterval(id);
    if (queued.delete(key('i', id))) kick();
  };
  window.requestAnimationFrame = (fn) => {
    let id;
    const run = (t) => {
      queued.delete(key('r', id));
      try {
        fn(t);
      } finally {
        kick();
      }
    };
    id = real.requestAnimationFrame(run);
    queued.set(key('r', id), 'requestAnimationFrame');
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    real.cancelAnimationFrame(id);
    if (queued.delete(key('r', id))) kick();
  };
  const incomplete = () => [...document.images].filter((img) => !img.complete).length;
  const nextFrame = () => new Promise((resolve) => real.requestAnimationFrame(resolve));
  window.__testWork = {
    /**
     * Resolves true once `frames` frames in a row pass with nothing queued, the fonts loaded and (with `images`) every
     * `<img>` complete; false, after one frame, as soon as one is not. Waits on the page's own frames (`real`), so the
     * wait itself never shows on the ledger.
     */
    calm: async (frames, images) => {
      const quiet = () => !queued.size && (!document.fonts || document.fonts.status === 'loaded') && (!images || !incomplete());
      if (!quiet()) {
        await nextFrame();
        return false;
      }
      for (let i = 0; i < frames; i++) {
        await nextFrame();
        if (!quiet()) return false;
      }
      return true;
    },
    incompleteImages: incomplete,
    /** Resolves when no timer or frame is queued (and the fonts have settled). */
    idle: async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      if (queued.size) await new Promise((resolve) => waiters.push(resolve));
      return true;
    },
    queued: () => [...queued.values()],
  };
}

/**
 * Start the ledger on a page that has not navigated yet. Returns `settled({ timeout })`.
 * @param {import('puppeteer').Page} page
 */
async function trackPageWork(page) {
  await page.evaluateOnNewDocument(installLedger);
  const inflight = new Set();
  const done = (r) => inflight.delete(r);
  page.on('request', (r) => inflight.add(r));
  page.on('requestfinished', done);
  page.on('requestfailed', done);

  /**
   * Resolve once no timer, frame or request is pending, all at once. Rejects, naming the queue, past `timeout`, which
   * is a hang guard for a page that never settles, not a wait.
   * @param {{ timeout?: number, frames?: number, images?: boolean }} [o]  `frames` and `images`: see the header
   */
  async function settled({ timeout = 60000, frames = 0, images = false } = {}) {
    let guard;
    const deadline = new Promise((_, reject) => {
      guard = setTimeout(async () => {
        const left = await page
          .evaluate((images) => {
            if (!window.__testWork) return ['no ledger: trackPageWork ran after the navigation'];
            const n = images ? window.__testWork.incompleteImages() : 0;
            return [...window.__testWork.queued(), ...(n ? [`${n} <img> not complete`] : []), ...(document.fonts && document.fonts.status !== 'loaded' ? ['fonts loading'] : [])];
          }, images)
          .catch((e) => [e.message]);
        reject(new Error(`the page never settled within ${timeout} ms; still queued: ${left.join(', ') || 'none'}; requests in flight: ${[...inflight].map((r) => r.url().slice(0, 80)).join(', ') || 'none'}`));
      }, timeout);
    });
    try {
      for (;;) {
        await Promise.race([page.evaluate(() => window.__testWork.idle()), deadline]);
        if (inflight.size) {
          // A request still loading will run its handlers when it lands: wait for it, then judge the timers again.
          await Promise.race([new Promise((resolve) => {
            const check = () => {
              if (inflight.size) return;
              page.off('requestfinished', check);
              page.off('requestfailed', check);
              resolve();
            };
            page.on('requestfinished', check);
            page.on('requestfailed', check);
            check();
          }), deadline]);
          continue;
        }
        // Idle, with nothing in flight: one more look, because the last request's handler may have queued work.
        const queued = await page.evaluate(() => window.__testWork.queued().length);
        if (queued || inflight.size) continue;
        if (!frames && !images) return;
        const calm = await Promise.race([page.evaluate((f, i) => window.__testWork.calm(f, i), frames, images), deadline]);
        if (calm && !inflight.size) return;
      }
    } finally {
      clearTimeout(guard);
    }
  }
  return settled;
}

module.exports = { trackPageWork, installLedger };
