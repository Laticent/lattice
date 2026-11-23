import { expect, type Page, test } from '@playwright/test';
// The menu-timing helpers only (they take a page): the Specimen is not the Studio, so not the fixture's `test`.
import { acceptCompletion, watchMenuOpen } from './studio-fixture';

// Completion inside a slide record in the Playground's completer (docs/src/playground/complete.js), on the one page that
// runs it: the editable Specimen on a component's docs page (specimen.js `createEditor`). The Playground page itself
// builds its editor with `autocomplete: false` (EditorHost.tsx: "validation only on this surface"), so it has no menu
// to drive. The Studio's side is meta-record-editing.spec.ts. `@meta` is the one spelling (owner, 2026-11-22, record
// note §15): `<!-- @m` offers it, inside its braces the fields complete, and after `name=` a register's own words.

async function openSpecimenSource(page: Page) {
	await page.goto('/components/statement/big-number/', { waitUntil: 'load' });
	await page.locator('.specimen-face-btn[data-face="source"]').first().click();
	// The Specimen focuses its editor on mount (editor-selection-parity.spec.ts drives the same open).
	await expect(page.locator('.specimen-editor-host .cm-editor.cm-focused')).toHaveCount(1, { timeout: 30_000 });
	return page.locator('.specimen-editor-host .cm-content').first();
}

const menu = (page: Page) => page.locator('.cm-tooltip-autocomplete');

test('@crosswidth @webkit-phone @gecko the Specimen completes a @meta record: the opener, its fields, a register value', async ({ page }) => {
	test.setTimeout(90_000);
	const editor = await openSpecimenSource(page);
	// A new line at the end of the sample, so the record is typed on a line of its own.
	const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) || /iPhone|iPad/.test(navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+ArrowDown' : 'Control+End');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
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
