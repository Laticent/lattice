/**
 * Unit: docs/scripts/ios-safari/tap-guard.mjs — the iPad compose tap re-delivers a gesture only when the page saw a long press
 * (followups.d/3223-p1). The guard exists so the re-delivery can never turn a real caret failure green: a short tap that misses
 * the caret fails at once. The logs below are the shapes run.mjs reads from `window.__tapLog`, with the holds measured on the
 * iPad simulator in dispatch 43798678775 (49 ms a tap, 632 ms a long press).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const load = () => import(path.join(__dirname, '..', '..', '..', 'docs', 'scripts', 'ios-safari', 'tap-guard.mjs'));
const log = (start, end, endType = 'touchend') => ({
  events: [
    { type: 'pointerdown', t: start - 2 },
    { type: 'touchstart', t: start },
    { type: 'pointerup', t: end },
    { type: endType, t: end },
    { type: 'selectionchange', t: end + 12 },
  ],
});

test('the hold is touchstart to the first touchend or touchcancel after it', async () => {
  const { tapHold } = await load();
  assert.equal(tapHold(log(234, 283)), 49);
  assert.equal(tapHold(log(51, 683)), 632);
  assert.equal(tapHold(log(20, 700, 'touchcancel')), 680);
  assert.equal(tapHold({ events: [{ type: 'selectionchange', t: 3 }] }), null, 'no touch seen');
  assert.equal(tapHold({ events: [{ type: 'touchstart', t: 3 }] }), null, 'no touchend yet');
  assert.equal(tapHold(null), null);
});

test('a caret passes, whatever the hold', async () => {
  const { tapVerdict } = await load();
  assert.equal(tapVerdict({ caret: true, hold: 49, delivery: 1 }), 'pass');
  assert.equal(tapVerdict({ caret: true, hold: 632, delivery: 2 }), 'pass');
});

test('a short tap that misses the caret fails at once: never re-delivered', async () => {
  const { tapVerdict } = await load();
  assert.equal(tapVerdict({ caret: false, hold: 49, delivery: 1 }), 'fail');
  assert.equal(tapVerdict({ caret: false, hold: 499, delivery: 1 }), 'fail', 'just under the long-press threshold');
  assert.equal(tapVerdict({ caret: false, hold: null, delivery: 1 }), 'fail', 'the page saw no touch');
});

test('a long press is re-delivered once, and a second long press fails with the hold named', async () => {
  const { tapVerdict, LONG_PRESS_MS } = await load();
  assert.equal(LONG_PRESS_MS, 500);
  assert.equal(tapVerdict({ caret: false, hold: 500, delivery: 1 }), 'redeliver');
  assert.equal(tapVerdict({ caret: false, hold: 632, delivery: 1 }), 'redeliver');
  assert.equal(tapVerdict({ caret: false, hold: 1630, delivery: 2 }), 'fail-long-press');
  assert.equal(tapVerdict({ caret: false, hold: 49, delivery: 2 }), 'fail', 'a short re-delivery that misses is a real failure');
});
