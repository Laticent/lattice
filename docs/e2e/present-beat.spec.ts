import { expect, gotoStudio, test } from './studio-fixture';

// THE BETWEEN-SLIDE BEAT, on the real Present overlay.
//
// The beat (#1352) holds on each new slide before speaking, so the audience reads it first.
// It introduced a state the transport had never been in: mid-delivery with NO reader running.
// The previous slide's reader has ended and the next has not started, so `reader.playing` is
// false for 0.8–4s — and everything keyed on that flag alone got it wrong.
//
// The adversarial trio found three consequences, all reasoned from source and none reachable
// from a unit test, because they live in the overlay's own state machine on a real timer:
//   · the primary control flipped to Play at EVERY slide transition — the same "a control that
//     renames itself mid-delivery" defect that got the "Catching up…" label reverted, on a
//     bigger control, more often;
//   · Pause was UNREACHABLE during a beat: `togglePresentation` branched on the same flag, so
//     the tap took the else path and started the slide early;
//   · and that tap left the beat's timer pending, which then fired a second, non-resume
//     `play()` — a barge-in that cut the sentence already sounding and restarted from word one.
//
// This drives the actual surface a presenter touches. It needs NO voice and NO key: the beat
// fires on the autoplay chain regardless of rung, so a captions-only deck exercises it exactly
// as a narrated one does (HARD RULE #24 keeps our key off this path; HARD RULE #23 is why this
// is an e2e spec and not another unit test).
test.describe('Present — the between-slide beat', () => {
	test.beforeEach(async ({ page }) => {
		// A long, deliberate beat so the hold is a window a test can observe rather than a race.
		// These are the same workspace keys the Settings control writes.
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-present-slide-beat', '4000');
				localStorage.setItem('lattice-present-section-beat', '4000');
			} catch {
				/* storage unavailable — the app falls back to its defaults */
			}
		});
		await gotoStudio(page);
	});

	test('the transport reads Pause during the hold, and a tap cancels the beat rather than racing it', async ({ page }) => {
		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();

		const transport = dialog.getByRole('button', { name: /^(Pause|Play the presentation)$/ });
		const counter = dialog.locator('span.font-mono').first();
		const label = () => transport.getAttribute('aria-label');
		const position = async () => (await counter.textContent())?.trim() ?? '';

		const first = await position();
		await transport.click(); // the ONE Play: narrate this slide AND chain

		// Sample the control AT THE INSTANT the slide advances — no auto-retrying matcher.
		// `toHaveAccessibleName` would poll for up to 15s and simply wait out the 4s hold, which
		// is why the first version of this test passed against the unfixed build. The hold is a
		// window; catching a defect inside it means reading the value, once, while it is open.
		let labelAtAdvance: string | null = null;
		const deadline = Date.now() + 45_000;
		while (Date.now() < deadline) {
			if ((await position()) !== first) {
				labelAtAdvance = await label();
				break;
			}
			await page.waitForTimeout(60);
		}

		// THE ASSERTION. Measured against the unfixed build, the control read "Play the
		// presentation" from the advance until the beat expired ~3.7s later, at every transition.
		expect(labelAtAdvance, 'the deck is mid-delivery — the transport must not offer Play').toBe('Pause');

		// And the tap must CANCEL the beat, not start the slide early and leave a timer armed to
		// barge in on it. Unfixed, the tap took the play branch (so this reads Pause), and the
		// pending timer then fired a second, non-resume play() that restarted the slide.
		await transport.click();
		await page.waitForTimeout(250);
		expect(await label(), 'a tap during the beat pauses the deck').toBe('Play the presentation');
		const held = await position();
		await page.waitForTimeout(4500); // past the full beat the tap interrupted
		expect(await label(), 'no timer survived the tap to resume playback').toBe('Play the presentation');
		expect(await position(), 'and the deck did not advance past the slide it was paused on').toBe(held);
	});
});
