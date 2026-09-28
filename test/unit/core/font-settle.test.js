/**
 * Unit: lib/core/font-settle.js's settleFonts — a maker-checker finding
 * (2026-07-11) caught the first cut of the overflow-watcher font-race fix
 * (issue #894) shipping as a silent no-op: Array.prototype.map.call(
 * document.fonts, ...) never actually loops, because a FontFaceSet is
 * iterable (.forEach/.size) but NOT array-like (no .length). These tests
 * drive a fake shaped EXACTLY like that real gap — .forEach and .ready
 * only, no .length, no numeric indices — so a regression back to
 * Array.prototype.map/slice/etc. on the raw set fails loudly here instead
 * of shipping silently again.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { settleFonts } = require('../../../lib/core/font-settle');

// A FontFaceSet-shaped fake: .forEach and .size, deliberately NO .length and
// no numeric index access — Array.prototype methods called with .call() on
// this object must fail to iterate it, exactly like the real DOM type.
function fakeFontFaceSet(faces) {
  return {
    size: faces.length,
    forEach(fn) { for (const f of faces) fn(f); },
    ready: Promise.resolve(),
  };
}

function fakeFont(loadDelayMs, shouldReject) {
  let loaded = false;
  return {
    get loaded() { return loaded; },
    load() {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          loaded = true;
          if (shouldReject) reject(new Error('font fetch failed'));
          else resolve();
        }, loadDelayMs);
      });
    },
  };
}

describe('settleFonts', () => {
  test('calls .load() on every font in the set (not zero, per the map.call bug)', async () => {
    const a = fakeFont(0, false);
    const b = fakeFont(0, false);
    const c = fakeFont(0, false);
    const set = fakeFontFaceSet([a, b, c]);
    await settleFonts(set, 1000);
    assert.equal(a.loaded, true);
    assert.equal(b.loaded, true);
    assert.equal(c.loaded, true);
  });

  test('resolves once every font has loaded, even with staggered delays', async () => {
    const fast = fakeFont(5, false);
    const slow = fakeFont(40, false);
    const set = fakeFontFaceSet([fast, slow]);
    await settleFonts(set, 1000);
    assert.equal(fast.loaded, true);
    assert.equal(slow.loaded, true);
  });

  test('a rejected font load does not reject settleFonts (caught per-font)', async () => {
    const ok = fakeFont(0, false);
    const broken = fakeFont(0, true);
    const set = fakeFontFaceSet([ok, broken]);
    await assert.doesNotReject(settleFonts(set, 1000));
    assert.equal(ok.loaded, true);
    assert.equal(broken.loaded, true);
  });

  test('an empty FontFaceSet resolves immediately, not stuck forever', async () => {
    const set = fakeFontFaceSet([]);
    const start = Date.now();
    await settleFonts(set, 1000);
    assert.ok(Date.now() - start < 500, 'should resolve well before the 1000ms timeout');
  });

  test('a hung font load does not block past the timeout bound', async () => {
    const hung = { load: () => new Promise(() => {}) }; // never settles
    const set = fakeFontFaceSet([hung]);
    const start = Date.now();
    await settleFonts(set, 150);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 140 && elapsed < 500, `expected ~150ms timeout, got ${elapsed}ms`);
  });
});

// settleLaidOutFonts — the PREVIEW's settle. It must NOT force-load the declared faces (that is
// the ten unused downloads it exists to stop), it must flush layout BEFORE reading `ready` (a
// face is only requested once text using it is laid out), and it must never hold past its bound.
describe('settleLaidOutFonts (preview)', () => {
  const { settleLaidOutFonts } = require('../../../lib/core/font-settle');
  const docWith = (onFlush) => ({ documentElement: { get offsetHeight() { onFlush(); return 100; } } });

  test('loads no declared face — it waits on ready, it never calls .load()', async () => {
    const faces = [fakeFont(5), fakeFont(5), fakeFont(5)];
    const set = { ...fakeFontFaceSet(faces), ready: Promise.resolve() };
    await settleLaidOutFonts(docWith(() => {}), set, 1000);
    assert.equal(faces.filter((f) => f.loaded).length, 0);
  });

  test('flushes layout before it reads ready', async () => {
    const order = [];
    const set = { forEach() {}, get ready() { order.push('ready'); return Promise.resolve(); } };
    await settleLaidOutFonts(docWith(() => order.push('flush')), set, 1000);
    assert.deepEqual(order, ['flush', 'ready']);
  });

  test('resolves at its bound when ready never settles', async () => {
    const set = { forEach() {}, ready: new Promise(() => {}) };
    const t = Date.now();
    await settleLaidOutFonts(docWith(() => {}), set, 30);
    assert.ok(Date.now() - t < 1000);
  });

  test('a document with no layout still settles on ready', async () => {
    const set = { forEach() {}, ready: Promise.resolve() };
    await settleLaidOutFonts({ documentElement: null }, set, 1000);
  });
});
