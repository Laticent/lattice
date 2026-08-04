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
	// FAIL ON A PAGE ERROR, and read this before touching the sampler below.
	//
	// The first version of this spec passed against a build with the tracking loop ripped out. The
	// `addInitScript` callback is SERIALIZED into the page, so it closes over nothing: its
	// reference to the module-scope `SUSTAIN` threw `ReferenceError` on the first frame that saw a
	// ring — after `__saw = true` and before any `__worst` was recorded. The oracle died, reported
	// a clean `null`, and the "guard the oracle itself" check below passed because it had already
	// been satisfied one statement too early. A sampler that dies silently is worse than no
	// sampler: it certifies. So the constant is now passed as an ARGUMENT, and any uncaught page
	// error fails the test outright — that is the guard that generalizes, not a smarter flag.
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(String(e)));

	// Sample from inside the page. The ring lives ~1.7s and the disagreement is a WINDOW, so a
	// retrying matcher would simply wait it out and pass against a broken build — the exact way
	// an earlier e2e spec in this area lied. Read continuously, assert once at the end.
	await page.addInitScript((sustain: number) => {
		const w = window as unknown as { __worst: Worst; __saw: boolean; __frames: number };
		w.__worst = null;
		w.__saw = false;
		w.__frames = 0;
		const SUSTAIN = sustain;
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
					const a = ring.getBoundingClientRect();
					const b = target.getBoundingClientRect();
					const gap = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
					// Set LAST among the bookkeeping, so a throw anywhere in the measurement above
					// leaves `__saw` false and the guard below fires instead of certifying.
					w.__saw = true;
					w.__frames++;
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
	}, SUSTAIN);

	await gotoStudio(page);
	// The `quiet` tour is the shortest one that plays `reskin` — the beat that closes the
	// Inspector (reflowing both panes) and circles the preview in the same step.
	await page.locator('button[data-demo="show-me"]').click();
	await page.locator('[data-tour="quiet"]').first().click();
	await expect(page.locator('.vetrina-stage')).toBeVisible();
	await expect(page.locator('.vetrina-stage')).toHaveCount(0, { timeout: 220_000 });

	const { worst, saw, frames } = await page.evaluate(() => {
		const g = window as unknown as { __worst: Worst; __saw: boolean; __frames: number };
		return { worst: g.__worst, saw: g.__saw, frames: g.__frames };
	});
	// Guard the oracle itself, three ways — a run that measured nothing reports a clean `null`
	// and is otherwise indistinguishable from a pass.
	expect(pageErrors, `the sampler threw inside the page, so it measured nothing: ${pageErrors.join(' | ')}`).toEqual([]);
	expect(saw, 'the tour never drew a spotlight ring — the oracle measured nothing').toBe(true);
	// More than a handful of frames: a sampler that died after its first ring frame would still
	// set `__saw`, and `SUSTAIN` frames is the minimum needed to record anything at all.
	expect(frames, `the oracle sampled only ${frames} ring frame(s) — too few to have observed a sustained gap`).toBeGreaterThan(SUSTAIN * 10);
	expect(worst, worst ? `sustained disagreement: ring [${worst.ring}] vs pane [${worst.target}] during "${worst.say}"` : '').toBeNull();
});
