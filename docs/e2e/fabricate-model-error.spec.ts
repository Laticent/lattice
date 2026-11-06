import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// THEME AND COMPONENT AI NAME THE REAL MODEL ERROR.
//
// The adapter used to floor every failed request into an empty reply, so a 402 (the
// account is out of credits) reached the theme faculty as "the model returned no usable
// palette" and the component faculty as "no usable component". The author was told
// nothing they could act on. Both faculties now opt in to `surfaceErrors` and route the
// failure through the chat's `describeModelError` (`model-error.ts`).
//
// THE MODEL IS MOCKED, NOT SPENT (HARD RULE #24). The seeded key is a throwaway string and
// the route handler answers every openrouter.ai request; nothing leaves the browser.

type Page = Parameters<typeof gotoStudio>[0];

async function failingModel(page: Page, status: number, message: string) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the test fails loudly on the missing control */
		}
	});
	await page.route('https://openrouter.ai/**', async (route) => {
		if (!route.request().url().includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
		await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { message, code: status } }) });
	});
}

async function openFabricate(page: Page, tab: 'Theme' | 'Component') {
	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	// Theme is Fabricate's default tab; a bare "Theme" button also names the topbar theme
	// picker, so only the Component tab is clicked.
	if (tab === 'Component') await page.getByRole('button', { name: tab, exact: true }).click();
}

test('@smoke a 402 on "Describe a look" says the account is out of credits', async ({ page }) => {
	test.slow();
	await failingModel(page, 402, 'Insufficient credits');
	await openFabricate(page, 'Theme');
	const prompt = page.getByPlaceholder(/^Describe a look/);
	await prompt.fill('warm editorial, deep navy accent');
	await prompt.press('Enter');
	await expect(page.getByText(/out of credits/).first()).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/No model connected/)).toHaveCount(0);
});

test('a 429 on "Describe a component" says the key is being rate-limited', async ({ page }) => {
	test.slow();
	await failingModel(page, 429, 'Rate limit exceeded');
	await openFabricate(page, 'Component');
	const prompt = page.getByRole('textbox', { name: /describe a component/i });
	await prompt.fill('three pricing tiers side by side');
	await prompt.press('Enter');
	await expect(page.getByText(/rate-limiting this key/).first()).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/No component proposed|No model connected/)).toHaveCount(0);
});
