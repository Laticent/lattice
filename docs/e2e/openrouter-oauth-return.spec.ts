import { expect, gotoStudio, test } from './studio-fixture';

// A FAILED OPENROUTER SIGN-IN SAYS SO.
//
// `resumePendingAuth` used to return `false` when the code-for-key exchange failed, which the
// Studio treated exactly like "nothing to resume": the author clicked Connect, signed in at
// OpenRouter, came back, and nothing happened. The dead PKCE verifier also stayed behind.
//
// MOCKED, NOT SPENT (HARD RULE #24): the route handler answers every openrouter.ai request.

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko a 400 from the key exchange shows a retry and clears the verifier', async ({ page }) => {
	await page.addInitScript(() => {
		try {
			if (!sessionStorage.getItem('e2e-seeded')) {
				localStorage.setItem('lattice-db-or-verifier', 'pkce-verifier');
				sessionStorage.setItem('e2e-seeded', '1');
			}
		} catch {
			/* storage unavailable — the test fails loudly below */
		}
	});
	await page.route('https://openrouter.ai/**', async (route) => {
		if (route.request().url().includes('/auth/keys')) {
			await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":{"message":"Invalid code"}}' });
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
	// The fixture's own setup runs on the first load; the redirect back from OpenRouter is the
	// second. A stored verifier with no `code` is not a failure, so the first load leaves it.
	await gotoStudio(page);
	await page.goto('/studio/?code=dead-code', { waitUntil: 'domcontentloaded' });
	await expect(page.getByText(/OpenRouter did not connect \(error 400\)/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lattice-db-or-verifier'))).toBeNull();
	await expect.poll(() => page.evaluate(() => location.search)).not.toContain('code=');
	expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBeNull();
});
