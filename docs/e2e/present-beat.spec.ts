import { FRAME_MS, pauseFrames, stepFrame, stepFramesUntil } from './frame-clock';
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
//
// EVERY TEST HERE RUNS ON A FAKE CLOCK, stepped one frame at a time from Play (frame-clock.ts). A beat is a timer and
// a hold is a span of frames, so the old real-clock polls (every 60 ms, with a stopwatch round them) passed or failed
// on runner load (HARD RULE #32). On the fake clock, "the instant the slide advances" is a frame the test steps onto,
// "4.5 s with nothing happening" is 4.5 s of virtual time in which the beat's timer had every chance to fire, and a
// hold's length is a count of frames.
const CAP_FRAMES = (ms: number) => Math.ceil(ms / FRAME_MS);

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
		await page.clock.install();
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
		await pauseFrames(page);
		await transport.click(); // the ONE Play: narrate this slide AND chain

		// Sample the control AT THE INSTANT the slide advances — no auto-retrying matcher.
		// `toHaveAccessibleName` would poll for up to 15s and simply wait out the 4s hold, which
		// is why the first version of this test passed against the unfixed build. The hold is a
		// window; catching a defect inside it means reading the value, once, while it is open.
		// Stepping frame by frame, the first frame after the advance is the one read.
		const frames = await stepFramesUntil(page, async () => (await position()) !== first, CAP_FRAMES(45_000));
		expect(frames, 'the deck never advanced inside 45 s of virtual time').toBeLessThan(CAP_FRAMES(45_000));
		const labelAtAdvance = await label();

		// THE ASSERTION. Measured against the unfixed build, the control read "Play the
		// presentation" from the advance until the beat expired ~3.7s later, at every transition.
		expect(labelAtAdvance, 'the deck is mid-delivery — the transport must not offer Play').toBe('Pause');

		// And the tap must CANCEL the beat, not start the slide early and leave a timer armed to
		// barge in on it. Unfixed, the tap took the play branch (so this reads Pause), and the
		// pending timer then fired a second, non-resume play() that restarted the slide.
		await transport.click();
		// The label CHANGES on a correct tap (Pause → "Play the presentation"), so there IS a
		// signal — poll it, bounded. Unfixed, the tap took the play branch and the label stayed
		// "Pause", so exhausting this budget is the failure it is meant to report, not a flake.
		await expect
			.poll(label, { timeout: 2_000, message: 'a tap during the beat pauses the deck' })
			.toBe('Play the presentation');
		const held = await position();
		// The pass condition here is that NOTHING happens: no surviving timer resumes playback and
		// the deck does not advance. A poll would be satisfied by the already-correct state the
		// instant it ran. So the clock is stepped past the 4000 ms beat the tap interrupted (set in
		// beforeEach): a timer that survived the tap has then fired, on every runner, and its
		// barge-in is on the page when the state is read.
		for (let i = 0; i < CAP_FRAMES(4_500); i++) await stepFrame(page);
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
						// The played range moves by transform (a full-width pill slid left), so its visible
						// width is the box width plus the x translation, never the computed width alone.
						progress: progress ? Math.max(0, parseFloat(getComputedStyle(progress).width) + new DOMMatrix(getComputedStyle(progress).transform).m41) : 0,
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

		await pauseFrames(page);
		await dialog.getByRole('button', { name: 'Play the presentation' }).click();

		// Two different things, and only ONE of them is pollable.
		//
		// "The fill appeared" is a STATE, so poll it, bounded at the interval the old sleep set.
		//
		// "The fill advances with the clock" is a RATE, and for a rate the SAMPLE POINT carries
		// the power, not the bound. Sampling `early` at the first non-zero value (measured
		// 0.047px at ~110ms) lets a single sub-pixel tick satisfy `later > early` — so a fill
		// that starts and then STALLS, which is the reported #1352 symptom, passes. Verified:
		// with an in-page break pinning the width 500ms after first paint, sampling `early` at
		// first-paint PASSES (early=1.39px, pinned=1.61px) and dwelling first FAILS, correctly.
		// So dwell across the original window before measuring: 1.5 s of virtual time, a
		// MEASUREMENT WINDOW, not a settle — shortening it is what breaks the test.
		const progressPx = async () => (await segments())[0].progress;
		await stepFramesUntil(page, async () => (await progressPx()) > 0, CAP_FRAMES(1_500));
		for (let i = 0; i < CAP_FRAMES(1_500); i++) await stepFrame(page);
		const early = await progressPx();
		await stepFramesUntil(page, async () => (await progressPx()) > early, CAP_FRAMES(3_000));
		const later = await progressPx();

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
		await page.clock.install();
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
		await pauseFrames(page);
		await dialog.getByRole('button', { name: 'Play the presentation' }).click();

		// Time the hold on ARRIVAL at slide 2, read off the dialog's own published beat state
		// (`data-beat="hold"`) rather than inferred from a control's label — the transport
		// deliberately keeps reading Pause through a hold, which is the #1352 fix. The hold's
		// length is the number of frames stepped while it lasts.
		await stepFramesUntil(page, async () => (await position()) !== first, CAP_FRAMES(60_000));
		expect(await position(), 'the deck never advanced to the second slide').not.toBe(first);
		const held = (await stepFramesUntil(page, async () => (await dialog.getAttribute('data-beat')) !== 'hold', CAP_FRAMES(20_000))) * FRAME_MS;

		// `deliberate` is ~2.2s and `brisk` ~0.8s. Anything under 1.5s means the workspace preset
		// won and the deck's declaration was thrown away the moment it left its author's machine —
		// which is the entire defect this register exists to close.
		expect(held, `the hold was ${held}ms — the deck asked for deliberate (~2200ms) and the machine holds brisk (~800ms)`).toBeGreaterThan(1500);
	});
});

// THE LEAVE BEAT (2026-09-27). Measured before it on the built Studio: at every handoff the next
// slide appeared on the SAME frame the previous slide's last sentence ended, so a closing line was
// cut off by the flip. The deck now holds the finished slide for the pace's leave beat (natural:
// 700 ms) before it advances, and publishes that hold as `data-beat="hold"`, like the arrival beat.
test.describe('Present — the beat before the next slide', () => {
	test('every handoff holds the finished slide before the next one appears', async ({ page }) => {
		await page.clock.install();
		await gotoStudio(page);
		await setEditorContent(
			page,
			['---', 'marp: true', 'theme: indaco', 'pace: brisk', '---', '', '# One', '', 'Growth held.', '', '---', '', '# Two', '', 'Spend stayed disciplined.', '', '---', '', '# Three', '', 'The plan holds.', ''].join('\n'),
		);
		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		const counter = dialog.locator('span.font-mono').first();
		const position = async () => (await counter.textContent())?.trim() ?? '';
		await dialog.getByRole('group', { name: /Deck progress/ }).getByRole('button').first().click();
		await expect.poll(position).toBe('1 / 3');

		// Record every slide change on the page's own frame clock: whether the deck was holding on
		// the frame BEFORE the flip, and for how long it had been holding.
		await dialog.evaluate((el) => {
			const w = window as unknown as { __flips: { hold: boolean; heldMs: number }[] };
			w.__flips = [];
			const read = () => el.querySelector('span.font-mono')?.textContent ?? '';
			let last = read();
			let holdFrom = -1;
			const tick = (t: number) => {
				const hold = el.getAttribute('data-beat') === 'hold';
				const now = read();
				if (now !== last) {
					w.__flips.push({ hold: holdFrom >= 0, heldMs: holdFrom >= 0 ? Math.round(t - holdFrom) : 0 });
					last = now;
				}
				if (hold && holdFrom < 0) holdFrom = t;
				if (!hold) holdFrom = -1;
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await pauseFrames(page);
		await dialog.getByRole('button', { name: 'Play the presentation' }).click();
		await stepFramesUntil(page, async () => (await position()) === '3 / 3', CAP_FRAMES(60_000), 10);
		expect(await position()).toBe('3 / 3');
		// The sampler is a frame callback: it sees the flip React just committed on the NEXT frame.
		await stepFrame(page);
		const flips = await page.evaluate(() => (window as unknown as { __flips: { hold: boolean; heldMs: number }[] }).__flips);
		expect(flips.length).toBe(2);
		for (const f of flips) {
			// brisk's leave beat is 400 ms; a frame of slack for the rAF sampling (virtual frames, on the fake clock).
			expect(f.hold, 'the deck was holding the finished slide when it advanced').toBe(true);
			expect(f.heldMs, `the finished slide held ${f.heldMs} ms before the next appeared`).toBeGreaterThanOrEqual(380);
		}
	});
});
