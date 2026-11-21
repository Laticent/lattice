import { pauseFrames } from './frame-clock';
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
// THE ORACLE IS A DIFFERENTIAL, not an absolute. Two slides carry the same passage and differ only by
// `**`, so sentence lengths and pace cancel; what remains is the hold.
//
// ON A VIRTUAL CLOCK (HARD RULE #32, shape F1). Playwright's clock is paused before Play, so the overlay's timers,
// frames and `performance.now()` run on time only this test advances, and every onset is where the reader's clock put it,
// whatever the machine is doing (followups.d/3101-p4: wall-clock onsets moved under load).
//
// ONE DRIVE, ONE PLAY. The plain passage is slide 2 and the bold one slide 3 of the same deck, and Play chains them, so
// the clock is paused once and never resumed. Two page loads used to need a `clock.resume()` between them, and a pause
// after a resume can throw "Cannot fast-forward to the past" (#3250). The drive stops once slide 3's cue 4 has started,
// not after a fixed 27 s run (which reached 59.1 s of the 60 s limit at 4 workers).
//
// ONSETS AT COMMIT. A MutationObserver stamps each cue's virtual `performance.now()` in the commit that marks it
// `data-state="now"`, so there is no sampler tick to add to the error. What is left is the reader's estimate clock, which
// advances on animation frames: Playwright's fake clock fires them on a 16 ms grid whose phase depends on when Play landed,
// so each onset sits on that grid and the measured step was only ever 224, 240 or 256 ms. Two onsets enter each slide's
// interval, so the step is the hold to within two frames, 32 ms; the band is derived from the frame, not tuned.
const DECK = (plain: string, bold: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${plain} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.

---

## Where the quarter turned.

Cost discipline held through the period. ${bold} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

/** One animation frame on Playwright's fake clock: the grid every onset sits on. */
const FRAME_MS = 16;
/** Each onset sits on the frame grid, so an interval between two onsets is off by at most one frame, and a difference
 *  of two intervals by at most two: the step can read up to 32 ms either side of the hold, and no further. */
const BAND = 2 * FRAME_MS;
/** How far the drive may run the paused clock before it gives up: both slides read with room to spare. */
const CAP_MS = 60_000;
/** Each run of the paused clock: long enough to keep the round trips few, short enough to stop soon after cue 4. */
const CHUNK_MS = 500;

type Mark = { slide: number; cue: number; at: number; narration: string | null };

test('an emphasized passage holds a beat on the real Present overlay', async ({ page }) => {
	// Installed before the first load, so every timer the overlay makes is on this clock; it flows as real time until the
	// pause below.
	await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(page, DECK('Retention reached 118 percent', '**Retention reached 118 percent**'));
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	// Read the toggle's STATE — a blind click would switch captions off if they default on.
	const cc = dialog.getByRole('button', { name: 'Captions' });
	if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
	// Present opens on the slide the editor's cursor is in, so walk to the plain slide, one landed step at a time.
	const counter = dialog.getByText(/^\d \/ 3$/);
	await expect(counter).toBeVisible();
	for (let at = Number((await counter.innerText()).charAt(0)); at !== 2; ) {
		const back = at > 2;
		at += back ? -1 : 1;
		await page.keyboard.press(back ? 'ArrowLeft' : 'ArrowRight');
		await expect(dialog.getByText(`${at} / 3`, { exact: true })).toBeVisible(); // the nav landed — a state wait, not a sleep
	}
	// The captions read the DOM projection, which alone carries the emphasis spans, only once the reader has adopted it;
	// until then Present reads a plain flatten with no hold. Under load the projection landed after Play, so the `**`
	// drive timed the flatten and showed no hold. Wait for the product's own signal, not a duration.
	await expect(dialog).toHaveAttribute('data-narration', 'projected');
	// The observer: every commit that changes which cue is live stamps the virtual time, the slide (a cue index that
	// falls back means the next slide's reader started) and which text the captions read at that moment.
	await page.evaluate(() => {
		const w = window as unknown as { __marks: Mark[] };
		w.__marks = [];
		let slide = 0;
		let last = -1;
		const read = () => {
			const el = document.querySelector('[data-cue][data-state="now"]');
			const cue = el ? Number(el.getAttribute('data-cue')) : -1;
			if (cue < 0 || cue === last) return;
			if (cue < last) slide++;
			last = cue;
			const narration = document.querySelector('[role="dialog"][data-narration]')?.getAttribute('data-narration') ?? null;
			w.__marks.push({ slide, cue, at: performance.now(), narration });
		};
		new MutationObserver(read).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-cue'] });
	});
	// From here time moves only when the test moves it. `pauseFrames` pauses past the test's own clock as well as the
	// page's: every frame keeps its own fake clock, and a slide's srcdoc frame, born after the install, read 0.8 to 1.1 s
	// ahead of the Studio page here, so a pause from the page's `Date.now()` alone threw "Cannot fast-forward to the past".
	await pauseFrames(page);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByRole('button', { name: /Pause/ })).toBeVisible();
	const marks = () => page.evaluate(() => (window as unknown as { __marks: Mark[] }).__marks);
	const done = (ms: Mark[]) => ms.some((m) => m.slide === 1 && m.cue === 4);
	for (let ran = 0; ran < CAP_MS && !done(await marks()); ran += CHUNK_MS) await page.clock.runFor(CHUNK_MS);
	const all = await marks();
	const onsets = (slide: number) => {
		const out: number[] = [];
		for (const m of all) if (m.slide === slide) out[m.cue] = m.at;
		return out;
	};
	const plain = onsets(0);
	const bold = onsets(1);
	const seen = `marks=${JSON.stringify(all.map((m) => [m.slide, m.cue, Math.round(m.at), m.narration]))}`;
	expect(done(all), `both slides were read to cue 4; ${seen}`).toBe(true);
	// Every cue was read from the projection, so the drive timed the text that carries the emphasis.
	expect(all.every((m) => m.narration === 'projected'), seen).toBe(true);

	// Cue 2 carries the claim; the hold lands in the gap AFTER it, so it shows in the interval from cue 2 to cue 3.
	const step = bold[3] - bold[2] - (plain[3] - plain[2]);
	// The hold the cadence kernel names (cadence.ts `EMPHASIS_HOLD_MS`, 250 ms for an emphasis of weight 2), to within the
	// two frames the onsets can sit on. Virtual time, so the machine's load cannot move it.
	expect(Math.abs(step - 250), seen).toBeLessThanOrEqual(BAND); // flaky-ok: virtual ms on Playwright's paused clock, which only the test advances; machine load cannot move it
	// The interval before the claim is the same on both slides: the `**` costs nothing until the hold. (From cue 1, not
	// cue 0: cue 0's onset includes how the slide's reading began, Play on the plain slide and the autoplay arrival on the
	// bold one, so only the intervals between cues compare.)
	expect(Math.abs(bold[2] - bold[1] - (plain[2] - plain[1])), seen).toBeLessThanOrEqual(BAND); // flaky-ok: virtual ms on Playwright's paused clock, which only the test advances; machine load cannot move it
	// And it holds ONCE: the interval after cue 3 pays nothing again.
	expect(Math.abs(bold[4] - bold[3] - (plain[4] - plain[3])), seen).toBeLessThanOrEqual(BAND); // flaky-ok: virtual ms on Playwright's paused clock, which only the test advances; machine load cannot move it
});
