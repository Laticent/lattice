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
		if (/\/api\/v1\/(auth\/)?key(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' });
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
	await expect(again.chat.getByTestId('chat-model-card-state')).toHaveText('Ready');
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

test('@crosswidth @webkit-tablet @gecko the chip reaches every source: a saved provider and the on-device models', async ({ page }) => {
	await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-chat-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'test/model' }) });
	await mockOpenRouter(page);
	await gotoStudio(page);
	await openChatAtWidth(page, page.viewportSize()?.width ?? 1440);
	const chip = page.getByTestId('chat-model-chip-name');
	await expect(chip).toHaveText('Test Model');
	await chip.click();
	await page.getByRole('radiogroup', { name: 'Chat source' }).getByRole('radio', { name: 'On-device' }).click();
	await page.getByRole('radiogroup', { name: 'On-device model' }).getByRole('radio', { name: /Browser built-in/ }).click();
	await expect(chip).toHaveText('Browser built-in model');
	expect(await stored(page, 'lattice-studio-chat-selection')).toMatchObject({ source: 'device', provider: 'prompt-api' });
	// And back to OpenRouter, on the model last picked there.
	await page.getByRole('radiogroup', { name: 'Chat source' }).getByRole('radio', { name: 'OpenRouter' }).click();
	await expect(chip).toHaveText('Test Model');
	expect(await stored(page, 'lattice-studio-chat-selection')).toMatchObject({ source: 'cloud', provider: 'openrouter', model: 'test/model' });
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

test('@crosswidth @webkit-phone @webkit-tablet @gecko saving a Gemini key fills a chat model that is not set, and never moves a voice that is', async ({ page }) => {
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
	// Nothing chosen yet: the chat model reads Not set (2026-11-08-studio-ai-routes-ux.md rule 1).
	await expect(ws.chat.getByTestId('chat-model-card-state')).toHaveText('Not set');
	await page.getByRole('button', { name: 'Add a Gemini key' }).click();
	await page.getByLabel('Gemini API key').fill(GEM);
	await page.getByRole('button', { name: 'Check & save' }).click();
	// The chat model was not set, so the key fills it, and the Studio says so.
	await expect(ws.chat).toContainText('Gemini · your own key');
	await expect(ws.chat.getByTestId('chat-model-card-state')).toHaveText('Ready');
	await expect(page.getByText(/Nothing was set, so chat \(and Image reader\) now run on your Gemini key/)).toBeVisible();
	// The voice WAS set (on OpenRouter, with no key): connecting never moves a set selection.
	expect(await stored(page, 'lattice-studio-voice-selection')).toMatchObject({ source: 'cloud', provider: 'openrouter', voice: 'af_bella' });
	await expect(ws.voice).toContainText('Add a key or choose on-device');
});

test('@webkit-tablet @gecko a voice model Gemini retired turns read-aloud off and says so, never another voice', async ({ page }) => {
	const GEM = 'AIzaE2eSpineGeminiKey0000a1b2';
	await seed(page, { 'lattice-db-gemini-key': GEM, 'lattice-studio-voice-selection': SEL({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'Kore' }) }, { promptApi: false });
	const seen = await mockOpenRouter(page);
	const speak: string[] = [];
	await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
		const req = route.request();
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		const url = req.url().split('?')[0];
		if (url.endsWith(':generateContent')) {
			speak.push(url);
			return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 404, message: 'models/gemini-3.8-flash-lite-tts is not found for API version v1beta', status: 'NOT_FOUND' } }) });
		}
		if (url.endsWith('/v1beta/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-lite-tts' }, { name: 'models/gemini-3.8-flash-tts' }] }) });
		return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
	});
	await gotoStudio(page);
	await setEditorContent(page, '---\ntheme: indaco\n---\n\n# Spine\n\n<!-- say: First line. Second line. Third line. -->\n\n---\n\n# Two\n');
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const voice = dialog.getByRole('button', { name: /^Voice (on|off)/ });
	if ((await voice.getAttribute('aria-pressed')) !== 'true') await voice.click();
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(page.getByText('Gemini retired the voice model you chose. Read-aloud is off: pick another in Workspace › AI.')).toBeVisible({ timeout: 30_000 });
	// Gemini was asked once; nothing was sent to OpenRouter in its place.
	expect(speak).toHaveLength(1);
	expect(seen.speech).toEqual([]);
	if (process.env.SPINE_SHOTS) await page.screenshot({ path: `${process.env.SPINE_SHOTS}/present-voice-retired.png`, animations: 'disabled' });
	await page.keyboard.press('Escape');
	const ws = await openWorkspaceAi(page);
	await expect(ws.voice.getByTestId('voice-model-card-state')).toHaveText('Model retired');
	await expect(ws.voice).toContainText('Gemini no longer offers this model');
});

// A stand-in for kokoro-js (the ~80 MB on-device voice). `from_pretrained` reports 42% and then
// waits for the page's BroadcastChannel message, so the test decides when the "download" ends.
const FAKE_KOKORO = `
export class KokoroTTS {
  static from_pretrained(_id, opts) {
    opts?.progress_callback?.({ status: 'progress', file: 'model.onnx', progress: 42 });
    return new Promise((resolve) => {
      const ch = new BroadcastChannel('fake-kokoro');
      ch.onmessage = () => { ch.close(); resolve(new KokoroTTS()); };
    });
  }
  async generate() {
    const rate = 24000, n = Math.floor(rate * 0.3), audio = new Float32Array(n);
    for (let i = 0; i < n; i++) audio[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate);
    return { audio, sampling_rate: rate };
  }
  list_voices() {}
}
export default { KokoroTTS };
`;

test('Present waits for the on-device voice on its first read, and its voice pill says how far the load is', async ({ page, context }) => {
	await seed(page, { 'lattice-studio-voice-selection': SEL({ source: 'device', provider: 'kokoro', model: '', voice: 'af_heart' }) }, { promptApi: false });
	await context.route('https://esm.run/kokoro-js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_KOKORO }));
	await mockOpenRouter(page);
	await gotoStudio(page);
	// Undo the fixture's worker block: a read loads the on-device voice OFF the main thread only,
	// so with the block in place the load fails and Present reads captions (see share-ondevice-narration.spec.ts).
	await page.evaluate(() => {
		window.Worker = Object.getPrototypeOf(window.Worker);
	});
	await setEditorContent(page, '---\ntheme: indaco\n---\n\n# Spine\n\n<!-- say: The on-device voice reads this line. -->\n\n---\n\n# Two\n');
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	const voice = dialog.getByRole('button', { name: /^Voice (on|off)/ });
	if ((await voice.getAttribute('aria-pressed')) !== 'true') await voice.click();
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	// The first read starts the load and waits for it, visibly: no other voice stands in.
	await expect(voice).toContainText('Loading voice… 42%', { timeout: 30_000 });
	await shot(page, 'present-loading-voice');
	await page.evaluate(() => new BroadcastChannel('fake-kokoro').postMessage('go'));
	await expect(voice).toContainText('Heart · on-device', { timeout: 30_000 });
});

// CLS 0 opening Workspace › AI, at the three widths the Studio ships to. Every card paints its
// final shape from the stored selection on the first frame, and readiness changes IN PLACE, so
// nothing on the tab may move once it is shown. Layout-shift entries are counted whether or not
// they follow input: the tab click is input, and Chromium would otherwise drop the shifts of the
// next 500 ms, which is exactly when the model and voice modules answer.
for (const width of [1440, 820, 390]) {
	test(`nothing moves on Workspace › AI once it is shown — ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
		await seed(page, { 'lattice-db-or-key': OR_KEY, 'lattice-studio-voice-selection': SEL({ source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella' }) });
		await mockOpenRouter(page);
		await gotoStudio(page);
		await page.evaluate(() => {
			const w = window as unknown as { __shifts: { value: number; at: number; nodes: string[] }[] };
			w.__shifts = [];
			new PerformanceObserver((list) => {
				for (const e of list.getEntries() as unknown as { value: number; startTime: number; sources?: { node?: Node }[] }[]) {
					w.__shifts.push({ value: e.value, at: e.startTime, nodes: (e.sources ?? []).map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}`.slice(0, 120) : String(s.node?.nodeName))) });
				}
			}).observe({ type: 'layout-shift' });
		});
		const ws = await openWorkspaceAi(page);
		const t0 = await page.evaluate(() => performance.now());
		await expect(ws.chat.getByTestId('chat-model-card-state')).toHaveAttribute('data-state', 'ready');
		await expect(ws.voice.getByTestId('voice-model-card-state')).toHaveAttribute('data-state', 'ready');
		// The image reader sits between the two cards, so it has to have painted its final text too.
		await expect(page.getByTestId('image-reader-card-state')).toHaveAttribute('data-state', 'ready');
		// Two frames, so a shift caused by the last answer has been recorded.
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		const shifts = await page.evaluate((from) => (window as unknown as { __shifts: { value: number; at: number; nodes: string[] }[] }).__shifts.filter((s) => s.at >= from), t0);
		const cls = shifts.reduce((n, s) => n + s.value, 0);
		expect(cls, `layout shifts after the AI tab was shown: ${JSON.stringify(shifts)}`).toBe(0);
		await shot(page, `workspace-ai-cls-${width}`);
	});
}
