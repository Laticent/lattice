import type { Page } from '@playwright/test';

/**
 * Drive a page's fake clock one animation frame at a time.
 *
 * Present's reader times its cues on `performance.now()` and ticks on `requestAnimationFrame`; the Guide's ink and focus
 * follow those cues. A spec that watched them for "25 s of wall clock" or grouped them by real arrival time passed or
 * failed on how loaded the runner was (HARD RULE #32, F1/F2). With `page.clock.install()` before the page loads and
 * `pauseFrames(page)` before Play, the page's time moves only when `stepFrame` moves it, so every window and every
 * gap the spec reads is virtual time: the same on a loaded box as on an idle one.
 *
 * Each step also waits for React. React commits on a MessageChannel task, which the fake clock does not own; a message
 * posted after the step is queued behind React's, so when it arrives the commit for that frame has run. Without this,
 * a frame's state could land after the next step and smear one onset into the next frame.
 */
export const FRAME_MS = 16;

/**
 * Stop the page's clock just ahead of where it is, so nothing time-driven runs until the test steps it.
 *
 * `pauseAt` must name a moment the clock has not reached yet. Two readings, and the later one wins: the page's own
 * `Date.now()` (exact, but it can be well AHEAD of the real clock after a run this helper stepped and then resumed),
 * and the test's `Date.now()` (where an installed clock that has only ever run in real time is). The two seconds on
 * top cover the round trip between the read and the pause; a first version with one second, read from the page only,
 * failed with "Cannot fast-forward to the past" under four workers. If a runner is ever slower than that, the failure
 * is that same loud error, never a wrong reading. The seconds jumped are idle time the page sees pass at once.
 */
export async function pauseFrames(page: Page): Promise<void> {
	const pageNow = await page.evaluate(() => Date.now());
	await page.clock.pauseAt(Math.max(pageNow, Date.now()) + 2000);
}

/** Advance one frame, then return once React has committed what that frame set. */
export async function stepFrame(page: Page): Promise<void> {
	await page.clock.runFor(FRAME_MS);
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				const ch = new MessageChannel();
				ch.port1.onmessage = () => done();
				ch.port2.postMessage(0);
			}),
	);
}

/**
 * Step frames until `done()` says the state the test waits for has arrived, or `limit` frames have passed. `done()` is
 * a round trip to the page, so it is asked every `every` frames. Returns the number of frames stepped, so a caller can
 * turn it into virtual milliseconds (`frames * FRAME_MS`) or fail on hitting the limit.
 */
export async function stepFramesUntil(page: Page, done: () => Promise<boolean>, limit: number, every = 1): Promise<number> {
	let frames = 0;
	while (frames < limit && !(frames % every === 0 && (await done()))) {
		await stepFrame(page);
		frames++;
	}
	return frames;
}
