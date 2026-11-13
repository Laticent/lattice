import type { Page } from '@playwright/test';
import { deckEditorText, expect, gotoStudio, isPhone, openSlideLook, persistedSource, test, typeDeck } from './studio-fixture';

// A held selection in Source survives a write the Studio makes elsewhere in the deck (Editor.tsx's value sync maps the
// whole selection through a localized write). Before the fix, Slide settings rewriting the class comment above the
// author's range collapsed it to a caret, so the next Delete removed one character instead of the range. The unit tier
// (editor-value-echo.test.tsx) pins the mapping in jsdom; this drives the real Studio and the real Inspector (HARD RULE #23).

const DECK = '---\ntitle: Held\n---\n\n<!-- _class: kpi -->\n\n## Held\n\nalpha beta gamma\n';
const RANGE = 'beta gamma';

/** Select `RANGE` in the deck editor: CodeMirror's own selection, the same state a drag or Shift+arrows leaves. */
async function holdRange(page: Page): Promise<void> {
	await page.evaluate((needle) => {
		const el = document.querySelector('[aria-label="Deck source"]');
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle (as demo-mobile.spec.ts does).
		const view = (el as any)?.cmTile?.root?.view;
		const at = view.state.doc.toString().indexOf(needle);
		view.dispatch({ selection: { anchor: at, head: at + needle.length }, userEvent: 'select' });
	}, RANGE);
}

/** The text the deck editor's main selection covers. */
const selectedText = (page: Page) =>
	page.evaluate(() => {
		const el = document.querySelector('[aria-label="Deck source"]');
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		const view = (el as any)?.cmTile?.root?.view;
		const { from, to } = view.state.selection.main;
		return view.state.sliceDoc(from, to);
	});

test('a range held in Source survives a Slide settings write above it, and one Delete removes exactly that range @crosswidth @webkit-phone @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await holdRange(page);
	await expect.poll(() => selectedText(page)).toBe(RANGE);

	// A localized write ABOVE the range: Compact spacing rewrites the slide's class comment.
	await openSlideLook(page);
	await page.getByRole('switch', { name: 'Compact spacing' }).filter({ visible: true }).first().click();
	await expect.poll(() => persistedSource(page)).toContain('<!-- _class: kpi compact -->');
	await expect.poll(() => deckEditorText(page)).toContain('<!-- _class: kpi compact -->');

	// The range is still held, whole.
	expect(await selectedText(page), 'the write collapsed the held range').toBe(RANGE);

	// At phone width the settings sheet covers the one pane on screen, so a key would go to the sheet: close it and bring
	// the Source pane back, as an author would, and check the range is still held after the switch.
	if (isPhone(page)) {
		await page.keyboard.press('Escape');
		await expect(page.getByRole('switch', { name: 'Compact spacing' }).filter({ visible: true }), 'Escape left the settings sheet open').toHaveCount(0);
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(page.getByLabel('Deck source')).toBeVisible();
		expect(await selectedText(page), 'switching back to Source dropped the held range').toBe(RANGE);
	}

	// And one Delete removes exactly it.
	await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		(document.querySelector('[aria-label="Deck source"]') as any)?.cmTile?.root?.view?.focus();
	});
	await page.keyboard.press('Delete');
	await expect.poll(() => deckEditorText(page)).toContain('\nalpha \n');
	expect(await deckEditorText(page)).not.toContain('beta');
});
