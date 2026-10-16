import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, test } from './studio-fixture';

// ── The code block's options in Compose, on the REAL Studio ───────────────────
//
// followups.d/2710-p1: a fence's `@code{…}` record had no editor, so a Compose author could not find
// `numbers`, `focus=`, `copy` or `format`. The options button sits beside the fence's language in the
// divider pill. These assert what only a browser answers (HARD RULE #23): the button opens a panel,
// a switch writes the record into the SOURCE through the engine's writer, only the toggled word
// changes, and toggling back gives the deck that was there before, byte for byte.
// Design: engineering/decisions/2026-10-15-code-plugin.md §7 and §11.

const COMPOSE = 'Compose — rich editor';

async function toCompose(page: Page): Promise<void> {
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

/** The persisted deck source, JSON-decoded (compose-fenced-code.spec.ts explains why). */
async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	if (!raw) return '';
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

async function seedDeck(page: Page, source: string): Promise<void> {
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(source, { delay: 0 });
	await expect.poll(() => deckSource(page)).toContain('```');
}

const RECORD = '`@code{title="src/load.ts",  focus=2}`';
const DECK = ['## Load a user', '', RECORD, '```ts', 'export async function load(id: string) {', '  return api.get(id);', '}', '```', '', 'Body prose after it.'].join('\n');

async function openOptions(page: Page): Promise<void> {
	await page.locator('.cs-host pre.cs-code code').first().click();
	const button = page.getByRole('button', { name: /^Code block options/ });
	await expect(button).toBeVisible();
	await button.click();
	await expect(page.getByText('Line numbers', { exact: true })).toBeVisible();
}

test('@crosswidth the options panel toggles numbers, writing only that word, and toggles back byte for byte', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	const before = await deckSource(page);
	await toCompose(page);
	await openOptions(page);

	// The panel reads the record as the engine does.
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('src/load.ts');
	await expect(page.getByRole('textbox', { name: 'Focus lines' })).toHaveValue('2');

	await page.getByRole('switch', { name: 'Line numbers' }).click();
	await expect.poll(() => deckSource(page)).toContain('`@code{title="src/load.ts",  focus=2, numbers}`\n```ts');
	await page.screenshot({ path: test.info().outputPath('code-options.png') });
	const after = await deckSource(page);
	expect(after).toBe(before.replace(RECORD, '`@code{title="src/load.ts",  focus=2, numbers}`'));
	await expect(page.getByTestId('code-record-text')).toHaveText('@code{title="src/load.ts",  focus=2, numbers}');

	// The panel stays open on the same block; toggle back.
	await page.getByRole('switch', { name: 'Line numbers' }).click();
	await expect.poll(() => deckSource(page)).toBe(before);
});

test('a fence with no record gets one on the line above, and loses it when the last option goes', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK.replace(`${RECORD}\n`, ''));
	const before = await deckSource(page);
	await toCompose(page);
	await openOptions(page);

	await page.getByRole('radio', { name: 'Indent: Tab' }).click();
	await expect.poll(() => deckSource(page)).toContain('`@code{indent=tab}`\n```ts');

	await page.getByRole('radio', { name: 'Indent: Default' }).click();
	await expect.poll(() => deckSource(page)).toBe(before);
});

test('a value that does not read is refused with the reason, and the source is untouched', async ({ page }) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);
	const before = await deckSource(page);
	await toCompose(page);
	await openOptions(page);
	const focus = page.getByRole('textbox', { name: 'Focus lines' });
	await focus.fill('3-');
	await focus.press('Enter');
	await expect(page.getByRole('alert')).toContainText('not a line or a range');
	expect(await deckSource(page)).toBe(before);
});
