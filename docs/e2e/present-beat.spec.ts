import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

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

	test('the rail marks the current slide at rest and advances its progress fill during playback', async ({ page }) => {
		// Two things reported broken on the real surface, neither reachable from a unit test.
		//
		// 1. "we don't get playback progress in the rail anymore" — the read-aloud clock pushed a
		//    React state update every frame, saturating the same main thread as audio decode and
		//    starving the very rAF loop driving the bar. Quantizing the update fixed it; this pins
		//    that the fill actually MOVES on a running deck.
		// 2. The current-slide cue. Making the track a flat `--border` for every segment left the
		//    rail with no "you are here" at all before the first word — position was carried only
		//    by a progress fill that is zero-width at rest (independent checker, #1352).
		//
		// Needs no voice: the captions-only rung drives the same reader clock.
		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		const rail = dialog.getByRole('group', { name: /Deck progress/ });
		await expect(rail).toBeVisible();

		/** Per segment: the track's computed background, and the width of the progress fill. */
		const segments = () =>
			rail.evaluate((el) =>
				Array.from(el.querySelectorAll('button')).map((b) => {
					// Selected by an explicit `data-tier`, never by DOM order or height. Ordinal
					// selection silently mis-identified the tiers — `spans[last]` is the PREFETCH
					// fill whenever prefetch has width and progress does not, so this guard would
					// have passed on an advancing buffer edge with playback progress entirely
					// broken: the exact bug it exists to catch, walking through it (#1352).
					const at = (tier: string) => b.querySelector(`[data-tier="${tier}"]`);
					const track = at('track');
					const progress = at('progress');
					return {
						track: track ? getComputedStyle(track).backgroundColor : '',
						progress: progress ? parseFloat(getComputedStyle(progress).width) : 0,
						playhead: !!at('playhead'),
					};
				}),
			);

		const atRest = await segments();
		expect(atRest.length).toBeGreaterThan(2);
		expect(atRest[0].progress, 'nothing has played yet').toBe(0);
		// The PLAYHEAD is the cue, not the track's tone. A tone lift was the old cue and the
		// prefetch fill covers it completely once a slide is cached — so assert the mark, which
		// is painted last and cannot be covered.
		expect(atRest[0].playhead, 'the current slide carries the playhead at rest').toBe(true);
		expect(atRest.slice(1).some((s) => s.playhead), 'and no other slide does').toBe(false);
		expect(new Set(atRest.slice(1).map((s) => s.track)).size, 'every other segment shares one resting track').toBe(1);

		await dialog.getByRole('button', { name: 'Play the presentation' }).click();
		await page.waitForTimeout(1500);
		const early = (await segments())[0].progress;
		await page.waitForTimeout(3000);
		const later = (await segments())[0].progress;

		expect(early, 'the progress fill appeared once playback started').toBeGreaterThan(0);
		expect(later, `the fill advanced with the clock (${early}px → ${later}px)`).toBeGreaterThan(early);
	});
});

// THE DECK'S OWN PACE, on the real overlay (#1399).
//
// This is the register's whole claim — that the author's rhythm travels with the deck and beats
// whatever the recipient's browser happens to hold — and it had only ever been driven in jsdom,
// with the preview, the voice model and the presenter view all mocked. HARD RULE #23 names jsdom
// as not verification, so here it is on the surface a presenter actually uses.
//
// The workspace is set to the FASTEST preset and the deck declares the SLOWEST, so the two
// disagree by ~1.4s and only one of them can be producing the observed hold.
test.describe('Present — a deck carries its own pace', () => {
	test('a `pace: deliberate` deck holds long on a machine set to brisk', async ({ page }) => {
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-present-pace', 'brisk');
				localStorage.removeItem('lattice-present-slide-beat');
				localStorage.removeItem('lattice-present-section-beat');
			} catch {
				/* storage unavailable — the app falls back to its defaults */
			}
		});
		await gotoStudio(page);
		await setEditorContent(
			page,
			['---', 'marp: true', 'theme: indaco', 'pace: deliberate', '---', '', '# One', '', 'Growth held.', '', '---', '', '# Two', '', 'Spend stayed disciplined.', ''].join('\n'),
		);

		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		const counter = dialog.locator('span.font-mono').first();
		const position = async () => (await counter.textContent())?.trim() ?? '';

		// Present opens where the editor caret is, which after replacing the document is the LAST
		// slide — with nothing to advance to, and nothing to time. Start at the top.
		await dialog.getByRole('group', { name: /Deck progress/ }).getByRole('button').first().click();
		await expect.poll(position).toBe('1 / 2');

		const first = await position();
		await dialog.getByRole('button', { name: 'Play the presentation' }).click();

		// Time the hold on ARRIVAL at slide 2, read off the dialog's own published beat state
		// (`data-beat="hold"`) rather than inferred from a control's label — the transport
		// deliberately keeps reading Pause through a hold, which is the #1352 fix.
		const advanced = Date.now() + 60_000;
		while (Date.now() < advanced && (await position()) === first) await page.waitForTimeout(60);
		expect(await position(), 'the deck never advanced to the second slide').not.toBe(first);

		const start = Date.now();
		const holdEnd = Date.now() + 20_000;
		while (Date.now() < holdEnd && (await dialog.getAttribute('data-beat')) === 'hold') await page.waitForTimeout(60);
		const held = Date.now() - start;

		// `deliberate` is ~2.2s and `brisk` ~0.8s. Anything under 1.5s means the workspace preset
		// won and the deck's declaration was thrown away the moment it left its author's machine —
		// which is the entire defect this register exists to close.
		expect(held, `the hold was ${held}ms — the deck asked for deliberate (~2200ms) and the machine holds brisk (~800ms)`).toBeGreaterThan(1500);
	});
});
