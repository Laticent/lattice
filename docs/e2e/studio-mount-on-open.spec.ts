import type { Page } from '@playwright/test';
import { expect, gotoStudio, openAddSlide, test } from './studio-fixture';

// THE PHONE'S CLOSED SURFACES MOUNT ON FIRST OPEN, AND THAT FIRST OPEN STILL WORKS.
//
// StudioShell used to mount the ⋯ drawer, the command palette, Send feedback, Version history, the
// compact panel sheets and both slide galleries at boot, closed. None is on screen at a phone's first
// slide, and together they cost ~70 ms of render before it
// (engineering/decisions/2026-11-09-studio-react-mount-profile.md §3 row 3). Each now mounts the
// first time it opens (`useLatch`, lazy-panel.tsx). So the first open is now a MOUNT, not a state
// flip on a mounted component, and this spec drives exactly that open, on a cold load, once per
// surface: it must slide in, take focus, and close again.
//
// Chromium at 390 px (`mobile`) and WebKit on the iPhone 15 Pro profile (`webkit-phone`). Both are
// emulation: a real iPhone is UNVERIFIED here.

/** The top dialog is open, has run (or is running) its enter animation, and holds focus. */
async function openedFresh(page: Page, name: string | RegExp): Promise<void> {
	const dialog = page.getByRole('dialog', { name }).last();
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAttribute('data-state', 'open');
	await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
}

async function openDrawer(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
	await openedFresh(page, 'Menu');
}

test.describe('first open of a surface that mounts on open', () => {
	test('@mobile @webkit-phone the ⋯ drawer opens on its first tap and gives focus back on close', async ({ page }) => {
		await gotoStudio(page);
		const menu = page.getByRole('button', { name: 'Menu', exact: true }).first();
		await openDrawer(page);
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(menu).toBeFocused();
		// The second open is the latched path: still mounted, a plain state flip.
		await openDrawer(page);
	});

	for (const row of [
		{ label: 'Send feedback', dialog: 'Send feedback' },
		{ label: 'Version history', dialog: 'Version history' },
		{ label: 'Search / commands', dialog: 'Search / commands' },
	]) {
		test(`@mobile @webkit-phone ${row.label} opens from the drawer on its first open`, async ({ page }) => {
			await gotoStudio(page);
			await openDrawer(page);
			await page.getByRole('button', { name: row.label, exact: true }).click();
			await openedFresh(page, row.dialog);
		});
	}

	test('@mobile @webkit-phone the slide gallery opens on its first open', async ({ page }) => {
		await gotoStudio(page);
		await openAddSlide(page, true);
		await expect(page.getByPlaceholder(/Search slides|Search \d+ slides/)).toBeVisible();
	});
});
