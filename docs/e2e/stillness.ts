import type { Page } from '@playwright/test';

// STILLNESS: a control moves only as the answer to an input (flaky shape F10,
// engineering/decisions/2026-11-06-flaky-tests.md). A layout change that lands frames after the click that caused it
// moves a button out from under a pointer that has already moved on: a click aimed at it starts on one layout and ends
// on the other, and the browser fires none. Present's Stage did this for about a second (the Next arrow jumped 337 px
// at 1440 wide), and a test, like a presenter, lost the click 1 time in 20.
//
// The web's word for it is an UNEXPECTED LAYOUT SHIFT (the Layout Instability API behind CLS). That API is Chromium's
// alone, and it calls a shift expected when it falls within 500 ms of an input, which reads the clock (HARD RULE #32)
// and misjudges a click whose handler blocks: `window.open` holds the main thread 300 to 900 ms, so the right answer to
// a Stage click lands "late" by the clock. This watcher counts FRAMES instead, on every engine: a control that moves
// within `graceFrames` frames of the moment the last pointer or key input's handlers finished is answering it; one that
// moves later moved on its own.
//
// What counts: an element matching CONTROLS, already on screen in the previous frame, whose box moved by more than a
// pixel. An element that mounts or unmounts is not a shift, and neither is motion a running animation or transition
// makes (CLS counts neither). Opt-in per surface: start
// it before the action, read it after the action's work has landed.

/** The controls a pointer aims at. */
const CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], input, select, textarea';

let watchSeq = 0;

export type Shift = {
	/** The control's accessible name, or its text, or its tag. */
	label: string;
	/** `x,y` before and after, in CSS pixels. */
	from: string;
	to: string;
	/** Frames since the last input when it moved; null when no input came before it. */
	framesAfterInput: number | null;
};

/**
 * Watch the controls under `within` for moves no input explains. Returns `unexpected()`, which reads the moves so far,
 * and `stop()`. Frames are counted from the page's own `requestAnimationFrame`, so a page whose clock a test paused
 * (`frame-clock.ts`) watches nothing until it steps.
 */
export async function watchStillness(page: Page, within: string, { graceFrames = 2 } = {}) {
	const key = `__stillness_${++watchSeq}`;
	await page.evaluate(
		({ within, controls, graceFrames, key }) => {
			const w = window as unknown as Record<string, unknown>;
			const state = { frame: 0, lastInput: -1, shifts: [] as unknown[], running: true, boxes: new WeakMap<Element, { x: number; y: number }>() };
			w[key] = state;
			const onInput = () => {
				state.lastInput = state.frame;
			};
			// Stamped twice. On `document` in capture, so an input the app stops from bubbling still counts. And on `window`
			// in bubble, which runs after the app's own handlers: a handler can block (WebKit runs animation frames inside
			// `window.open`, 3 or 4 of them, before React has committed the answer), and the answer's frames count from
			// the moment the handlers finished, not from the moment the input began.
			for (const type of ['pointerdown', 'keydown', 'click']) {
				document.addEventListener(type, onInput, true);
				window.addEventListener(type, onInput, false);
			}
			const label = (el: Element) =>
				(el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 40) || el.tagName.toLowerCase()).replace(/\s+/g, ' ');
			const tick = () => {
				if (!state.running) return;
				state.frame++;
				const seen = new WeakMap<Element, { x: number; y: number }>();
				// Motion an animation or a transition makes is intended (a panel sliding in carries its buttons with it), and
				// CLS does not count it either. A control inside an element that is animating this frame is not judged.
				const moving = document
					.getAnimations()
					.filter((a) => a.playState === 'running')
					.map((a) => (a.effect as KeyframeEffect | null)?.target)
					.filter((t): t is Element => t instanceof Element);
				for (const root of document.querySelectorAll(within)) {
					for (const el of root.querySelectorAll(controls)) {
						if (moving.some((t) => t.contains(el))) {
							seen.delete(el);
							continue;
						}
						const r = el.getBoundingClientRect();
						if (!r.width || !r.height) continue;
						const now = { x: r.x, y: r.y };
						seen.set(el, now);
						const was = state.boxes.get(el);
						if (!was || (Math.abs(was.x - now.x) <= 1 && Math.abs(was.y - now.y) <= 1)) continue;
						const after = state.lastInput < 0 ? null : state.frame - state.lastInput;
						if (after === null || after > graceFrames) {
							state.shifts.push({ label: label(el), from: `${Math.round(was.x)},${Math.round(was.y)}`, to: `${Math.round(now.x)},${Math.round(now.y)}`, framesAfterInput: after });
						}
					}
				}
				state.boxes = seen;
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		},
		{ within, controls: CONTROLS, graceFrames, key },
	);
	return {
		unexpected: () => page.evaluate((k) => ((window as unknown as Record<string, { shifts: Shift[] }>)[k]?.shifts ?? []).slice(), key),
		stop: () =>
			page.evaluate((k) => {
				const s = (window as unknown as Record<string, { running: boolean }>)[k];
				if (s) s.running = false;
			}, key),
	};
}
