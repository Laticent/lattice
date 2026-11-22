import { expect, type Locator, type Page, test } from '@playwright/test';
// The menu-timing helpers only (they take a page): the Playground is not the Studio, so not the fixture's `test`.
import { acceptCompletion, watchMenuOpen } from './studio-fixture';

// Completion inside a slide record in the real Playground editor (the Studio's side is meta-record-editing.spec.ts).
// `@meta` is the one spelling (owner, 2026-11-22, record note §15): `<!-- @m` offers it, inside its braces the fields
// complete, and after `name=` a register's own words. Both editors share `recordCompletion`
// (docs/src/playground/slide-context.js); this proves the Playground wires it, which a unit test of the source cannot.

/** The Playground's editor, emptied and focused. */
async function emptyEditor(page: Page): Promise<Locator> {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 40_000 });
	await editor.click();
	// Select all, checked rather than assumed: CodeMirror reads the iPhone's user agent as a Mac, so there it is Meta+A
	// (studio-fixture.ts `selectAllInEditor` has the measurement; playground-fix-all.spec.ts does the same).
	for (const combo of ['ControlOrMeta+a', 'Meta+a']) {
		await page.keyboard.press(combo);
		if (await page.evaluate(() => (window.getSelection()?.toString() ?? '').length > 0)) break;
	}
	await page.keyboard.press('Delete');
	await expect(editor).toHaveText('');
	return editor;
}

const menu = (page: Page) => page.locator('.cm-tooltip-autocomplete');

test('@crosswidth @webkit-phone @gecko the Playground completes a @meta record: the opener, its fields, a register value', async ({ page }) => {
	test.setTimeout(90_000);
	const editor = await emptyEditor(page);
	await page.keyboard.insertText('---\ntheme: indaco\n---\n\n# A\n\n');
	await watchMenuOpen(page);
	await page.keyboard.type('<!-- @m');
	await expect(menu(page).getByRole('option', { name: /^@meta\{/ })).toBeVisible({ timeout: 20_000 });
	await acceptCompletion(page);
	await expect(editor).toContainText('<!-- @meta{}');
	// The fields open at once, inside the braces.
	await expect(menu(page).getByRole('option', { name: /^layout/ })).toBeVisible();
	await page.keyboard.type('headl');
	await expect(menu(page).getByRole('option', { name: /^headline/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editor).toContainText('<!-- @meta{headline=}');
	await page.keyboard.type('l');
	await expect(menu(page).getByRole('option', { name: /^left/ })).toBeVisible();
	await acceptCompletion(page);
	await expect(editor).toContainText('<!-- @meta{headline=left}');
});
