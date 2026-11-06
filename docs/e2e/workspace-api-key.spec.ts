import { expect, gotoStudio, test } from './studio-fixture';

// WORKSPACE → AI → API KEY: paste an OpenRouter key instead of the one-click sign-in.
//
// The key is checked against OpenRouter's /auth/key before it is stored, then shown only by its
// last four characters. MOCKED, NOT SPENT (HARD RULE #24): the route handler answers every
// openrouter.ai request, and the keys below are throwaway strings.

type Page = Parameters<typeof gotoStudio>[0];

async function mockAuthKey(page: Page, good: string) {
	await page.route('https://openrouter.ai/**', async (route) => {
		const req = route.request();
		if (req.url().includes('/auth/key')) {
			const ok = req.headers().authorization === `Bearer ${good}`;
			await route.fulfill({ status: ok ? 200 : 401, contentType: 'application/json', body: ok ? '{"data":{"usage":0,"limit":null}}' : '{"error":{"message":"User not found.","code":401}}' });
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
}

async function openApiKeyTab(page: Page) {
	await gotoStudio(page);
	const header = page.locator('button[aria-label="Workspace settings"]:visible');
	if (await header.count()) await header.first().click();
	else {
		await page.getByRole('button', { name: /^(Menu|More controls)$/ }).click();
		await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
	}
	await page.getByRole('tab', { name: 'AI' }).click();
	await page.getByRole('tab', { name: 'API key' }).click();
}

test('@smoke @crosswidth @webkit-phone a pasted OpenRouter key is checked, saved and shown masked', async ({ page }) => {
	const GOOD = 'sk-or-v1-e2e-good-key-7f3c';
	await mockAuthKey(page, GOOD);
	await openApiKeyTab(page);

	const field = page.getByLabel('OpenRouter API key');
	await expect(field).toHaveAttribute('type', 'password');

	// A key OpenRouter refuses is not stored.
	await field.fill('sk-or-v1-e2e-revoked');
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(page.getByText(/OpenRouter rejected this key/)).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBeNull();

	// A good one is stored and shown only by its last four characters.
	await field.fill(GOOD);
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(page.getByText('OpenRouter key …7f3c')).toBeVisible();
	await expect(page.getByText(/e2e-good-key/)).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBe(GOOD);

	// Remove clears it from this browser.
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByLabel('OpenRouter API key')).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBeNull();
});
