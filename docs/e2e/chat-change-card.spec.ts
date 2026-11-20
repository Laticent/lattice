import type { Locator, Page } from '@playwright/test';
import { checkpointLabels, expect, gotoStudio, openChatAtWidth, persistedSource, setEditorContent, test } from './studio-fixture';

// THE CHAT'S CHANGE CARD, ON THE REAL SURFACE (engineering/decisions/2026-11-19-chat-card-apply-undo.md).
//   · Rows: every slide is decided on its own (Apply, Discard, Undo), in any order; the whole-card actions sit
//     at the bottom right. Each row finds its slide by its TEXT, so applying a new slide first does not knock
//     a later replace onto the wrong slide.
//   · Undo by content: a row undoes only while its slide still reads as the AI wrote it; a slide the author
//     has edited since says so before the click, and their typing survives every undo.
//   · History: ONE entry per card, its label kept current.
//   · Preview for real: the Studio's preview shows the change rendered, not applied; a phone gets a sheet.
//   · The AI is told what the author did with the card on the next message.
//   · Room: the card fills the chat less two lines of the reply, its rows scroll in one region.
//
// The model is MOCKED, not spent (HARD RULE #24).

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

// Long slides, so the rows together are taller than any viewport and the card has to scroll.
const body = (n: number, word: string) => Array.from({ length: 14 }, (_, k) => `- ${word} point ${n}.${k + 1} for the board`).join('\n');
const DECK = ['# Board update', `## Revenue\n\n${body(2, 'Old')}`, `## Costs\n\n${body(3, 'Old')}`, `## Hiring\n\n${body(4, 'Old')}`].join('\n\n---\n\n');
const EDITS = [
	{ action: 'replace', slide: 2, body: `## Revenue grew\n\n${body(2, 'New')}` },
	{ action: 'replace', slide: 3, body: `## Costs held\n\n${body(3, 'New')}` },
	{ action: 'insert', slide: 4, body: '## The ask\n\n- Approve two sales hires\n- Hold cloud spend flat' },
];
const SUMMARY = 'I tightened the two headings and rewrote their points so each one leads with the number, and added a closing slide with the ask. Slide 1 already reads well.';

type Body = { messages: { role: string; content: unknown }[] };
const text = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : '');

async function mockModel(page: Page): Promise<Body[]> {
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
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(bodies.length === 1 ? toolCall('edit_slides', { edits: EDITS, summary: SUMMARY }) : say(SUMMARY)) });
	});
	return bodies;
}

/** The preview frame shows its slide: revealed by the engine (opacity 1, set once the slide has painted and been
 *  scaled) and holding `text`. Holding the text alone passed while the frame was still a blank box. */
async function expectShown(frame: Locator, text: string) {
	await expect.poll(async () => frame.evaluate((f: HTMLIFrameElement) => `${f.style.opacity}|${f.contentDocument?.body?.innerText ?? ''}`), { timeout: 30_000 }).toMatch(new RegExp(`^1\\|[\\s\\S]*${text}`));
	// Let the compositor put that paint on screen before a screenshot for a human reads it.
	await frame.screenshot();
}

async function send(page: Page, message: string) {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(message);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
}

async function askForEdits(page: Page, width: number, height: number, dark = false): Promise<{ card: Locator; bodies: Body[] }> {
	const bodies = await mockModel(page);
	// Load the deck where the source editor is on screen (a phone hides it), then take the width under test.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('Old point 4.14');
	// The Studio's own toggle: it does not follow the system setting, and a phone's chat sheet covers it.
	if (dark) await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
	await page.setViewportSize({ width, height });
	await openChatAtWidth(page, width);
	await send(page, 'tighten slides 2 and 3, and add the ask');
	const card = page.locator('[data-proposal-card]');
	await expect(card).toBeVisible({ timeout: 30_000 });
	return { card, bodies };
}

for (const [w, h] of [
	[1440, 900],
	[820, 1180],
	[390, 844],
] as const) {
	test(`the change card fills the chat under two lines of the reply at ${w}px @crosswidth`, async ({ page }) => {
		test.setTimeout(90_000);
		const { card } = await askForEdits(page, w, h);
		// Wait for the slide to settle: the transcript's scrollTop stops moving.
		const scroller = card.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
		await expect
			.poll(async () => {
				const a = await scroller.evaluate((el) => el.scrollTop);
				await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
				return a === (await scroller.evaluate((el) => el.scrollTop)) && a > 0;
			})
			.toBe(true);
		const geo = await card.evaluate((el) => {
			const wrap = el.parentElement as HTMLElement;
			const sc = wrap.closest('.overflow-y-auto') as HTMLElement;
			const s = sc.getBoundingClientRect();
			const c = el.getBoundingClientRect();
			const prose = wrap.parentElement?.querySelector('[data-chat-prose]') as HTMLElement;
			// The last line of TEXT, not the box: the paragraph's own spacing sits below it.
			const range = document.createRange();
			range.selectNodeContents(prose);
			const pBottom = Math.max(...Array.from(range.getClientRects()).filter((r) => r.height > 0).map((r) => r.bottom));
			const lh = Number.parseFloat(getComputedStyle(prose).lineHeight);
			return { proseShown: pBottom - s.top, below: s.bottom - c.bottom, cardH: c.height, viewH: s.height, lh };
		});
		// Two lines of the reply's own text show above the card, and the card takes the rest.
		expect(geo.proseShown).toBeGreaterThan(geo.lh * 1.85);
		expect(geo.proseShown).toBeLessThan(geo.lh * 2.3);
		expect(geo.cardH).toBeGreaterThan(geo.viewH * 0.6);
		expect(geo.below).toBeGreaterThanOrEqual(-1);
		// The whole-card Apply sits at the bottom right, on screen; the rows scroll inside the card.
		await expect(card.getByRole('button', { name: 'Apply all' })).toBeInViewport();
		expect(await card.locator('ul').first().evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`change-card-${w}.png`) });
	});
}

test('rows apply one at a time in any order, each finding its slide by its text @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 1440, 900);
	// The new slide FIRST, then slide 2: the insert must not knock the replace onto the wrong slide.
	await card.getByRole('button', { name: 'Apply: New slide' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## The ask');
	await card.getByRole('button', { name: 'Apply: Slide 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
	const src = await persistedSource(page);
	expect(src).toContain('Old point 3.1 ');
	expect(src.indexOf('## Revenue grew')).toBeLessThan(src.indexOf('## Costs'));
	expect(src.indexOf('## Hiring')).toBeLessThan(src.indexOf('## The ask'));
	// The footer offers what is left.
	await expect(card.getByRole('button', { name: /^Apply remaining 1$/ })).toBeVisible();
	await expect(card.getByText('2 of 3 applied')).toBeVisible();
	// ONE History entry for the card, its label kept current.
	await expect.poll(async () => (await checkpointLabels(page)).filter((l) => l.startsWith('Before AI edit'))).toEqual([expect.stringMatching(/^Before AI edit · \d\d:\d\d · “tighten slides 2 and 3, and add the…” \(2 of 3 applied\)$/)]);
});

test("undo works by content: a slide the author edited since says so, and their typing survives @crosswidth", async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 1440, 900);
	await card.getByRole('button', { name: 'Apply all' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## The ask');
	await expect(card.getByText('Applied', { exact: true })).toHaveCount(3);
	// The author types on slide 3 after applying.
	// The store keeps the deck JSON-encoded; the editor takes the text itself.
	const typed = (JSON.parse(await persistedSource(page)) as string).replace('New point 3.1 for the board', 'New point 3.1 for the board (my note)');
	await setEditorContent(page, typed);
	await expect.poll(() => persistedSource(page)).toContain('(my note)');
	await expect(card.getByText("Applied · you've edited it since")).toBeVisible();
	await expect(card.getByRole('button', { name: 'Undo: Slide 3' })).toHaveCount(0);
	// Slide 2 still reads as the AI wrote it, so it undoes, and the typing on slide 3 survives.
	await card.getByRole('button', { name: 'Undo: Slide 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('Old point 2.1 ');
	expect(await persistedSource(page)).toContain('(my note)');
	await expect(card.getByRole('button', { name: 'Apply again: Slide 2' })).toBeVisible();
});

test('the card follows ⌘Z: an apply the Studio undid reads as undone, and can be applied again', async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 1440, 900);
	await card.getByRole('button', { name: 'Apply: Slide 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
	// The Studio's own Undo, which the card does not drive.
	await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
	await expect.poll(() => persistedSource(page)).not.toContain('## Revenue grew');
	await expect(card.getByRole('button', { name: 'Apply again: Slide 2' })).toBeVisible();
	await card.getByRole('button', { name: 'Apply again: Slide 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
});

test('discard keeps the row, and Bring back offers it again', async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 1440, 900);
	await card.getByRole('button', { name: 'Discard: Slide 3' }).click();
	await expect(card.getByRole('button', { name: 'Bring back: Slide 3' })).toBeVisible();
	await card.getByRole('button', { name: 'Apply remaining 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## The ask');
	expect(await persistedSource(page)).toContain('Old point 3.1 ');
	await card.getByRole('button', { name: 'Bring back: Slide 3' }).click();
	await expect(card.getByRole('button', { name: 'Apply: Slide 3' })).toBeVisible();
});

test('the AI is told what the author did with its card on the next message', async ({ page }) => {
	test.setTimeout(90_000);
	const { card, bodies } = await askForEdits(page, 1440, 900);
	await card.getByRole('button', { name: 'Apply: Slide 2' }).click();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
	await card.getByRole('button', { name: 'Discard: Slide 3' }).click();
	const before = bodies.length;
	await send(page, 'thanks, what next?');
	await expect.poll(() => bodies.length).toBeGreaterThan(before);
	const sent = bodies[bodies.length - 1].messages.map((m) => text(m.content)).join('\n');
	expect(sent).toContain('[The author applied slide 2; discarded slide 3; has not decided on new slide.]');
});

test('preview shows the change rendered in the Studio, applies nothing, and leaves on Esc', async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 1440, 900);
	const before = await persistedSource(page);
	await card.getByRole('button', { name: 'Preview Slide 2 in the deck' }).click();
	const draft = page.locator('[data-chat-draft]');
	await expect(draft).toBeVisible();
	await expect(draft.getByText('Previewing slide 2 · not applied')).toBeVisible();
	await expectShown(draft.locator('iframe'), 'Revenue grew');
	expect(await persistedSource(page)).toBe(before);
	await page.screenshot({ path: test.info().outputPath('preview-1440.png') });
	// Before shows the slide as it is now.
	await draft.getByRole('button', { name: 'Before' }).click();
	await expectShown(draft.locator('iframe'), 'Old point 2.1');
	await page.keyboard.press('Escape');
	await expect(draft).toHaveCount(0);
	// Apply from the preview lands that row.
	await card.getByRole('button', { name: 'Preview Slide 2 in the deck' }).click();
	await draft.getByRole('button', { name: 'Apply', exact: true }).click();
	await expect.poll(() => persistedSource(page)).toContain('## Revenue grew');
	await expect(draft).toHaveCount(0);
});

test('on a phone the preview is a full-screen sheet with Apply in thumb reach @crosswidth', async ({ page }) => {
	test.setTimeout(90_000);
	const { card } = await askForEdits(page, 390, 844);
	await card.getByRole('button', { name: 'Preview Slide 2 in the deck' }).click();
	const sheet = page.getByRole('dialog', { name: "Preview of the AI's changes" });
	await expect(sheet).toBeVisible();
	const apply = sheet.getByRole('button', { name: 'Apply', exact: true });
	await expect(apply).toBeInViewport();
	const box = await apply.boundingBox();
	expect(box && box.y > 844 / 2).toBe(true);
	await expectShown(sheet.locator('iframe'), 'Revenue grew');
	await page.screenshot({ path: test.info().outputPath('preview-390.png') });
	await sheet.getByRole('button', { name: 'Close preview' }).click();
	await expect(sheet).toHaveCount(0);
	// Closing the preview leaves the chat sheet, and its card, where they were.
	await expect(card).toBeVisible();
	// Esc closes the preview only, never the chat sheet under it.
	await card.getByRole('button', { name: 'Preview Slide 2 in the deck' }).click();
	await expect(sheet).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	await expect(card).toBeVisible();
});

for (const dark of [false, true]) {
	test(`the cost menu answers each question in one card, details behind a chevron${dark ? ', in dark mode' : ''} @crosswidth`, async ({ page }) => {
		test.setTimeout(90_000);
		await askForEdits(page, 390, 844, dark);
		await page.getByRole('button', { name: /^Chat metrics:/ }).click();
		const menu = page.getByTestId('chat-metrics');
		await expect(menu).toBeVisible();
		// Let the open animation finish, so the shot shows the menu as it rests.
		await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
		// Folded: the headline figure and the line under it, no breakdown.
		await expect(menu.getByText(/^\d+% used$/)).toBeVisible();
		await expect(menu.getByText(/ of 100K tokens$/)).toBeVisible();
		await expect(menu.getByText('Read from cache')).toHaveCount(0);
		await page.screenshot({ path: test.info().outputPath(`cost-menu-390${dark ? '-dark' : ''}.png`) });
		// The chevron opens the breakdown in place.
		await menu.getByRole('button', { name: 'Context window: show details' }).click();
		await expect(menu.getByText('Read from cache')).toBeVisible();
		await expect(menu.getByRole('button', { name: 'Context window: hide details' })).toBeVisible();
		await menu.getByRole('button', { name: 'This session: show details' }).click();
		await expect(menu.getByText('Model calls')).toBeVisible();
		await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
		await page.screenshot({ path: test.info().outputPath(`cost-menu-390-open${dark ? '-dark' : ''}.png`) });
	});
}
