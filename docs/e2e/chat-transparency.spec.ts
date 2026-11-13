import { routeHolds } from './route-hold';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE ARCHITECT'S CHAT METRICS, SHOW WORK AND COMPACTION, ON THE REAL SURFACE (2026-10-20-chat-transparency.md).
//
// The model is MOCKED, not spent (HARD RULE #24). Round 1 streams some thinking and reads a layout; round 2 answers. The
// usage blocks carry what OpenRouter reports (cached and thinking tokens), which is where every number in the dropdown comes from.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE_1 = { prompt_tokens: 17000, completion_tokens: 80, total_tokens: 17080, cost: 0.011, prompt_tokens_details: { cached_tokens: 16000 }, completion_tokens_details: { reasoning_tokens: 50 } };
const USAGE_2 = { prompt_tokens: 18400, completion_tokens: 60, total_tokens: 18460, cost: 0.006, prompt_tokens_details: { cached_tokens: 16500 }, completion_tokens_details: { reasoning_tokens: 20 } };

/** With `summaryHolds`, the compaction's summary call stays open until the test releases it. */
async function mockModel(page: import('@playwright/test').Page, onSummary?: () => void, summaryHolds?: ReturnType<typeof routeHolds>) {
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
			await summaryHolds?.hold();
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'The author is building a board deck on Q3 results. Revenue is $4.2M. Slide 2 uses the big-number layout; edits so far were applied.' } }], usage: { prompt_tokens: 3000, completion_tokens: 70, total_tokens: 3070, cost: 0.004 } }) });
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

		// What the Architect did is ONE line under the reply, and nothing in the transcript scrolls sideways.
		const row = page.getByTestId('chat-activity-row');
		await expect(row).toBeVisible();
		const rowBox = await row.boundingBox();
		expect(rowBox && rowBox.height < 48).toBe(true);
		const overflowX = await row.evaluate((el) => {
			const scroller = el.closest('.overflow-y-auto');
			return scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
		});
		expect(overflowX).toBeLessThanOrEqual(0);
		await page.screenshot({ path: test.info().outputPath(`transcript-${w}.png`) });

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
		// The thinking is markdown: a bold heading and a real list, not asterisks and dashes.
		await expect(dialog.locator('strong', { hasText: 'Plan' })).toBeVisible();
		await expect(dialog.locator('li', { hasText: 'I should read the' })).toBeVisible();
		await expect(dialog.getByText('**Plan**')).toHaveCount(0);
		// Raw shows the exact characters the model sent; Formatted brings the markdown back.
		await dialog.getByRole('button', { name: 'Raw' }).click();
		await expect(dialog.locator('pre', { hasText: '**Plan**' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Formatted' }).click();
		await expect(dialog.locator('strong', { hasText: 'Plan' })).toBeVisible();
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
		const thread = await savedThread(page, 2); // the question and its reply
		const filler = Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? { role: 'user', content: `Earlier question ${i / 2 + 1}: ${'detail '.repeat(60)}` } : { role: 'assistant', content: `Earlier answer ${(i - 1) / 2 + 1}: ${'detail '.repeat(60)}` }));
		await writeThread(page, thread.deckId, [...filler, ...thread.messages]);
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

test('sending is held while a compaction runs, so the new message is never dropped and Undo cannot delete it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	const summary = routeHolds();
	await mockModel(page, undefined, summary);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await ask(page, 'does slide 2 work as a single number?');
	const thread = await savedThread(page, 2); // the question and its reply
	const filler = Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? { role: 'user', content: `Earlier question ${i / 2 + 1}` } : { role: 'assistant', content: `Earlier answer ${(i - 1) / 2 + 1}` }));
	await writeThread(page, thread.deckId, [...filler, ...thread.messages]);
	const seeded = filler.length + thread.messages.length;
	await page.reload();
	await gotoStudioReady(page, 1440);
	await page.getByRole('button', { name: /^Chat metrics:/ }).click();
	await page.getByTestId('chat-metrics').getByRole('button', { name: 'Compact conversation' }).click();
	// While the summary is in flight (held open by the mock), try to send: it must be refused.
	await summary.held();
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('a message typed mid-compaction');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await summary.release();
	await expect(page.getByTestId('chat-compacted')).toBeVisible({ timeout: 20_000 });
	// Nothing was sent: the text is still in the composer and no such message is in the thread.
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toHaveValue('a message typed mid-compaction');
	// Read the thread the compaction STORED (it is shorter than the seeded one), so the absence below is read from the
	// write that would have carried the message, not from a store that has not caught up yet.
	await expect.poll(async () => (await savedThread(page)).messages.length, { message: 'the compacted thread was never stored' }).toBeLessThan(seeded);
	const saved = (await savedThread(page)).messages;
	expect(saved.some((m) => m.content === 'a message typed mid-compaction')).toBe(false);
});

type Thread = { deckId: string; messages: { role: string; content: string }[] };

/**
 * The deck's saved chat thread, from the Studio's chats database (`chat-store.ts`, #3138: one `{ deckId, messages }`
 * record per deck in `lattice-studio-chats` / `chats`). Chats left localStorage in #3138, which is what turned this
 * file's localStorage reads into "no saved chat" on every run. Waits until the stored thread holds `min` messages: a
 * seed written before the reply's own write has landed would be overwritten by it.
 */
async function savedThread(page: import('@playwright/test').Page, min = 1): Promise<Thread> {
	const read = () =>
		page.evaluate(
			() =>
				new Promise<Thread | null>((resolve, reject) => {
					const open = indexedDB.open('lattice-studio-chats');
					open.onerror = () => reject(open.error);
					open.onsuccess = () => {
						const db = open.result;
						if (!db.objectStoreNames.contains('chats')) {
							db.close();
							return resolve(null);
						}
						const all = db.transaction('chats').objectStore('chats').getAll();
						all.onerror = () => reject(all.error);
						all.onsuccess = () => {
							db.close();
							const rows = (all.result as Thread[]).filter((r) => Array.isArray(r?.messages) && r.messages.length > 0);
							resolve(rows.length === 1 ? rows[0] : null);
						};
					};
				}),
		);
	await expect.poll(async () => (await read())?.messages.length ?? 0, { message: 'no chat thread was saved' }).toBeGreaterThanOrEqual(min);
	return (await read()) as Thread;
}

/** Replace the deck's stored thread; a reload then reads it (the Studio hydrates each deck's thread on load). */
async function writeThread(page: import('@playwright/test').Page, deckId: string, messages: Thread['messages']): Promise<void> {
	await page.evaluate(
		({ deckId, messages }) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('lattice-studio-chats');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const t = db.transaction('chats', 'readwrite');
					t.objectStore('chats').put({ deckId, messages });
					t.oncomplete = () => {
						db.close();
						resolve();
					};
					t.onerror = () => reject(t.error);
				};
			}),
		{ deckId, messages },
	);
}

async function gotoStudioReady(page: import('@playwright/test').Page, w: number) {
	// After a reload the posture is re-seeded by gotoStudio's init script; only the panel needs reopening.
	await expect(page.getByRole('textbox', { name: 'Message the Architect' }).or(page.getByRole('button', { name: /Toggle Chat|Chat/ }).first())).toBeVisible({ timeout: 30_000 });
	if (!(await page.getByRole('textbox', { name: 'Message the Architect' }).isVisible())) await openChatAtWidth(page, w);
}
