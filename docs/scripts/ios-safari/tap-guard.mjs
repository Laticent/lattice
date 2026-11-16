/**
 * THE COMPOSE TAP'S PRECONDITION: was the gesture Safari saw a tap at all? (followups.d/3223-p1)
 *
 * run.mjs `composeTouchTap` sends a WebDriver touch with no pause between down and up, and checks that the caret lands in the
 * tapped paragraph. A slow iOS Simulator stretches that hold: in dispatch 43798678775 a 300 ms hold reached the page as 632 ms,
 * and Safari read it as a long press. It selected the word under the finger ("point") and, on release, the Studio's
 * screen-reader-only legend ("Workspace stop"). Those are the exact messages of every red iPad run. Where the finger landed
 * was never wrong: on all 26 logged taps the page saw the point WebDriver sent.
 *
 * So the probe reads the hold from the page's own event log, and a gesture held for LONG_PRESS_MS or more was not the
 * stimulus the step tests. It is delivered again ONCE. That re-delivery checks the precondition, not the assertion: a short
 * tap that misses the caret fails at once, and a second long press fails with the hold named, never with "SELECTED".
 * The flaky-test coordinator approved exactly this shape on 2026-11-16 (quoted in the PR that added it).
 */

/** iOS reads a touch held this long as a long press (UIKit's default minimum press duration is 0.5 s). */
export const LONG_PRESS_MS = 500;

/**
 * The hold the page saw: the time from the first touchstart to the first touchend (or touchcancel) after it, in ms, or null
 * when the log holds no such pair (the page saw no touch at all).
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
 * What the probe does after one delivered tap.
 * - `pass`: the caret is in the tapped paragraph.
 * - `redeliver`: no caret, and the page saw a long press on the FIRST delivery: the stimulus was not a tap.
 * - `fail-long-press`: no caret, and the re-delivery was a long press too. The step fails, naming the hold.
 * - `fail`: no caret after a gesture the page saw as a tap, or no touch seen at all. A real failure, never re-delivered.
 * @param {{ caret: boolean, hold: number | null, delivery: number }} r  `delivery` counts from 1
 * @returns {'pass' | 'redeliver' | 'fail-long-press' | 'fail'}
 */
export function tapVerdict({ caret, hold, delivery }) {
	if (caret) return 'pass';
	if (hold === null || hold < LONG_PRESS_MS) return 'fail';
	return delivery === 1 ? 'redeliver' : 'fail-long-press';
}
