import { expect, gotoStudio, persistedSource, test } from './studio-fixture';

// Workspace-inherited reader views (Option B) on the REAL browser — the real-surface confirmation
// (HARD RULE #23) of the delta model the registry unit tests and the jsdom StudioShell tests prove.
// With the "Default reader views" setting ON (the app default), every deck inherits two starter views
// (Bottom line + The evidence) that show in the Lenses panel WITHOUT being written to the deck source;
// they stay reader-invisible until the author approves one; turning the setting off removes them from a
// deck that never materialized one. Inheritance ON is the default, so these tests seed nothing extra.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByRole('tab', { name: 'Coach' })).toBeVisible();
	// Reader views live on the Architect's Lenses tab now — open it.
	await page.getByRole('tab', { name: 'Lenses' }).click();
});

test('a fresh deck inherits the two starter views WITHOUT writing a lenses: block', async ({ page }) => {
	// Both inherited starters are rows in the Lenses panel, unbidden.
	await expect(page.getByText('Bottom line')).toBeVisible();
	await expect(page.getByText('The evidence')).toBeVisible();
	// The Add menu offers only the archetypes NOT already inherited.
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await expect(page.getByRole('button', { name: /The story/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /The ask/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Bottom line/ })).toHaveCount(1); // the inherited row only
	await page.keyboard.press('Escape');

	// Make an edit so the source persists, then confirm NOTHING lens-related was written — the views are
	// inherited, not materialized. Type into the editor to trigger a persist.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nInherited, not written.');
	await expect.poll(() => persistedSource(page)).toContain('Inherited, not written.');
	expect(await persistedSource(page)).not.toContain('lenses:');
});

test('approving an inherited view materializes ONLY that view into the deck source', async ({ page }) => {
	// Expand The evidence (base:all → already every slide), preview, approve.
	await page.getByText('The evidence').click();
	await page.getByRole('button', { name: /^Preview$/ }).click();
	await page.getByRole('button', { name: /Approve for readers/ }).click();
	// The approved view is now written (with its content hash); the still-inherited Bottom line is NOT.
	await expect.poll(() => persistedSource(page)).toContain('lenses:');
	const src = await persistedSource(page);
	expect(src).toContain('evidence:');
	expect(src).toContain('approved:');
	expect(src).not.toMatch(/\bbrief:/); // Bottom line stays inherited, not materialized
});

test('tagging an inherited view materializes it — it survives turning the setting OFF (#993)', async ({ page }) => {
	// Tag slides into the inherited Bottom line (accept the deterministic suggester's proposal).
	await page.getByText('Bottom line').click();
	await page.getByRole('button', { name: 'Accept all' }).click();
	// Tagging materializes it into the deck source — written, but still UNAPPROVED (no reader sees it yet).
	await expect.poll(() => persistedSource(page)).toMatch(/\bbrief:/);
	// Now turn Default reader views OFF.
	await page.getByRole('button', { name: 'Workspace settings' }).click();
	await page.getByRole('tab', { name: 'General' }).click();
	await page.getByRole('switch', { name: 'Default reader views' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('switch', { name: 'Default reader views' })).toBeHidden(); // sheet closed
	// Bottom line PERSISTS as a panel row (the deck owns it now); the untouched The evidence is gone.
	// Scoped to the row heading button — "Bottom line"/"The evidence" also appear in the editor + the
	// Workspace copy, so a bare getByText would be ambiguous.
	await expect(page.getByRole('button', { name: /Bottom line/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /The evidence/ })).toHaveCount(0);
});

test('turning the setting OFF removes the inherited starters from an untouched deck', async ({ page }) => {
	await expect(page.getByText('Bottom line')).toBeVisible();
	// Open Workspace → General and flip Default reader views off (the sheet opens on the AI tab).
	await page.getByRole('button', { name: 'Workspace settings' }).click();
	await page.getByRole('tab', { name: 'General' }).click();
	const toggle = page.getByRole('switch', { name: 'Default reader views' });
	await expect(toggle).toBeVisible();
	await toggle.click();
	await page.keyboard.press('Escape'); // close the sheet
	// The starters are gone from the Lenses panel — the deck never materialized them, so nothing remains.
	await expect(page.getByText('Bottom line')).toHaveCount(0);
	await expect(page.getByText('The evidence')).toHaveCount(0);
});
