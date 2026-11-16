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

test('the hold is the events\' own times, not when the listener ran: a blocked main thread does not make a long press', async () => {
  const { tapHold, tapVerdict } = await load();
  // A 40 ms tap whose touchend listener ran 700 ms late (lag): the page was busy, the finger was not held.
  const busy = { events: [{ type: 'touchstart', t: 100, lag: 0 }, { type: 'touchend', t: 140, lag: 700 }] };
  assert.equal(tapHold(busy), 40);
  assert.equal(tapVerdict({ caret: false, hold: tapHold(busy), delivery: 1 }), 'fail', 'a missed short tap on a busy page is a real failure');
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
  assert.equal(tapVerdict({ caret: false, hold: 500, selected: true, delivery: 1 }), 'redeliver');
  assert.equal(tapVerdict({ caret: false, hold: 632, selected: true, delivery: 1 }), 'redeliver');
  assert.equal(tapVerdict({ caret: false, hold: 1630, selected: true, delivery: 2 }), 'fail-long-press');
  assert.equal(tapVerdict({ caret: false, hold: 49, selected: false, delivery: 2 }), 'fail', 'a short re-delivery that misses is a real failure');
});

// Shapes from real dispatches (run.mjs's window.__tapLog): a long press Safari acted on selects text; a stalled tap does not.
const pressLog = {
  events: [
    { type: 'pointerdown', t: 20 },
    { type: 'touchstart', t: 20 },
    { type: 'selectionchange', t: 762, collapsed: false, text: 'point' },
    { type: 'touchend', t: 1238 },
    { type: 'selectionchange', t: 1981, collapsed: false, text: 'Workspace stop' },
  ],
}; // dispatch 43817085692, iPad control-1: hold 1218 ms
const stallLog = {
  events: [
    { type: 'pointerdown', t: 97 },
    { type: 'touchstart', t: 97 },
    { type: 'touchend', t: 25251 },
    { type: 'selectionchange', t: 25260, collapsed: true, text: '' },
  ],
}; // dispatch 43851595030, iPhone delivery 1: hold 25154 ms, and the caret landed

test('pressSelected: a long press Safari acted on selects text after touchstart; a stall and a caret do not', async () => {
  const { pressSelected, tapHold } = await load();
  assert.equal(pressSelected(pressLog), true);
  assert.equal(pressSelected(stallLog), false, 'a caret is a collapsed selection');
  assert.equal(tapHold(stallLog), 25154);
  assert.equal(pressSelected({ events: [{ type: 'selectionchange', collapsed: false, text: 'x' }, { type: 'touchstart', t: 1 }] }), false, 'a selection before the touch is not this press');
  assert.equal(pressSelected(null), false);
});

test('a long hold with no selection is a stall, not a long press: a missed caret then fails, never re-delivered', async () => {
  const { tapVerdict, tapHold, pressSelected } = await load();
  const verdict = (log, delivery = 1) => tapVerdict({ caret: false, hold: tapHold(log), selected: pressSelected(log), delivery });
  assert.equal(verdict(stallLog), 'fail', 'a 25 s stall that missed the caret is a real failure');
  assert.equal(verdict(pressLog), 'redeliver', 'a 1218 ms hold that selected "point" was a long press');
  assert.equal(tapVerdict({ caret: false, hold: 6335 }), 'fail', 'selected must be stated: an omitted flag never re-delivers');
});
