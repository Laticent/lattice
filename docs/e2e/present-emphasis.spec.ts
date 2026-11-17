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
// hold itself, to within one frame.
//
// READ AFTER REACT HAS COMMITTED (2026-11-17). The reader picks the live cue on a frame, on the paused clock, but React
// commits the caption's `data-state` through its scheduler, a REAL MessageChannel task that the paused clock does not
// hold. One `runFor(27_000)` ran the virtual timers in a tight loop, so a commit landed some virtual time after its
// frame, by however long the machine took: onsets moved by up to 650 ms and the measured hold read 220 ms or 0
// (red 64 of 80 at six workers, about half of them on the test's own timeout). Now the test moves the clock one
// frame at a time and, after each, reads the live cue only once a real MessageChannel round trip has run in the
// page: a task posted after React's is run after it, so the read sees the frame's commit.
const DECK = (claim: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${claim} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

/** One frame of the paused clock: the step the drive advances by, and the resolution of every onset. */
const FRAME = 16;
/** The furthest the drive runs the paused clock before giving up on cue 4. */
const RUN = 27_000;

/**
 * Where Playwright's clock stands, so the next pause can be set ahead of it. A pause can only move time forward, and
 * after a run and a resume the clock is ahead of the page's own first reading by the run plus the real time since
 * the resume, so the page's `Date.now()` alone was sometimes behind it ("Cannot fast-forward to the past").
 */
const clockMark = { at: 0, resumedAt: 0 };

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
	await page.keyboard.press('ArrowRight'); // onto the content slide
	await expect(dialog.getByText('2 / 2')).toBeVisible(); // the nav landed — a state wait, not a sleep
	// From here time moves only when the test moves it.
	const pageNow = await page.evaluate(() => Date.now());
	const pauseAt = Math.max(pageNow, clockMark.at + (Date.now() - clockMark.resumedAt)) + 1_000;
	await page.clock.pauseAt(pauseAt);
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByRole('button', { name: /Pause/ })).toBeVisible();
	// One frame at a time, until the cue AFTER the emphasized one has started (cue 4) or the narration is over.
	const out: number[] = [];
	let last = -1;
	let ran = 0;
	for (let t = FRAME; t <= RUN && out.length <= 4; t += FRAME) {
		await page.clock.runFor(FRAME);
		ran = t;
		const ci = await page.evaluate(
			() =>
				new Promise<number>((done) => {
					// A real task, queued behind any render React posted for the frame that just ran.
					const ch = new MessageChannel();
					ch.port1.onmessage = () => {
						const el = document.querySelector('[data-cue][data-state="now"]');
						done(el ? Number(el.getAttribute('data-cue')) : -1);
					};
					ch.port2.postMessage(0);
				}),
		);
		if (ci >= 0 && ci !== last) {
			out[ci] = t;
			last = ci;
		}
	}
	// Time flows again for whatever the test does next (the second drive loads the Studio afresh).
	clockMark.at = pauseAt + ran;
	clockMark.resumedAt = Date.now();
	await page.clock.resume();
	return out;
}

test('an emphasized passage holds a beat on the real Present overlay', async ({ page }) => {
	// Installed before the first load, so every timer the overlay makes is on this clock; it flows as real time
	// until `cueOnsets` pauses it.
	await page.clock.install();
	const plain = await cueOnsets(page, DECK('Retention reached 118 percent'));
	const bold = await cueOnsets(page, DECK('**Retention reached 118 percent**'));
	expect(plain.length).toBeGreaterThan(3);
	expect(bold.length).toBeGreaterThan(3);

	// Cue 2 carries the claim; the hold lands in the gap AFTER it, so it shows at cue 3's onset.
	const before = bold[2] - plain[2]; // what the `**` costs before the hold (nothing, or a tick)
	const after = bold[3] - plain[3]; // that, plus the hold
	const step = after - before;
	// Within a frame either side of the hold the cadence kernel names (cadence.ts `EMPHASIS_HOLD_MS`, 250 ms
	// for an emphasis of weight 2). Virtual time, so the band is the sampler's resolution, not the machine's.
	expect(Math.abs(step - 250), `cue onsets plain=${JSON.stringify(plain)} bold=${JSON.stringify(bold)}`).toBeLessThanOrEqual(2 * FRAME); // flaky-ok: virtual ms on Playwright's paused clock, read after React commits each frame; machine load cannot move it

	// And it holds ONCE: cue 4 inherits the same offset rather than paying a second time.
	expect(Math.abs(bold[4] - plain[4] - after)).toBeLessThanOrEqual(2 * FRAME); // flaky-ok: virtual ms on Playwright's paused clock, read after React commits each frame; machine load cannot move it
});
