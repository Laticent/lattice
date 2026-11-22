/**
 * THE COMPOSE TAP'S PRECONDITION: was the gesture Safari saw a tap at all? (followups.d/3223-p1)
 *
 * run.mjs `composeTouchTap` sends a WebDriver touch with no pause between down and up, and checks that the caret lands in the
 * tapped paragraph. A slow iOS Simulator stretches that hold: in dispatch 43798678775 a 300 ms hold reached the page as 632 ms,
 * and Safari read it as a long press. It selected the word under the finger ("point") and, on release, the Studio's
 * screen-reader-only legend ("Workspace stop"). Those are the exact messages of every red iPad run. Where the finger landed
 * was never wrong: on all 26 logged taps the page saw the point WebDriver sent. The jump to the legend is the simulator's long
 * press, not the Studio: on a bare page with no Studio code, the same WebDriver long press moved its selection on release to
 * the text above and left of the finger (dispatch 44856765533, #3241), and in the Studio that text is the hidden legend.
 *
 * So the probe reads the hold from the page's own event log, and a gesture held for LONG_PRESS_MS or more was not the
 * stimulus the step tests. It is delivered again ONCE. That re-delivery checks the precondition, not the assertion: a short
 * tap that misses the caret fails at once, and a second long press fails with the hold named, never with "SELECTED".
 * The flaky-test coordinator approved exactly this shape on 2026-11-16 (quoted in the PR that added it).
 */

/**
 * Where a logged selection or focus target sits, for run.mjs's tap log (`inEditor`): true inside a Compose editor
 * (`.ProseMirror`), false outside every editor, and null when there is no node at all (a cleared selection has no anchor).
 * null never counts as "outside" (see `pressSelected`), so a dropped selection is not read as a moved one. run.mjs embeds
 * this function's own source in the page script, so the page and this test run the same code.
 * @param {{ closest?: (sel: string) => unknown } | null | undefined} el  an element, or the anchor's parent element
 * @returns {boolean | null}
 */
export function inEditorOf(el) {
	return el ? !!el.closest?.('.ProseMirror') : null;
}

/** iOS reads a touch held this long as a long press (UIKit's default minimum press duration is 0.5 s). */
export const LONG_PRESS_MS = 500;

/**
 * The hold the page saw: the time from the first touchstart to the first touchend (or touchcancel) after it, in ms, or null
 * when the log holds no such pair (the page saw no touch at all). `t` is each event's own time (`e.timeStamp`), never when
 * its listener ran (`lag` records that), so a main thread blocked mid-gesture cannot turn a tap into a long press here.
 * @param {{ events?: Array<{ type: string, t: number }> } | null | undefined} log  `window.__tapLog` from run.mjs
 * @returns {number | null}
 */
export function tapHold(log) {
	const events = log?.events || [];
	const start = events.findIndex((e) => e.type === 'touchstart');
	if (start < 0) return null;
	const end = events.slice(start + 1).find((e) => e.type === 'touchend' || e.type === 'touchcancel');
	return end ? end.t - events[start].t : null;
}

/**
 * Did Safari ACT on a long press? True when the log holds a selection that is not a caret (a word, or the legend a long press
 * jumps to) after the first touchstart, or a selection that left every editor after the lift. A long hold alone does not
 * show it: the page's touch times include the time a stalled simulator took to dispatch them, and real taps that placed the
 * caret showed holds of 1018 ms, 6335 ms and 25154 ms (dispatches 43817085692, 43811508778, 43851595030). Every forced or swept long press selected text about 650 to 720 ms in.
 * Events are taken in log order, not by time, because selectionchange is stamped at listener time and touches at event time.
 * @param {{ events?: Array<{ type: string, collapsed?: boolean, text?: string, inEditor?: boolean | null, doorbell?: boolean }> } | null | undefined} log
 * @returns {boolean}
 */
export function pressSelected(log) {
	return pressSelectedWord(log) || pressMovedOut(log);
}

/** The touch's events after its touchstart, or null when the log has no touchstart. */
function afterTouch(log) {
	const events = log?.events || [];
	const start = events.findIndex((e) => e.type === 'touchstart');
	return start < 0 ? null : events.slice(start + 1);
}

/** `pressSelected`'s first clause: the press selected a word (a range with text). */
export function pressSelectedWord(log) {
	const after = afterTouch(log);
	return !!after && after.some((e) => e.type === 'selectionchange' && e.collapsed === false && !!e.text);
}

/**
 * `pressSelected`'s second clause, alone: the release-jump. Exported so the forced long press in run.mjs can say whether this
 * clause by itself would have re-sent it, which gives the clause a real-simulator artifact (the checker on #3368).
 */
export function pressMovedOut(log) {
	const after = afterTouch(log);
	if (!after) return false;
	// After the lift, Safari moved the selection out of every editor: the long press's release moving it to the text above
	// and left of the finger, which in the Studio is the hidden legend or heading (nightly 44744978068 put a CARET there, so
	// `pressSelectedWord` missed it, #3241). A stalled tap leaves its caret in the editor, so this never reads one as a press.
	const end = after.findIndex((e) => e.type === 'touchend' || e.type === 'touchcancel');
	// NOT when the page moved FOCUS out of the editor: that is a product's doing (an overlay or field that takes the first tap),
	// and a long press moving the selection into hidden text moves no focus. The undo doorbell's own ring is excluded: it takes
	// focus for one invisible edit and hands it straight back on ordinary taps. `inEditor` null (no anchor: a cleared selection)
	// never counts, so a dropped selection is not read as a moved one.
	const focusLeft = after.some((e) => e.type === 'focusin' && e.inEditor === false && !e.doorbell);
	return end >= 0 && !focusLeft && after.slice(end + 1).some((e) => e.type === 'selectionchange' && e.inEditor === false);
}

/** A hold this far past the tap budget, with the page's listeners this late, is a stalled tap (see `tapVerdict`). */
export const SIM_STALL_HOLD_MS = 2000;
export const SIM_STALL_LAG_MS = 1000;

/**
 * How late the page's touch listeners ran, in ms: the largest `lag` on a touchstart or touchend (run.mjs records each event's
 * own time and how long after it the listener ran). Seconds of lag mean the simulator's page was not running, not a finger.
 * @param {{ events?: Array<{ type: string, lag?: number }> } | null | undefined} log
 * @returns {number}
 */
export function tapLag(log) {
	return Math.max(0, ...(log?.events || []).filter((e) => /^touch(start|end|cancel)$/.test(e.type)).map((e) => e.lag || 0));
}

/**
 * Whether Safari synthesized a click after the lift, its own sign that it read the gesture as a tap. Reported only: a missing
 * click never re-delivers, because a real defect that eats taps (an overlay, `touch-action`) also leaves none.
 * @param {{ events?: Array<{ type: string }> } | null | undefined} log
 * @returns {boolean}
 */
export function tapClicked(log) {
	const events = log?.events || [];
	const end = events.findIndex((e) => e.type === 'touchend' || e.type === 'touchcancel');
	return end >= 0 && events.slice(end + 1).some((e) => e.type === 'click');
}

/**
 * What the probe does after one delivered tap.
 * - `pass`: the caret is in the tapped paragraph.
 * - `redeliver`: no caret, and on the FIRST delivery the page saw a long press that Safari acted on (held LONG_PRESS_MS or
 *   more AND a non-caret selection, or a selection moved out of every editor after the lift, see `pressSelected`): the
 *   stimulus was not a tap.
 * - `fail-long-press`: no caret, and the re-delivery was such a long press too. The step fails, naming the hold.
 * - `fail-sim-stall`: no caret, no long press Safari acted on, a hold of SIM_STALL_HOLD_MS or more AND listeners running
 *   SIM_STALL_LAG_MS or more late. Still a failure, never re-delivered; its own name only so triage reads it as the simulator
 *   stalling or a long task on the page holding the tap up (the lab's iPhone run 44856765533: a 9313 ms hold, 3.8 s of lag,
 *   no click after the lift). It names no culprit: a page long task is a product defect.
 * - `fail`: no caret after anything else: a short hold, a long hold with no selection (a stall, not a press), or no touch
 *   seen at all. A real failure, never re-delivered.
 * @param {{ caret: boolean, hold: number | null, selected: boolean, delivery: number, lag?: number }} r  `delivery` counts from 1
 * @returns {'pass' | 'redeliver' | 'fail-long-press' | 'fail-sim-stall' | 'fail'}
 */
export function tapVerdict({ caret, hold, selected, delivery, lag = 0 }) {
	if (caret) return 'pass';
	if (hold !== null && hold >= LONG_PRESS_MS && selected === true) return delivery === 1 ? 'redeliver' : 'fail-long-press';
	if (hold !== null && hold >= SIM_STALL_HOLD_MS && lag >= SIM_STALL_LAG_MS) return 'fail-sim-stall';
	return 'fail';
}
