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
