import { expect, gotoStudio, readStorage, test, toastText } from './studio-fixture';

// CONNECT OPENROUTER IN A POPUP — the Studio never leaves the screen (docs/src/lib/sign-in.js).
//
// OpenRouter is MOCKED, NOT SPENT (HARD RULE #24): `context.route` answers every openrouter.ai
// request, the popup's included. The mock /auth sends the popup straight to its callback with a
// code, the way OpenRouter does once the user approves, and the mock /auth/keys hands back a
// throwaway key.

async function mockOpenRouter(context: import('@playwright/test').BrowserContext, opts: { authHolds?: boolean; coop?: boolean } = {}) {
	const exchanges: Array<Record<string, string>> = [];
	await context.route('https://openrouter.ai/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/auth') {
			if (opts.authHolds) {
				await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>OpenRouter</title><p>Sign in</p>' });
				return;
			}
			const back = new URL(url.searchParams.get('callback_url') || '');
			back.searchParams.set('code', 'e2e-code');
			if (opts.coop) {
				// What Google's sign-in page does inside OpenRouter's flow: a COOP header puts the
				// popup in a new browsing context group, which cuts it off from the Studio for good.
				// The user then "approves" a moment later.
				await route.fulfill({
					status: 200,
					contentType: 'text/html',
					headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
					body: `<!doctype html><title>Sign in</title><script>setTimeout(() => location.replace(${JSON.stringify(back.toString())}), 1500)</script>`,
				});
				return;
			}
			// A page that redirects, not a 302: Playwright's WebKit cannot fulfill a navigation
			// with a redirect status.
			await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><script>location.replace(${JSON.stringify(back.toString())})</script>` });
			return;
		}
		if (url.pathname === '/api/v1/auth/keys') {
			exchanges.push(JSON.parse(route.request().postData() || '{}'));
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'sk-e2e-mock-not-a-real-key' }) });
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
	return exchanges;
}

async function openCloudPane(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	const sheet = page.getByRole('dialog', { name: /Workspace/ });
	await sheet.getByRole('tab', { name: 'AI', exact: true }).click();
	await sheet.getByRole('tab', { name: 'Cloud', exact: true }).click();
	return sheet;
}

test('@crosswidth @webkit-phone @gecko Connect signs in through a popup and the Studio page never navigates', async ({ page, context }) => {
	const exchanges = await mockOpenRouter(context);
	await gotoStudio(page);
	const studioUrl = page.url();
	// A marker on the page's own window: any page load (a redirect out and back) wipes it.
	// Counting `framenavigated` instead also counts the phone sheet's same-document history
	// entry on WebKit.
	await page.evaluate(() => { (window as unknown as { __stayed: number }).__stayed = 1; });
	const sheet = await openCloudPane(page);

	const [popup] = await Promise.all([page.waitForEvent('popup'), sheet.getByRole('button', { name: /Connect OpenRouter/ }).click()]);
	await popup.waitForEvent('close', { timeout: 15_000 });

	await expect(toastText(page)).toContainText('OpenRouter connected');
	expect(await readStorage(page, 'lattice-db-or-key')).toBe('sk-e2e-mock-not-a-real-key');
	expect(await readStorage(page, 'lattice-db-or-verifier')).toBeNull();
	expect(await readStorage(page, 'lattice-sign-in-return')).toBeNull();
	expect(exchanges).toHaveLength(1);
	expect(exchanges[0].code).toBe('e2e-code');
	expect(exchanges[0].code_verifier).toBeTruthy();
	expect(page.url(), 'the Studio stayed where it was').toBe(studioUrl);
	expect(await page.evaluate(() => (window as unknown as { __stayed?: number }).__stayed), 'the Studio page was never reloaded').toBe(1);
	await expect(sheet.getByText(/OpenRouter — (active|connected)/)).toBeVisible();
});

test('@crosswidth @webkit-phone @gecko closing the popup resets Connect and connects nothing', async ({ page, context }) => {
	await mockOpenRouter(context, { authHolds: true });
	await gotoStudio(page);
	const sheet = await openCloudPane(page);
	const connect = sheet.getByRole('button', { name: /Connect OpenRouter|Signing in to OpenRouter/ });

	const [popup] = await Promise.all([page.waitForEvent('popup'), connect.click()]);
	await popup.waitForURL(/openrouter\.ai\/auth/);
	await expect(connect).toBeDisabled();
	await popup.close();

	await expect(connect).toBeEnabled();
	await expect(connect).toHaveText(/Connect OpenRouter/);
	expect(await readStorage(page, 'lattice-db-or-key')).toBeNull();
});

test('a callback no tab answers sends the popup back to the Studio, which finishes the sign-in', async ({ page, context }) => {
	const exchanges = await mockOpenRouter(context);
	await gotoStudio(page);
	// What a reloaded Studio leaves: a PKCE verifier and a return address, and nobody listening.
	await page.evaluate(() => {
		localStorage.setItem('lattice-db-or-verifier', 'v'.repeat(64));
		localStorage.setItem('lattice-sign-in-return', `${location.origin}/studio/`);
	});
	const orphan = await context.newPage();
	await orphan.goto('/sign-in/callback/?code=orphan-code');
	await orphan.waitForURL(/\/studio\//, { timeout: 15_000 });
	await expect.poll(() => readStorage(orphan, 'lattice-db-or-key'), { timeout: 30_000 }).toBe('sk-e2e-mock-not-a-real-key');
	expect(exchanges.map((e) => e.code)).toEqual(['orphan-code']);
	await expect.poll(() => orphan.evaluate(() => location.search), { timeout: 30_000 }).toBe('');
});

test('@crosswidth @webkit-phone @gecko a sign-in page that cuts the popup off (COOP) still connects', async ({ page, context }) => {
	const exchanges = await mockOpenRouter(context, { coop: true });
	await gotoStudio(page);
	const studioUrl = page.url();
	const sheet = await openCloudPane(page);
	const [popup] = await Promise.all([page.waitForEvent('popup'), sheet.getByRole('button', { name: /Connect OpenRouter/ }).click()]);
	await expect(toastText(page)).toContainText('OpenRouter connected', { timeout: 20_000 });
	expect(await readStorage(page, 'lattice-db-or-key')).toBe('sk-e2e-mock-not-a-real-key');
	expect(exchanges.map((e) => e.code)).toEqual(['e2e-code']);
	expect(page.url()).toBe(studioUrl);
	await expect(sheet.getByText(/OpenRouter — (active|connected)/)).toBeVisible();
	// The cut-off popup closes itself on the tab's ack (the opener can no longer close it).
	await expect.poll(() => popup.isClosed(), { timeout: 10_000 }).toBe(true);
});
