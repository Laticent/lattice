import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// A MESSAGE SENT BEFORE A MODEL IS CONNECTED IS ANSWERED ONCE ONE IS (docs/src/components/studio/chat-resume.ts).
// Seen by the owner on an iPhone (PR #3317): "hi" with no model connected sent them to connect one; OpenRouter's
// sign-in reloaded the page, nothing answered the message, so they asked again and the thread read "hi", "hi".
// Here: ask with no key, connect (a key stored, then a reload, as the sign-in's return does), reopen the chat, and
// the waiting message is answered on its own, once, with one "hi" in the thread.
//
// The model is MOCKED, not spent (HARD RULE #24).

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const REPLY = 'Hello! Happy to help with the deck.';
const sse = (t: string) => `data: ${JSON.stringify({ id: 'g', choices: [{ index: 0, delta: { content: t } }] })}\n\ndata: ${JSON.stringify({ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 } })}\n\ndata: [DONE]\n\n`;

async function mockModel(page: Page): Promise<() => number> {
	let calls = 0;
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		calls++;
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(REPLY) });
	});
	return () => calls;
}

for (const [w, h] of [
	[1440, 900],
	[390, 844],
] as const) {
	test(`a message sent before connecting a model is answered once one is, at ${w}px @crosswidth @webkit-phone`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: w, height: h });
		const calls = await mockModel(page);
		await gotoStudio(page);
		await openChatAtWidth(page, w);
		// No model: the author asks anyway, and is sent to connect one.
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('hi');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		// Wait for the turn to END, on its own visible signal: the chat's notice naming what to connect. (Waiting for "a
		// dialog that mentions a model" matched the phone's chat sheet itself, so the test stored the key and reloaded
		// before the turn had finished, and the waiting message was never marked: a race in the test, not the Studio.)
		await expect(page.getByText(/Connect a model in Workspace|Choose a chat model in Workspace/).first()).toBeVisible({ timeout: 30_000 });
		expect(calls()).toBe(0);
		// They connect: a key is stored, and the page comes back (OpenRouter's sign-in returns with a reload).
		await page.evaluate(() => {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
			localStorage.setItem('lattice-db-dedup', 'off');
		});
		await page.reload();
		await openChatAtWidth(page, w);
		// The waiting "hi" is answered without being asked again, and the thread holds it once.
		await expect(page.getByText(REPLY)).toBeVisible({ timeout: 30_000 });
		expect(calls()).toBe(1);
		await expect(page.locator('.whitespace-pre-wrap', { hasText: /^hi$/ })).toHaveCount(1);
		await page.screenshot({ path: test.info().outputPath(`connect-resume-${w}.png`) });
	});
}
