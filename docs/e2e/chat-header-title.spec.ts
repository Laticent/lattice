import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE CHAT HEADER KEEPS ITS TITLE BESIDE A LONG MODEL NAME (followup 2821-p1).
//
// On a phone the Chat sheet's header carries the model chip and the session figure in its actions slot. The slot held its
// full width and the title gave way, so with a model named like "Anthropic: Claude Sonnet 4.5" the owner's iPhone showed
// "C". The other chat specs mock a model called "Test Model", which fits, so none of them could see it.
//
// The model is MOCKED, not spent (HARD RULE #24). Runs in Chromium at 390 px (`mobile`) and in WebKit on the iPhone 15 Pro
// profile (`webkit-phone`) — WebKit with the iPhone's viewport and touch, NOT an iPhone.

const LONG = { id: 'anthropic/claude-sonnet-4.5', name: 'Anthropic: Claude Sonnet 4.5 (thinking, extended context)' };
const MODELS = [{ ...LONG, context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];

async function mockLongModel(page: import('@playwright/test').Page) {
	await page.addInitScript((id) => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', id);
		} catch {
			/* storage unavailable: the spec fails loudly on the missing control */
		}
	}, LONG.id);
	await page.route('https://openrouter.ai/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/models') ? { data: MODELS } : { data: [] }) }));
}

test('@mobile @webkit-phone the Chat title is not clipped beside a long model name', async ({ page }) => {
	await mockLongModel(page);
	const { width } = page.viewportSize() ?? { width: 390 };
	await gotoStudio(page);
	await openChatAtWidth(page, width);

	const sheet = page.getByRole('dialog', { name: 'Chat' });
	const chip = sheet.getByRole('button', { name: /^Model: .*Change model$/ });
	await expect(chip).toBeVisible();
	// The title shows "Chat" in full: its box is as wide as its text.
	const title = sheet.getByRole('heading', { name: 'Chat', exact: true });
	const fit = await title.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
	expect(fit.scroll).toBeLessThanOrEqual(fit.client);
	// The chip still names the model, if shortened, and nothing in the header leaves the screen.
	await expect(chip).toContainText(/Claude|Sonnet|Anthropic/);
	const header = await chip.evaluate((el) => {
		let row: Element | null = el;
		while (row && !String(row.getAttribute('class')).includes('h-14')) row = row.parentElement;
		const r = row?.getBoundingClientRect();
		return { right: r?.right ?? 0, over: row ? row.scrollWidth - row.clientWidth : 0 };
	});
	expect(header.over).toBeLessThanOrEqual(0);
	expect(header.right).toBeLessThanOrEqual(width + 0.5);
	await page.screenshot({ path: test.info().outputPath('chat-header.png') });
});
