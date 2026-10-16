import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE LINE UNDER AN ARCHITECT REPLY, ON THE REAL SURFACE (2026-10-13-studio-chat-polish.md §4e).
//
// It read "Read big-number · Checked the deck" in 10.5px labels; it is one sentence now. The model is MOCKED, not
// spent (HARD RULE #24): the first round calls read_component for a layout, the second answers. A question that read a
// doc and changed nothing must show the answer and the sentence, and no diff card.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`a question that read a layout doc shows its answer, one activity sentence and no diff card at ${w}px`, async ({ page }) => {
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
		let round = 0;
		await page.route('https://openrouter.ai/**', async (route) => {
			const url = route.request().url();
			if (!url.includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
				return;
			}
			round++;
			const frames =
				round === 1
					? [
							{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_component', arguments: '{"name":"big-number"}' } }] } }] },
							{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
						]
					: [
							{ id: 'g2', choices: [{ index: 0, delta: { content: 'Slide 2 makes one claim with one number, which suits a slide built around a single figure.' } }] },
							{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
						];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});
		await gotoStudio(page);
		await openChatAtWidth(page, w);
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('does slide 2 work as a single number?');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(page.getByText('Slide 2 makes one claim with one number')).toBeVisible({ timeout: 30_000 });
		const line = page.getByText('Read about the big number layout.', { exact: true });
		await expect(line).toBeVisible();
		expect(await line.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11.5);
		// No edit was made, so there is nothing to apply.
		await expect(page.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
		await page.screenshot({ path: test.info().outputPath(`chat-activity-${w}.png`) });
	});
}
