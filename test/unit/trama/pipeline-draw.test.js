/**
 * Unit: WHEN Trama's pipeline draws, and where its fit lands. The real serialized
 * `installGraphPass`, run in jsdom against a stand-in chart whose size follows its type
 * floor, so the numbers are exact:
 *   - no layout while `document.fonts.status` is `loading`; a draw when the faces land, at
 *     the 2 s deadline for a face that never does, and at once on `__latticeGraphFlush`
 *     (the CLI export calls it before it captures);
 *   - the type floor and the fit solved as one fixed point on the first draw, with the
 *     secant step from the third round (docs/src/lib/trama/pipeline.ts, `settled`).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installGraphPass } = require('@laticent/trama');

// The stand-in chart. Its one label is set at the declared type floor, and the drawing is
// 400 + 60 x floor units wide in a 1000-unit port, so the floor it needs solves
// f = 11 * (400 + 60 f) / 1000: f = 12.94, a fit of 0.850. Plain iteration from 11 gets
// there at 0.66 of the remaining distance per round.
const adapter = () => ({
  selector: '.g-figure[data-g-model]',
  figure: '.g-figure',
  attr: 'g',
  parts(fig) {
    return { box: fig.querySelector('.g-box'), harness: fig.querySelector('.g-harness'), svg: fig.querySelector('svg'), port: fig };
  },
  // The model attribute names the chart: `1` and `2` are different charts (no shape in common).
  // Three shapes, since a chart counts as the same one while all but two of them match.
  readModel(fig) { const n = fig.getAttribute('data-g-model'); return { shapes: [{ id: `a${n}` }, { id: `b${n}` }, { id: `c${n}` }], edges: [] }; },
  signature() { return ['model']; },
  measure(model, ctx) {
    const floor = Number.parseFloat(ctx.fig.querySelector('.g-box').style.getPropertyValue('--chart-text-min')) || 11;
    return { args: [model, { a: { w: floor, h: 10, chart: model.shapes[0].id } }, {}], floor };
  },
  paint(_model, m) { return `<text font-size="${m.floor}">a</text>`; },
});

function setup({ fonts, base = 400, perPx = 60 } = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="g-figure" data-g-model="1"><div class="g-box"><div class="g-harness"></div><svg><title>Chart</title></svg></div></div></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  const fig = w.document.querySelector('.g-figure');
  fig.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  w.__latticeDagre = { layout() {} };
  if (fonts) Object.defineProperty(w.document, 'fonts', { value: fonts, configurable: true });
  const log = { layouts: [] };
  const kernel = () => ({
    layout(_model, sizes) {
      log.layouts.push(sizes.a.w);
      // Chart `2` is wider, so its fit (and the floor it asks for) differs from chart `1`'s.
      return { width: (sizes.a.chart === 'a2' ? 3 * base : base) + perPx * sizes.a.w, height: 10, dir: 'lr', nodes: {}, routes: [] };
    },
  });
  const pass = w.eval(`(${installGraphPass.toString()})`);
  const run = () => pass(w.document, kernel, adapter);
  return { w, fig, log, run, drawn: () => fig.getAttribute('data-g-drawn') === '1' };
}

/** A FontFaceSet stand-in: `loading` until `land()`, with a `ready` that settles then. */
function fontSet() {
  let settle;
  const set = { status: 'loading' };
  set.ready = new Promise((r) => { settle = r; });
  set.land = () => { set.status = 'loaded'; settle(set); };
  return set;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('trama pipeline — it draws once, in the page\'s own fonts', () => {
  test('no layout while the faces load; one draw when they land', async () => {
    const fonts = fontSet();
    const t = setup({ fonts });
    t.run();
    t.run(); // a second pass meanwhile (DOMContentLoaded, a resize) waits too
    assert.equal(t.log.layouts.length, 0, 'nothing laid out in fallback fonts');
    assert.equal(t.drawn(), false, 'the harness shows meanwhile');
    fonts.land();
    await tick();
    assert.equal(t.drawn(), true);
    const n = t.log.layouts.length;
    t.run();
    assert.equal(t.log.layouts.length, n, 'a pass with nothing new lays nothing out');
  });

  test('a ready that settles while another face is still loading waits for that one too', async () => {
    let settleFirst, settleSecond;
    const fonts = { status: 'loading', ready: new Promise((r) => { settleFirst = r; }) };
    const t = setup({ fonts });
    t.run();
    // The first round ends, but a face requested meanwhile has started a second one.
    const second = new Promise((r) => { settleSecond = r; });
    fonts.ready = second;
    settleFirst(fonts);
    await tick();
    assert.equal(t.log.layouts.length, 0, 'still loading: nothing laid out');
    fonts.status = 'loaded';
    settleSecond(fonts);
    await tick();
    assert.equal(t.drawn(), true, 'drawn when the second round ends');
  });

  test('a face that never loads still gets a draw, at the deadline', async () => {
    const fonts = fontSet();
    const t = setup({ fonts });
    t.run();
    await new Promise((r) => setTimeout(r, 1900));
    assert.equal(t.drawn(), false, 'still waiting inside the deadline');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(t.drawn(), true, 'drawn at 2 s, in whatever fonts there are');
    const n = t.log.layouts.length;
    fonts.land();
    await tick();
    assert.ok(t.log.layouts.length > n, 'and drawn again once the faces land');
  });

  test('__latticeGraphFlush draws at once, fonts or not (the capture hook)', () => {
    const fonts = fontSet();
    const t = setup({ fonts });
    t.run();
    assert.equal(t.drawn(), false);
    assert.equal(typeof t.w.document.__latticeGraphFlush?.g, 'function', 'keyed by the chart\'s prefix');
    for (const draw of Object.values(t.w.document.__latticeGraphFlush)) draw();
    assert.equal(t.drawn(), true);
  });

  test('with the faces already loaded, and with no fonts API, the draw is immediate', () => {
    const loaded = setup({ fonts: { status: 'loaded', ready: Promise.resolve() } });
    loaded.run();
    assert.equal(loaded.drawn(), true);
    const none = setup();
    none.run();
    assert.equal(none.drawn(), true);
  });
});

describe('trama pipeline — the fit and the type floor, solved on the first draw', () => {
  test('the secant step lands the fixed point: the painted floor is the one its fit asks for', () => {
    const t = setup();
    t.run();
    const box = t.fig.querySelector('.g-box');
    const k = Number(box.getAttribute('data-fit-k'));
    const painted = Number(/font-size="([\d.]+)"/.exec(t.fig.querySelector('svg').innerHTML)[1]);
    // The fit the drawing got, and the floor that fit asks for (11 / k).
    assert.ok(Math.abs(k - 0.85) < 0.002, `fit ${k}`);
    assert.ok(Math.abs(painted - 11 / k) / (11 / k) < 0.01, `painted at ${painted}px, the fit asks for ${(11 / k).toFixed(2)}px`);
    // Plain iteration would have stopped at 12.1px after three rounds, under a floor of 12.9.
    assert.deepEqual(t.log.layouts.map((x) => Math.round(x * 100) / 100), [11, 11.66, 12.94]);
  });

  // Under half size a chart still settles when its fit contracts: the text is a small part
  // of its size, so lifting the floor converges and the secant step lands it.
  test('a contracting chart under half size still reaches the floor', () => {
    const t = setup({ base: 1800, perPx: 40 });
    t.run();
    const k = Number(t.fig.querySelector('.g-box').getAttribute('data-fit-k'));
    const painted = Number(/font-size="([\d.]+)"/.exec(t.fig.querySelector('svg').innerHTML)[1]);
    assert.ok(k < 0.5, `fit ${k}`);
    assert.ok(Math.abs(painted - 11 / k) / (11 / k) < 0.01, `painted at ${painted}px, the fit asks for ${(11 / k).toFixed(2)}px`);
  });

  // When the text drives the size faster than the lift, there is no fixed point: each round
  // only shrinks the chart. Two rounds measure that slope, and the fit stops there.
  test('a chart under half size whose fit cannot settle stops at the second layout', () => {
    const t = setup({ base: 400, perPx: 120 });
    t.run();
    assert.equal(t.log.layouts.length, 2, `layouts ${t.log.layouts}`);
    assert.ok(Number(t.fig.querySelector('.g-box').getAttribute('data-fit-k')) < 0.5);
  });

  test('the next draw starts from the fit it left, and lays out once', () => {
    const t = setup();
    t.run();
    const n = t.log.layouts.length;
    // A live preview replaces the figure on every edit; the fit memory is per position.
    t.fig.removeAttribute('data-g-drawn');
    t.fig.__gSig = null;
    t.run();
    assert.equal(t.log.layouts.length - n, 1);
  });

  test('another chart at the same position fits from a cold start, so it draws as a fresh page does', () => {
    // A live preview draws the next slide's chart where the last one was; seeding its fit from
    // the last chart's scale settled on another fixed point than an export of it.
    const fresh = setup();
    fresh.fig.setAttribute('data-g-model', '2');
    fresh.run();
    const t = setup();
    t.run();
    t.fig.setAttribute('data-g-model', '2');
    t.fig.removeAttribute('data-g-drawn');
    t.fig.__gSig = null;
    t.run();
    assert.equal(t.fig.querySelector('svg').innerHTML, fresh.fig.querySelector('svg').innerHTML);
  });
});

describe('trama pipeline — live: the drawing at rest is the one a fresh page draws', () => {
  // The same stand-in chart, in a live preview: a section, a dagre tag, and a Worker stand-in
  // that runs the stand-in kernel a tick later. Its drawing names its chart and its floor.
  const live = () => ({
    ...adapter(),
    signature(fig) { return [fig.getAttribute('data-g-model'), fig.getAttribute('data-rev') || '']; },
    paint(model, m) { return `<text font-size="${m.floor}">${model.shapes[0].id}</text>`; },
  });
  function setupLive(isLive) {
    const dom = new JSDOM('<!doctype html><head><script src="https://x.test/lattice-dagre.js"></script></head><body><section><div class="g-figure" data-g-model="1"><div class="g-box"><div class="g-harness"></div><svg><title>Chart</title></svg></div></div></section></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    const fig = w.document.querySelector('.g-figure');
    fig.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
    w.__latticeDagre = { layout() {} };
    const log = { posts: [], paints: [], workers: 0 };
    const kernel = () => ({ layout(_m, sizes) { return { width: 400 + 60 * sizes.a.w, height: 10, dir: 'lr', nodes: {}, routes: [] }; } });
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    w.Worker = class {
      constructor() { this.n = ++log.workers; }
      postMessage(d) {
        log.posts.push({ floor: d.sizes.a.w, via: this.n });
        setTimeout(() => this.onmessage({ data: { id: d.id, geo: kernel().layout(d.model, d.sizes) } }), 5);
      }
      terminate() {}
    };
    const pass = w.eval(`(${installGraphPass.toString()})`);
    const run = () => pass(w.document, kernel, live, { live: isLive });
    new w.MutationObserver(() => log.paints.push(fig.querySelector('svg').innerHTML)).observe(fig.querySelector('svg'), { childList: true, subtree: true });
    return { fig, log, run, svg: () => fig.querySelector('svg').innerHTML };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  test('the settle fits from a cold start on the search worker, paints only its last round, and ends as a fresh page', async () => {
    const fresh = setupLive(false);
    fresh.run();
    const t = setupLive(true);
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    await sleep(100);
    const n = t.log.posts.length;
    const p = t.log.paints.length;
    await sleep(600);
    const settle = t.log.posts.slice(n);
    assert.ok(settle.length >= 2, `the settle ran its fit rounds: ${JSON.stringify(settle)}`);
    assert.equal(settle[0].floor, 11, 'it starts cold, at the declared floor');
    assert.ok(settle.every((x) => x.via === 2), 'on the search worker');
    assert.ok(t.log.paints.slice(p).every((x) => !/font-size="11"/.test(x)), 'no cold round is painted');
    assert.equal(t.svg(), fresh.svg());
  });

  // THE SAME, WITH NO WORKER (a host that blocks blob workers, a worker that died). A live
  // redraw on this thread starts from the fit it remembers; the stand-in's revision 1 is wider,
  // so that warm start stops at another point than a cold one. The settle after the pause
  // fits it again from a cold start, so the drawing at rest is a fresh page's.
  function setupNoWorker(rev, perPx = 90) {
    const dom = new JSDOM('<!doctype html><body><section><div class="g-figure" data-g-model="1"><div class="g-box"><div class="g-harness"></div><svg><title>Chart</title></svg></div></div></section></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    const fig = w.document.querySelector('.g-figure');
    if (rev) fig.setAttribute('data-rev', rev);
    fig.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
    w.__latticeDagre = { layout() {} };
    w.Worker = undefined;
    const log = { layouts: [] };
    const widen = (f) => (f.getAttribute('data-rev') === '1' ? 1600 : 400);
    const ad = () => ({
      ...live(),
      measure(model, ctx) {
        const floor = Number.parseFloat(ctx.fig.querySelector('.g-box').style.getPropertyValue('--chart-text-min')) || 11;
        return { args: [model, { a: { w: floor, h: 10, base: widen(ctx.fig) } }, {}], floor };
      },
    });
    const kernel = () => ({ layout(_m, sizes) { log.layouts.push(sizes.a.w); return { width: sizes.a.base + perPx * sizes.a.w, height: 10, dir: 'lr', nodes: {}, routes: [] }; } });
    const pass = w.eval(`(${installGraphPass.toString()})`);
    const run = () => pass(w.document, kernel, ad, { live: true });
    return { fig, log, run, svg: () => fig.querySelector('svg').innerHTML };
  }

  test('with no worker, a live redraw settles from a cold fit after the pause, and ends as a fresh page', async () => {
    const fresh = setupNoWorker('1');
    fresh.run();
    const t = setupNoWorker('');
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    const warm = t.svg();
    const n = t.log.layouts.length;
    assert.notEqual(warm, fresh.svg(), 'the warm start must stop elsewhere, or this test proves nothing');
    await sleep(450);
    assert.equal(t.log.layouts[n], 11, 'the settle starts cold, at the declared floor');
    assert.equal(t.svg(), fresh.svg());
  });

  test('with no worker, a newer redraw drops the pending settle', async () => {
    const t = setupNoWorker('');
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    await sleep(100);
    t.fig.setAttribute('data-g-model', '2');
    t.run();
    const n = t.log.layouts.length;
    await sleep(450);
    assert.match(t.svg(), />a2</);
    assert.equal(t.log.layouts.length, n, 'another chart at this position fits cold at once, and nothing settles after it');
  });

  test('with no worker, the settle lays nothing out into a stage that collapsed to no height', async () => {
    const t = setupNoWorker('');
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    const n = t.log.layouts.length;
    // The stage collapses inside the pause (a narrow reflow): width, no height.
    Object.defineProperty(t.fig, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(t.fig, 'clientHeight', { value: 0, configurable: true });
    await sleep(450);
    assert.equal(t.log.layouts.length, n, 'a layout into a zero-height stage tries every candidate for nothing');
  });

  test('with no worker, a chart scaled up does not settle: its cold fit is the same drawing', async () => {
    const t = setupNoWorker('', 10);
    t.run();
    assert.equal(t.fig.querySelector('.g-box').getAttribute('data-fit-k'), '1.2500');
    t.fig.setAttribute('data-rev', '1');
    t.run();
    const n = t.log.layouts.length;
    await sleep(450);
    assert.equal(t.log.layouts.length, n);
  });

  // THE EDITOR'S THREAD BEFORE THE POST (option C of
  // engineering/decisions/2026-10-05-graph-chart-typing-latency.md). Every style
  // read after a DOM write forces a style recalculation. The pending signature is read after
  // the post, a mid-chain paint reads none, and the declared type floor is read once a draw.
  test('a live redraw reads the signature after each post, none for a mid-chain paint, and the floor once', async () => {
    const dom = new JSDOM('<!doctype html><head><script src="https://x.test/lattice-dagre.js"></script></head><body><section><div class="g-figure" data-g-model="1"><div class="g-port"><div class="g-box"><div class="g-harness"></div><svg><title>Chart</title></svg></div></div></div></section></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    const fig = w.document.querySelector('.g-figure');
    // A port of its own inside the figure, as both shipping adapters have (.sc-canvas, .fc-canvas).
    const port = w.document.querySelector('.g-port');
    for (const el of [fig, port]) el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
    w.__latticeDagre = { layout() {} };
    const events = [];
    const kernel = () => ({ layout(_m, sizes) { return { width: sizes.a.base + 90 * sizes.a.w, height: 10, dir: 'lr', nodes: {}, routes: [] }; } });
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    let workers = 0;
    w.Worker = class {
      constructor() { this.n = ++workers; }
      postMessage(d) {
        events.push(this.n === 1 ? 'post' : 'settle-post');
        setTimeout(() => this.onmessage({ data: { id: d.id, geo: kernel().layout(d.model, d.sizes) } }), 5);
      }
      terminate() {}
    };
    const gcs = w.getComputedStyle;
    w.getComputedStyle = (el, ...r) => {
      if (el === fig) events.push('style(fig)');
      if (el === port) events.push('style(port)');
      return gcs.call(w, el, ...r);
    };
    // Revision 1 is wider, so its warm start is off its fixed point and takes several rounds.
    const ad = () => ({
      ...live(),
      parts(f) { return { box: f.querySelector('.g-box'), harness: f.querySelector('.g-harness'), svg: f.querySelector('svg'), port: f.querySelector('.g-port') }; },
      signature(f) { events.push('sig'); return [f.getAttribute('data-g-model'), f.getAttribute('data-rev') || '']; },
      measure(model, ctx) {
        const floor = Number.parseFloat(ctx.fig.querySelector('.g-box').style.getPropertyValue('--chart-text-min')) || 11;
        return { args: [model, { a: { w: floor, h: 10, base: ctx.fig.getAttribute('data-rev') === '1' ? 1600 : 400 } }, {}], floor };
      },
    });
    const pass = w.eval(`(${installGraphPass.toString()})`);
    pass(w.document, kernel, ad, { live: true });
    fig.setAttribute('data-rev', '1');
    events.length = 0;
    pass(w.document, kernel, ad, { live: true });
    await sleep(100);
    const keyEvents = events.filter((e) => e !== 'settle-post');
    const posts = keyEvents.filter((e) => e === 'post').length;
    assert.ok(posts >= 2, `the redraw must take more than one round, or this test proves nothing: ${keyEvents}`);
    keyEvents.forEach((e, i) => { if (e === 'post') assert.equal(keyEvents[i + 1], 'sig', `the pending signature follows the post: ${keyEvents}`); });
    // A draw's entry reads the figure's transform, then its signature; the runtime's own pass
    // re-enters for the attributes a round writes, and skips there on the pending signature.
    const entries = keyEvents.filter((e, i) => e === 'sig' && keyEvents[i - 1] === 'style(fig)').length;
    // The entry checks, one pending signature per post, and the final paint's: none for the
    // mid-chain paints.
    assert.equal(keyEvents.filter((e) => e === 'sig').length, entries + posts + 1, `${keyEvents}`);
    // The declared floor of the figure and of the port: once each for the one draw that did not
    // skip, however many rounds it ran; a skipping pass reads neither.
    assert.equal(keyEvents.filter((e) => e === 'style(fig)').length, entries + 1, `${keyEvents}`);
    assert.equal(keyEvents.filter((e) => e === 'style(port)').length, 1, `${keyEvents}`);
    // ...and a pass run while a round is in flight still finds the pending signature and skips.
    fig.setAttribute('data-rev', '');
    events.length = 0;
    pass(w.document, kernel, ad, { live: true });
    const inFlight = events.filter((e) => e === 'post').length;
    pass(w.document, kernel, ad, { live: true });
    assert.equal(events.filter((e) => e === 'post').length, inFlight, 'the second pass skipped');
  });

  // The floor is read once a draw, but a settle runs after a pause: a declared floor that
  // changed meanwhile (with no signature change) must reach it, as it reaches a fresh page.
  test('the settle reads the declared type floor again', async () => {
    const fresh = setupLive(false);
    fresh.fig.style.setProperty('--chart-text-min', '24px');
    fresh.run();
    const t = setupLive(true);
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    await sleep(100);
    t.fig.style.setProperty('--chart-text-min', '24px');
    await sleep(600);
    assert.notEqual(fresh.svg(), '', 'the fresh page drew');
    assert.equal(t.svg(), fresh.svg());
  });

  test('a chain in flight for the chart this element held before never paints over the next one', async () => {
    const t = setupLive(true);
    t.run();
    t.fig.setAttribute('data-rev', '1');
    t.run();
    t.fig.setAttribute('data-g-model', '2');
    t.run();
    assert.match(t.svg(), />a2</);
    await sleep(700);
    assert.match(t.svg(), />a2</, 'the stale chain for chart 1 was dropped');
  });
});
