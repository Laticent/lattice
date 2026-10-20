import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE ARCHITECT'S CHAT METRICS, SHOW WORK AND COMPACTION, ON THE REAL SURFACE (2026-10-20-chat-transparency.md).
//
// The model is MOCKED, not spent (HARD RULE #24). Round 1 streams some thinking and reads a layout; round 2 answers. The
// usage blocks carry what OpenRouter reports (cached and thinking tokens), which is where every number in the dropdown comes from.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE_1 = { prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011, prompt_tokens_details: { cached_tokens: 16000 }, completion_tokens_details: { reasoning_tokens: 50 } };
const USAGE_2 = { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006, prompt_tokens_details: { cached_tokens: 16500 }, completion_tokens_details: { reasoning_tokens: 20 } };

async function mockModel(page: import('@playwright/test').Page, onSummary?: () => void) {
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
		const body = JSON.parse(route.request().postData() ?? '{}');
		if (!body.stream) {
			onSummary?.();
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'The author is building a board deck on Q3 results. Revenue is $4.2M. Slide 2 uses the big-number layout; edits so far were applied.' } }], usage: { prompt_tokens: 3000, completion_tokens: 70, total_tokens: 3070, cost: 0.004 } }) });
			return;
		}
		round++;
		const frames =
			round % 2 === 1
				? [
						{ id: 'g1', choices: [{ index: 0, delta: { reasoning: 'The author asks about slide 2. ' } }] },
						{ id: 'g1', choices: [{ index: 0, delta: { reasoning: 'I should read the big-number layout first.' } }] },
						{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_component', arguments: '{"name":"big-number"}' } }] } }] },
						{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE_1 },
					]
				: [
						{ id: 'g2', choices: [{ index: 0, delta: { content: 'Slide 2 makes one claim with one number, which suits a slide built around a single figure.' } }] },
						{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE_2 },
					];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});
}

async function ask(page: import('@playwright/test').Page, text: string, expectReply = 'Slide 2 makes one claim') {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText(expectReply)).toBeVisible({ timeout: 30_000 });
}

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`the chat shows spend, context and a Show work trace with its commands at ${w}px`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width: w, height: h });
		await mockModel(page);
		await gotoStudio(page);
		await openChatAtWidth(page, w);
		await ask(page, 'does slide 2 work as a single number?');

		// The metrics dropdown: spend three ways, the window, and the last reply.
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		const menu = page.getByTestId('chat-metrics');
		await expect(menu).toBeVisible();
		await expect(menu.getByText('This session')).toBeVisible();
		await expect(menu.getByText('This deck')).toBeVisible();
		await expect(menu.getByText('Today')).toBeVisible();
		// Two model calls: $0.011 + $0.006. The window is the LAST call's input: 18.4K of 200K, 9%.
		await expect(menu.getByText('$0.017').first()).toBeVisible();
		await expect(menu.getByText('18K of 200K · 9%')).toBeVisible();
		await expect(menu.getByText('Model calls')).toBeVisible();
		await expect(menu.getByText(/thinking\)/)).toBeVisible();
		// The menu stays inside the viewport at every width.
		const box = await menu.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= w).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`metrics-${w}.png`) });
		await page.keyboard.press('Escape');

		// Show work: what was sent, and each call with its commands behind a link.
		await page.getByRole('button', { name: 'Show work' }).click();
		const dialog = page.getByTestId('chat-trace');
		await expect(dialog.getByText('Lattice primer')).toBeVisible();
		await expect(dialog.getByText('2 model calls')).toBeVisible();
		await dialog.getByText('Thinking', { exact: true }).click();
		await expect(dialog.getByText('I should read the big-number layout first.')).toBeVisible();
		await dialog.getByText('Read component', { exact: true }).click();
		await expect(dialog.getByText('{"name":"big-number"}')).toBeVisible();
		const dbox = await dialog.boundingBox();
		expect(dbox && dbox.x >= 0 && dbox.x + dbox.width <= w).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`trace-${w}.png`) });
	});
}

for (const [w, h] of [
	[1440, 900],
	[390, 844],
] as const) {
	test(`a long thread offers compaction, compacts to a briefing, and undoes at ${w}px`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: w, height: h });
		let summaries = 0;
		await mockModel(page, () => summaries++);
		await gotoStudio(page);
		await openChatAtWidth(page, w);
		await ask(page, 'does slide 2 work as a single number?');
		// Grow the saved thread to 24 messages, then reload so the panel reads it.
		await page.evaluate(() => {
			const key = Object.keys(localStorage).find((k) => k.startsWith('lattice-studio-chat-') && Array.isArray(JSON.parse(localStorage.getItem(k) || 'null')));
			if (!key) throw new Error('no saved chat');
			const msgs = JSON.parse(localStorage.getItem(key) || '[]');
			const filler = Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? { role: 'user', content: `Earlier question ${i / 2 + 1}: ${'detail '.repeat(60)}` } : { role: 'assistant', content: `Earlier answer ${(i - 1) / 2 + 1}: ${'detail '.repeat(60)}` }));
			localStorage.setItem(key, JSON.stringify([...filler, ...msgs]));
		});
		await page.reload();
		await gotoStudioReady(page, w);
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		const menu = page.getByTestId('chat-metrics');
		await expect(menu.getByText('Would compact')).toBeVisible();
		await expect(menu.getByText('Saves about')).toBeVisible();
		await expect(menu.getByText('Costs once')).toBeVisible();
		await page.screenshot({ path: test.info().outputPath(`compact-offer-${w}.png`) });
		await menu.getByRole('button', { name: 'Compact conversation' }).click();
		const divider = page.getByTestId('chat-compacted');
		await expect(divider).toBeVisible({ timeout: 20_000 });
		expect(summaries).toBe(1);
		await divider.getByText(/earlier messages compacted/).click();
		await expect(divider.getByText(/Revenue is \$4.2M/)).toBeVisible();
		await page.screenshot({ path: test.info().outputPath(`compact-done-${w}.png`) });
		// Undo puts the thread back, word for word.
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		await page.getByTestId('chat-metrics').getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByTestId('chat-compacted')).toHaveCount(0);
		await expect(page.getByText('Earlier question 1:', { exact: false })).toBeVisible();
	});
}

async function gotoStudioReady(page: import('@playwright/test').Page, w: number) {
	// After a reload the posture is re-seeded by gotoStudio's init script; only the panel needs reopening.
	await expect(page.getByRole('textbox', { name: 'Message the Architect' }).or(page.getByRole('button', { name: /Toggle Chat|Chat/ }).first())).toBeVisible({ timeout: 30_000 });
	if (!(await page.getByRole('textbox', { name: 'Message the Architect' }).isVisible())) await openChatAtWidth(page, w);
}
