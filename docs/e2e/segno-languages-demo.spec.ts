import { expect, test } from '@playwright/test';

// The /libraries/segno-languages/ demo, driven in all three engines and at phone width. The page
// reads its sample deck with the real deck model (src/lib/segno-languages-demo.ts): five slides,
// four breaks, and none of the `---` lines inside a fence or under a line of text. Each edit goes
// through `updateDeckModel`; the slide the edit touched must say it was read again and every other
// slide must say it was reused, and an edit in the front matter must read the whole deck again.

test('@crosswidth @webkit-phone @webkit-tablet @gecko the demo re-reads only the edited slide', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/libraries/segno-languages/');

	const slides = page.locator('#slides > li');
	const state = () => slides.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.state));
	await expect(slides).toHaveCount(5);
	await expect(page.locator('#s-slides')).toHaveText('5');
	await expect(slides.locator('.title')).toHaveText(['Quarterly review', 'Two ways to ship', 'A fence keeps its dashes', 'Under a line of text', 'Next steps']);
	await expect(page.locator('#breaks')).toHaveText(/^Slide breaks on lines \d+, \d+, \d+, \d+\.$/);
	await expect(page.locator('#fm')).toContainText('theme: indaco');

	// Typing in slide 3 reads slide 3 again and reuses the other four.
	await page.getByRole('button', { name: 'Type in slide 3' }).click();
	await expect(slides.nth(2).locator('.title')).toHaveText('A fence keeps its dashes again');
	await expect.poll(state).toEqual(['reused', 'reused', 'reread', 'reused', 'reused']);
	await expect(page.locator('#s-reused')).toHaveText('4');
	await expect(page.locator('#log')).toContainText('Read slide 3 again');

	// Typing by hand goes the same way: an edit at the end of the deck re-reads the last slide only.
	const ed = page.locator('#ed');
	await ed.focus();
	await ed.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
	await ed.pressSequentially('3. Ship');
	await expect.poll(state).toEqual(['reused', 'reused', 'reused', 'reused', 'reread']);
	await expect(page.locator('#log')).toContainText('Read slide 5 again');

	// Splitting slide 2 re-reads its two halves; the deck now has six slides.
	await page.getByRole('button', { name: 'Split slide 2' }).click();
	await expect(slides).toHaveCount(6);
	await expect.poll(state).toEqual(['reused', 'reread', 'reread', 'reused', 'reused', 'reused']);
	await expect(slides.nth(2).locator('.title')).toHaveText('A new slide');

	// An edit in the front matter reads the whole deck again.
	await page.getByRole('button', { name: 'Edit the front matter' }).click();
	await expect(page.locator('#fm')).toContainText('paginate: false');
	await expect.poll(state).toEqual(['reread', 'reread', 'reread', 'reread', 'reread', 'reread']);
	await expect(page.locator('#log')).toContainText('the whole deck was read again');
	await expect(page.locator('#s-reused')).toHaveText('0');

	await page.getByRole('button', { name: 'Reset' }).click();
	await expect(slides).toHaveCount(5);
	await expect.poll(state).toEqual(['read', 'read', 'read', 'read', 'read']);
	expect(errors).toEqual([]);
});
