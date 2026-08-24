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
  const win = {
    setTimeout: (fn, ms, ...rest) => { const id = setTimeout(fn, ms, ...rest); live.timeouts.add(id); return id; },
    clearTimeout: (id) => { live.timeouts.delete(id); return clearTimeout(id); },
    setInterval: (fn, ms, ...rest) => { const id = setInterval(fn, ms, ...rest); live.intervals.add(id); return id; },
    clearInterval: (id) => { live.intervals.delete(id); return clearInterval(id); },
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
  const prevDocument = globalThis.document;
  globalThis.window = win;
  globalThis.document = doc;
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
    globalThis.document = prevDocument;
  }
}

/** Let the real event loop run for `ms`, so tracked callbacks actually fire. */
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const lines = formatAuthorDeferralWarning([{ kind: 'fetch', detail: './d.json', slide: 1, where: 'inline <script>' }]).join('\n');
    assert.match(lines, /NOT in this file/, 'the author must learn content is missing, not just that a timer exists');
    assert.match(lines, /does not wait on author timers/);
    assert.match(lines, /design\/skill\.md/);
  });
});
