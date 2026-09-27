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
  readModel() { return { shapes: [{ id: 'a' }], edges: [] }; },
  signature() { return ['model']; },
  measure(model, ctx) {
    const floor = Number.parseFloat(ctx.fig.querySelector('.g-box').style.getPropertyValue('--chart-text-min')) || 11;
    return { args: [model, { a: { w: floor, h: 10 } }, {}], floor };
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
      return { width: base + perPx * sizes.a.w, height: 10, dir: 'lr', nodes: {}, routes: [] };
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
});
