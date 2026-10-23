import type { Page } from '@playwright/test';
import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, gotoStudio, openChat, setEditorContent, test } from './studio-fixture';

// An outside change (here a deck rename, which rewrites the title heading) is shown in Compose: the line and the changed words are painted,
// then the paint removes itself, and the deck's bytes are the ones the change wrote. followups.d/2861-p3;
// engineering/decisions/2026-10-21-compose-point-and-click.md §8d.

const DECK = ['<!-- _class: content -->', '', '# Launch plan', '', 'The launch is on Monday.', '', 'Closing words.'].join('\n');
const RENAMED = DECK.replace('# Launch plan', '# Pilot plan');

/** Rename the active deck from the switcher: its button is named by the deck's title, and a phone shows no slide count beside it. */
async function rename(page: Page, from: string, to: string): Promise<void> {
	page.once('dialog', (d) => d.accept(to));
	await page.locator('header').getByRole('button', { name: new RegExp(`^${from}`) }).first().click();
	await page.getByRole('menuitem', { name: /^Rename/ }).click();
}

test.describe('an outside change shown in Compose', () => {
	test('@crosswidth @gecko @webkit-phone @webkit-tablet the changed line and words are painted, fade, and leave the deck bytes alone', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		const block = page.locator('.cs-host .cs-flash-block');
		await expect(block).toHaveCount(1);
		await expect(block).toContainText('Pilot plan');
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveText('Pilot');
		// The paint is on screen with an accent rule on the leading edge, not a restyle of the words.
		const shadow = await block.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(shadow).not.toBe('none');
		await expect.poll(() => savedDeck(page)).toBe(RENAMED);
		// It removes itself when the fade ends (150 ms in, 1.2 s hold, 1.6 s out, plus the words' lag).
		await expect(block).toHaveCount(0, { timeout: 10_000 });
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveCount(0);
		expect(await savedDeck(page)).toBe(RENAMED);
	});

	test('with reduced motion the tint holds without a fade, then goes in one step', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		const block = page.locator('.cs-host .cs-flash-block');
		await expect(block).toHaveCount(1);
		expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
		expect(await block.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
		await expect(block).toHaveCount(0, { timeout: 5_000 });
		expect(await savedDeck(page)).toBe(RENAMED);
	});

	test('the shell\u2019s undo shows what it restored', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await rename(page, 'Launch plan', 'Pilot plan');
		await expect(page.locator('.cs-host .cs-flash-block')).toContainText('Pilot plan');
		await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
		await expect(page.locator('.cs-host .cs-flash-block')).toContainText('Launch plan');
		await expect(page.locator('.cs-host .cs-flash-span')).toHaveText('Launch');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('an AI edit applied from the chat is shown on the line it rewrote', async ({ page }) => {
		// The model is MOCKED, not spent (HARD RULE #24); the Architect's real edit and Apply path runs.
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.addInitScript(() => {
			try {
				localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
				localStorage.setItem('lattice-db-dedup', 'off');
			} catch {
				/* storage unavailable: the spec fails loudly on the missing control */
			}
		});
		const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
		const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 };
		const rewritten = ['<!-- _class: content -->', '', '# Launch plan', '', 'The launch is on Tuesday morning.', '', 'Closing words.'].join('\n');
		let round = 0;
		await page.route('https://openrouter.ai/**', async (route) => {
			if (!route.request().url().includes('/chat/completions')) {
				await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
				return;
			}
			round++;
			const frames =
				round === 1
					? [
							{ id: 'g1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'edit_slides', arguments: JSON.stringify({ edits: [{ action: 'replace', slide: 1, body: rewritten }], summary: 'Moved the launch to Tuesday morning.' }) } }] } }] },
							{ id: 'g1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
						]
					: [
							{ id: 'g2', choices: [{ index: 0, delta: { content: 'Moved the launch to Tuesday morning.' } }] },
							{ id: 'g2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
						];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		});
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await openChat(page);
		await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Move the launch to Tuesday morning.');
		await page.getByRole('button', { name: 'Send', exact: true }).click();
		await expect(page.getByText('Moved the launch to Tuesday morning.').first()).toBeVisible({ timeout: 60_000 });
		await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
		await page.getByRole('button', { name: /^Apply/ }).first().click();
		const span = page.locator('.cs-host .cs-flash-span');
		await expect(span).toHaveText('Tuesday morning');
		await expect(page.locator('.cs-host .cs-flash-block')).toContainText('The launch is on Tuesday morning.');
		await expect.poll(() => savedDeck(page)).toBe(rewritten);
		await expect(span).toHaveCount(0, { timeout: 10_000 });
	});
});
