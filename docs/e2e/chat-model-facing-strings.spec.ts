import { expect, gotoStudio, openArchitect, openChatAtWidth, test } from './studio-fixture';

// WHAT THE MODEL READS, ON THE REAL SURFACE (#3531). The unit tests hold the strings in their builders; this reads
// the request the BUILT Studio sends, so a string that a unit test pins but the shipped bundle never carries still
// goes red. The model is MOCKED, not spent (HARD RULE #24): one round, one answer, then the spec reads the request.
//
// Each pair is a claim that was wrong before #3531 and what the engine does now:
//   · preview_speech reads `@say{…}`, chart narration, then the slide text; the front-matter `say:` map is gone
//     (engineering/decisions/2026-11-20-four-notes.md N6).
//   · find_text and replace_text name fields as lib/deck-find.ts labels them.
//   · chart_from_data's guide is read with read_guide.
//   · a full-slide photo is `image` with `class=spotlight`; there is no `bleed` layout.
//   · the deck canon names no `escalateTo` field, which the model never sees.
//   · the language directive keeps `@meta{…}` records untranslated, not `_class` directives.
//   · `glossary:` is built from `terms:`, which absorbs `acronyms:`.
//   · the edit-block protocol (the Coach's finding fix, not the chat agent) asks for the slide from its `@meta{…}` line
//     and names no ```chart fence.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };

type Msg = { role: string; content: unknown };
type Tool = { function: { name: string; description: string } };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');

test('the chat request carries the corrected tool descriptions and system prompt @crosswidth @webkit-phone @gecko', async ({ page }) => {
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
	const bodies: { messages: Msg[]; tools?: Tool[] }[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		bodies.push(JSON.parse(route.request().postData() || '{}'));
		const frames = [
			{ id: 'g1', choices: [{ index: 0, delta: { content: 'The deck reads well as it stands.' } }] },
			{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
		];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('does this deck read well?');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('The deck reads well as it stands.')).toBeVisible({ timeout: 30_000 });

	expect(bodies.length).toBe(1);
	const tool = (name: string) => bodies[0].tools?.find((t) => t.function.name === name)?.function.description ?? '';

	const speech = tool('preview_speech');
	expect(speech).toContain('its spoken line (`@say{…}`) first, then chart narration, then the slide text; a hidden slide is skipped.');
	expect(speech).not.toContain('say:');

	expect(tool('find_text')).toContain('spoken line, speaker notes, slide alt text, handout, comment');
	expect(tool('find_text')).not.toMatch(/\bnote, description\b/);
	expect(tool('replace_text')).toContain('the four notes and plain comments');
	expect(tool('chart_from_data')).toContain('read_guide chart-from-data');
	expect(tool('chart_from_data')).not.toContain('(read_component)');

	const system = bodies[0].messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n');
	expect(system).toContain('`class=spotlight` behind the whole slide');
	expect(system).not.toContain('`bleed` behind the whole slide');
	expect(system).toContain('`<!-- @meta{layout=list-steps, class=timeline} -->`');
	expect(system).not.toContain('escalateTo');
	expect(system).not.toContain('skeleton below');
	expect(system).toContain('`@meta{…}` records exactly as given');
	expect(system).not.toContain('`_class` directives exactly as given');
	expect(system).toContain('built from the terms: definitions');
	expect(system).not.toContain('acronyms: definitions');

	await test.info().attach('chat-request.json', { body: JSON.stringify(bodies[0], null, 2), contentType: 'application/json' });
	await page.screenshot({ path: test.info().outputPath('chat-model-facing-strings-1440.png') });
});

test('the Coach finding fix carries the corrected edit-block protocol @crosswidth @webkit-phone @gecko', async ({ page }) => {
	// The edit protocol rides the one-shot paths (architect-fix.js, deckSystem), never the chat agent, so the first
	// test cannot see it. A finding fix on the seeded deck is the request that carries it.
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
	const bodies: { messages: Msg[] }[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		const body = JSON.parse(route.request().postData() || '{}');
		bodies.push(body);
		const reply = 'The slide already reads well; no change.';
		if (body.stream) await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([{ id: 'f1', choices: [{ index: 0, delta: { content: reply } }] }, { id: 'f1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE }]) });
		else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'f1', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }], usage: USAGE }) });
	});
	await gotoStudio(page);
	await openArchitect(page);
	await page.getByRole('button', { name: /^Fix (≈|·)/ }).first().click();
	await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0);

	const system = bodies[0].messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n');
	expect(system).toContain('give the WHOLE slide (its `@meta{…}` line through its last line)');
	expect(system).not.toContain('the `_class` line through');
	expect(system).toContain('```mermaid / ```math fences');
	expect(system).not.toContain('```chart fences');
	// The primer rides this request too: its variant line is the record form.
	expect(system).toMatch(/Variants: [^\n]*\(add to `class=`, e\.g\. `@meta\{layout=/);
	await test.info().attach('fix-request.json', { body: JSON.stringify(bodies[0], null, 2), contentType: 'application/json' });
});
