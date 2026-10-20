import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE CONTEXT METER FOLLOWS THE MODEL YOU PICK (PR #2819).
//
// The meter divides the last reply's input tokens by a window. It used to take the window the reply SAVED, which is the window of the
// model that wrote it, so switching models left the figure on the old window until the next reply. Here a reply is written on a 200K
// model, then the author picks a 1M model: the same 18.4K tokens must read as 9% of 200K, then 2% of 1.0M, with no new reply in between.
//
// The model is MOCKED, not spent (HARD RULE #24).

const MODELS = [
	{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } },
	{ id: 'test/big', name: 'Big Model', context_length: 1000000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } },
];
const USAGE = { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006, prompt_tokens_details: { cached_tokens: 16500 }, completion_tokens_details: { reasoning_tokens: 0 } };
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

for (const [w, h] of [
	[1440, 900],
	[390, 844],
] as const) {
	test(`the context figure re-measures against the model picked after a reply, at ${w}px`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width: w, height: h });
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
				localStorage.setItem('lattice-db-or-model', 'test/model');
				localStorage.setItem('lattice-db-dedup', 'off');
			} catch {
				/* storage unavailable: the spec fails loudly on the missing control */
			}
		});
		await page.route('https://openrouter.ai/**', async (route) => {
			const url = route.request().url();
			if (!url.includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
				return;
			}
			const frames = [
				{ id: 'g1', choices: [{ index: 0, delta: { content: 'Slide 2 makes one claim with one number.' } }] },
				{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
			];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});

		await gotoStudio(page);
		await openChatAtWidth(page, w);
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('does slide 2 work as a single number?');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(page.getByText('Slide 2 makes one claim')).toBeVisible({ timeout: 30_000 });

		// On the model that wrote the reply: 18.4K of 200K.
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		const menu = page.getByTestId('chat-metrics');
		await expect(menu.getByText('18K of 200K · 9%')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();

		// Pick the 1M model. No new reply is sent.
		await page.getByRole('button', { name: /^Model:/ }).click();
		await expect(page.getByRole('searchbox', { name: 'Search OpenRouter models' })).toBeVisible();
		await page.getByRole('tab', { name: 'All', exact: true }).click();
		await page.getByRole('searchbox', { name: 'Search OpenRouter models' }).fill('Big');
		await page.getByRole('radio', { name: /Big Model/ }).check();
		// Picking closes the picker by itself.
		await expect(page.getByRole('searchbox', { name: 'Search OpenRouter models' })).toBeHidden();
		await expect(page.getByRole('button', { name: /^Model: Big Model/ })).toBeVisible();

		// The same tokens, measured against the window of the model picked now.
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		await expect(menu.getByText('18K of 1.0M · 2%')).toBeVisible();
		await expect(menu.getByText('18K of 200K · 9%')).toHaveCount(0);
		await page.screenshot({ path: test.info().outputPath(`ring-after-switch-${w}.png`) });
	});
}
