import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

// A newline inside a paragraph is a line break on the slide, so editing the paragraph keeps it.
// followups.d/2846-p6; engineering/decisions/2026-10-21-compose-point-and-click.md §7b.

const COMPOSE = 'Compose — rich editor';

const DECK = ['---', 'marp: true', 'theme: indaco', '---', '', '## Address.', '', 'Line one', 'Line two', 'Line three', ''].join('\n');

// The stored value is a JSON string, so its newlines come back escaped.
const stored = async (page: import('@playwright/test').Page): Promise<string> => JSON.parse(await persistedSource(page));

async function openDeck(page: import('@playwright/test').Page): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
}

test('@crosswidth editing a paragraph keeps its line breaks, and deleting a line does not split it', async ({ page }) => {
	await openDeck(page);
	await expect(page.locator('.cs-host .cs-slide-locked, .cs-host [data-locked="true"]')).toHaveCount(0);
	await page.locator('.cs-host p', { hasText: 'Line one' }).click();
	await page.keyboard.press('Control+Home'); // the heading
	await page.keyboard.press('ArrowDown'); // the paragraph's first line
	await page.keyboard.press('End');
	await page.keyboard.type('!');
	await expect.poll(() => stored(page)).toContain('Line one!\nLine two\nLine three');
	// Delete the middle line's text: two breaks sit side by side, and the paragraph must stay one block.
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	await page.keyboard.press('Delete');
	await expect.poll(() => stored(page)).not.toContain('Line two');
	const source = await stored(page);
	expect(source).toContain('Line three');
	expect(source).not.toMatch(/Line one!\\?\n\n/); // no blank line between the first and last line
});
