/**
 * Unit: lib/core/author-deferral-probe.js — the export's answer to #1792.
 *
 * The export captures at `load` + an explicit media settle and does NOT wait on author
 * timers. Declining the wait is the decision; declining it SILENTLY was the defect. This
 * probe is what makes the decline audible, so the properties that matter are the ones a
 * false alarm or a missed alarm would break:
 *
 *   1. ENGINE WORK IS NEVER REPORTED. The export's own overflow watcher schedules a
 *      2,000 ms `setTimeout` on every deck in the repo. If the probe counted it, every
 *      render would warn and authors would learn to ignore the warning.
 *   2. ARRIVED WORK IS NEVER REPORTED. A callback that ran wrote what the capture sees.
 *   3. CANCELED WORK IS NEVER REPORTED. `clearTimeout` means the deck said never mind.
 *   4. AN INTERVAL SETTLES ON ITS FIRST TICK. An interval never ends; reporting it
 *      forever would be a permanent false alarm on a deck that renders correctly.
 *   5. NESTED WORK KEEPS ITS ATTRIBUTION. `document.currentScript` is null inside a
 *      callback, so a `setTimeout` chained off another one is the case that needs the
 *      probe's context propagation. It is also the common authoring shape.
 *
 * The installer runs here against a synthetic window rather than a browser — deliberately,
 * because these are logic properties. The REAL-surface evidence (a rendered PDF that does
 * or does not carry the late text) is `test/integration/export/author-script-deferral.test.js`
 * and the record in the cost assessment; HARD RULE #23 means neither substitutes for the
 * other.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ENGINE_SCRIPT_ATTR,
  installAuthorDeferralProbe,
  readAuthorDeferralProbe,
  formatAuthorDeferralWarning,
  INSTALL_AUTHOR_DEFERRAL_PROBE_SRC,
} = require('../../../lib/core/author-deferral-probe');

/**
 * A `<script>`-shaped fake. `closest` answers with the slide the script sits on, exactly
 * like the real element inside `section[data-lattice-slide]`.
 */
function fakeScript({ engine = false, slide = 0, src = null } = {}) {
  return {
    hasAttribute: (name) => engine && name === ENGINE_SCRIPT_ATTR,
    getAttribute: (name) => (name === 'src' ? src : null),
    closest: (sel) =>
      slide && sel === 'section[data-lattice-slide]'
        ? { getAttribute: () => String(slide) }
        : null,
  };
}

/**
 * The smallest window the probe needs: real timers (so a callback genuinely runs) and a
 * `document.currentScript` the test can point at whichever script is "executing".
 */
function makeWindow() {
  // Every real handle is recorded so the test can drop the un-fired ones at the end. A
  // deliberately-never-fired 5,000 ms timer is the whole point of half these cases, and
  // leaving it armed keeps the node:test process alive after the assertions pass.
  const live = { timeouts: new Set(), intervals: new Set() };
  // EVERY arm the probe wraps is present here, and that is a correction: the first cut of
  // this harness supplied only the four timer functions, so `wrapScheduler` took its
  // `typeof orig !== 'function'` bail for fetch, XHR and the frame callbacks — four of six
  // wrapped APIs had ZERO coverage and the suite was green while they were broken.
  const win = {
    setTimeout: (fn, ms, ...rest) => { const id = setTimeout(fn, ms, ...rest); live.timeouts.add(id); return id; },
    clearTimeout: (id) => { live.timeouts.delete(id); return clearTimeout(id); },
    setInterval: (fn, ms, ...rest) => { const id = setInterval(fn, ms, ...rest); live.intervals.add(id); return id; },
    clearInterval: (id) => { live.intervals.delete(id); return clearInterval(id); },
    // Present so a regression that starts wrapping them again is caught here. The probe
    // must leave both alone: see WHAT IS WRAPPED in the module header.
    requestAnimationFrame: (fn) => { const id = setTimeout(() => fn(1234.5), 1); live.timeouts.add(id); return id; },
    cancelAnimationFrame: (id) => { live.timeouts.delete(id); return clearTimeout(id); },
    requestIdleCallback: (fn) => {
      const id = setTimeout(() => fn({ timeRemaining: () => 16, didTimeout: false }), 1);
      live.timeouts.add(id);
      return id;
    },
    cancelIdleCallback: (id) => { live.timeouts.delete(id); return clearTimeout(id); },
    fetch: (_url, _opts) => win.__nextFetch ?? new Promise(() => {}),
    XMLHttpRequest: class FakeXHR {
      open(_method, url) { this.url = url; }
      send() {
        if (this.__throwOnSend) throw new DOMExceptionLike('InvalidStateError');
        this.__sent = true;
      }
      addEventListener(name, fn) { (this.__on ||= {})[name] = fn; }
      finish() { this.__on?.loadend?.(); }
    },
  };
  const doc = { currentScript: null };
  const disarm = () => {
    for (const id of live.timeouts) clearTimeout(id);
    for (const id of live.intervals) clearInterval(id);
    live.timeouts.clear();
    live.intervals.clear();
  };
  return { win, doc, disarm };
}

/** Install the probe with `window`/`document` bound to the fakes, and hand back a driver. */
async function withProbe(run) {
  const { win, doc, disarm } = makeWindow();
  const prevWindow = globalThis.window;
  const prevDoc = activeDoc;
  globalThis.window = win;
  activeDoc = doc;
  try {
    installAuthorDeferralProbe();
    // AWAITED inside the try, not returned out of it: `run` is async, so returning its
    // promise would restore the globals before the body ever touched them.
    return await run({
      win,
      doc,
      /** Run `fn` as if `script` were the executing `<script>` element. */
      as(script, fn) {
        doc.currentScript = script;
        try { return fn(); } finally { doc.currentScript = null; }
      },
      read: () => readAuthorDeferralProbe(),
    });
  } finally {
    disarm();
    globalThis.window = prevWindow;
    activeDoc = prevDoc;
  }
}

/** Stands in for the DOMException a real `send()` throws on a bad state. */
class DOMExceptionLike extends Error {}

/** Let the real event loop run for `ms`, so tracked callbacks actually fire. */
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

// `track()` reads `document.currentScript` at CALL time, which can be long after the test
// that scheduled the work returned. A per-test `globalThis.document` that the next test's
// `finally` had already torn down therefore threw from inside a timer callback. One stable
// shim, re-pointed per test, removes the race entirely.
let activeDoc = { currentScript: null };
globalThis.document = { get currentScript() { return activeDoc.currentScript; } };

describe('author-deferral-probe · attribution', () => {
  test('a deck script that has not run yet is reported, with its slide', async () => {
    const state = await withProbe(async (p) => {
      p.as(fakeScript({ slide: 2 }), () => p.win.setTimeout(() => {}, 5000));
      return p.read();
    });
    assert.equal(state.installed, true);
    assert.equal(state.pending.length, 1);
    assert.deepEqual(
      { kind: state.pending[0].kind, slide: state.pending[0].slide, where: state.pending[0].where },
      { kind: 'setTimeout', slide: 2, where: 'inline <script>' },
    );
  });

  test('a `<script src>` is named by its file, so the author knows which one to open', async () => {
    const state = await withProbe(async (p) => {
      p.as(fakeScript({ slide: 3, src: './assets/late.js' }), () => p.win.setTimeout(() => {}, 5000));
      return p.read();
    });
    assert.equal(state.pending[0].where, 'late.js');
  });

  test('the ENGINE own timers are never reported — the watcher schedules one per deck', async () => {
    const state = await withProbe(async (p) => {
      p.as(fakeScript({ engine: true }), () => p.win.setTimeout(() => {}, 5000));
      return p.read();
    });
    assert.deepEqual(state.pending, [], "a marked <script> is ours, not the deck's");
  });

  test('unknown provenance (a module script, a promise continuation) is NOT reported', async () => {
    // document.currentScript is null and no tracked callback is on the stack. Reporting it
    // would blame the deck for the engine's own `settleFonts(...).then(check)` work; see the
    // module header for why the false negative is the cheaper error.
    const state = await withProbe(async (p) => {
      p.win.setTimeout(() => {}, 5000);
      return p.read();
    });
    assert.deepEqual(state.pending, []);
  });
});

describe('author-deferral-probe · settling', () => {
  test('work that has already run is not reported', async () => {
    const state = await withProbe(async (p) => {
      let ran = false;
      p.as(fakeScript({ slide: 1 }), () => p.win.setTimeout(() => { ran = true; }, 1));
      await tick(30);
      assert.equal(ran, true, 'the callback must actually have fired');
      return p.read();
    });
    assert.deepEqual(state.pending, []);
  });

  test('canceled work is not reported — clearTimeout means the deck said never mind', async () => {
    const state = await withProbe(async (p) => {
      p.as(fakeScript({ slide: 1 }), () => {
        const id = p.win.setTimeout(() => {}, 5000);
        p.win.clearTimeout(id);
      });
      return p.read();
    });
    assert.deepEqual(state.pending, []);
  });

  test('an interval settles on its FIRST tick, not on ending — it never ends', async () => {
    const state = await withProbe(async (p) => {
      let id;
      p.as(fakeScript({ slide: 1 }), () => { id = p.win.setInterval(() => {}, 1); });
      await tick(30);
      const snapshot = p.read();
      p.win.clearInterval(id);
      return snapshot;
    });
    assert.deepEqual(state.pending, [], 'a clock that has ticked once already wrote what the capture sees');
  });

  test('a timer chained off another timer keeps the slide it came from', async () => {
    // The case `document.currentScript` cannot answer: inside a callback it is null, so
    // only the probe's context propagation attributes the inner timer.
    const state = await withProbe(async (p) => {
      p.as(fakeScript({ slide: 4 }), () => {
        p.win.setTimeout(() => { p.win.setTimeout(() => {}, 5000); }, 1);
      });
      await tick(30);
      return p.read();
    });
    assert.equal(state.pending.length, 1);
    assert.equal(state.pending[0].slide, 4, 'the nested timer belongs to the slide that started the chain');
    assert.equal(state.pending[0].detail, '5000ms');
  });
});

describe('author-deferral-probe · installation', () => {
  test('installing twice does not double-wrap', async () => {
    const state = await withProbe(async (p) => {
      installAuthorDeferralProbe();
      p.as(fakeScript({ slide: 1 }), () => p.win.setTimeout(() => {}, 5000));
      return p.read();
    });
    assert.equal(state.pending.length, 1, 'a second install must be a no-op, not a second tracker');
  });

  test('the injected SOURCE is self-contained — no closure over module scope', () => {
    // The emulator ships this as text through `page.evaluateOnNewDocument`. A reference to
    // anything at module scope would be a ReferenceError in the page, at render time, inside
    // the guard — i.e. a silently un-installed probe. Evaluate it the way the page does.
    const win = { setTimeout: () => 1, clearTimeout: () => {} };
    const doc = { currentScript: null };
    const evaluate = new Function('window', 'document', `"use strict"; ${INSTALL_AUTHOR_DEFERRAL_PROBE_SRC}`);
    evaluate(win, doc);
    assert.ok(win.__latticeAuthorDeferral, 'the probe must install from its serialized source alone');
  });

  test('the reader says so when the probe never ran, rather than reporting a clean deck', () => {
    const prev = globalThis.window;
    globalThis.window = {};
    try {
      assert.deepEqual(readAuthorDeferralProbe(), { installed: false, pending: [] });
    } finally {
      globalThis.window = prev;
    }
  });
});

describe('author-deferral-probe · the warning text', () => {
  test('nothing outstanding prints nothing', () => {
    assert.deepEqual(formatAuthorDeferralWarning([]), []);
    assert.deepEqual(formatAuthorDeferralWarning(undefined), []);
  });

  test('identical records collapse to one counted line', () => {
    const lines = formatAuthorDeferralWarning([
      { kind: 'setTimeout', detail: '400ms', slide: 2, where: 'inline <script>' },
      { kind: 'setTimeout', detail: '400ms', slide: 2, where: 'inline <script>' },
      { kind: 'setTimeout', detail: '400ms', slide: 2, where: 'inline <script>' },
    ]);
    const rows = lines.filter((l) => l.includes('slide 2'));
    assert.equal(rows.length, 1, 'sixty identical ticks must not print sixty lines');
    assert.match(rows[0], /× 3/);
    assert.match(lines[0], /^ {2}⚠ 3 deck-authored script tasks/);
  });

  test('the same call from two different scripts stays two lines', () => {
    const lines = formatAuthorDeferralWarning([
      { kind: 'setTimeout', detail: '400ms', slide: 2, where: 'inline <script>' },
      { kind: 'setTimeout', detail: '400ms', slide: 2, where: 'late.js' },
    ]);
    assert.equal(lines.filter((l) => l.includes('slide 2')).length, 2, "which script is the author's first question");
  });

  test('a long tail is summarized rather than dumped', () => {
    const many = Array.from({ length: 9 }, (_v, i) => ({
      kind: 'setTimeout', detail: `${i}ms`, slide: i + 1, where: 'inline <script>',
    }));
    const lines = formatAuthorDeferralWarning(many);
    assert.equal(lines.filter((l) => l.trimStart().startsWith('slide ')).length, 4);
    assert.ok(lines.some((l) => l.includes('and 5 more')));
  });

  test('the message says what happened AND where the contract is written down', () => {
    const lines = formatAuthorDeferralWarning([{ kind: 'XMLHttpRequest', detail: './d.json', slide: 1, where: 'inline <script>' }]).join('\n');
    assert.match(lines, /NOT in this file/, 'the author must learn content is missing, not just that a timer exists');
    assert.match(lines, /does not wait on author timers/);
    assert.match(lines, /design\/skill\.md/);
  });
});

describe('author-deferral-probe · observe, never perturb', () => {
  // The prime directive, and every case here is a regression pin for a defect an
  // independent checker found in the first cut. Each one changed what DECK CODE SAW —
  // strictly worse than the silence the probe was written to fix, and invisible because
  // the emulator registers no `pageerror` handler.

  test('requestAnimationFrame is left alone entirely', async () => {
    // The first cut wrapped it with a zero-parameter arrow, so the browser's
    // DOMHighResTimeStamp was dropped and `rAF(ts => …)` saw `undefined` — measured in a
    // real PDF as `RAFARG undefined`. It is not wrapped at all now: a rAF scheduled at
    // parse time runs at the next paint, long before the capture, so it can never be the
    // lost-content signal, and a paint loop always has one frame outstanding.
    const seen = await withProbe(async (p) => {
      let arg = 'never ran';
      p.as(fakeScript({ slide: 1 }), () => p.win.requestAnimationFrame((ts) => { arg = ts; }));
      await tick(30);
      return { arg, pending: p.read().pending };
    });
    assert.equal(seen.arg, 1234.5, 'the timestamp must reach the deck untouched');
    assert.deepEqual(seen.pending, [], 'a rAF is never reported — its output is in the capture');
  });

  test('requestIdleCallback is left alone entirely', async () => {
    const seen = await withProbe(async (p) => {
      let remaining = 'never ran';
      p.as(fakeScript({ slide: 1 }), () => p.win.requestIdleCallback((d) => { remaining = d.timeRemaining(); }));
      await tick(30);
      return { remaining, pending: p.read().pending };
    });
    assert.equal(seen.remaining, 16, 'the IdleDeadline must reach the deck — the first cut made this throw');
    assert.deepEqual(seen.pending, []);
  });

  test('setTimeout forwards its trailing arguments, in both directions', async () => {
    // `setTimeout(fn, 0, 'a', 'b')` must still deliver 'a','b'. The wrapper passes them to
    // the ORIGINAL and forwards whatever the platform hands back, rather than building an
    // argument list of its own.
    const got = await withProbe(async (p) => {
      let args = null;
      p.as(fakeScript({ slide: 1 }), () => p.win.setTimeout((...a) => { args = a; }, 1, 'a', 'b'));
      await tick(30);
      return args;
    });
    assert.deepEqual(got, ['a', 'b']);
  });

  test('a synchronous throw out of the timer API is re-thrown and leaves nothing pending', async () => {
    const out = await withProbe(async (p) => {
      const realSetTimeout = p.win.setTimeout;
      p.win.setTimeout = () => { throw new RangeError('too many timers'); };
      let caught = null;
      // Re-install against the throwing original.
      delete p.win.__latticeAuthorDeferral;
      installAuthorDeferralProbe();
      p.as(fakeScript({ slide: 1 }), () => {
        try { p.win.setTimeout(() => {}, 1); } catch (e) { caught = e; }
      });
      const snapshot = p.read();
      p.win.setTimeout = realSetTimeout;
      return { caught, pending: snapshot.pending };
    });
    assert.ok(out.caught instanceof RangeError, 'the deck must see its own error, unchanged');
    assert.deepEqual(out.pending, [], 'nothing was scheduled, so nothing is outstanding');
  });
});

describe('author-deferral-probe · network', () => {
  test('fetch is left alone entirely — neither wrapped nor reported', async () => {
    // The feature existed and worked, and was withdrawn on the prime directive. Settling a
    // fetch record means ATTACHING to the deck's promise, and attaching is what marks a
    // promise handled. Both strategies were built and measured in a real render:
    //   · `p.then(settle, settle)` -> a deck painting a fallback from `unhandledrejection`
    //     stopped painting it;
    //   · re-throwing -> a deck that correctly `.catch`ed its fetch got that fallback
    //     SPURIOUSLY, overwriting a slide that had rendered fine.
    // There is no third option, so a pending fetch is a documented false negative and
    // `lint:deck` names `fetch(` statically instead.
    const out = await withProbe(async (p) => {
      const original = p.win.fetch;
      const returned = p.as(fakeScript({ slide: 2 }), () => p.win.fetch('./data.json'));
      return { same: p.win.fetch === original, returned, pending: p.read().pending };
    });
    assert.equal(out.same, true, 'window.fetch must be the platform function, untouched');
    assert.ok(out.returned instanceof Promise, 'and it must still return the deck its own promise');
    assert.deepEqual(out.pending, [], 'a fetch is never reported — see the module header');
  });

  test('an XHR is reported until loadend, and its url is a non-enumerable stamp', async () => {
    // XHR is wrapped where fetch is not, and the difference is the whole rule:
    // `addEventListener('loadend')` is purely ADDITIVE — it observes without changing what
    // any deck handler sees.
    const out = await withProbe(async (p) => {
      const xhr = new p.win.XMLHttpRequest();
      p.as(fakeScript({ slide: 3 }), () => {
        xhr.open('GET', './rows.csv');
        xhr.send();
      });
      const whilePending = p.read().pending;
      const keys = Object.keys(xhr);
      xhr.finish();
      return { whilePending, keys, after: p.read().pending };
    });
    assert.equal(out.whilePending.length, 1);
    assert.equal(out.whilePending[0].detail, './rows.csv');
    assert.deepEqual(out.after, [], 'loadend settles it');
    assert.ok(!out.keys.includes('__latticeUrl'), 'the probe must not show up in Object.keys of a deck-visible object');
  });

  test('a synchronous throw out of XHR.send is re-thrown and leaves nothing pending', async () => {
    const out = await withProbe(async (p) => {
      const xhr = new p.win.XMLHttpRequest();
      xhr.__throwOnSend = true;   // the PROTOTYPE send throws, so the wrapper's try/catch runs
      let caught = null;
      p.as(fakeScript({ slide: 1 }), () => {
        xhr.open('GET', './x');
        try { xhr.send(); } catch (e) { caught = e; }
      });
      return { caught, sawListener: !!xhr.__on?.loadend, pending: p.read().pending };
    });
    assert.ok(out.caught instanceof DOMExceptionLike, 'the deck must see the error unchanged');
    assert.equal(out.sawListener, true, 'the wrapper really did run — otherwise this passes for the wrong reason');
    assert.deepEqual(out.pending, [], 'a send that never went out is not outstanding work');
  });
});

describe('author-deferral-probe · bookkeeping', () => {
  test('a fired timer is not retained by id', async () => {
    // `byId` used to be pruned only on the cancel path, so every fired timer's record was
    // retained forever keyed by an id the page will never reuse. Asserted through the
    // public surface: after a cancel of a REUSED id the probe must not settle a stranger.
    const state = await withProbe(async (p) => {
      let firstId;
      p.as(fakeScript({ slide: 1 }), () => { firstId = p.win.setTimeout(() => {}, 1); });
      await tick(30);                       // fires, and drops itself from the id map
      let second;
      p.as(fakeScript({ slide: 2 }), () => { second = p.win.setTimeout(() => {}, 5000); });
      p.win.clearTimeout(firstId);          // a stale id — must settle nothing
      assert.ok(second !== undefined);
      return p.read();
    });
    assert.equal(state.pending.length, 1, 'clearing a long-fired id must not settle a live record');
    assert.equal(state.pending[0].slide, 2);
  });

  test('the installer declines to run inside a frame', () => {
    // evaluateOnNewDocument reaches every frame, but only the main frame is ever read —
    // so installing in an <iframe> would change an embedded document for zero benefit.
    const frame = { setTimeout: () => 1, clearTimeout: () => {} };
    frame.top = { different: true };
    const prevWindow = globalThis.window;
    globalThis.window = frame;
    try {
      installAuthorDeferralProbe();
      assert.equal(frame.__latticeAuthorDeferral, undefined, 'a subframe must be left untouched');
    } finally {
      globalThis.window = prevWindow;
    }
  });
});
