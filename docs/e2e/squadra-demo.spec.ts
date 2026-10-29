import { expect, test } from '@playwright/test';

// The /libraries/squadra/ demo, driven in all three engines and at phone width. The page compiles
// its six rules with the real library in lenient mode (src/lib/squadra-demo.ts): each broken rule
// must show as refused, with the refusal code the compiler gave, and never act on the text; Fix all
// must clear every finding in one pass and leave the fenced example as written.

test('@crosswidth @webkit-phone @webkit-tablet @gecko the demo refuses the broken rules and Fix all clears the honest findings', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/libraries/squadra/');

	const card = (id: string) => page.locator(`.rule[data-id="${id}"]`);
	await expect(card('notes/no-venue')).toHaveAttribute('data-state', 'refused');
	await expect(card('notes/no-venue').locator('.verdict')).toContainText('good-fired');
	await expect(card('notes/next-section').locator('.verdict')).toContainText('fix-changed-shape');
	await expect(card('notes/tbd').locator('.verdict')).toContainText('fix-did-not-resolve');
	for (const id of ['notes/no-todo', 'notes/one-space', 'notes/no-trailing-space']) await expect(card(id)).toHaveAttribute('data-state', 'loaded');
	await expect(page.locator('#s-rules')).toHaveText('3');
	await expect(page.locator('#s-find')).toHaveText('4');

	// A refused rule never reports on the text: the sample's "venue" and "TBD" lines have no finding.
	await expect(page.locator('#findings .rid')).not.toContainText(['notes/no-venue']);

	await page.getByRole('button', { name: 'Fix all' }).click();
	await expect(page.locator('#log')).toContainText('Applied 4 fixes in 1 pass');
	await expect(page.locator('#s-find')).toHaveText('0');
	await expect(page.getByRole('button', { name: 'Fix all' })).toBeDisabled();
	const text = await page.locator('#ed').inputValue();
	expect(text).toContain('an example, left as written: TODO  here');
	expect(text).toContain('call the venue DONE\nbook the room\n');

	// Turning a rule off recompiles: it drops out of the count and its card says so.
	await card('notes/no-venue').locator('input').click();
	await expect(card('notes/no-venue')).toHaveAttribute('data-state', 'off');
	await expect(page.locator('#s-on')).toHaveText('5');
	expect(errors).toEqual([]);
});
