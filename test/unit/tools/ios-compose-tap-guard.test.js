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

// Nightly 44744978068 (iPad, compose probe tap 1): a tap the simulator held 2642 ms. Safari answered the long press with a
// CARET moved out of the editor into the Studio's sr-only legend after the lift, not a word, so the guard read it as a real
// miss and failed the run (#3241). `inEditor` is run.mjs's per-selectionchange flag.
const nightlyLog = {
  events: [
    { type: 'pointerdown', t: 53 },
    { type: 'touchstart', t: 53 },
    { type: 'selectionchange', t: 1039, collapsed: true, text: '', inEditor: true },
    { type: 'pointerup', t: 2695 },
    { type: 'touchend', t: 2695 },
    { type: 'selectionchange', t: 3198, collapsed: true, text: '', inEditor: false },
    { type: 'selectionchange', t: 3436, collapsed: true, text: '', inEditor: true },
  ],
};

test('a long press whose release moved the selection out of the editor is re-delivered, even as a caret', async () => {
  const { tapVerdict, tapHold, pressSelected } = await load();
  assert.equal(tapHold(nightlyLog), 2642);
  assert.equal(pressSelected(nightlyLog), true);
  assert.equal(tapVerdict({ caret: false, hold: tapHold(nightlyLog), selected: pressSelected(nightlyLog), delivery: 1 }), 'redeliver');
  // Only AFTER the lift: a caret outside the editor before touchend is where focus started, not the press's release.
  const before = { events: [{ type: 'touchstart', t: 1 }, { type: 'selectionchange', t: 2, collapsed: true, text: '', inEditor: false }, { type: 'touchend', t: 900 }] };
  assert.equal(pressSelected(before), false);
  // The clause counts only for a LONG press: the same log with a 200 ms hold, a short tap whose caret left the editor, is
  // a real failure the probe must show, never re-delivered.
  const shortLog = { events: nightlyLog.events.map((e) => (e.type === 'pointerup' || e.type === 'touchend' ? { ...e, t: 253 } : e)) };
  assert.equal(tapHold(shortLog), 200);
  assert.equal(tapVerdict({ caret: false, hold: tapHold(shortLog), selected: pressSelected(shortLog), delivery: 1 }), 'fail');
  // A stall that leaves its caret in the editor is still a stall.
  const stalled = { events: [{ type: 'touchstart', t: 1 }, { type: 'touchend', t: 6000 }, { type: 'selectionchange', t: 6010, collapsed: true, text: '', inEditor: true }] };
  assert.equal(pressSelected(stalled), false);
  // A log from before the flag existed (no inEditor) reads as before.
  assert.equal(pressSelected(stallLog), false);
});

// Lab run 44856765533 (iPhone, compose probe tap 1): the simulator stalled mid-tap. The page saw a 9313 ms hold, its touch
// listeners ran 3.8 s late, and nothing followed the lift: no click, no selection change. Safari acted on no long press, so the
// tap still fails and is never re-delivered (a real defect that eats taps leaves no click either); the verdict only names it.
const simStallLog = {
  events: [
    { type: 'pointerdown', t: 122, lag: 3826 },
    { type: 'touchstart', t: 122, lag: 3840 },
    { type: 'pointerup', t: 9435, lag: 32 },
    { type: 'touchend', t: 9435, lag: 34 },
  ],
};

test('a long hold during a simulator stall still fails, under its own name, and is never re-delivered', async () => {
  const { tapVerdict, tapHold, tapLag, tapClicked, pressSelected, SIM_STALL_HOLD_MS, SIM_STALL_LAG_MS } = await load();
  assert.equal(tapHold(simStallLog), 9313);
  assert.equal(tapLag(simStallLog), 3840);
  assert.equal(tapClicked(simStallLog), false);
  assert.equal(pressSelected(simStallLog), false);
  const verdict = (log, delivery = 1) => tapVerdict({ caret: false, hold: tapHold(log), selected: pressSelected(log), delivery, lag: tapLag(log) });
  assert.equal(verdict(simStallLog), 'fail-sim-stall');
  assert.equal(verdict(simStallLog, 2), 'fail-sim-stall', 'never re-delivered, on either delivery');
  // Both conditions, never one: a long hold on a page that kept up is a plain failure, and so is a short tap on a busy one.
  assert.equal(tapVerdict({ caret: false, hold: 9313, selected: false, delivery: 1, lag: SIM_STALL_LAG_MS - 1 }), 'fail');
  assert.equal(tapVerdict({ caret: false, hold: SIM_STALL_HOLD_MS - 1, selected: false, delivery: 1, lag: 3840 }), 'fail');
  // A long press Safari acted on is still re-delivered, stall or not; a caret still passes.
  assert.equal(tapVerdict({ caret: false, hold: 9313, selected: true, delivery: 1, lag: 3840 }), 'redeliver');
  assert.equal(tapVerdict({ caret: true, hold: 9313, selected: false, delivery: 1, lag: 3840 }), 'pass');
  // The earlier stall fixture (no lag recorded) reads as before.
  assert.equal(verdict(stallLog), 'fail');
  const tapped = { events: [{ type: 'touchstart', t: 1 }, { type: 'touchend', t: 40 }, { type: 'mousedown', t: 80 }, { type: 'click', t: 90 }] };
  assert.equal(tapClicked(tapped), true);
});

// The maker-checker's two exposures in the out-of-editor clause (PR #3368): it must not re-deliver a selection that was
// CLEARED (no anchor), nor one that left the editor because the page moved FOCUS out of it, which is a product's doing.
test('a cleared selection, or focus taken by the page, is never read as a long press; the undo doorbell does not count', async () => {
  const { pressSelected, tapVerdict, tapHold } = await load();
  const withAfter = (...extra) => ({
    events: [
      { type: 'touchstart', t: 0 },
      { type: 'selectionchange', t: 700, collapsed: true, text: '', inEditor: true },
      { type: 'touchend', t: 900 },
      ...extra,
    ],
  });
  // Cleared: run.mjs logs inEditor null when the selection has no anchor.
  const cleared = withAfter({ type: 'selectionchange', t: 950, collapsed: true, text: '', inEditor: null });
  assert.equal(pressSelected(cleared), false);
  assert.equal(tapVerdict({ caret: false, hold: tapHold(cleared), selected: pressSelected(cleared), delivery: 1 }), 'fail');
  // Focus stolen: a field outside the editor took focus after the touch, and the selection went with it.
  const stolen = withAfter({ type: 'focusin', t: 920, inEditor: false, doorbell: false }, { type: 'selectionchange', t: 950, collapsed: true, text: '', inEditor: false });
  assert.equal(pressSelected(stolen), false);
  assert.equal(tapVerdict({ caret: false, hold: tapHold(stolen), selected: pressSelected(stolen), delivery: 1 }), 'fail');
  // The undo doorbell's ring takes focus and hands it back on ordinary taps: it does not block the re-delivery.
  const rang = withAfter({ type: 'focusin', t: 920, inEditor: false, doorbell: true }, { type: 'focusin', t: 940, inEditor: true, doorbell: false }, { type: 'selectionchange', t: 950, collapsed: true, text: '', inEditor: false });
  assert.equal(pressSelected(rang), true);
  // Focus back INTO the editor (it took the tap's focus) is not a steal either.
  const focused = withAfter({ type: 'focusin', t: 920, inEditor: true, doorbell: false }, { type: 'selectionchange', t: 950, collapsed: true, text: '', inEditor: false });
  assert.equal(pressSelected(focused), true);
  // A long press Safari answered with a WORD still counts, whatever focus did: that clause is unchanged.
  const word = withAfter({ type: 'focusin', t: 920, inEditor: false, doorbell: false }, { type: 'selectionchange', t: 950, collapsed: false, text: 'point', inEditor: true });
  assert.equal(pressSelected(word), true);
});

// The tap log's own classification (run.mjs embeds inEditorOf's source in the page): a selection with NO anchor is null,
// never false, so the out-of-editor clause cannot read a dropped selection as a moved one (maker-checker, PR #3368).
test('inEditorOf: inside an editor, outside every editor, and no node at all', async () => {
  const { inEditorOf, pressSelected } = await load();
  const el = (editor) => ({ closest: (sel) => (sel === '.ProseMirror' && editor ? {} : null) });
  assert.equal(inEditorOf(el(true)), true);
  assert.equal(inEditorOf(el(false)), false);
  assert.equal(inEditorOf(null), null, 'a cleared selection has no anchor');
  assert.equal(inEditorOf(undefined), null);
  assert.equal(inEditorOf({}), false, 'a node without closest (not an element) is outside');
  // End to end through the log: a cleared selection after a long hold is not a long press.
  const log = { events: [{ type: 'touchstart', t: 0 }, { type: 'touchend', t: 900 }, { type: 'selectionchange', t: 950, collapsed: true, text: '', inEditor: inEditorOf(null) }] };
  assert.equal(pressSelected(log), false);
});

test('pressSelected is exactly its two clauses: the word one and the release-jump one, each callable alone', async () => {
	// run.mjs's forced long press reports each clause on its own, so the release-jump clause (#3241) gets a real-simulator
	// artifact even when the word clause catches the press first (the checker on #3368).
	const { pressSelected, pressSelectedWord, pressMovedOut } = await load();
	// The nightly: a caret after the lift, in the hidden legend. Only the release-jump clause sees it.
	assert.equal(pressSelectedWord(nightlyLog), false);
	assert.equal(pressMovedOut(nightlyLog), true);
	assert.equal(pressSelected(nightlyLog), true);
	// A word selected during the press, and no move after the lift: only the word clause.
	assert.equal(pressSelectedWord(pressLog), true);
	assert.equal(pressMovedOut(pressLog), false);
	assert.equal(pressSelected(pressLog), true);
	// A stall: neither.
	assert.equal(pressSelectedWord(stallLog), false);
	assert.equal(pressMovedOut(stallLog), false);
	assert.equal(pressSelected(stallLog), false);
	// No touch at all: neither, and no throw.
	assert.equal(pressSelectedWord({ events: [] }), false);
	assert.equal(pressMovedOut(null), false);
});
