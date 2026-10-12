import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';


// THE STUDIO CHAT, ON THE REAL SURFACE: status line, Markdown, model chip.
//
// Three reports from one recording (2026-10-11): later turns showed a caret that did nothing,
// replies with tables printed raw pipes and numbered lists read "1. 1. 1.", and changing the
// model meant leaving the chat. The model is MOCKED, not spent (HARD RULE #24): the seeded key
// is a throwaway string and every openrouter.ai request is fulfilled here.
//
// Round one answers with a sentence and a tool call, then waits; round two waits again and
// answers with a table and a loose numbered list. The waits are what make the status line
// observable — a fulfilled route cannot stream, so a delay is the only way to hold a phase open.

const REPLY = ['**My score: 9.5 out of 10.**', '', '| Dimension | Score | Why |', '|---|:---:|---|', '| Argument and arc | 9.5 | The headings carry the argument. |', '| Voice and intent | 9.8 | It reads as your preferences. |', '', "What's left", '', '1. **The ask has no priority.** Slide 40 lists four things.', '', '1. **The ending says the same thing four times.** Slides 40, 51, 52 and 53.', '', '1. **The opening is four slides on one idea.** Slides 3 to 6.'].join('\n');

const MODELS = [
	{ id: '~anthropic/claude-sonnet-latest', name: 'Anthropic: Claude Sonnet 5.5', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] }, top_provider: { max_completion_tokens: 64000 } },
	{ id: 'google/gemini-3-flash', name: 'Google: Gemini 3 Flash', context_length: 1000000, pricing: { prompt: '0.0000003', completion: '0.0000025' }, architecture: { input_modalities: ['text', 'image'] }, top_provider: { max_completion_tokens: 64000 } },
];

const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.02 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test.describe(`at ${w}px`, () => {
		test.use({ viewport: { width: w, height: h } });
		test('the chat names its phase every turn, renders tables and real numbering, and switches model from the header', async ({ page }) => {
	test.setTimeout(120_000);
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the spec fails loudly on the missing control */
		}
	});
	let round = 0;
	const models: string[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		models.push(route.request().postDataJSON().model);
		round++;
		await wait(1800);
		const frames =
			round === 1
				? [
						{ id: 'g1', choices: [{ index: 0, delta: { content: "I'll read the slides first." } }] },
						{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1,"to":2}' } }] } }] },
						{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
					]
				: [
						{ id: 'g2', choices: [{ index: 0, delta: { content: REPLY } }] },
						{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
					];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});

	await gotoStudio(page);
	await openChatAtWidth(page, w);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('evaluate and score the deck');
	await page.getByRole('button', { name: 'Send', exact: true }).click();

	// Round one is held open: the line says so before a single token has arrived.
	const status = page.getByTestId('chat-live-status');
	await expect(status).toHaveText('Thinking…');
	// Prose and a tool call arrive; round two is then held open. Between them the line never
	// disappears, which is the whole report — it was a dead caret here.
	await expect(page.getByText("I'll read the slides first.")).toBeVisible({ timeout: 15_000 });
	await expect(status).toBeVisible();
	await expect(page.getByText('My score: 9.5 out of 10.')).toBeVisible({ timeout: 30_000 });
	await expect(status).toHaveCount(0);

	// A real table, and ONE ordered list with three items (it read 1. 1. 1. as three lists).
	const reply = page.locator('.cm-chat-md').last();
	await expect(reply.locator('table.cm-md-table')).toHaveCount(1);
	await expect(reply.locator('tbody tr')).toHaveCount(2);
	await expect(reply.locator('ol')).toHaveCount(1);
	await expect(reply.locator('ol > li')).toHaveCount(3);
	// What the author reads: the markers are 1, 2, 3 — the browser's own counter, not our markup.
	const markers = await reply.locator('ol > li').evaluateAll((lis) => lis.map((li) => (li.parentElement as HTMLOListElement).start + [...(li.parentElement as HTMLElement).children].indexOf(li)));
	expect(markers).toEqual([1, 2, 3]);

	// The chat has no horizontal scrollbar of its own — a wide table scrolls inside its wrapper.
	const scroller = page.locator('.cm-chat-md').last().locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
	expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth), `the transcript scrolls sideways at ${w}px`).toBeLessThanOrEqual(1);
	await page.screenshot({ path: test.info().outputPath(`chat-polish-${w}.png`) });

	// The header chip: one model name, and the picker lives behind it.
	const chip = page.getByRole('button', { name: /Change model/ });
	await expect(chip).toBeVisible();
	await chip.click();
	await expect(page.getByText('Ask a question')).toBeVisible();
	await expect(page.getByText('Make an edit')).toBeVisible();
	await page.getByRole('tab', { name: 'All' }).click();
	await page.getByRole('radio', { name: /Gemini 3 Flash/ }).check();
	await expect(page.getByLabel('Search OpenRouter models')).toHaveCount(0);
	await expect(chip).toContainText('Gemini 3 Flash');
	await page.screenshot({ path: test.info().outputPath(`chat-polish-chip-${w}.png`) });

	// The next turn goes out on the model that was picked.
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('and again');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect.poll(() => models.length, { timeout: 15_000 }).toBeGreaterThan(2);
	expect(models.at(-1)).toBe('google/gemini-3-flash');
});
	});
}
