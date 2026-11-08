import { expect, gotoStudio, openChatAtWidth, setEditorContent, test } from './studio-fixture';

// THE MODEL SPINE on the real Studio (engineering/decisions/2026-11-07-studio-model-spine.md).
//
// One stored chat selection and one stored voice selection decide who answers and who speaks:
// they survive a reload, follow another tab, are pinned for a whole chat turn, never fall back
// to another model while a key opens, and stay independent of each other. Present reads in the
// selected voice, and saving a key selects its provider (owner decision 3).
//
// MOCKED, NOT SPENT (HARD RULE #24): every openrouter.ai and Gemini request is answered by a
// route handler, and the keys are throwaway strings. `SPINE_SHOTS=<dir>` saves screenshots.

type Page = Parameters<typeof gotoStudio>[0];

const MODELS = [
	{ id: 'test/model', name: 'Test Model', context_length: 200000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } },
	{ id: 'test/big', name: 'Big Model', context_length: 1000000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } },
	{ id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', pricing: { prompt: '0.0000006', completion: '0' }, architecture: { input_modalities: ['text'], output_modalities: ['speech'] }, supported_voices: ['af_heart', 'af_bella'] },
];
const USAGE = { prompt_tokens: 1200, completion_tokens: 40, total_tokens: 1240, cost: 0.001 };
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const textReply = (text: string) => sse([{ id: 'g', choices: [{ index: 0, delta: { content: text } }] }, { id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE }]);
const toolReply = () =>
	sse([
		{ id: 't', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call1', type: 'function', function: { name: 'read_slides', arguments: '{"from":1}' } }] } }] },
		{ id: 't', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
	]);
const OR_KEY = 'sk-or-v1-e2e-spine-mock-key-0a0a';
const SEL = (o: object) => JSON.stringify({ v: 1, last: {}, ...o });
const shot = async (page: Page, name: string) => {
	if (process.env.SPINE_SHOTS) await page.screenshot({ path: `${process.env.SPINE_SHOTS}/${name}.png` });
};

/** Seed storage once (not on reload), plus a stubbed browser built-in model. */
async function seed(page: Page, entries: Record<string, string>, { promptApi = true } = {}) {
	await page.addInitScript(
		([e, p]) => {
			if (!sessionStorage.getItem('spine-seeded')) {
				for (const [k, v] of Object.entries(e as Record<string, string>)) localStorage.setItem(k, v);
				localStorage.setItem('lattice-db-dedup', 'off');
				sessionStorage.setItem('spine-seeded', '1');
			}
			if (p) {
				const w = window as unknown as { LanguageModel: unknown; __promptApiUsed: number };
				w.__promptApiUsed = 0;
				w.LanguageModel = {
					availability: async () => 'available',
					create: async () => {
						w.__promptApiUsed++;
						return { prompt: async () => 'from the built-in model', promptStreaming: async function* () { yield 'from the built-in model'; }, destroy() {} };
					},
				};
			}
		},
		[entries, promptApi] as const,
	);
}

/** Answer openrouter.ai; `chat` handles each chat request (its parsed body) and returns the SSE body. */
async function mockOpenRouter(page: Page, chat: (body: { model: string }, n: number) => Promise<string> | string = () => textReply('ok')) {
	let n = 0;
	const seen = { chat: [] as string[], speech: [] as { model: string; voice: string }[] };
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/chat/completions')) {
			const body = JSON.parse(route.request().postData() || '{}');
			seen.chat.push(body.model);
			const out = await chat(body, ++n);
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: out });
			return;
		}
		if (url.includes('/audio/speech')) {
			const body = JSON.parse(route.request().postData() || '{}');
			seen.speech.push({ model: body.model, voice: body.voice });
			await route.fulfill({ status: 500, body: 'mock: no audio' });
			return;
		}
		if (url.includes('/auth/key')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' });
		const body = url.includes('/models') ? { data: MODELS } : { data: [] };
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
	});
	return seen;
}

async function openWorkspaceAi(page: Page) {
	const header = page.locator('button[aria-label="Workspace settings"]:visible');
	if (await header.count()) await header.first().click();
	else {
		await page.getByRole('button', { name: /^(Menu|More controls)$/ }).click();
		await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
	}
	await page.getByRole('tab', { name: 'AI' }).click();
	return { chat: page.getByTestId('chat-model-card'), voice: page.getByTestId('voice-model-card') };
}

async function useBuiltIn(page: Page) {
	await page.getByTestId('chat-model-card').getByRole('button', { name: /Change/ }).click();
	await page.getByRole('group', { name: 'Chat model source' }).getByRole('radio', { name: /On-device/ }).click();
	await page.locator('div.rounded-xl', { hasText: 'Browser built-in' }).getByRole('button', { name: 'Use' }).click();
}

async function send(page: Page, text: string) {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

const stored = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);

test('@crosswidth @webkit-phone @webkit-tablet @gecko the chat and voice selections survive a reload', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY });
	await mockOpenRouter(page);
	await gotoStudio(page);
	const ws = await openWorkspaceAi(page);
	await useBuiltIn(page);
	await expect(ws.chat.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');
	await ws.voice.getByRole('button', { name: /Change/ }).click();
	await page.getByRole('group', { name: 'Voice engine' }).getByRole('radio', { name: 'On-device' }).click();
	await expect(ws.voice.getByTestId('voice-model-card-name')).toHaveText(/^Kokoro/);

	await page.reload();
	const again = await openWorkspaceAi(page);
	await expect(again.chat.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');
	await expect(again.chat.getByTestId('chat-model-card-state')).toHaveText('Active');
	await expect(again.voice.getByTestId('voice-model-card-name')).toHaveText(/^Kokoro/);
	expect(await stored(page, 'lattice-studio-chat-selection')).toMatchObject({ v: 1, source: 'device', provider: 'prompt-api' });
	expect(await stored(page, 'lattice-studio-voice-selection')).toMatchObject({ v: 1, source: 'device', provider: 'kokoro' });
	await shot(page, `workspace-ai-${page.viewportSize()?.width}`);
});

test('@webkit-tablet @gecko a model switch in the middle of a turn does not change who answers the rest of it', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-chat-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'test/model' }) });
	const seen = await mockOpenRouter(page, async (_body, n) => {
		if (n === 1) {
			// The author picks another model while round 1 is answering (as the chip or the Workspace would).
			await page.evaluate((rec) => {
				localStorage.setItem('lattice-studio-chat-selection', rec);
				window.dispatchEvent(new Event('db-model-changed'));
			}, SEL({ source: 'cloud', provider: 'openrouter', model: 'test/big' }));
			return toolReply();
		}
		return textReply('Slide 1 reads well.');
	});
	await gotoStudio(page);
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	await send(page, 'does slide 1 read well?');
	await expect(page.getByText('Slide 1 reads well.')).toBeVisible({ timeout: 30_000 });
	expect(seen.chat.length).toBeGreaterThanOrEqual(2);
	expect(new Set(seen.chat), 'every round of the turn ran on the model pinned at its start').toEqual(new Set(['test/model']));
	// The NEXT turn runs on the new selection, and the chip already names it.
	await expect(page.getByTestId('chat-model-chip-name')).toHaveText('Big Model');
	await send(page, 'and slide 2?');
	await expect.poll(() => seen.chat.at(-1)).toBe('test/big');
});

test('@crosswidth @webkit-tablet @gecko the chip names the model that answered, and picking in the chip is the global selection', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-chat-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'test/model' }) });
	const seen = await mockOpenRouter(page, () => textReply('Answered.'));
	await gotoStudio(page);
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	const chip = page.getByTestId('chat-model-chip-name');
	await expect(chip).toHaveText('Test Model');
	await send(page, 'hello');
	await expect(page.getByText('Answered.')).toBeVisible({ timeout: 30_000 });
	expect(seen.chat).toEqual(['test/model']);
	await shot(page, `chat-chip-${page.viewportSize()?.width}`);

	await chip.click();
	await page.getByRole('tab', { name: 'All', exact: true }).click();
	await page.getByRole('searchbox', { name: 'Search OpenRouter models' }).fill('Big');
	await page.getByRole('radio', { name: /Big Model/ }).check();
	await expect(chip).toHaveText('Big Model');
	expect(await stored(page, 'lattice-studio-chat-selection')).toMatchObject({ provider: 'openrouter', model: 'test/big' });
	await send(page, 'again');
	await expect.poll(() => seen.chat.at(-1)).toBe('test/big');
	// The Workspace shows the same selection (on a phone the chat is a sheet: close it first).
	await page.keyboard.press('Escape');
	const ws = await openWorkspaceAi(page);
	await expect(ws.chat.getByTestId('chat-model-card-name')).toHaveText('Big Model');
});

test('@webkit-tablet @gecko another tab follows a selection change without a reload', async ({ page, context }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-chat-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'test/model' }) });
	await mockOpenRouter(page);
	await gotoStudio(page);
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	await expect(page.getByTestId('chat-model-chip-name')).toHaveText('Test Model');

	const other = await context.newPage();
	await seed(other, {});
	await mockOpenRouter(other);
	await gotoStudio(other);
	await openWorkspaceAi(other);
	await useBuiltIn(other);
	await expect(other.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');

	// The first tab never reloaded: the storage event brought the change.
	await expect(page.getByTestId('chat-model-chip-name')).toHaveText('Browser built-in model');
});

test('@webkit-tablet @gecko a chosen direct key that is still opening reads "still opening": no OpenRouter, no built-in model', async ({ page }) => {
	// The race: the sealed Anthropic key cannot be opened yet. The secrets database answers every
	// open with a transient error, so the key stays stored but closed (lib/openrouter-key.js keeps
	// retrying) — the window in which the old ladder fell through to another model.
	await page.addInitScript(() => {
		// On the prototype: WebKit does not let an own property shadow `indexedDB.open`.
		const proto = IDBFactory.prototype;
		const open = proto.open;
		proto.open = function (this: IDBFactory, name: string, v?: number) {
			if (name !== 'lattice-secrets') return open.call(this, name, v);
			const req = { error: new DOMException('transient', 'UnknownError') } as unknown as IDBOpenDBRequest & { onerror: ((e: unknown) => void) | null };
			queueMicrotask(() => queueMicrotask(() => req.onerror?.({ target: req })));
			return req;
		} as typeof proto.open;
	});
	await seed(page, {
		'lattice-db-or-key': OR_KEY, // a working OpenRouter key, which the old ladder would have billed
		'lattice-db-anthropic-key': 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBB',
		'lattice-studio-chat-selection': SEL({ source: 'cloud', provider: 'anthropic', model: 'claude-sonnet-5-5' }),
	});
	const seen = await mockOpenRouter(page);
	await gotoStudio(page);
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	await send(page, 'hello');
	await expect(page.getByText(/Your API key is still opening/)).toBeVisible({ timeout: 30_000 });
	expect(seen.chat).toEqual([]);
	expect(await page.evaluate(() => (window as unknown as { __promptApiUsed: number }).__promptApiUsed)).toBe(0);
});

test('@crosswidth @webkit-tablet @gecko the voice selection is independent of the chat selection', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-voice-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella' }) });
	await mockOpenRouter(page);
	await gotoStudio(page);
	const ws = await openWorkspaceAi(page);
	await expect(ws.voice.getByTestId('voice-model-card-name')).toHaveText(/Bella/);
	await useBuiltIn(page);
	await expect(ws.chat.getByTestId('chat-model-card-name')).toHaveText('Browser built-in model');
	await expect(ws.voice.getByTestId('voice-model-card-name')).toHaveText(/Bella/);
	expect(await stored(page, 'lattice-studio-voice-selection')).toMatchObject({ provider: 'openrouter', voice: 'af_bella' });
	// And the other way round: changing the voice leaves chat alone.
	await ws.voice.getByRole('button', { name: /Change/ }).click();
	await page.getByRole('group', { name: 'Voice engine' }).getByRole('radio', { name: 'On-device' }).click();
	expect(await stored(page, 'lattice-studio-chat-selection')).toMatchObject({ provider: 'prompt-api' });
});

test('@webkit-tablet @gecko Present reads in the selected voice and names it', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-voice-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella' }) });
	const seen = await mockOpenRouter(page);
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: indaco\n---\n\n# Spine\n\n<!-- say: The selected voice reads this line. -->\n\n---\n\n# Two\n');
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const voice = dialog.getByRole('button', { name: /^Voice (on|off)/ });
	if ((await voice.getAttribute('aria-pressed')) !== 'true') await voice.click();
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	await expect.poll(() => seen.speech.length, { timeout: 30_000 }).toBeGreaterThan(0);
	expect(seen.speech[0]).toEqual({ model: 'hexgrad/kokoro-82m', voice: 'af_bella' });
	if ((page.viewportSize()?.width ?? 0) >= 640) await expect(voice).toContainText('Bella · OpenRouter');
	await shot(page, `present-voice-${page.viewportSize()?.width}`);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko saving a Gemini key selects its chat model, and its voice when the current voice has no key', async ({ page }) => {
	const GEM = 'AIzaE2eSpineGeminiKey0000a1b2';
	await seed(page, { 'lattice-studio-voice-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella' }) }, { promptApi: false });
	await mockOpenRouter(page);
	const gemini = { calls: [] as string[] };
	await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
		const req = route.request();
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		gemini.calls.push(req.url());
		const url = req.url().split('?')[0];
		if (url.endsWith('/openai/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'models/gemini-3.8-flash' }] }) });
		if (url.endsWith('/v1beta/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-tts' }, { name: 'models/gemini-3.8-flash-lite-tts' }] }) });
		if (url.endsWith('/v1beta/voices')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voices: [{ id: 'Kore' }, { id: 'Puck' }] }) });
		return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
	});
	await gotoStudio(page);
	const ws = await openWorkspaceAi(page);
	await expect(ws.chat.getByTestId('chat-model-card-state')).toHaveText('Add a key');
	await page.getByRole('group', { name: 'Key provider' }).getByRole('button', { name: 'Gemini', exact: true }).click();
	await page.getByLabel('Gemini API key').fill(GEM);
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(ws.chat).toContainText('Gemini · your own key');
	await expect(ws.chat.getByTestId('chat-model-card-state')).toHaveText('Active');
	// The OpenRouter voice had no key, so Gemini's voice was selected too.
	expect(await stored(page, 'lattice-studio-voice-selection')).toMatchObject({ source: 'cloud', provider: 'gemini' });
	await expect(ws.voice).toContainText('Gemini · your own key');
});
