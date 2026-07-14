import { expect, gotoStudio, test } from './studio-fixture';

// Reader views (the Lenses panel) — the human-in-the-loop gate, on the REAL browser (the jsdom e2e in
// StudioShell.test.tsx proves the same loop; this is the real-surface confirmation, HARD RULE #23).
// A machine SUGGESTS membership; the author accepts, PREVIEWS, and APPROVES — and only then is the view
// offered to a reader in Present. A draft view is never presentable.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
});

test('a reader view is offered to a reader ONLY after the author previews + approves it', async ({ page }) => {
	// Add a Bottom-line reader view and accept the (deterministic, no-AI) suggester's proposal.
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name: /Bottom line/ }).click();
	await page.getByRole('button', { name: 'Accept all' }).click();

	// It's a DRAFT — Present must NOT offer it to a reader yet (and a registry deck drops the legacy
	// Exec/One-pager heuristics from the reader picker).
	await page.getByRole('button', { name: 'Present' }).click();
	const present = page.getByRole('dialog', { name: 'Present' });
	await present.getByRole('button', { name: 'Reader view' }).click();
	await expect(page.getByRole('menuitem', { name: /Full deck/ })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: /Bottom line/ })).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: /Exec summary/ })).toHaveCount(0);
	await page.keyboard.press('Escape'); // close the menu
	await page.keyboard.press('Escape'); // exit Present
	await expect(present).toBeHidden();

	// Preview (the approval gate) then approve.
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await page.getByRole('button', { name: /Approve for readers/ }).click();

	// NOW a reader is offered the view.
	await page.getByRole('button', { name: 'Present' }).click();
	await present.getByRole('button', { name: 'Reader view' }).click();
	await expect(page.getByRole('menuitem', { name: /Bottom line/ })).toBeVisible();
});

test('Approve is withheld until the view is previewed', async ({ page }) => {
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name: /Bottom line/ }).click();
	await page.getByRole('button', { name: 'Accept all' }).click();
	// Before previewing, there is no Approve button — only the gated stand-in.
	await expect(page.getByRole('button', { name: /Approve for readers/ })).toHaveCount(0);
	await expect(page.getByText(/Preview to approve/i)).toBeVisible();
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await expect(page.getByRole('button', { name: /Approve for readers/ })).toBeVisible();
});
