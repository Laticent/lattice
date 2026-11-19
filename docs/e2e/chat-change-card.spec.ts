import type { Page } from '@playwright/test';
import { expect, gotoStudio, openChatAtWidth, persistedSource, setEditorContent, test } from './studio-fixture';

// THE CHAT'S CHANGE CARD, ON THE REAL SURFACE.
//   · Pick: each proposed edit has its own checkbox; untick one and Apply lands only the rest.
//   · Room: the card grows to fill the transcript less two lines, scrolls its diffs in ONE region,
//     and the transcript slides to it so the last two lines above it stay in view.
//
// The model is MOCKED, not spent (HARD RULE #24): one edit_slides round proposing three slide edits.

const MODELS = [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 };
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
const toolCall = (name: string, args: unknown) => [
	{ id: 'g', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USAGE },
];
const say = (t: string) => [
	{ id: 'g', choices: [{ index: 0, delta: { content: t } }] },
	{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USAGE },
];

// Long slides, so the three diffs together are taller than any viewport and the card has to scroll.
const body = (n: number, word: string) => Array.from({ length: 14 }, (_, k) => `- ${word} point ${n}.${k + 1} for the board`).join('\n');
const DECK = ['# Board update', `## Revenue\n\n${body(2, 'Old')}`, `## Costs\n\n${body(3, 'Old')}`, `## Hiring\n\n${body(4, 'Old')}`].join('\n\n---\n\n');
const EDITS = [
	{ action: 'replace', slide: 2, body: `## Revenue grew\n\n${body(2, 'New')}` },
	{ action: 'replace', slide: 3, body: `## Costs held\n\n${body(3, 'New')}` },
	{ action: 'replace', slide: 4, body: `## Hiring paused\n\n${body(4, 'New')}` },
];
const SUMMARY = 'I tightened the three headings and rewrote their points so each one leads with the number. Slide 1 is unchanged because it already reads well, and the closing ask still follows.';

async function mockModel(page: Page) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable: the spec fails loudly on the missing control */
		}
	});
	let calls = 0;
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS } : { data: [] }) });
			return;
		}
		calls++;
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(calls === 1 ? toolCall('edit_slides', { edits: EDITS, summary: SUMMARY }) : say(SUMMARY)) });
	});
}

async function askForEdits(page: Page, width: number, height: number, dark = false) {
	await mockModel(page);
	// Load the deck where the source editor is on screen (a phone hides it), then take the width under test.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('Old point 4.14');
	// The Studio's own toggle: it does not follow the system setting, and a phone's chat sheet covers it.
	if (dark) await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
	await page.setViewportSize({ width, height });
	await openChatAtWidth(page, width);
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('tighten slides 2 to 4');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	const card = page.locator('[data-proposal-card]');
	await expect(card).toBeVisible({ timeout: 30_000 });
	return card;
}

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`the change card fills the chat under two lines of the reply at ${w}px @crosswidth`, async ({ page }) => {
		test.setTimeout(90_000);
		const card = await askForEdits(page, w, h);
		// Wait for the slide to settle: the transcript's scrollTop stops moving.
		const scroller = card.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
		await expect.poll(async () => {
			const a = await scroller.evaluate((el) => el.scrollTop);
			await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
			return a === (await scroller.evaluate((el) => el.scrollTop)) && a > 0;
		}).toBe(true);
		const geo = await card.evaluate((el) => {
			const sc = el.parentElement?.closest('.overflow-y-auto') as HTMLElement;
			const s = sc.getBoundingClientRect();
			const c = el.getBoundingClientRect();
			const prose = el.parentElement?.parentElement?.querySelector('[data-chat-prose]') as HTMLElement;
			// The last line of TEXT, not the box: the paragraph's own spacing sits below it.
			const range = document.createRange();
			range.selectNodeContents(prose);
			const p = { bottom: Math.max(...Array.from(range.getClientRects()).filter((r) => r.height > 0).map((r) => r.bottom)) };
			const lh = Number.parseFloat(getComputedStyle(prose).lineHeight);
			return { proseShown: p.bottom - s.top, below: s.bottom - c.bottom, cardH: c.height, viewH: s.height, lh };
		});
		// Two lines of the reply's own text show above the card, and the card takes the rest.
		expect(geo.proseShown).toBeGreaterThan(geo.lh * 1.85);
		expect(geo.proseShown).toBeLessThan(geo.lh * 2.3);
		expect(geo.cardH).toBeGreaterThan(geo.viewH * 0.7);
		expect(geo.below).toBeGreaterThanOrEqual(-1);
		// The Apply bar is on screen without scrolling, and the diffs scroll inside the card.
		await expect(card.getByRole('button', { name: 'Apply', exact: true })).toBeInViewport();
		const inner = await card.locator('.overflow-y-auto').evaluate((el) => el.scrollHeight > el.clientHeight);
		expect(inner).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`change-card-${w}.png`) });
	});
}

test('untick an edit and Apply lands only the rest @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	const card = await askForEdits(page, 1440, 900);
	await card.getByRole('checkbox', { name: /Include .*3/ }).click();
	const apply = card.getByRole('button', { name: 'Apply 2 of 3' });
	await expect(apply).toBeVisible();
	await apply.click();
	await expect(page.getByText('Applied · skipped 1')).toBeVisible();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
	const src = await persistedSource(page);
	expect(src).toContain('## Hiring paused');
	expect(src).toContain('## Costs');
	expect(src).not.toContain('## Costs held');
	expect(src).toContain('Old point 3.1 ');
});

test('untick every edit and Apply is disabled', async ({ page }) => {
	test.setTimeout(90_000);
	const card = await askForEdits(page, 1440, 900);
	await card.getByRole('checkbox', { name: 'Leave out every edit' }).click();
	await expect(card.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
	await card.getByRole('checkbox', { name: 'Include every edit' }).click();
	await expect(card.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
});

for (const dark of [false, true]) {
	test(`the cost menu shows its figures three to a row on a phone${dark ? ' in dark mode' : ''} @crosswidth`, async ({ page }) => {
		test.setTimeout(90_000);
		await askForEdits(page, 390, 844, dark);
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		const menu = page.getByTestId('chat-metrics');
		await expect(menu).toBeVisible();
		// Let the open animation finish, so the shot shows the menu as it rests.
		await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
		for (const section of ['This session', 'Cost']) {
			const row = menu.locator('dl').filter({ hasText: section });
			const tops = await row.locator(':scope > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
			expect(tops.length).toBe(3);
			expect(new Set(tops).size).toBe(1);
		}
		await page.screenshot({ path: test.info().outputPath(`cost-menu-390${dark ? '-dark' : ''}.png`) });
	});
}
