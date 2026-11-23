import { expect, test } from '@playwright/test';

// The /libraries/ltt/ demo, driven in all three engines and at phone width. The page writes a
// three-slide deck's narration as an LTT file with the real library (src/lib/ltt-demo.ts): the
// file must validate, scrubbing must move the lit word across slides through the phases
// `positionAt` reports, a cleared slide must turn into a hold, and each break must make
// `validateLtt` name a problem.

test('@crosswidth @webkit-phone @webkit-tablet @gecko the LTT demo validates, scrubs and breaks the file', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/libraries/ltt/');
	await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');

	// It opens mid-sentence on slide 1 with one word lit, and the file is valid.
	await expect(page.locator('#phase')).toHaveText('cue');
	await expect(page.locator('#where')).toHaveText('Slide 1, sentence 1 of 2');
	await expect(page.locator('#caption .w.lit')).toHaveCount(1);
	await expect(page.locator('#verdict')).toHaveAttribute('data-ok', 'true');
	await expect(page.locator('#s-segs')).toHaveText('3');

	// The scrubber reaches the end of the deck.
	const scrub = page.getByLabel('Position in the narration');
	await scrub.fill('1000');
	await expect(page.locator('#phase')).toHaveText('end');
	await expect(page.locator('#where')).toHaveText('The deck is over');

	// Clearing slide 2 makes it a hold: no sentences, nothing to light.
	await page.getByLabel('Slide 2 narration').fill('');
	await expect(page.locator('.slide[data-i="1"] .kind')).toHaveText('hold');
	await expect(page.locator('#verdict')).toHaveAttribute('data-ok', 'true');

	// Each break makes the validator name at least one problem; leaving it valid clears them.
	await page.getByRole('button', { name: 'A version this reader does not know' }).click();
	await expect(page.locator('#verdict')).toHaveAttribute('data-ok', 'false');
	await expect(page.locator('#verdict li').first()).toContainText('2.0');
	await page.getByRole('button', { name: 'A word that ends before it starts' }).click();
	await expect(page.locator('#verdict')).toHaveAttribute('data-ok', 'false');
	await page.getByRole('button', { name: 'Leave it valid' }).click();
	await expect(page.locator('#verdict')).toHaveAttribute('data-ok', 'true');

	// The packed tab shows the smaller encoding, at the size the stats report.
	const bytes = async (id: string) => Number((await page.locator(id).textContent())?.replace(/[^0-9]/g, '') || 0);
	await expect.poll(async () => (await bytes('#s-packed')) > 0 && (await bytes('#s-packed')) < (await bytes('#s-canon'))).toBe(true);
	await page.getByRole('tab', { name: 'Packed' }).click();
	await expect(page.getByRole('tab', { name: 'Packed' })).toHaveAttribute('aria-selected', 'true');
	await expect.poll(async () => (await bytes('#bytes')) === (await bytes('#s-packed'))).toBe(true);
	await expect(page.locator('#json')).toContainText('"encoding": "packed"');
	expect(errors).toEqual([]);
});
