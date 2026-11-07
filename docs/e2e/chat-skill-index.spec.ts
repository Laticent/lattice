import fs from 'node:fs';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// Read from disk: Playwright's loader needs an import attribute for JSON modules.
const skillIndex: { skills: { name: string; description: string; studio: boolean }[] } = JSON.parse(
	fs.readFileSync(new URL('../../design/skills/index.json', import.meta.url), 'utf8'),
);

// THE SKILL INDEX, ON THE REAL SURFACE (engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §3).
//
// The chat's read_guide topics come from design/skills/index.json, and a skill's front matter is for indexes, not
// for the model. The model is MOCKED, not spent (HARD RULE #24): round 1 calls read_guide for the deck skill, round 2
// answers. The spec reads what the built Studio actually SENT: the system prompt must list every `studio: true` skill
// with its index description, and the tool result must be the skill's body without its `---` block.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };

type Msg = { role: string; content: unknown; tool_call_id?: string };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');

test('read_guide serves a skill from the index, without its front matter, in the built Studio @crosswidth @webkit-phone @gecko', async ({ page }) => {
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
	const bodies: { messages: Msg[]; tools?: { function: { name: string; parameters: { properties: { topic?: { enum?: string[] } } } } }[] }[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		bodies.push(JSON.parse(route.request().postData() || '{}'));
		const frames =
			bodies.length === 1
				? [
						{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_guide', arguments: '{"topic":"deck"}' } }] } }] },
						{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
					]
				: [
						{ id: 'g2', choices: [{ index: 0, delta: { content: 'Open with the claim, then the evidence, then the ask.' } }] },
						{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
					];
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
	});
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('how should a deck like this be structured?');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('Open with the claim, then the evidence, then the ask.')).toBeVisible({ timeout: 30_000 });

	expect(bodies.length).toBe(2);
	const offered = skillIndex.skills.filter((s) => s.studio);
	// The system prompt lists every Studio skill with its index description, and the tool enum offers exactly those.
	const system = bodies[0].messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n');
	for (const s of offered) expect(system, s.name).toContain(`- ${s.name} — ${s.description}`);
	const guide = bodies[0].tools?.find((t) => t.function.name === 'read_guide');
	const topics = guide?.function.parameters.properties.topic?.enum ?? [];
	expect(topics.filter((t) => offered.some((s) => s.name === t)).sort()).toEqual(offered.map((s) => s.name).sort());
	expect(topics).not.toContain('cli');
	// The tool result the model read: the deck skill's body, front matter stripped.
	const result = text(bodies[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call-1')?.content);
	expect(result).toContain('Skill — Create a deck');
	expect(result).not.toMatch(/^---/);
	expect(result).not.toContain('studio: true');
	await page.screenshot({ path: test.info().outputPath('chat-skill-index-1440.png') });
});
