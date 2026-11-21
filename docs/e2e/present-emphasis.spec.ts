import { FRAME_MS, pauseFrames } from './frame-clock';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE EMPHASIS HOLD, on the real Present overlay.
//
// A cue carrying an author-emphasized phrase holds a beat after the passage ENDS
// (cadence.ts `EMPHASIS_HOLD_MS`). Everything else about this feature is pinned by unit tests over
// pure kernels; this is the only place the whole chain runs on the surface a presenter drives —
// projection → spans → buildTrack → the reader's own clock → the caption band advancing.
//
// It needs NO voice and NO key (HARD RULE #24): with the voice off, Present runs the ESTIMATE
// clock, which is exactly the path the hold changes. `PresentCaption` marks the live cue
// `data-state="now"`, so cue boundaries are directly observable rather than inferred from text.
//
// THE ORACLE IS A DIFFERENTIAL, not an absolute. The same deck is driven twice and differs only by
// `**`, so sentence lengths and pace cancel; what remains is the hold.
//
// ON A VIRTUAL CLOCK (HARD RULE #32, shape F1). The onsets used to be read off the wall clock while the
// overlay played in real time, so a loaded runner moved them: the step read +253 and +250 ms on a quiet
// machine, and the cell failed under parallel load (followups.d/3101-p4). Now Playwright's clock is paused
// before Play and the overlay's own timers, frames and `performance.now()` run on time this test advances,
// so every onset is where the reader's clock put it, whatever the machine is doing. The step is then the
// hold itself, to within one sampling tick.
const DECK = (claim: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${claim} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

/** How often the in-page sampler reads the live cue, in virtual ms: the resolution of every onset. */
const TICK = 10;
/**
 * How far a measured step may sit from the kernel's hold. Each onset the sampler reads is late by up to one frame (the
 * reader moves on an animation frame, FRAME_MS on Playwright's clock) plus one tick (the sampler looks every TICK), and a step is a difference of differences. The
 * old band, two ticks, ignored the frame: under Playwright 1.65.1 passing drives read 230 ms against a 250 ms hold and
 * about 1 in 15 read 210. Still far from the failures it exists to catch: no hold reads about 0, a doubled one about 500.
 */
const BAND = 2 * (TICK + FRAME_MS);
/** How far the drive runs the paused clock. */
const RUN = 27_000;
/** Virtual ms per clock step while the narration plays; see the loop in `cueOnsets`. */
const RUN_STEP = 100;

/** Onset (virtual ms from play) of each caption cue, driving the real overlay on a paused clock. */
async function cueOnsets(page: import('@playwright/test').Page, md: string): Promise<number[]> {
	await gotoStudio(page);
	await setEditorContent(page, md);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	// Read the toggle's STATE — a blind click would switch captions off if they default on.
	const cc = dialog.getByRole('button', { name: 'Captions' });
	if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
	// The emphasis spans come from the narration projection, which lands asynchronously after Present opens. A slide reached
	// before it lands reads the markdown fallback, with no emphasis, until the next slide: under Playwright 1.65.1 about one
	// bold drive in ten read exactly the plain timeline (no 250 ms hold) and failed. Wait for it, then go to the slide.
	await expect(dialog).toHaveAttribute('data-narration-projected', 'true');
	await page.keyboard.press('ArrowRight'); // onto the content slide
	await expect(dialog.getByText('2 / 2')).toBeVisible(); // the nav landed — a state wait, not a sleep
	// From here time moves only when the test moves it.
	// The clock has only ever run in real time in this context, so `pauseFrames` (frame-clock.ts) names a moment no frame
	// has reached yet.
	await pauseFrames(page);
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByRole('button', { name: /Pause/ })).toBeVisible();
	// Play decides its voice on real async work before the reader's loop is armed, and the paused clock does not
	// move that work. Wait for the decision to land (the overlay publishes it) before running virtual time. Through
	// Playwright 1.64 `runFor` spent seconds of real time and covered this gap by accident; 1.65 yields through a
	// MessageChannel instead, raced past it, and the captions stalled after one or three cues.
	await expect(dialog).toHaveAttribute('data-reader-rung', /.+/);
	// The sampler runs on the paused clock too, so it samples virtual time at a fixed TICK.
	const marks = page.evaluate((tick) => {
		const out: number[] = [];
		const t0 = performance.now();
		let last = -1;
		return new Promise<number[]>((done) => {
			const id = setInterval(() => {
				const el = document.querySelector('[data-cue][data-state="now"]');
				const ci = el ? Number(el.getAttribute('data-cue')) : -1;
				if (ci >= 0 && ci !== last) {
					out[ci] = Math.round(performance.now() - t0);
					last = ci;
				}
				// stop once the cue AFTER the emphasized one has started, or when the narration is over
				if (out.length > 4 || performance.now() - t0 > 26_000) {
					clearInterval(id);
					done(out);
				}
			}, tick);
		});
	}, TICK);
	// In 100 ms chunks, each followed by one MessageChannel round trip, so React's commits for that span land before
	// the clock moves on (frame-clock.ts's pattern, at a coarser step). Through Playwright 1.64 one `runFor(RUN)` did,
	// because its clock yielded on real timers; 1.65 yields through a MessageChannel, and a cue's onset could then read
	// 10 to 20 ms late (1 run in 10 failed the band).
	for (let t = 0; t < RUN; t += RUN_STEP) {
		await page.clock.runFor(RUN_STEP);
		await page.evaluate(
			() =>
				new Promise<void>((done) => {
					const ch = new MessageChannel();
					ch.port1.onmessage = () => done();
					ch.port2.postMessage(0);
				}),
		);
	}
	const out = await marks;
	// Time flows again for whatever the test does next (the second drive loads the Studio afresh).
	return out;
}

/**
 * One drive in a context of its own, clock installed before the first load. The two drives used to share a page and
 * `resume()` the clock between them, and a frame born after a resume replays Playwright's clock log plus every real
 * millisecond since it, so a preview iframe could already sit past the next pause: "Cannot fast-forward to the past"
 * in a full desktop run (deck-drop-import.spec.ts records the same mechanism). A fresh context has no such history.
 */
async function drive(browser: import('@playwright/test').Browser, md: string): Promise<number[]> {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.clock.install();
		return await cueOnsets(page, md);
	} finally {
		await context.close();
	}
}

test('an emphasized passage holds a beat on the real Present overlay', async ({ browser }) => {
	const plain = await drive(browser, DECK('Retention reached 118 percent'));
	const bold = await drive(browser, DECK('**Retention reached 118 percent**'));
	expect(plain.length).toBeGreaterThan(4);
	expect(bold.length).toBeGreaterThan(4);

	// Cue 2 carries the claim; the hold lands in the gap AFTER it, so it shows at cue 3's onset.
	const before = bold[2] - plain[2]; // what the `**` costs before the hold (nothing, or a tick)
	const after = bold[3] - plain[3]; // that, plus the hold
	const step = after - before;
	// Within a sampling tick either side of the hold the cadence kernel names (cadence.ts `EMPHASIS_HOLD_MS`, 250 ms
	// for an emphasis of weight 2). Virtual time, so the band is the sampler's resolution, not the machine's.
	expect(Math.abs(step - 250), `cue onsets plain=${JSON.stringify(plain)} bold=${JSON.stringify(bold)}`).toBeLessThanOrEqual(BAND); // flaky-ok: virtual ms on Playwright's paused clock, which only the test advances; machine load cannot move it

	// And it holds ONCE: cue 4 inherits the same offset rather than paying a second time.
	expect(Math.abs(bold[4] - plain[4] - after)).toBeLessThanOrEqual(BAND); // flaky-ok: virtual ms on Playwright's paused clock, which only the test advances; machine load cannot move it
});
