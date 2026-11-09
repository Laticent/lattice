import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// DIRECT PROVIDER KEYS — OpenAI, Anthropic and Gemini beside OpenRouter (lifecycle note §7 step 2).
//
// For each provider: paste a key in Workspace → AI → Connections, have it checked against that
// provider's free model listing, then run four Studio AI faculties — Theme, Finish and Motion
// succeed, Component meets a 402 — and prove every request went to the provider's own endpoint
// with its own auth header, none to OpenRouter's chat endpoint, and the 402 names the provider.
// The Spend section says the balance is not available and labels the session as an estimate.
//
// MOCKED, NOT SPENT (HARD RULE #24). Route handlers answer every request to the three providers
// and to openrouter.ai (whose PUBLIC catalog prices the direct models); the keys are throwaway
// strings that never leave the browser.

type Page = Parameters<typeof gotoStudio>[0];

const DRAWING = `\`\`\`svg
<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-width="3">
  <title>A review loop</title>
  <rect id="draft-box" x="20" y="60" width="100" height="56" rx="10" stroke="var(--accent)"/>
  <path id="hand-off" d="M120 88 H200" stroke="var(--text-muted)"/>
  <rect id="review-box" x="200" y="60" width="100" height="56" rx="10" stroke="var(--cat-4-mark)"/>
</svg>
\`\`\``;
const FINISH = JSON.stringify({ name: 'quiet-grid', wash: { type: 'corner-glow', intensity: 8 }, texture: { type: 'grid', intensity: 6, scale: 24 }, mark: { type: 'none', placement: 'top-left' }, edge: { type: 'none', intensity: 4 } });
const THEME = JSON.stringify({ name: 'harbor', accent: '#1f4e79' });

/** The reply a faculty gets, picked by what the request asks for. `null` means "answer 402". */
function replyFor(body: string): string | null {
	if (/SLIDE FINISH/.test(body)) return FINISH;
	if (/SVG line art/.test(body)) return DRAWING;
	if (/three pricing tiers/.test(body)) return null;
	return THEME;
}

type Provider = {
	id: 'openai' | 'anthropic' | 'gemini';
	label: string;
	key: string;
	model: string;
	catalogId: string;
	host: string;
	chatPath: string;
	authOf: (h: Record<string, string>) => string | undefined;
	models: unknown;
	ok: (content: string) => unknown;
};

const PROVIDERS: Provider[] = [
	{
		id: 'openai',
		label: 'OpenAI',
		key: 'sk-proj-e2e-direct-openai-key-a1b2',
		model: 'gpt-6.1-terra',
		catalogId: 'openai/gpt-6.1-terra',
		host: 'https://api.openai.com/v1',
		chatPath: '/chat/completions',
		authOf: (h) => h.authorization,
		models: { data: [{ id: 'gpt-6.1-terra', created: 2 }, { id: 'text-embedding-3-large', created: 3 }] },
		ok: (content) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } }),
	},
	{
		id: 'anthropic',
		label: 'Anthropic',
		key: 'sk-ant-e2e-direct-anthropic-key-c3d4',
		model: 'claude-sonnet-5-5',
		catalogId: 'anthropic/claude-sonnet-5.5',
		host: 'https://api.anthropic.com/v1',
		chatPath: '/messages',
		authOf: (h) => h['x-api-key'],
		models: { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-28T00:00:00Z' }] },
		ok: (content) => ({ content: [{ type: 'text', text: content }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 } }),
	},
	{
		id: 'gemini',
		label: 'Gemini',
		key: 'AIzaE2eDirectGeminiKey000e5f6',
		model: 'gemini-3.8-flash',
		catalogId: 'google/gemini-3.8-flash',
		host: 'https://generativelanguage.googleapis.com/v1beta/openai',
		chatPath: '/chat/completions',
		authOf: (h) => h.authorization,
		models: { data: [{ id: 'models/gemini-3.8-flash' }, { id: 'models/text-embedding-004' }] },
		ok: (content) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } }),
	},
];

async function mockAll(page: Page, p: Provider) {
	const seen = { chat: [] as { auth?: string; browserAccess?: string; model?: string }[], openRouterChat: 0 };
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the test fails loudly on the missing control */
		}
	});
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/chat/completions')) seen.openRouterChat++;
		const body = url.endsWith('/api/v1/models') ? { data: [{ id: p.catalogId, name: `${p.label}: e2e model`, pricing: { prompt: '0.000002', completion: '0.00001' }, context_length: 200000, architecture: { input_modalities: ['text', 'image'] } }] } : { data: [] };
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
	});
	await page.route(`${p.host}/**`, async (route) => {
		const req = route.request();
		const h = req.headers();
		const good = p.authOf(h) === (p.id === 'anthropic' ? p.key : `Bearer ${p.key}`);
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		if (req.url().split('?')[0].endsWith('/models')) {
			await route.fulfill({ status: good ? 200 : 401, contentType: 'application/json', body: JSON.stringify(good ? p.models : { error: { message: 'invalid key' } }) });
			return;
		}
		if (req.url().endsWith(p.chatPath)) {
			const sent = req.postData() || '';
			seen.chat.push({ auth: p.authOf(h), browserAccess: h['anthropic-dangerous-direct-browser-access'], model: JSON.parse(sent).model });
			const content = replyFor(sent);
			if (content === null) {
				await route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Your credit balance is too low', type: 'billing_error' } }) });
				return;
			}
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(p.ok(content)) });
			return;
		}
		await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
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
}

async function openFabricate(page: Page, tab?: 'Component' | 'Finish' | 'Motion') {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	if (tab) await page.getByRole('button', { name: tab, exact: true }).first().click();
}

for (const p of PROVIDERS) {
	test(`@crosswidth a pasted ${p.label} key runs Theme, Finish, Motion and Component on ${p.label}`, async ({ page }) => {
		test.slow();
		const seen = await mockAll(page, p);
		await gotoStudio(page);
		await openWorkspaceAi(page);

		// Pick the provider; a key of the wrong shape is refused without a request.
		await page.getByRole('button', { name: new RegExp(`^Add an? ${p.label} key$`) }).click();
		const field = page.getByLabel(`${p.label} API key`);
		await expect(field).toHaveAttribute('type', 'password');
		await field.fill('sk-or-v1-not-this-provider');
		await page.getByRole('button', { name: 'Check & save' }).click();
		await expect(page.getByText(/That looks like an? OpenRouter key/)).toBeVisible();

		// A key the provider refuses is not stored.
		await field.fill(`${p.key}-revoked`);
		await page.getByRole('button', { name: 'Check & save' }).click();
		await expect(page.getByText(new RegExp(`${p.label} rejected this key`))).toBeVisible();

		await field.fill(p.key);
		await page.getByRole('button', { name: 'Check & save' }).click();
		await expect(page.getByTestId(`provider-row-${p.id}`)).toContainText(`Key …${p.key.slice(-4)}`);
		await expect(page.getByText(p.key)).toHaveCount(0);
		// Nothing was set, so the saved key FILLS the chat model (2026-11-08-studio-ai-routes-ux.md rule 1).
		await expect(page.getByTestId('chat-model-card')).toContainText(`${p.label} · your own key`);
		// Sealed at rest: the stored value is an envelope, never the key.
		// The sealed write lands after the toast, so wait for it rather than read once.
		const stored = () => page.evaluate((id) => localStorage.getItem(`lattice-db-${id}-key`), p.id);
		await expect.poll(stored).toMatch(/^v1:/);
		expect(await stored()).not.toContain(p.key);

		// Spend: no balance a browser key can read, a billing link, and an estimate label.
		await expect(page.getByText('Balance not available for this provider')).toBeVisible();
		await expect(page.getByRole('link', { name: new RegExp(`${p.label} billing`) })).toBeVisible();
		await expect(page.getByText('This session · estimate')).toBeVisible();

		// THEME — "Describe a look".
		await openFabricate(page);
		const look = page.getByPlaceholder(/^Describe a look/);
		await look.fill('harbor at dusk, deep navy accent');
		await look.press('Enter');
		await expect(page.getByText(/^Generated a( full)? palette/).first()).toBeVisible({ timeout: 30_000 });

		// FINISH — "Describe a finish".
		await openFabricate(page, 'Finish');
		const fin = page.getByLabel('Describe a finish');
		await fin.fill('a calm blueprint grid');
		await fin.press('Enter');
		await expect(page.getByText(/Generated a finish recipe/).first()).toBeVisible({ timeout: 30_000 });

		// MOTION — "Describe a drawing".
		await openFabricate(page, 'Motion');
		const draw = page.getByLabel('Describe a drawing');
		await draw.fill('a review loop');
		await draw.press('Enter');
		await expect(page.getByText(/Drew it/).first()).toBeVisible({ timeout: 30_000 });

		// COMPONENT — the provider answers 402, and the sentence names the provider, not OpenRouter.
		await openFabricate(page, 'Component');
		const comp = page.getByRole('textbox', { name: /describe a component/i });
		await comp.fill('three pricing tiers side by side');
		await comp.press('Enter');
		await expect(page.getByText(new RegExp(`Your ${p.label} account is out of credits`)).first()).toBeVisible({ timeout: 30_000 });

		// Every model request went to the provider, on its own key and model; none to OpenRouter.
		expect(seen.openRouterChat).toBe(0);
		expect(seen.chat.length).toBeGreaterThanOrEqual(4);
		for (const c of seen.chat) {
			expect(c.auth).toBe(p.id === 'anthropic' ? p.key : `Bearer ${p.key}`);
			expect(c.model).toBe(p.model);
			if (p.id === 'anthropic') expect(c.browserAccess).toBe('true');
		}
	});
}

test('connecting a second key never moves the chat model; choosing one is done in Models in use; removing another key leaves it alone', async ({ page }) => {
	const p = PROVIDERS[0];
	await mockAll(page, p);
	await page.route('https://openrouter.ai/api/v1/key', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"usage":0,"limit":null}}' }));
	await gotoStudio(page);
	await openWorkspaceAi(page);
	const card = page.getByTestId('chat-model-card');

	// The first connection fills the chat model that was not set.
	await page.getByLabel('OpenRouter API key').fill('sk-or-v1-e2e-switch-key-0or0');
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(page.getByTestId('provider-row-openrouter')).toContainText('Key …0or0');
	await expect(card).toContainText('OpenRouter · your account');

	// A second connection adds models; the chat model stays where the author left it.
	await page.getByRole('button', { name: 'Add an OpenAI key' }).click();
	await page.getByLabel('OpenAI API key').fill(p.key);
	await page.getByRole('button', { name: 'Check & save' }).click();
	await expect(page.getByTestId('provider-row-openai')).toContainText(`Key …${p.key.slice(-4)}`);
	await expect(card).toContainText('OpenRouter · your account');
	await expect(page.getByRole('button', { name: 'Use for chat' })).toHaveCount(0);

	// Choosing is done on the Chat model card.
	await card.getByRole('button', { name: /Change/ }).click();
	await page.getByRole('radiogroup', { name: 'Chat provider' }).getByRole('radio', { name: 'OpenAI' }).click();
	await expect(card).toContainText('OpenAI · your own key');
	await page.getByRole('radiogroup', { name: 'Chat provider' }).getByRole('radio', { name: 'OpenRouter' }).click();
	await expect(card).toContainText('OpenRouter · your account');

	// The image reader can use a key added after the sheet opened: "a model of its own" lands on a
	// connected route (a live check on 2026-11-08 found it did nothing when no key existed at mount).
	const reader = page.getByTestId('image-reader-card');
	await reader.getByRole('button', { name: /Change/ }).click();
	await page.getByRole('radio', { name: 'A model of its own' }).click();
	await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-image-selection') || '{}').mode)).toBe('own');
	await page.getByRole('radio', { name: 'Same as chat model' }).click();
	await reader.getByRole('button', { name: /Change/ }).click();

	await page.getByRole('button', { name: 'Remove the OpenAI key' }).click();
	await expect(page.getByTestId('provider-row-openai')).toContainText('No key');
	await expect(page.getByTestId('provider-row-openrouter')).toContainText('Key …0or0');
	await expect(card).toContainText('OpenRouter · your account');
});
