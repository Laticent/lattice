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
// hold itself, to within one sampling tick. Play waits for the narration projection (`data-narration`), the only
// source of the emphasis spans; before it lands Present speaks a flatten without them.
const DECK = (claim: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${claim} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

/** How far the drive moves the paused clock between two reads of the live cue: the unit every onset is counted in. */
const STEP_MS = 100;
/**
 * After a cue goes live, the drive leaps this far in one run before it steps again. Every cue in DECK lasts over two
 * seconds, so no boundary falls inside a leap; one that did fails the drive rather than recording a late onset. The
 * leaps are what keep the drive short: a 50 ms step with no leaps made about a thousand calls into the page, and on
 * four cores at eight workers every run passed the 60 s test timeout.
 */
const LEAP_STEPS = 15;
/** How far the drive runs the paused clock. */
const RUN = 27_000;

/**
 * Where Playwright's clock stands, so the next pause can be set ahead of it. A pause can only move time forward, and
 * after a run and a resume the clock is ahead of the page's own first reading by the run plus the real time since
 * the resume, so the page's `Date.now()` alone was sometimes behind it ("Cannot fast-forward to the past").
 */
const clockMark = { at: 0, resumedAt: 0 };

/**
 * Pause the clock a second ahead of where it stands, and return that time. The target is read from the page and then
 * sent back, and on a loaded machine the clock can pass it in between ("Cannot fast-forward to the past": 1 run in 40
 * at four workers). That error is the clock saying the target went stale, so read it again and send a fresh one; any
 * other error, or a target that keeps going stale, still fails the test.
 */
async function pauseAhead(page: import('@playwright/test').Page): Promise<number> {
	for (let attempt = 1; ; attempt++) {
		const pageNow = await page.evaluate(() => Date.now());
		const target = Math.max(pageNow, clockMark.at + (Date.now() - clockMark.resumedAt)) + 1_000;
		try {
			await page.clock.pauseAt(target);
			return target;
		} catch (e) {
			if (attempt >= 5 || !String(e).includes('fast-forward to the past')) throw e;
		}
	}
}

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
	// The holds come from the shared narration projection, which lands asynchronously after Present opens; until then
	// Present speaks the plain flatten, which has no emphasis spans. Playing before it landed made the bold drive play
	// with no hold at all (red 1 of 10 alone, more under load). Wait for the projection, while time still flows.
	await expect(dialog).toHaveAttribute('data-narration', 'projected');
	// From here time moves only when the test moves it.
	const pauseAt = await pauseAhead(page);
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByRole('button', { name: /Pause/ })).toBeVisible();
	// STEP BY STEP, AND READ ONLY WHAT REACT HAS COMMITTED. The reader picks the live cue on a frame of the paused clock;
	// React commits the caption through its scheduler, a real task the paused clock does not hold. So each read waits for a
	// real MessageChannel round trip, which runs after the commit React posted for the frames just run, and the cue it sees
	// is the state at exactly this step, whatever the machine is doing. (A single runFor with an in-page sampler read a
	// commit some virtual time late, by however long the machine took, and the measured hold drifted with the load.)
	const liveCue = () =>
		page.evaluate(
			() =>
				new Promise<number>((done) => {
					const ch = new MessageChannel();
					ch.port1.onmessage = () => {
						const el = document.querySelector('[data-cue][data-state="now"]');
						done(el ? Number(el.getAttribute('data-cue')) : -1);
					};
					ch.port2.postMessage(0);
				}),
		);
	// The step at which each cue first goes live, until the cue after the emphasized one has started (cue 4).
	const out: number[] = [];
	let last = -1;
	let n = 0;
	while (n * STEP_MS < RUN && out.length <= 4) {
		const leap = last >= 0 && n === out[last];
		const by = leap ? LEAP_STEPS : 1;
		await page.clock.runFor(by * STEP_MS);
		n += by;
		const ci = await liveCue();
		if (ci >= 0 && ci !== last) {
			if (leap || ci !== last + 1) throw new Error(`cue ${ci} went live at step ${n} after cue ${last}, inside a leap or past a cue: its onset is unknown (${JSON.stringify(out)})`);
			out[ci] = n;
			last = ci;
		}
	}
	const ran = n * STEP_MS;
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

	const seen = `cue onsets in ${STEP_MS} ms steps: plain=${JSON.stringify(plain)} bold=${JSON.stringify(bold)}`;
	// Cue 2 carries the claim, and the hold is spent after it, so the bold drive keeps cue 2 live LONGER than the plain
	// drive does. An order between two counts of steps on the paused clock, not a reading of milliseconds: the size of the
	// hold (cadence.ts `EMPHASIS_HOLD_MS`) is the cadence kernel's unit test, and its speed is not this test's business.
	// A duration counted in steps is right to within one step either way, so "longer" means more than one step longer:
	// the 250 ms hold is two and a half steps, and with no hold the two counts differ by at most one.
	expect(bold[3] - bold[2] - (plain[3] - plain[2]), seen).toBeGreaterThan(1); // flaky-ok: counts of 100 ms steps the test itself advanced on the paused clock, compared as an order; no clock is read
	// And it holds ONCE: cue 3 lasts as long in both drives (to the step), so the hold did not repeat on the cue after it.
	expect(Math.abs(bold[4] - bold[3] - (plain[4] - plain[3])), seen).toBeLessThanOrEqual(1); // flaky-ok: counts of steps the test advanced, equal to within one step; no clock is read
});
