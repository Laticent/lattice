import { expect, test } from '@playwright/test';

// The /libraries/markup/ demo, driven in all three engines and at phone width. Both panels run the
// real @laticent/markup (src/lib/markup-demo.ts; markup-demo.test.ts holds the same numbers): the
// newline split must cut the sample's multi-line comment and string while splitCodeLines keeps
// every line balanced, and the regex must fall into the slide sample's three traps while the
// section walker finds the two real slides and their own titles.

test('@crosswidth @webkit-phone @webkit-tablet @gecko the demo shows the shortcut breaking where Markup does not', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/libraries/markup/');

	await expect(page.locator('#s-lines')).toHaveText('9');
	await expect(page.locator('#s-broken')).toHaveText('5');
	await expect(page.locator('#s-reopened')).toHaveText('3');
	await expect(page.locator('#naive li[data-cut]')).toHaveCount(5);
	await expect(page.locator('#balanced li[data-cut]')).toHaveCount(0);
	// The comment's second line keeps its color only in the balanced split.
	await expect(page.locator('#balanced li').nth(1).locator('.hljs-comment')).toHaveText('   Figures are in millions,');
	await expect(page.locator('#naive li').nth(1).locator('.hljs-comment')).toHaveCount(0);

	await expect(page.locator('#walk .t')).toHaveText(['Revenue held in Q2', 'Q3 beat the target']);
	await expect(page.locator('#regex .t')).toHaveText(['Old title', 'Speaker aside', 'Q3 plan">beat the target']);
	await expect(page.locator('#regex li[data-wrong]')).toHaveCount(3);

	// Editing re-runs both sides: with the comment gone, the regex finds the same two slides' classes.
	const slides = page.locator('#slides');
	await slides.fill((await slides.inputValue()).replace(/^<!--[^\n]*\n/, ''));
	await expect(page.locator('#regex .c')).toHaveText([/section\.title/, /section\.split/]);
	await expect(page.locator('#walk li')).toHaveCount(2);

	// A flat line has nothing to cut.
	await page.locator('#code').fill("const a = 1;\nconst b = 'two';");
	await expect(page.locator('#s-broken')).toHaveText('0');
	await expect(page.locator('#naive li[data-cut]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Reset both inputs' }).click();
	await expect(page.locator('#s-broken')).toHaveText('5');
	await expect(page.locator('#regex li')).toHaveCount(3);
	expect(errors).toEqual([]);
});
