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
// `**`, so sentence lengths, pace and startup jitter cancel; what remains is the hold. Measured
// twice while writing this, the step was +253 ms and +250 ms against a drifting baseline of 110 ms
// and 60 ms — the baseline moves run to run, the STEP does not, which is why the assertion is on
// the step and carries a wide band rather than pinning 250.
const DECK = (claim: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${claim} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

/** Onset (ms from play) of each caption cue, driving the real overlay. */
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
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByRole('button', { name: /Pause/ })).toBeVisible();
	// The caption band is built from the reader's track, which exists only once playback starts.
	await expect(dialog.locator('[data-cue]').first()).toBeVisible();
	return page.evaluate(async () => {
		const marks: number[] = [];
		const t0 = performance.now();
		let last = -1;
		await new Promise<void>((done) => {
			const id = setInterval(() => {
				const el = document.querySelector('[data-cue][data-state="now"]');
				const ci = el ? Number(el.getAttribute('data-cue')) : -1;
				if (ci >= 0 && ci !== last) { marks[ci] = Math.round(performance.now() - t0); last = ci; }
				// stop as soon as the cue AFTER the emphasized one has started, or at the deadline
				if (marks.length > 4 || performance.now() - t0 > 26000) { clearInterval(id); done(); }
			}, 10);
		});
		return marks;
	});
}

test('an emphasized passage holds a beat on the real Present overlay', async ({ page }) => {
	const plain = await cueOnsets(page, DECK('Retention reached 118 percent'));
	const bold = await cueOnsets(page, DECK('**Retention reached 118 percent**'));
	expect(plain.length).toBeGreaterThan(3);
	expect(bold.length).toBeGreaterThan(3);

	// Cue 2 carries the claim; the hold lands in the gap AFTER it, so it shows at cue 3's onset.
	const before = bold[2] - plain[2]; // baseline drift, no hold yet
	const after = bold[3] - plain[3]; // baseline drift + the hold
	const step = after - before;
	expect(step, `cue onsets plain=${JSON.stringify(plain)} bold=${JSON.stringify(bold)}`).toBeGreaterThan(150);
	expect(step).toBeLessThan(400);

	// And it holds ONCE: cue 4 inherits the same offset rather than paying a second time.
	expect(Math.abs(bold[4] - plain[4] - after)).toBeLessThan(120);
});
