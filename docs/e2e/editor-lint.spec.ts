import { appendToEditor, expect, gotoStudio, openInspector, test } from './studio-fixture';

// The editor's real grammar lint (shared lint-core). An unknown component makes
// Fix-all actionable and surfaces an inline-issue count in the Coach; turning
// inline validation off stands the linter down. The Fix-all enabled/disabled
// state is the reliable outer-DOM oracle (the Coach banner lives in the
// collapsed-by-default Architect panel).

const UNKNOWN_SLIDE = '\n\n---\n\n<!-- _class: zzznotacomponent -->\n\n# Stray slide\n';
const fixAll = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Fix all/i });

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('an unknown component makes Fix-all actionable; validation-off clears it', async ({ page }) => {
	// With no issues, Fix-all is disabled.
	await expect(fixAll(page)).toBeDisabled();

	await appendToEditor(page, UNKNOWN_SLIDE);
	await expect(fixAll(page)).toBeEnabled();

	// Turning inline validation off makes nothing "unknown" → Fix-all disabled again.
	await openInspector(page);
	await page.getByRole('switch', { name: 'Inline validation' }).click();
	await expect(fixAll(page)).toBeDisabled();
});

test('the Coach surfaces the inline-issue count', async ({ page }) => {
	await appendToEditor(page, UNKNOWN_SLIDE);
	// The count lives in the Architect Coach, which is collapsed by default.
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByText(/\d+ inline issue/)).toBeVisible();
});
