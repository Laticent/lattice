import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE GREETING AND THE CLOSING, on the real Present overlay
// (engineering/decisions/2026-09-27-narration-bookends.md).
//
// A deck's `greeting:` plays before slide 1 and its `closing:` after the last slide, once per
// Present session. The unit test (studio.present-bookends.test.tsx) pins the state machine in
// jsdom; this drives the surface a presenter touches, in a real browser with a real clock and a
// real time zone. Like present-beat, it needs no voice and no key: the chain runs on the caption
// clock whatever the rung (HARD RULE #24), and the greeting is read off the caption band.
//
// The deck opens and ends on SILENT slides — the shape the feature exists for, and the one a
// maker-checker pass caught racing: the empty-slide skip must wait out the greeting's gap.
// SILENT MEANS NO TEXT. An empty `<!-- say: -->` does not mute a slide: it falls through to
// the slide's own words (mergeNarration, lib/core/read-along-build.js). This deck used to close
// on `## Thank you` under an empty spoken line, so its last slide SAID "Thank you." and the closing
// was dropped by design, as a repeat (`alreadyThanks`) — the spec had been red since it landed.
const DECK = [
	'---',
	'theme: indaco',
	'greeting: "{greeting}, and welcome to the review."',
	'closing: "Thank you. Questions are welcome."',
	'---',
	'',
	'<!-- _class: title -->',
	'',
	'---',
	'',
	'## The middle slide',
	'',
	'<!-- say: The middle slide speaks one line. -->',
	'',
	'---',
	'',
	'<!-- _class: closing -->',
	'',
].join('\n');

test.describe('Present — greeting and closing', () => {
	test.use({ timezoneId: 'Asia/Tokyo' });
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-present-slide-beat', '0');
				localStorage.setItem('lattice-present-section-beat', '0');
			} catch {
				/* storage unavailable — the app falls back to its defaults */
			}
		});
		await gotoStudio(page);
		await setEditorContent(page, DECK);
	});

	test('greets by the viewer\'s own hour, chains the deck, closes once, and never repeats', async ({ page }) => {
		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		const transport = dialog.getByRole('button', { name: /^(Pause|Play the presentation)$/ });
		const counter = dialog.locator('span.font-mono').first();

		// The salutation the page's own clock (Asia/Tokyo here) should produce.
		const hour = await page.evaluate(() => new Date().getHours());
		const want = hour >= 4 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';

		// Present opens on the editor's slide (the caret sits on the last one after typing).
		await page.keyboard.press('Home');
		await expect(counter).toHaveText(/^1 \//);
		await transport.click();
		await expect(dialog).toContainText(`${want}, and welcome to the review.`, { timeout: 15_000 });
		await expect(counter).toHaveText(/^1 \//);
		await expect(dialog).toContainText('The middle slide speaks one line.', { timeout: 30_000 });
		await expect(counter).toHaveText(/^2 \//);
		await expect(dialog).toContainText('Thank you. Questions are welcome.', { timeout: 30_000 });
		await expect(counter).toHaveText(/^3 \//);
		await expect(transport).toHaveAccessibleName('Play the presentation', { timeout: 30_000 });

		// Back to slide 1 and Play again: the same session does not greet twice.
		await page.keyboard.press('Home');
		await expect(counter).toHaveText(/^1 \//);
		await transport.click();
		// Slide 1 is silent, so the deck moves straight on: the first thing said is slide 2's
		// line, and the greeting is nowhere in the band.
		await expect(dialog).toContainText('The middle slide speaks one line.', { timeout: 30_000 });
		await expect(dialog).not.toContainText(`${want}, and welcome`);
	});
});
