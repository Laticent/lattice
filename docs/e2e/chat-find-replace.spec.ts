import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// FIND AND REPLACE FROM THE CHAT, ON THE REAL SURFACE (#3208 items 6 and 25).
//
// The model is MOCKED, not spent (HARD RULE #24). It reads slide 1's title from the deck brief the Studio really
// sends, calls find_text for it, then replace_text on slide 1. The spec checks that the tool ran in the page (its
// result comes back in the next request), that the author gets ONE card to apply, and that applying it changes the
// stored deck.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
type Msg = { role: string; content: unknown };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');
const toolCall = (name: string, args: unknown) => [
	{ id: 'g', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
];
const say = (t: string) => [
	{ id: 'g', choices: [{ index: 0, delta: { content: t } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
];

test('the chat finds a title and replaces it on one card the author applies', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable: the spec fails loudly on the missing control */
		}
	});
	const requests: Msg[][] = [];
	let title = '';
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		const body = JSON.parse(route.request().postData() || '{}') as { messages: Msg[] };
		requests.push(body.messages);
		let frames: unknown[];
		if (requests.length === 1) {
			// The deck brief's outline line for slide 1: `[1] "class" — "Title" · Nw`.
			const brief = body.messages.map((m) => text(m.content)).join('\n');
			title = JSON.parse(/\[1\] "[^"\n]*" — ("(?:[^"\\]|\\.)+")/.exec(brief)?.[1] ?? '""');
			frames = toolCall('find_text', { text: title });
		} else if (requests.length === 2) {
			frames = toolCall('replace_text', { find: title, replace: `${title} today`, slides: [1], summary: 'Added "today" to the title.' });
		} else frames = say('Added "today" to the title.');
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('add "today" to the first title');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	const apply = page.getByRole('button', { name: /^Apply/ });
	await expect(apply).toBeVisible({ timeout: 30_000 });
	expect(title).not.toBe('');
	// find_text ran in the page: its result is the tool message in the second request.
	const found = text(requests[1].find((m) => m.role === 'tool')?.content);
	expect(found).toContain(`${JSON.stringify(title)}: 1 match in 1 slide`);
	expect(found).toContain('[slide 1] heading:');
	// replace_text ran too: its result reached the model, or the turn settled on its summary.
	expect(requests.length).toBeGreaterThanOrEqual(2);
	await page.screenshot({ path: test.info().outputPath('chat-find-replace-card.png') });
	await apply.click();
	await expect.poll(() => page.evaluate((t) => Object.values(localStorage).some((v) => typeof v === 'string' && v.includes(`${t} today`)), title)).toBe(true);
});
