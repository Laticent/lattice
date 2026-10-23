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

test('@crosswidth @gecko @webkit-tablet editing a paragraph keeps its line breaks, and deleting a line does not split it', async ({ page }) => {
	await openDeck(page);
	await expect(page.locator('.cs-host .cs-slide-locked, .cs-host [data-locked="true"]')).toHaveCount(0);
	const para = page.locator('.cs-host p', { hasText: 'Line one' });
	await para.click();
	// Place the caret through the DOM selection, which ProseMirror reads: Home/End and Control+Home move differently in
	// WebKit, and the test is about the source, not about a browser's caret keys.
	const select = (text: string, whole: boolean) =>
		para.evaluate(
			(p, [text, whole]) => {
				const node = [...p.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent === text);
				if (!node) throw new Error(`no text node ${text}`);
				document.getSelection()?.setBaseAndExtent(node, whole ? 0 : text.length, node, text.length);
			},
			[text, whole] as const,
		);
	await select('Line one', false);
	await page.keyboard.type('!');
	await expect.poll(() => stored(page)).toContain('Line one!\nLine two\nLine three');
	// Delete the middle line's text: two breaks sit side by side, and the paragraph must stay one block.
	await select('Line two', true);
	await page.keyboard.press('Delete');
	await expect.poll(() => stored(page)).not.toContain('Line two');
	const source = await stored(page);
	expect(source).toContain('Line three');
	expect(source).not.toMatch(/Line one!\\?\n\n/); // no blank line between the first and last line
});
