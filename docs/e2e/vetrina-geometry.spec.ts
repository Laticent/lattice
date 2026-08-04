import { expect, gotoStudio, test } from './studio-fixture';

// Does a Vetrina cue land on the thing it names? (#1400)
//
// The production report was three cues in three wrong places on an iPad, read as "geometry
// resolved in the wrong coordinate space". Measured here, on the real Studio, it is not a
// coordinate space at all: the stage layer sits at exactly (0,0,viewport) with no transformed
// ancestor. It is a STALE RECT. The `reskin` beat closes the Inspector and circles the preview
// pane in the same step, and the ring was positioned from the rect the pane had BEFORE React
// committed the close — so it drew around a pane-width of nowhere and ran off the screen edge.
//
// Instrumented on the UNFIXED build at this viewport, the ring sat at left=699 w=481 while
// `#studio-pane-preview` was at left=571 w=609 — a 128px disagreement that held for the ring's
// whole 1.7s life. This spec is that measurement, as an oracle.
//
// WHY 1180x703: the reported surface is an iPad in landscape under Safari's chrome, and it is
// the box the repo already keeps for engine-divergence work (playwright.config.ts, #1227).
// Chromium is enough because the defect is timing, not engine layout — but that also means
// this spec does NOT stand in for real iPad Safari, which the sandbox cannot reach.

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1180, height: 703 } });

/** The largest SUSTAINED gap, in px, between the spotlight ring and the pane it circles.
 *
 *  Sustained, not instantaneous, and that distinction is the whole design of this oracle. A
 *  reflow lands after the frame that caused it, so a cue that tracks its target is one frame
 *  behind for exactly one frame — ~16ms, and across this particular transition that one frame
 *  is a full 128px. Failing on that would be failing on physics. What the DEFECT looked like
 *  is a gap that never closes: ~100 consecutive frames. So a gap is only recorded once it has
 *  survived `SUSTAIN` frames in a row. */
type Worst = { gap: number; ring: number[]; target: number[]; say: string } | null;
const SUSTAIN = 4;

test('a spotlight cue never disagrees with the pane it circles', async ({ page }) => {
	// Sample from inside the page. The ring lives ~1.7s and the disagreement is a WINDOW, so a
	// retrying matcher would simply wait it out and pass against a broken build — the exact way
	// an earlier e2e spec in this area lied. Read continuously, assert once at the end.
	await page.addInitScript(() => {
		const w = window as unknown as { __worst: Worst; __saw: boolean };
		w.__worst = null;
		w.__saw = false;
		const arm = () => {
			const layer = document.querySelector('.vetrina-stage');
			if (!layer) return requestAnimationFrame(arm);
			let run = 0;
			const tick = () => {
				if (!document.contains(layer)) return;
				const target = document.querySelector('#studio-pane-preview');
				// The ring is the only stage child sized to a target box (the cursor and the dock
				// are not); every other cue is a small transform-centered burst.
				const ring = [...layer.children].find((c) => (c as HTMLElement).style.borderRadius === '14px') as HTMLElement | undefined;
				if (ring && target) {
					w.__saw = true;
					const a = ring.getBoundingClientRect();
					const b = target.getBoundingClientRect();
					const gap = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
					run = gap > 2 ? run + 1 : 0;
					if (run >= SUSTAIN && (!w.__worst || gap > w.__worst.gap)) {
						w.__worst = {
							gap: Math.round(gap),
							ring: [a.left, a.top, a.width, a.height].map(Math.round),
							target: [b.left, b.top, b.width, b.height].map(Math.round),
							say: document.querySelector('.vetrina-narration')?.textContent?.slice(0, 40) ?? '',
						};
					}
				} else {
					run = 0;
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(arm);
	});

	await gotoStudio(page);
	// The `quiet` tour is the shortest one that plays `reskin` — the beat that closes the
	// Inspector (reflowing both panes) and circles the preview in the same step.
	await page.locator('button[data-demo="show-me"]').click();
	await page.locator('[data-tour="quiet"]').first().click();
	await expect(page.locator('.vetrina-stage')).toBeVisible();
	await expect(page.locator('.vetrina-stage')).toHaveCount(0, { timeout: 220_000 });

	const { worst, saw } = await page.evaluate(() => {
		const g = window as unknown as { __worst: Worst; __saw: boolean };
		return { worst: g.__worst, saw: g.__saw };
	});
	// Guard the oracle itself: a run that never drew a ring would report a clean `null` and be
	// indistinguishable from a pass. It has to have measured something.
	expect(saw, 'the tour never drew a spotlight ring — the oracle measured nothing').toBe(true);
	expect(worst, worst ? `sustained disagreement: ring [${worst.ring}] vs pane [${worst.target}] during "${worst.say}"` : '').toBeNull();
});
