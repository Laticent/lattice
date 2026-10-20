import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE ACTIVITY ROW AND THE SHOW WORK SHEET, IN WEBKIT ON THE iPHONE 15 PRO PROFILE (PR #2821).
//
// The Chromium spec (chat-transparency.spec.ts) proves the layout; this one runs the same flow in WebKit, the engine Safari on an iPhone
// uses, with touch on, because the owner tested the earlier chat on an iPhone and found it heavy. It is WebKit with the iPhone's viewport and
// touch input, NOT an iPhone: Safari's address bar, the home-indicator safe area and finger momentum are still not exercised here.
//
// The model is MOCKED, not spent (HARD RULE #24): round 1 streams some thinking and reads a layout, round 2 answers.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE_1 = { prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011, prompt_tokens_details: { cached_tokens: 16000 }, completion_tokens_details: { reasoning_tokens: 50 } };
const USAGE_2 = { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006, prompt_tokens_details: { cached_tokens: 16500 }, completion_tokens_details: { reasoning_tokens: 20 } };

test('@webkit-phone a finished reply is one tappable line, and its sheet scrolls inside itself', async ({ page }) => {
	test.setTimeout(90_000);
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
			round % 2 === 1
				? [
						{ id: 'g1', choices: [{ index: 0, delta: { reasoning: '**Plan**\n\n- The author asks about slide 2.\n' } }] },
						{ id: 'g1', choices: [{ index: 0, delta: { reasoning: '- I should read the `big-number` layout first.' } }] },
						{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_component', arguments: '{"name":"big-number"}' } }] } }] },
						{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE_1 },
					]
				: [
						{ id: 'g2', choices: [{ index: 0, delta: { content: 'Slide 2 makes one claim with one number, which suits a slide built around a single figure.' } }] },
						{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE_2 },
					];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});

	const { width } = page.viewportSize() ?? { width: 390 };
	await gotoStudio(page);
	await openChatAtWidth(page, width);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('does slide 2 work as a single number?');
	await page.getByRole('button', { name: 'Send', exact: true }).tap();
	await expect(page.getByText('Slide 2 makes one claim')).toBeVisible({ timeout: 30_000 });

	// One line, no sideways scroll in the transcript.
	const row = page.getByTestId('chat-activity-row');
	await expect(row).toBeVisible();
	const rowBox = await row.boundingBox();
	expect(rowBox && rowBox.height < 56).toBe(true);
	const transcriptOverflow = await row.evaluate((el) => {
		const scroller = el.closest('.overflow-y-auto');
		return scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
	});
	expect(transcriptOverflow).toBeLessThanOrEqual(0);
	await page.screenshot({ path: test.info().outputPath('webkit-transcript.png') });

	// A tap opens the sheet; it fits the screen and has the trace in it.
	await row.tap();
	const sheet = page.getByTestId('chat-trace');
	await expect(sheet).toBeVisible();
	await expect(sheet).toHaveAttribute('data-slot', 'sheet-content');
	await expect(sheet.getByText('2 model calls')).toBeVisible();
	// The sheet slides up over 500 ms, so poll until it has settled instead of measuring it mid-flight.
	const vh = page.viewportSize()?.height ?? 0;
	await expect
		.poll(async () => {
			const box = await sheet.boundingBox();
			return !!box && box.x >= 0 && box.x + box.width <= width + 0.5 && box.y >= 0 && box.y + box.height <= vh + 0.5;
		})
		.toBe(true);

	// Open the longest section so there is something to scroll, then scroll the sheet's own scroller.
	await sheet.getByText('Read component', { exact: true }).tap();
	const scroller = sheet.locator('.overflow-y-auto').first();
	const before = await scroller.evaluate((el) => ({ top: el.scrollTop, room: el.scrollHeight - el.clientHeight, over: el.scrollWidth - el.clientWidth }));
	expect(before.over).toBeLessThanOrEqual(0); // nothing in the sheet scrolls sideways
	if (before.room > 0) {
		await scroller.evaluate((el) => el.scrollBy({ top: 200 }));
		const after = await scroller.evaluate((el) => el.scrollTop);
		expect(after).toBeGreaterThan(before.top);
	}
	await page.screenshot({ path: test.info().outputPath('webkit-sheet.png') });

	// Closing returns to the transcript, and the row is still there to open again.
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	await expect(row).toBeVisible();
});
