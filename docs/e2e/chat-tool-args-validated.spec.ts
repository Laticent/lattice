import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, persistedSource, setEditorContent, test } from './studio-fixture';

// A TOOL CALL THAT DOES NOT FIT ITS SCHEMA, ON THE REAL SURFACE (use-case-layer.md §7, §10.2). The built Studio's
// dispatcher runs the generated validator before the handler: a misfit changes nothing in the deck, and the model
// is told which field failed, so it can fix that one. A null in an optional field counts as left out. The model is
// MOCKED, never spent (HARD RULE #24); everything after its scripted answer is the Studio's own code.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const toolCall = (name: string, args: unknown) => [
	{ id: 'g', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
];
const say = (text: string) => [
	{ id: 'g', choices: [{ index: 0, delta: { content: text } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
];
const DECK = '---\ntheme: cuoio\n---\n\n<!-- @meta{layout=title} -->\n# Plan 2027\n\n---\n\n<!-- @meta{layout=content} -->\n## Old heading\n\n- Point one\n';
const REPLY = 'Done looking.';

type Msg = { role: string; content: unknown };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');

/** The model's first answer is `call`; its second is a plain reply. Returns every request body it was sent. */
async function mockModel(page: Page, call: [string, unknown]): Promise<{ messages: Msg[] }[]> {
	const bodies: { messages: Msg[] }[] = [];
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
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(bodies.length === 1 ? toolCall(...call) : say(REPLY)) });
	});
	return bodies;
}

async function ask(page: Page, message: string) {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('Old heading');
	await openChatAtWidth(page, 1440);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(message);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText(REPLY)).toBeVisible({ timeout: 30_000 });
}

/** What the Studio told the model about its tool call: the tool message in the second request. */
const toolResult = (bodies: { messages: Msg[] }[]) => text(bodies[1]?.messages.find((m) => m.role === 'tool')?.content);

test('an edit whose arguments do not fit is refused: the deck is untouched and the model is told the field @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(90_000);
	const bodies = await mockModel(page, ['edit_slides', { edits: [{ action: 'replace', slide: 'two', body: '<!-- @meta{layout=content} -->\n## New heading' }], summary: 'Retitled slide 2.' }]);
	await ask(page, 'retitle slide 2');
	expect(bodies).toHaveLength(2);
	expect(toolResult(bodies)).toBe('The arguments for edit_slides do not fit its schema: /edits/0/slide must be integer. Fix that and send them again.');
	// Nothing was staged: no change card, and the source still holds the old heading.
	await expect(page.locator('[data-proposal-card]')).toHaveCount(0);
	expect(await persistedSource(page)).toContain('## Old heading');
	expect(await persistedSource(page)).not.toContain('New heading');
});

test('a null in an optional field counts as left out, and the call runs @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(90_000);
	const bodies = await mockModel(page, ['read_slides', { from: 2, to: null }]);
	await ask(page, 'read slide 2');
	expect(bodies).toHaveLength(2);
	const result = toolResult(bodies);
	expect(result).toContain('[slide 2]');
	expect(result).toContain('## Old heading');
	expect(result).not.toContain('do not fit its schema');
});
