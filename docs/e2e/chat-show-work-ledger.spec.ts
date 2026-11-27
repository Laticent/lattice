import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE SHOW WORK LEDGER, ON THE REAL SURFACE (#3533 S01/S02). Each reply's Show work lists every model call with its cost, its
// input and the cached share of it, and its output; the metrics menu reads the same figures. The model is MOCKED, never spent
// (HARD RULE #24): the provider's answers are scripted, and everything after them (the transport, the chat agent's settling of
// a stopped round, the trace, the dialog and the menu) is the built Studio's own code.
//
// Three turns:
//   · a normal turn whose provider reports its cache use: the ledger shows the cached share, the total is exact;
//   · a turn whose provider sends no cache figure: the ledger and the menu say "unknown", never 0;
//   · a turn the author stops mid-stream: the stopped call is charged as an estimate and says so.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const TOOL_ROUND = (usage: Record<string, unknown>) => [
	{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1}' } }] } }] },
	{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
];
const ANSWER = 'Slide one opens on the claim it should.';

async function connect(page: Page) {
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
}

/** Two rounds through page.route: a tool call, then the answer, each with the usage block given. */
async function twoRounds(page: Page, usage1: Record<string, unknown>, usage2: Record<string, unknown>) {
	let round = 0;
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		round++;
		const frames = round === 1 ? TOOL_ROUND(usage1) : [{ id: 'g2', choices: [{ index: 0, delta: { content: ANSWER } }] }, { id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: usage2 }];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});
}

async function ask(page: Page, text: string) {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

async function ledger(page: Page) {
	await page.getByRole('button', { name: /^Show work/ }).last().click();
	const dialog = page.getByTestId('chat-trace');
	await expect(dialog).toBeVisible();
	return { dialog, rows: dialog.getByTestId('trace-round-ledger'), total: dialog.getByTestId('trace-total') };
}

async function metrics(page: Page) {
	await page.getByRole('button', { name: /^Chat metrics:/ }).click();
	const menu = page.getByTestId('chat-metrics');
	await expect(menu).toBeVisible();
	return menu;
}

test('a normal turn: each call shows its cached share, and the total is exact @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(90_000);
	await connect(page);
	await twoRounds(page, { prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011, prompt_tokens_details: { cached_tokens: 16000 } }, { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006, prompt_tokens_details: { cached_tokens: 16500 } });
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await ask(page, 'does slide one open well?');
	await expect(page.getByText(ANSWER)).toBeVisible({ timeout: 30_000 });

	const menu = await metrics(page);
	await menu.getByRole('button', { name: 'Context window: show details' }).click();
	// 16.5K of the last call's 18.4K came from cache.
	await expect(menu.getByText('90%', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');

	const { rows, total } = await ledger(page);
	await expect(rows).toHaveText(['$0.011 · 17K in (16K cached) · 80 out', '$0.006 · 18K in (17K cached) · 60 out']);
	await expect(total).toHaveText(/^Total \$0\.017 · 35K input over 2 calls, 18K at most in one$/);
	await page.screenshot({ path: test.info().outputPath('ledger-normal.png'), animations: 'disabled' });
});

test('a turn with no cache report: the ledger and the menu say "unknown", never 0 @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(90_000);
	await connect(page);
	// No `prompt_tokens_details` in either usage block: the provider said nothing about its cache.
	await twoRounds(page, { prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011 }, { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006 });
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await ask(page, 'does slide one open well?');
	await expect(page.getByText(ANSWER)).toBeVisible({ timeout: 30_000 });

	const menu = await metrics(page);
	await menu.getByRole('button', { name: 'Context window: show details' }).click();
	const cacheRow = menu.getByText('Read from cache').locator('..');
	await expect(cacheRow).toContainText('unknown');
	await expect(cacheRow).not.toContainText('0%');
	await page.keyboard.press('Escape');

	const { rows } = await ledger(page);
	await expect(rows).toHaveText(['$0.011 · 17K in (cache unknown) · 80 out', '$0.006 · 18K in (cache unknown) · 60 out']);
	await page.screenshot({ path: test.info().outputPath('ledger-unknown.png'), animations: 'disabled' });
});

test('a turn stopped mid-stream: the stopped call is charged as an estimate and marked as one @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(90_000);
	await connect(page);
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
	});
	// The completions stream lives in the page: page.route answers a request whole, and a Stop needs a stream the provider is
	// still sending. Round 1 answers in full; round 2 sends one chunk and then waits, until the author's Stop aborts it.
	await page.addInitScript(
		({ round1 }) => {
			const real = window.fetch.bind(window);
			let n = 0;
			window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				if (!url.startsWith('https://openrouter.ai/api/v1/chat/completions')) return real(input, init);
				n++;
				if (n === 1) return new Response(round1, { status: 200, headers: { 'content-type': 'text/event-stream' } });
				const signal = init?.signal;
				const chunk = new TextEncoder().encode(`data: ${JSON.stringify({ id: 'g2', choices: [{ index: 0, delta: { content: 'Tightening slide two' } }] })}\n\n`);
				const body = new ReadableStream<Uint8Array>({
					start(c) {
						c.enqueue(chunk);
						signal?.addEventListener('abort', () => c.error(new DOMException('The user aborted a request.', 'AbortError')));
					},
				});
				return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
			};
		},
		{ round1: sse(TOOL_ROUND({ prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011, prompt_tokens_details: { cached_tokens: 16000 } })) },
	);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await ask(page, 'tighten slide two');
	// The second call is streaming: its first words are on screen and the turn is still open.
	await expect(page.getByText('Tightening slide two')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();

	const menu = await metrics(page);
	await menu.getByRole('button', { name: 'This session: show details' }).click();
	// The reply's cost includes the stopped call's estimate, and the menu says so.
	await expect(menu.getByText('Last reply').locator('..')).toContainText('≈ $');
	await page.keyboard.press('Escape');

	const { dialog, rows, total } = await ledger(page);
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toHaveText('$0.011 · 17K in (16K cached) · 80 out');
	// Round 2 never reported its usage: our estimate, at the full input rate, with no cache figure to show.
	await expect(rows.nth(1)).toHaveText(/^≈ \$\d+\.\d+ · ≈ [\d.]+K in \(cache unknown\) · \d+ out$/);
	await expect(dialog.getByText('stopped, estimated')).toBeVisible();
	await expect(total).toHaveText(/^Total ≈ \$\d/);
	await page.screenshot({ path: test.info().outputPath('ledger-stopped.png'), animations: 'disabled' });
});
