import type { Page } from '@playwright/test';
import { expect, gotoStudio, openInspector, persistedByPrefix, persistedSource, test, toastText } from './studio-fixture';

// The Deck inspector's front-matter controls, speaker notes, and version history.
// Front-matter writes are asserted both on the immediate outer-DOM signal
// (control label / aria-checked) and, where it matters, on the persisted source.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await openInspector(page);
});

test('@smoke size control writes the size front-matter', async ({ page }) => {
	await page.getByRole('button', { name: /Widescreen 16 . 9/ }).click();
	await page.getByRole('menuitem', { name: /Standard 4 . 3/ }).click();

	await expect(page.getByRole('button', { name: /Standard 4 . 3/ })).toBeVisible();
	await expect.poll(() => persistedSource(page)).toContain('size: standard');
});

// Header / Footer / Page numbers / Section rail live under the Inspector's
// "Marks" tab (DECK_TABS); the panel opens on "Look". Selecting the tab is part
// of the flow — these two specs were silently red for want of that one click.
async function openMarksTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'Marks' }).click();
}

test('page-numbers toggle writes paginate front-matter', async ({ page }) => {
	await openMarksTab(page);
	const toggle = page.getByRole('switch', { name: 'Page numbers' });
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => persistedSource(page)).toContain('paginate: true');
});

test('the Header field declares running-header text into front-matter', async ({ page }) => {
	// Header is a text DECLARATION now (you state the copy), not a toggle.
	await openMarksTab(page);
	const header = page.getByRole('textbox', { name: 'Header' });
	await header.click();
	await header.fill('Acme — Q3');
	await header.blur();
	await expect.poll(() => persistedSource(page)).toContain('header:');
});

test('a speaker note is written into the slide source on blur', async ({ page }) => {
	// The speaker note lives in the Inspector's SLIDE scope, under the "Notes" tab.
	// Open Slide settings (which points the panel at slide scope), then the Notes tab.
	await page.getByRole('button', { name: 'Slide settings' }).click();
	await page.getByRole('tab', { name: 'Notes' }).click();
	const note = page.getByRole('textbox', { name: 'Speaker note for this slide' });
	await note.click();
	await note.fill('Open with the headline number.');
	await note.blur();

	await expect.poll(() => persistedSource(page)).toContain('note: Open with the headline number.');
});

test('saving a version records a checkpoint', async ({ page }) => {
	// Version history moved out of the inspector into its own top-bar sheet.
	await page.getByRole('button', { name: 'Version history' }).click();
	await page.getByRole('button', { name: 'Save a version' }).click();
	await expect(toastText(page)).toContainText('Version saved');

	await expect.poll(async () => {
		const snaps = await persistedByPrefix(page, 'snap');
		return snaps ? JSON.parse(snaps).length : 0;
	}).toBeGreaterThan(0);
});
