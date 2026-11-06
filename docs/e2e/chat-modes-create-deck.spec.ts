import type { Page } from '@playwright/test';
import { checkpointLabels, expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE CHAT'S MODES AND create_deck, ON THE REAL SURFACE (engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4–§5).
//
// The model is MOCKED, not spent (HARD RULE #24). Each test scripts the model's rounds and reads what the built Studio
// SENT, so it proves the gates in code, not the model's manners:
//   · Review: create_deck draws a confirm the author presses; the new deck opens and the conversation follows it.
//   · Talk: the request carries no tool that can change anything, and the prompt says so.
//   · Auto: an edit applies with no Apply press.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
const NEW_DECK = '---\ntheme: cuoio\n---\n\n# Board update\n\n---\n\n## Revenue grew forty percent\n\nThe plan held.\n\n---\n\n## The ask\n\nApprove the hire.\n';

type Body = { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');
const toolCall = (name: string, args: unknown) => [
	{ id: 'g', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
];
const say = (t: string) => [
	{ id: 'g', choices: [{ index: 0, delta: { content: t } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
];

/** Serve the scripted rounds in order, recording every chat request body. */
async function mockModel(page: Page, rounds: unknown[][]): Promise<Body[]> {
	const bodies: Body[] = [];
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
		bodies.push(JSON.parse(route.request().postData() || '{}'));
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(rounds[Math.min(bodies.length, rounds.length) - 1]) });
	});
	return bodies;
}

async function send(page: Page, message: string) {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(message);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

/** Press the mode button until it reads `label`. */
async function setMode(page: Page, label: 'Talk' | 'Review' | 'Auto') {
	const button = page.getByRole('button', { name: /^Chat mode:/ });
	for (let i = 0; i < 3; i++) {
		if ((await button.getAttribute('aria-label'))?.startsWith(`Chat mode: ${label}.`)) return;
		await button.click();
	}
	await expect(button).toHaveAttribute('aria-label', new RegExp(`^Chat mode: ${label}\\.`));
}

test('Review: create_deck waits for the author, then opens the new deck and the chat follows @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	const bodies = await mockModel(page, [toolCall('create_deck', { title: 'Board update', markdown: NEW_DECK }), say('Your new deck is ready for you to confirm below.'), say('Slide 2 carries the number; it reads well.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await expect(page.getByRole('button', { name: /^Chat mode: Review\./ })).toBeVisible();
	await send(page, 'make me a new three-slide deck for the board');
	const card = page.getByRole('group', { name: 'Create a new deck: Board update' });
	await expect(card).toBeVisible({ timeout: 30_000 });
	// The card is drawn from the action's own fields: the slide headings, not the model's prose.
	await expect(card.getByText('Revenue grew forty percent')).toBeVisible();
	await expect(card.getByText('The ask')).toBeVisible();
	// Nothing exists until the author presses.
	// The seeded deck writes its source key only after a first edit, so count before the press.
	const before = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lattice-studio-src-')).length);
	expect(bodies[0].tools?.map((t) => t.function.name)).toContain('create_deck');
	await card.getByRole('button', { name: 'Create and open' }).click();
	await expect(page.getByText('Created “Board update”.', { exact: true })).toBeVisible({ timeout: 15_000 });
	// A DECK SOURCE now holds it (a `lattice-studio-src-` key whose value is the deck itself), not
	// only the chat transcript, which held the Markdown before the press too.
	// The store writes every value JSON-encoded (studio-store.ts `write`), so decode before reading.
	const deckSources = () =>
		page.evaluate(() =>
			Object.keys(localStorage)
				.filter((k) => k.startsWith('lattice-studio-src-'))
				.map((k) => {
					const raw = localStorage.getItem(k) ?? '';
					try {
						const v = JSON.parse(raw);
						return typeof v === 'string' ? v : raw;
					} catch {
						return raw;
					}
				}),
		);
	await expect.poll(async () => (await deckSources()).some((v) => v.startsWith('---') && v.includes('Revenue grew forty percent'))).toBe(true);
	expect((await deckSources()).length).toBe(before + 1);
	// The new deck's chat starts with one line pointing back, not a copy of the old thread.
	await expect(page.getByText('I created this 3-slide deck from our chat on the deck you were in before.')).toBeVisible();
	await expect(page.getByText('make me a new three-slide deck for the board')).toHaveCount(0);
	// And the next turn is about the new deck.
	await send(page, 'does slide 2 work?');
	await expect(page.getByText('Slide 2 carries the number; it reads well.')).toBeVisible({ timeout: 30_000 });
	const last = bodies[bodies.length - 1];
	expect(text(last.messages[last.messages.length - 1].content)).toContain('Revenue grew forty percent');
	await page.screenshot({ path: test.info().outputPath('chat-create-deck-1440.png') });
});

test('Review: Not now creates nothing @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockModel(page, [toolCall('create_deck', { title: 'Board update', markdown: NEW_DECK }), say('Ready to confirm below.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await send(page, 'make me a new deck');
	const card = page.getByRole('group', { name: 'Create a new deck: Board update' });
	await expect(card).toBeVisible({ timeout: 30_000 });
	await card.getByRole('button', { name: 'Not now' }).click();
	await expect(page.getByText('New deck not created')).toBeVisible();
	expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('lattice-studio-src-') && (localStorage.getItem(k) ?? '').includes('Revenue grew forty percent')))).toBe(false);
});

test('Talk: the request carries no tool that changes anything, and the prompt says so @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	const bodies = await mockModel(page, [say('I would tighten slide 2; switch to Review and I can make the change.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await setMode(page, 'Talk');
	await send(page, 'rewrite slide 2');
	await expect(page.getByText('switch to Review and I can make the change')).toBeVisible({ timeout: 30_000 });
	const names = bodies[0].tools?.map((t) => t.function.name) ?? [];
	expect(names).toContain('read_slides');
	for (const n of ['edit_slides', 'set_front_matter', 'create_deck', 'caption_asset']) expect(names).not.toContain(n);
	const system = bodies[0].messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n');
	expect(system).toContain('MODE — Talk');
	// Talk is the workspace's choice: it survives a reload.
	await page.reload();
	await openChatAtWidth(page, 1440);
	await expect(page.getByRole('button', { name: /^Chat mode: Talk\./ })).toBeVisible();
	// Auto never does: it lasts for the visit only.
	await setMode(page, 'Auto');
	await page.reload();
	await openChatAtWidth(page, 1440);
	await expect(page.getByRole('button', { name: /^Chat mode: Review\./ })).toBeVisible();
});

test('Auto: an edit applies with no Apply press, and History can undo it @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockModel(page, [toolCall('edit_slides', { edits: [{ action: 'insert', slide: 0, body: '# Auto put this first' }], summary: 'Added an opening slide.' }), say('Added an opening slide.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await setMode(page, 'Auto');
	await send(page, 'add an opening slide');
	await expect(page.getByText('Applied', { exact: true })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
	// The applied edit stays readable.
	await expect(page.getByText('What Auto changed')).toBeVisible();
	await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((v) => typeof v === 'string' && v.includes('# Auto put this first')))).toBe(true);
	// A History checkpoint, saved before the edit applied, so the author can undo it.
	await expect.poll(() => checkpointLabels(page)).toContain('Before AI chat edit (Auto)');
});

test('Auto leaves an edit that deletes slides for the author, and says why @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockModel(page, [toolCall('edit_slides', { edits: [{ action: 'delete', slide: 2 }], summary: 'Removed slide 2.' }), say('Removed slide 2.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await setMode(page, 'Auto');
	await send(page, 'remove slide 2');
	await expect(page.getByText('Auto left this for you to apply: it deletes slides.')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('button', { name: /^Apply/ })).toBeVisible();
});

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`the mode button fits the composer bar at ${w}px @crosswidth`, async ({ page }) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width: w, height: h });
		await mockModel(page, [say('ok')]);
		await gotoStudio(page);
		await openChatAtWidth(page, w);
		const button = page.getByRole('button', { name: /^Chat mode:/ });
		await expect(button).toBeVisible();
		const send = page.getByRole('button', { name: 'Send', exact: true });
		const [b, s] = await Promise.all([button.boundingBox(), send.boundingBox()]);
		expect(b && s && b.x + b.width <= s.x).toBe(true);
		const bar = await page.evaluate(() => {
			const el = document.querySelector('[aria-label="Send"]')?.parentElement;
			return el ? el.scrollWidth <= el.clientWidth + 1 : false;
		});
		expect(bar).toBe(true);
		await setMode(page, 'Auto');
		await page.screenshot({ path: test.info().outputPath(`chat-mode-${w}.png`) });
	});
}
