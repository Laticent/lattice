import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// THE CHAT'S LOOK AND CHART TOOLS, ON THE REAL SURFACE (engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4).
//
// The model is MOCKED, not spent (HARD RULE #24). render_slide renders a draft slide with the export's own capture and
// sends it to the model as a picture: the spec saves that picture so a reviewer can see what the model saw.
// chart_from_data and set_theme stage on the draft like any edit, and land on Apply.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
type Body = { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] };
const toolCall = (name: string, args: unknown) => [
	{ id: 'g', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
];
const say = (t: string) => [
	{ id: 'g', choices: [{ index: 0, delta: { content: t } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
];

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

const storedSources = (page: Page) =>
	page.evaluate(() =>
		Object.keys(localStorage)
			.filter((k) => k.startsWith('lattice-studio-src-'))
			.map((k) => {
				try {
					return String(JSON.parse(localStorage.getItem(k) ?? '""'));
				} catch {
					return '';
				}
			}),
	);

test('render_slide sends the model a real picture of the slide @crosswidth @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	const bodies = await mockModel(page, [toolCall('render_slide', { slide: 1 }), say('The title slide reads cleanly.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await send(page, 'how does the title slide look?');
	await expect(page.getByText('The title slide reads cleanly.')).toBeVisible({ timeout: 60_000 });
	expect(bodies[0].tools?.map((t) => t.function.name)).toContain('render_slide');
	// The picture rides the message after the tool result, as an image part.
	const parts = bodies[1].messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type?: string; image_url?: { url?: string } }[]) : []));
	const url = parts.find((p) => p.type === 'image_url')?.image_url?.url ?? '';
	expect(url).toMatch(/^data:image\/jpeg;base64,/);
	const bytes = Buffer.from(url.split(',')[1], 'base64');
	expect(bytes.length).toBeGreaterThan(5_000);
	fs.writeFileSync(test.info().outputPath('render-slide-1.jpg'), bytes);
});

test('chart_from_data stages a chart slide that lands on Apply @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockModel(page, [
		toolCall('chart_from_data', { after: 1, kind: 'bar', heading: 'EMEA leads the year', rows: [{ label: 'EMEA', value: '$4.2M' }, { label: 'APAC', value: '$3.1M' }, { label: 'Americas', value: '$2.9M' }] }),
		say('Added a bar chart as slide 2.'),
	]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await send(page, 'chart these: EMEA 4.2M, APAC 3.1M, Americas 2.9M');
	await page.getByRole('button', { name: /^Apply/ }).click({ timeout: 30_000 });
	await expect.poll(async () => (await storedSources(page)).some((v) => v.includes('<!-- _class: bar -->') && v.includes('- EMEA `$4.2M`'))).toBe(true);
	await page.screenshot({ path: test.info().outputPath('chart-from-data-1440.png') });
});

test('set_theme stages the theme change, from the Studio\'s own theme list @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	const bodies = await mockModel(page, [toolCall('set_theme', { name: 'cuoio' }), say('Switched the theme to cuoio.')]);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await send(page, 'use the cuoio theme');
	await page.getByRole('button', { name: /^Apply/ }).click({ timeout: 30_000 });
	await expect.poll(async () => (await storedSources(page)).some((v) => /^---[\s\S]*theme: cuoio/.test(v))).toBe(true);
	// The theme list the model was offered is the Studio's own.
	const def = bodies[0].tools?.find((t) => t.function.name === 'set_theme') as unknown as { function: { parameters: { properties: { name: { enum: string[] } } } } };
	expect(def.function.parameters.properties.name.enum).toContain('cuoio');
});
