import { storedOpenRouterRaw } from './openrouter-key-helper';
import { expect, gotoStudio, test } from './studio-fixture';

// A KEY A SIGN-IN JUST MADE READS "ACTIVATING", NOT "KEY REJECTED".
//
// OpenRouter starts accepting a key its sign-in just minted only a minute or two later: on the
// owner's iPhone it answered 401 "User not found." and accepted the key 94 s after it was made
// (2026-11-09). For three minutes after a sign-in a 401 means "activating"; the Studio asks again
// every 15 s and clears the note once the key is accepted. A pasted key's 401 is a rejection at once.
//
// MOCKED, NOT SPENT (HARD RULE #24): the route handler answers every openrouter.ai request.

type Page = Parameters<typeof gotoStudio>[0];
const MINTED = 'sk-or-v1-e2e-just-minted-key-5a5a';
const PASTED = 'sk-or-v1-e2e-pasted-key-6b6b';

/** Answer openrouter.ai: the key exchange gives MINTED; /api/v1/key answers 401 until `state.accept`. */
async function mockOpenRouter(page: Page, state: { accept: boolean }) {
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/auth/keys')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: MINTED }) });
			return;
		}
		if (/\/api\/v1\/(auth\/)?key(\?|$)/.test(url)) {
			await route.fulfill(
				state.accept
					? { status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' }
					: { status: 401, contentType: 'application/json', body: '{"error":{"message":"User not found.","code":401}}' },
			);
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
}

async function openAiTab(page: Page) {
	const header = page.locator('button[aria-label="Workspace settings"]:visible');
	if (await header.count()) await header.first().click();
	else {
		await page.getByRole('button', { name: /^(Menu|More controls)$/ }).click();
		await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
	}
	await page.getByRole('tab', { name: 'AI' }).click();
}

test('@smoke @crosswidth @webkit-phone @gecko a fresh sign-in refused at first reads activating, then Ready, never Key rejected', async ({ page }) => {
	const state = { accept: false };
	// A controllable clock: the 15 s re-check is advanced, not waited for (HARD RULE #32).
	await page.clock.install();
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
	await mockOpenRouter(page, state);
	await gotoStudio(page);
	// The redirect back from OpenRouter carries the code; the exchange mints MINTED.
	await page.goto('/studio/?code=good-code', { waitUntil: 'domcontentloaded' });
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lattice-db-or-minted'))).toMatch(/^\d+:5a5a$/);
	await openAiTab(page);

	const row = page.getByTestId('provider-row-openrouter-line');
	await expect(row).toContainText('OpenRouter is activating the key', { timeout: 30_000 });
	await expect(page.getByTestId('chat-model-card')).toContainText('OpenRouter is activating the key');
	await expect(page.getByText('Key rejected')).toHaveCount(0);
	await expect(row).not.toContainText('rejected');

	// OpenRouter starts accepting the key: the next re-check, 15 s on, clears the note by itself.
	state.accept = true;
	await page.clock.runFor(16_000);
	await expect(row).not.toContainText('activating');
	await expect(row).toContainText(/activated it \d+ s after it was made/);
	await expect(page.getByTestId('chat-model-card-state')).toHaveText('Ready');
	await expect(page.getByText('Key rejected')).toHaveCount(0);
});

test('@smoke @crosswidth @webkit-phone @gecko a pasted key that OpenRouter refuses reads rejected at once', async ({ page }) => {
	let reads = 0;
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (/\/api\/v1\/(auth\/)?key(\?|$)/.test(url)) {
			// The paste check passes (the key is stored); every later read refuses it.
			await route.fulfill(
				reads++ === 0
					? { status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' }
					: { status: 401, contentType: 'application/json', body: '{"error":{"message":"User not found.","code":401}}' },
			);
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
	});
	await gotoStudio(page);
	await openAiTab(page);
	await page.getByLabel('OpenRouter API key').fill(PASTED);
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(page.getByTestId('provider-row-openrouter')).toContainText('Key …6b6b');
	// The sealed copy is written after the memory one: reload only once it is stored.
	await expect.poll(() => storedOpenRouterRaw(page)).toMatch(/^v1:/);
	await page.reload();
	await openAiTab(page);
	await expect(page.getByTestId('provider-row-openrouter-line')).toContainText('rejected by OpenRouter', { timeout: 30_000 });
	await expect(page.getByTestId('provider-row-openrouter-line')).not.toContainText('activating');
});
