import { storedOpenRouterKey, storedOpenRouterRaw } from './openrouter-key-helper';
import { expect, gotoStudio, test } from './studio-fixture';

// WORKSPACE → AI → PROVIDERS & KEYS: paste an OpenRouter key instead of the one-click sign-in.
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
	await expect(page.getByTestId('provider-row-openrouter')).toContainText('Key …7f3c');
	await expect(page.getByText(/e2e-good-key/)).toHaveCount(0);
	// Sealed at rest: storage holds an envelope that does not contain the key, and it opens to it.
	await expect.poll(() => storedOpenRouterRaw(page)).toMatch(/^v1:/);
	expect(await storedOpenRouterRaw(page)).not.toContain(GOOD);
	expect(await storedOpenRouterKey(page)).toBe(GOOD);

	// A reload opens the sealed key again: the Workspace still shows it.
	await page.reload();
	const header = page.locator('button[aria-label="Workspace settings"]:visible');
	if (await header.count()) await header.first().click();
	else {
		await page.getByRole('button', { name: /^(Menu|More controls)$/ }).click();
		await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
	}
	await page.getByRole('tab', { name: 'AI' }).click();
	await expect(page.getByTestId('provider-row-openrouter')).toContainText(`Key …${GOOD.slice(-4)}`);

	// Remove clears it from this browser.
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByLabel('OpenRouter API key')).toBeVisible();
	await expect.poll(() => storedOpenRouterRaw(page)).toBeNull();
});

// Rule 1 of the routes redesign (2026-11-08-studio-ai-routes-ux.md): saving a key never changes a set
// selection, so an on-device pick survives it. From the checker pass on this flow: a key pasted with an invisible character made the request throw and
// read as "could not reach OpenRouter". The browser's built-in model is stubbed so an on-device
// tier can be picked without a download. (A password <input> drops line breaks itself, so the
// invisible-character case is a zero-width space plus padding.)
test('@crosswidth @webkit-phone a key saved while on-device is selected is cleaned of invisible characters and leaves the on-device pick alone', async ({ page }) => {
	const CLEAN = 'sk-or-v1-e2e-clean-key-9b1d';
	const seen: string[] = [];
	// A working key is already stored, so Cloud would be active; the author then PICKS on-device,
	// which outranks it, and that is the state the bug lived in.
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('e2e-seeded')) {
			localStorage.setItem('lattice-db-or-key', 'sk-or-v1-e2e-old-working-key');
			sessionStorage.setItem('e2e-seeded', '1');
		}
		(window as unknown as { LanguageModel: unknown }).LanguageModel = {
			availability: async () => 'available',
			create: async () => ({ prompt: async () => '', promptStreaming: async function* () {}, destroy() {} }),
		};
	});
	await page.route('https://openrouter.ai/**', async (route) => {
		const req = route.request();
		if (req.url().includes('/auth/key')) {
			seen.push(String(req.headers().authorization));
			const ok = [`Bearer ${CLEAN}`, 'Bearer sk-or-v1-e2e-old-working-key'].includes(String(req.headers().authorization));
			await route.fulfill({ status: ok ? 200 : 401, contentType: 'application/json', body: ok ? '{"data":{"usage":0,"limit":null}}' : '{}' });
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
	await openApiKeyTab(page);

	// Start on-device: the built-in model, selected from the Chat model chooser.
	const card = page.getByTestId('chat-model-card');
	await card.getByRole('button', { name: /Change/ }).click();
	await page.getByRole('group', { name: 'Chat model source' }).getByRole('radio', { name: /On-device/ }).click();
	const builtIn = page.locator('div.rounded-xl', { hasText: 'Browser built-in' });
	await builtIn.getByRole('button', { name: 'Use' }).click();
	await expect(card.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');
	await expect(card.getByTestId('chat-model-card-state')).toHaveText('Ready');

	// Replace the key with one carrying a zero-width space and padding.
	await page.getByRole('button', { name: 'Replace' }).click();
	await page.getByLabel('OpenRouter API key').fill(`  ${CLEAN.slice(0, 10)}\u200B${CLEAN.slice(10)}  `);
	await page.getByRole('button', { name: 'Check & save' }).click();

	await expect(page.getByTestId('provider-row-openrouter')).toContainText(`Key …${CLEAN.slice(-4)}`);
	expect(seen, 'the check carried the cleaned key').toContain(`Bearer ${CLEAN}`);
	await expect.poll(() => storedOpenRouterRaw(page)).toMatch(/^v1:/);
	expect(await storedOpenRouterKey(page)).toBe(CLEAN);
	// Connecting never changes a set selection (2026-11-08-studio-ai-routes-ux.md rule 1): the
	// author's on-device pick stays the chat model, and the key waits under Connections.
	await expect(card.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');
	await expect(card.getByTestId('chat-model-card-state')).toHaveText('Ready');
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-chat-selection') || '{}'))).toMatchObject({ source: 'device', provider: 'prompt-api' });
});
