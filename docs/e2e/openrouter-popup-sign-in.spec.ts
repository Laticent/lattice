import { expect, gotoStudio, readStorage, test, toastText } from './studio-fixture';

// CONNECT OPENROUTER IN A POPUP — the Studio never leaves the screen (docs/src/lib/sign-in.js).
//
// OpenRouter is MOCKED, NOT SPENT (HARD RULE #24): `context.route` answers every openrouter.ai
// request, the popup's included. The mock /auth sends the popup straight to its callback with a
// code, the way OpenRouter does once the user approves, and the mock /auth/keys hands back a
// throwaway key.

async function mockOpenRouter(context: import('@playwright/test').BrowserContext, opts: { authHolds?: boolean } = {}) {
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
			await route.fulfill({ status: 302, headers: { location: back.toString() } });
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

test('Connect signs in through a popup and the Studio page never navigates', async ({ page, context }) => {
	const exchanges = await mockOpenRouter(context);
	await gotoStudio(page);
	const studioUrl = page.url();
	let mainNavigations = 0;
	page.on('framenavigated', (f) => { if (f === page.mainFrame()) mainNavigations++; });
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
	expect(mainNavigations, 'the Studio page itself never navigated').toBe(0);
	await expect(sheet.getByText(/OpenRouter — (active|connected)/)).toBeVisible();
});

test('closing the popup resets Connect and connects nothing', async ({ page, context }) => {
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
