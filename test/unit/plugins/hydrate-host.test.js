/**
 * The plugin host's BROWSER half (lib/plugins/host-browser.mjs) and function-plot's hydrate, run in
 * jsdom TWO ways — as the runtime runs them (the imported functions) and as the CLI export page
 * runs them (the script lib/plugins/hydrate-script.js serializes) — so the one-source claim is a
 * test, not a comment. The real library and the real surfaces are the integration tier's
 * (test/integration/invariants/functionplot-runtime-load.test.js, the committed gallery PDFs).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { createEngine } = require('../../../lib/engine');
const { fromBase64 } = require('../../../lib/core/base64-utf8');
const { installHydrateHost, releaseFigure, PENDING_FIGURES } = require('../../../lib/plugins/host-browser.mjs');
const { HYDRATORS } = require('../../../lib/plugins/hydrate.generated.js');
const { usedHydrators, hydrateScript, settleBarrierScript, settleBudget } = require('../../../lib/plugins/hydrate-script.js');

const PLOT = '```functionplot\n{ "data": [{ "fn": "x^2" }], "yAxis": { "label": "x²" } }\n```\n';
const BAD = '```functionplot\n{ not json\n```\n';

/** A jsdom window holding the ENGINE's markup for `md`. */
function page(md) {
  const { html } = createEngine().render(md);
  return new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only', pretendToBeVisual: true }).window;
}

/** A stand-in for window.functionPlot: draws the <svg> the real one draws, and records configs. */
function fakeLibrary(win) {
  const calls = [];
  win.functionPlot = (cfg) => {
    calls.push(cfg);
    const svg = win.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'function-plot');
    svg.setAttribute('width', '480');
    svg.setAttribute('height', '320');
    cfg.target.appendChild(svg);
  };
  return calls;
}

const placeholder = (win) => win.document.querySelector('[data-lattice-hydrate="function-plot"]');
const state = (el) => el.getAttribute('data-lattice-settle');

/** The two ways a surface installs the host. Each returns `run`. */
const SURFACES = {
  runtime: (win, hydrators = HYDRATORS) => installHydrateHost(win, hydrators, { fromBase64, releaseFigure }).run,
  'cli page (serialized)': (win, hydrators = HYDRATORS) => {
    win.eval(hydrateScript(hydrators).replace('var host = ', 'var host = window.__host = '));
    return () => win.__host.run();
  },
};

for (const [surface, install] of Object.entries(SURFACES)) {
  describe(`plugin host — ${surface}`, () => {
    test('draws a pending plot, settles it rendered, and gives the svg a viewBox', () => {
      const win = page(PLOT);
      const calls = fakeLibrary(win);
      assert.equal(state(placeholder(win)), 'pending', 'the engine writes the barrier state');
      install(win)();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].yAxis.label, 'x²', 'the config is decoded as UTF-8');
      assert.equal(calls[0].target, placeholder(win));
      assert.equal(state(placeholder(win)), 'rendered');
      assert.equal(placeholder(win).querySelector('svg').getAttribute('viewBox'), '0 0 480 320');
      assert.equal(win.document.querySelector(PENDING_FIGURES), null);
    });

    test('a config the library cannot use shows an error and settles it — once', () => {
      const win = page(BAD);
      const calls = fakeLibrary(win);
      const run = install(win);
      run();
      const el = placeholder(win);
      assert.equal(state(el), 'error');
      assert.match(el.textContent, /^functionplot error: /);
      assert.ok(el.classList.contains('functionplot-error'));
      run();
      assert.equal(calls.length, 0, 'a settled error is never retried');
    });

    test('no library and nowhere to fetch it: the author sees their config, recoverably', () => {
      const win = page(PLOT);
      const run = install(win);
      run();
      const el = placeholder(win);
      assert.equal(state(el), 'unavailable');
      assert.ok(!el.hasAttribute('data-lattice-final'));
      assert.match(el.textContent, /"label": "x²"/);
      // The library turns up later: the next pass clears the text and draws.
      fakeLibrary(win);
      run();
      assert.equal(state(el), 'rendered');
      assert.doesNotMatch(el.textContent, /label/);
    });

    test('a placeholder a capture closed (final) is never touched again', () => {
      const win = page(PLOT);
      const el = placeholder(win);
      releaseFigure(el, fromBase64, true);
      const calls = fakeLibrary(win);
      install(win)();
      assert.equal(calls.length, 0);
      assert.equal(state(el), 'unavailable');
    });
  });
}

describe('plugin host — asynchronous hydrate and its budget', () => {
  // Built from text so it carries no closure: the serialized surface re-creates it from its own
  // source, which is the self-containment rule every real hydrate obeys (a closure over `ms` here
  // failed on that surface alone — the rule, demonstrated).
  const slow = (ms) => [{
    name: 'function-plot', budgetMs: 60, payload: null,
    hydrate: new Function('el', `return new Promise((r) => setTimeout(() => { el.textContent = 'DRAWN'; r(); }, ${ms}));`),
  }];
  for (const [surface, install] of Object.entries(SURFACES)) {
    test(`${surface}: a hydrate inside its budget settles rendered; one past it is closed and its late draw discarded`, async () => {
      const fast = page(PLOT);
      install(fast, slow(10))();
      assert.equal(state(placeholder(fast)), 'pending', 'pending while the hydrate runs');
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(state(placeholder(fast)), 'rendered');

      const late = page(PLOT);
      install(late, slow(150))();
      await new Promise((r) => setTimeout(r, 100));
      const el = placeholder(late);
      assert.ok(el.hasAttribute('data-lattice-final'), 'closed at the budget');
      assert.equal(state(el), 'unavailable');
      await new Promise((r) => setTimeout(r, 100));
      assert.doesNotMatch(el.textContent, /DRAWN/, 'the late draw is discarded');
      assert.match(el.textContent, /"fn": "x\^2"/);
    });
  }
});

describe('the settle barrier (every CLI capture evaluates it)', () => {
  test('resolves at once when nothing is pending', async () => {
    const win = page(PLOT);
    fakeLibrary(win);
    SURFACES.runtime(win)();
    assert.equal(await win.eval(settleBarrierScript(1000)), 0);
  });
  test('waits for a pending figure, and closes what is still pending at the budget', async () => {
    const win = page(PLOT);
    const started = Date.now();
    assert.equal(await win.eval(settleBarrierScript(80)), 1);
    assert.ok(Date.now() - started >= 70, 'it waited out the budget');
    const el = placeholder(win);
    assert.ok(el.hasAttribute('data-lattice-final'));
    assert.match(el.textContent, /"label": "x²"/);
  });
  test('the budget covers the longest hydrate plus the library load', () => {
    assert.equal(settleBudget([{ budgetMs: 4000 }, { budgetMs: 200 }]), 5000);
  });
});

describe('the CLI page gets only what a deck uses', () => {
  test('usedHydrators reads the engine\'s own marker', () => {
    assert.deepEqual(usedHydrators(createEngine().render(PLOT).html).map((h) => h.name), ['function-plot']);
    assert.deepEqual(usedHydrators(createEngine().render('# no plot\n\n```json\n{}\n```\n').html), []);
    assert.equal(hydrateScript([]), '');
  });
  test('every hydrate the runtime bundles is self-contained, so its serialized copy is the same function', () => {
    for (const h of HYDRATORS) {
      const src = h.hydrate.toString();
      assert.doesNotMatch(src, /\brequire\s*\(|\bimport\b/, `${h.name}'s hydrate reaches a module`);
      // Re-created from its own text, it is still a function of (el, ctx).
      assert.equal(typeof new Function(`return (${src})`)(), 'function');
    }
  });
});
