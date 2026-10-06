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
      assert.equal(state(placeholder(fast)), 'hydrating', 'hydrating — in markup, so captures keep waiting — while the hydrate runs');
      assert.ok(fast.document.querySelector(PENDING_FIGURES), 'a capture still waits on a hydrating figure');
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

// EVERY hydrator, not just function-plot: run on both surfaces over the inputs of its own fixtures,
// the two must reach the same settle states, and neither may fail on a free identifier. A module-
// level helper passes the runtime and breaks only the CLI page — the PDF prints "x is not defined"
// where the figure goes — which is the failure the serialized surface exists to catch
// (HARD RULE #25 inversion lens). The library is a stand-in that accepts any call.
describe('every hydrator behaves the same on both surfaces, over its own fixtures', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const inputsOf = (name) => {
    const text = fs.readFileSync(path.join(__dirname, `../../../lib/plugins/${name}/${name}.fixtures.md`), 'utf8');
    return [...text.matchAll(/^(`{3,4})markdown\n([\s\S]*?)\n\1$/gm)].map((m) => m[2]);
  };
  for (const h of HYDRATORS) {
    const inputs = inputsOf(h.name).filter((src) => createEngine().render(src).html.includes(`data-lattice-hydrate="${h.name}"`));
    test(`${h.name}: ${inputs.length} fixture input(s), same states, no free identifiers`, () => {
      assert.ok(inputs.length > 0, `${h.name} has no fixture that renders its placeholder`);
      for (const src of inputs) {
        const states = {};
        for (const [surface, install] of Object.entries(SURFACES)) {
          const win = page(src);
          if (h.payload) win[h.payload.global] = () => {};
          install(win, [h])();
          const els = [...win.document.querySelectorAll(`[data-lattice-hydrate="${h.name}"]`)];
          for (const el of els) assert.doesNotMatch(el.textContent, /is not defined/, `${surface}: ${el.textContent}`);
          states[surface] = els.map(state);
        }
        const [a, b] = Object.values(states);
        assert.deepEqual(b, a, `the surfaces disagree on ${JSON.stringify(src.slice(0, 40))}`);
      }
    });
  }
});

describe('the host, against markup it did not write', () => {
  test('an author element marked pending is not a figure: no capture waits on it, nothing erases it', async () => {
    // Injected into the page, not rendered: the ENGINE drops an author's host markers
    // (lib/plugins/author-markup.js), so this is markup from a page the engine did not render —
    // an Export-to-Marp bundle (followups.d/2509-p4-marp-bundle-author-markers.md).
    const win = page(PLOT);
    const forged = win.document.createElement('p');
    forged.setAttribute('data-lattice-settle', 'pending');
    forged.textContent = 'Author text.';
    win.document.body.prepend(forged);
    fakeLibrary(win);
    SURFACES.runtime(win)();
    assert.equal(await win.eval(settleBarrierScript(1000)), 0);
    assert.equal(win.document.querySelector('p[data-lattice-settle]').textContent, 'Author text.');
  });
  test('a placeholder for a plugin this page has no browser half for settles with its source', () => {
    const win = page(PLOT);
    placeholder(win).setAttribute('data-lattice-hydrate', 'nope');
    SURFACES.runtime(win)();
    assert.equal(win.document.querySelector('[data-lattice-hydrate="nope"]').getAttribute('data-lattice-settle'), 'unavailable');
  });
  test('an element named like the library is not the library', () => {
    const win = page(PLOT);
    const decoy = win.document.createElement('div');
    decoy.id = 'functionPlot';
    win.document.body.appendChild(decoy);
    SURFACES.runtime(win)();
    assert.equal(state(placeholder(win)), 'unavailable', 'a <div id="functionPlot"> must not be called as the library');
  });
  test('a placeholder another host is drawing is left alone (the --fluid page runs two)', () => {
    const win = page(PLOT);
    const calls = fakeLibrary(win);
    placeholder(win).setAttribute('data-lattice-settle', 'hydrating');
    SURFACES.runtime(win)();
    assert.equal(calls.length, 0);
  });
});

/**
 * RUNTIME-DRAWN figures (Mermaid, `render.exec.hydrate: "pass"`): the plugin's pass tags a
 * fence's <pre> with the host's markup, so a capture waits on it — but the host must neither draw
 * nor release one (its pass owns it), a release keeps its highlighted content (it has no packed
 * config), and the host's one loader fetches its library for that pass (`ensureLibrary`).
 * (Mutation-proved gaps the HARD RULE #25 checker found: dropping `runtimeDrawn` failed only the
 * integration tier.)
 */
describe('the host and a runtime-drawn figure', () => {
  const DRAWN = [{ name: 'mermaid', payload: { file: 'mermaid.min.js', global: 'mermaid' } }];
  const fence = (settle = 'pending') => new JSDOM(
    `<!doctype html><body><pre data-lattice-hydrate="mermaid" data-lattice-settle="${settle}"><code class="language-mermaid-source"><span class="hljs-keyword">flowchart</span> LR</code></pre><div class="mermaid"></div></body>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  ).window;
  const pre = (win) => win.document.querySelector('pre');
  // A jsdom document built this way still reports `loading` synchronously after construction; the
  // loader declines mid-parse by design (its own test below), so these tests see a parsed page.
  const parsed = (win) => {
    Object.defineProperty(win.document, 'readyState', { configurable: true, get: () => 'complete' });
    return win;
  };

  test('run() leaves a pending runtime-drawn fence to the runtime\'s pass', () => {
    const a = fence();
    installHydrateHost(a, HYDRATORS, { fromBase64, releaseFigure, runtimeDrawn: DRAWN }).run();
    assert.equal(state(pre(a)), 'pending');
  });

  test('the CLI page has no runtime pass, so there a tagged fence is released — its source kept', () => {
    const b = fence();
    b.eval(hydrateScript(HYDRATORS).replace('var host = ', 'var host = window.__host = '));
    b.__host.run();
    assert.equal(state(pre(b)), 'unavailable');
    assert.ok(pre(b).querySelector('.hljs-keyword'));
  });

  test('an AUTHOR element carrying a runtime-drawn plugin\'s name is not its figure: released, never waited on', () => {
    // Only the fence's own <pre> is the runtime's; a forged <div> survives the sanitizer and, left
    // pending, held every capture for its whole budget (HARD RULE #25 red team).
    const win = new JSDOM('<!doctype html><body><div data-lattice-hydrate="mermaid" data-lattice-settle="pending">x</div></body>', { runScripts: 'outside-only' }).window;
    installHydrateHost(win, HYDRATORS, { fromBase64, releaseFigure, runtimeDrawn: DRAWN }).run();
    const div = win.document.querySelector('div');
    assert.equal(state(div), 'unavailable');
    assert.equal(div.matches(PENDING_FIGURES), false, 'no capture waits on it');
  });

  test('without runtimeDrawn it would be an unknown plugin — released, but its highlighted content kept', () => {
    const win = fence();
    installHydrateHost(win, HYDRATORS, { fromBase64, releaseFigure }).run();
    assert.equal(state(pre(win)), 'unavailable');
    assert.ok(pre(win).querySelector('.hljs-keyword'), 'a figure with no packed config keeps its own source markup');
  });

  test('ensureLibrary: one tag, every waiter called once, then answered from memory', () => {
    const win = parsed(fence());
    const host = installHydrateHost(win, [], { fromBase64, releaseFigure, runtimeDrawn: DRAWN, baseUrl: 'https://x.test/v/1/lattice-runtime.js' });
    const got = [];
    const ready = () => typeof win.mermaid?.render === 'function';
    assert.equal(host.ensureLibrary('mermaid', ready, (ok) => got.push(['a', ok])), 'loading');
    assert.equal(host.ensureLibrary('mermaid', ready, (ok) => got.push(['b', ok])), 'loading');
    const tags = [...win.document.querySelectorAll('script[src]')];
    assert.deepEqual(tags.map((t) => t.src), ['https://x.test/v/1/mermaid.min.js'], 'one tag, beside the runtime, by the payload\'s file name');
    win.mermaid = { render() {}, initialize() {} };
    tags[0].onload();
    assert.deepEqual(got, [['a', true], ['b', true]]);
    assert.equal(host.ensureLibrary('mermaid', ready, () => got.push(['late'])), 'ready');
    assert.equal(got.length, 2, 'a call once the library is here takes no waiter');
  });

  test('ensureLibrary: a failed load answers false once per waiter, and "failed" afterwards; no URL is "unavailable"', () => {
    const win = parsed(fence());
    const host = installHydrateHost(win, [], { fromBase64, releaseFigure, runtimeDrawn: DRAWN, baseUrl: 'https://x.test/lattice-runtime.js' });
    const got = [];
    assert.equal(host.ensureLibrary('mermaid', () => false, (ok) => got.push(ok)), 'loading');
    win.document.querySelector('script[src]').onerror();
    assert.deepEqual(got, [false]);
    assert.equal(host.ensureLibrary('mermaid', () => false, (ok) => got.push(ok)), 'failed');
    assert.deepEqual(got, [false], 'never retried');
    const bare = installHydrateHost(parsed(fence()), [], { fromBase64, releaseFigure, runtimeDrawn: DRAWN });
    assert.equal(bare.ensureLibrary('mermaid', () => false, () => {}), 'unavailable', 'no baseUrl: nothing to load beside');
    assert.equal(host.ensureLibrary('no-such-plugin', () => false, () => {}), 'unavailable');
  });

  test('ensureLibrary: mid-parse it declines and takes no waiter, so the next pass asks again', () => {
    const win = fence();
    Object.defineProperty(win.document, 'readyState', { configurable: true, get: () => 'loading' });
    const host = installHydrateHost(win, [], { fromBase64, releaseFigure, runtimeDrawn: DRAWN, baseUrl: 'https://x.test/lattice-runtime.js' });
    let called = 0;
    assert.equal(host.ensureLibrary('mermaid', () => false, () => { called++; }), 'unavailable');
    assert.equal(win.document.querySelectorAll('script[src]').length, 0);
    Object.defineProperty(win.document, 'readyState', { configurable: true, get: () => 'complete' });
    assert.equal(host.ensureLibrary('mermaid', () => false, () => { called++; }), 'loading');
    win.document.querySelector('script[src]').onerror();
    assert.equal(called, 1, 'only the waiter that was taken is answered');
  });
});
