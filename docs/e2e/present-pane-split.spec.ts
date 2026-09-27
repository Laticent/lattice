import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// PRESENT STEPS THROUGH A SPLIT PANES SLIDE (docs/src/components/studio/PresentOverlay.tsx).
//
// On a portrait deck the engine splits every panes slide into one slide per pane
// (lib/core/panes.js). Present counted the slides the author wrote and had no page step, so
// it showed the split slide's FIRST pane and "Next" jumped past the second. It now reads the
// same map the editor's preview does (pane-pages.ts): Next spends the second page before it
// leaves the slide, Previous comes back to it, and the presenter's "next" tile shows it.
const DECK = [
	'---',
	'theme: indaco',
	'size: 9:16',
	'---',
	'',
	'# Opening',
	'',
	'---',
	'',
	'## EMEA carried the quarter.',
	'',
	'<!-- panes: 35/65 -->',
	'<!-- pane: list -->',
	'',
	'- EMEA closed three late deals',
	'',
	'<!-- pane: table -->',
	'',
	'| Region | Q3 |',
	'|---|---|',
	'| EMEA | 5.3 |',
	'',
	'---',
	'',
	'## Closing',
	'',
].join('\n');

for (const [width, height] of [
	[1440, 900],
	[820, 1180],
] as const) {
test.describe(`at ${width}px`, () => {
test.use({ viewport: { width, height } });
test('Present shows both panes of a split slide, in order, forward and back', async ({ page }, info) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(3);
	await railButtons(page).nth(1).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const shown = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
	const next = dialog.getByRole('button', { name: 'Next slide' });
	const prev = dialog.getByRole('button', { name: 'Previous slide' });

	await expect(shown).toContainText('EMEA closed three late deals', { timeout: 30_000 });
	await next.click();
	await expect(shown).toContainText('5.3');
	await expect(shown).not.toContainText('EMEA closed three late deals');
	// …and it is SEEN, not only in the DOM: the portrait slide fits its frame. The frame was a
	// fixed 16:9 box, which cropped a 9:16 slide below its heading on every deck.
	const frame = await page.locator('[aria-label="Presented slide"]').boundingBox();
	const slide = await shown.boundingBox();
	expect(frame && slide).toBeTruthy();
	if (frame && slide) expect(slide.y + slide.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
	const path = info.outputPath('present-second-pane.png');
	await page.screenshot({ path });
	await info.attach('present-second-pane.png', { path, contentType: 'image/png' });
	await next.click();
	await expect(shown).toContainText('Closing');
	// Back from the slide after it lands on the split slide's LAST page, then its first.
	await prev.click();
	await expect(shown).toContainText('5.3');
	await prev.click();
	await expect(shown).toContainText('EMEA closed three late deals');
});
});
}

test('a one-slide deck whose slide splits still steps to its second page', async ({ page }) => {
	// The arrows counted slides, so on a deck of one they were both disabled and the second pane
	// could not be reached at all. They count pages now.
	const one = ['---', 'theme: indaco', 'size: 9:16', '---', '', '## EMEA carried the quarter.', '', '<!-- panes: 35/65 -->', '<!-- pane: list -->', '', '- EMEA closed three late deals', '', '<!-- pane: table -->', '', '| Region | Q3 |', '|---|---|', '| EMEA | 5.3 |', ''].join('\n');
	await gotoStudio(page);
	await setEditorContent(page, one);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(1);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const shown = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
	await expect(shown).toContainText('EMEA closed three late deals', { timeout: 30_000 });
	const next = dialog.getByRole('button', { name: 'Next slide' }).first();
	await expect(next).toBeEnabled();
	await next.click();
	await expect(shown).toContainText('5.3');
	await expect(next).toBeDisabled();
});

test('a jump or a reopen starts a split slide on its first page', async ({ page }) => {
	// The checker's repros: the page used to be kept per slide index and never reset, so Home after
	// the second pane, or closing and reopening Present on the split slide, showed the second pane.
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(3);
	await railButtons(page).nth(1).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const shown = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
	const next = dialog.getByRole('button', { name: 'Next slide' }).first();
	await expect(shown).toContainText('EMEA closed three late deals', { timeout: 30_000 });
	await next.click();
	await expect(shown).toContainText('5.3');
	await next.click();
	await expect(shown).toContainText('Closing');
	await page.keyboard.press('Home');
	await expect(shown).toContainText('Opening');
	await next.click();
	await expect(shown).toContainText('EMEA closed three late deals');
	await next.click();
	await expect(shown).toContainText('5.3');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(shown).toContainText('EMEA closed three late deals', { timeout: 30_000 });
});
