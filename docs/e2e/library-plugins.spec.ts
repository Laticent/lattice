import fs from 'node:fs';
import path from 'node:path';
import { BARS_RENDERER, ganttZip } from './plugin-fence-fixture';
import { CHROME, expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ── Importing a plugin: what the editor says, and what the Library shows ──────────────────────────
//
// 1. A deck can name a plugin BEFORE the person imports it. The editor then (correctly) warns `unknown-plugin`.
//    Importing the plugin must clear that warning without a keystroke, and removing it must bring it back. The plugin names
//    reach the linter through a shared array; the editor used to re-lint only on an edit, so a phone user who never typed
//    kept a stale warning beside a plugin that Deck settings showed as installed.
// 2. The Library lists what is installed, under a Plugins pill: a plugin-only shelf is not "No saved assets yet", a plugin-only
//    zip opens on the Plugins pill, the card says whether this browser has approved the code, and it has no select box and no
//    Share, so no gesture there can put a plugin's code in a bundle.
//
// With LATTICE_EVIDENCE_DIR=<dir> each state is saved at the width under test; off by default, so CI writes nothing.

const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';
const DECK = '---\nplugins: [gantt-plugin]\n---\n\n## Plan\n\n```gantt\nDesign 2\nBuild 4\n```\n';
type Page = import('@playwright/test').Page;

/** The Library opens from a different control at each width (the single-import spec reads the same ladder). */
async function openLibrary(page: Page, width = 1440): Promise<void> {
	if (width >= 1100) await page.getByRole('button', { name: CHROME.library }).click();
	else if (width >= 700) {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
		await page.getByRole('menuitem', { name: /^Library/ }).click();
	} else {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: /^Library/ }).click();
	}
}
const importZip = async (page: Page) => {
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(BARS_RENDERER) });
};

test('importing a plugin clears the unknown-plugin warning a deck got before it, and removing it brings it back @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	// The plugin is not installed yet: the warning is right, and it has to be on screen before the import for this to prove anything.
	await expect(page.locator('.cm-lintRange-warning').first()).toBeVisible({ timeout: 30_000 });
	await openLibrary(page);
	await importZip(page);
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await expect(page.locator('.cm-lintRange-warning')).toHaveCount(0, { timeout: 15_000 });
	// And the other way: removing the plugin makes the deck's list wrong again.
	await page.locator('[data-library-plugin="gantt-plugin"]').getByRole('button', { name: /^Delete / }).click();
	await page.getByRole('button', { name: /^Confirm delete / }).click();
	await expect(page.locator('[data-library-plugin]')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.locator('.cm-lintRange-warning').first()).toBeVisible({ timeout: 15_000 });
});

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`the Library lists an imported plugin under a Plugins pill, at ${label} (${width}px) @crosswidth @webkit-tablet @gecko`, async ({ page }) => {
		const shot = async (name: string) => {
			if (!EVIDENCE) return;
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `library-plugins-${name}-${width}.png`) });
		};
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await page.setViewportSize({ width, height });
		await openLibrary(page, width);
		const tabs = page.getByRole('tablist', { name: 'Library sections' });
		// A phone's sheet is still settling (and the keyboard may be up): click until the pill is the selected one.
		const pick = (name: string) => expect(async () => {
			await tabs.getByRole('tab', { name, exact: true }).click();
			await expect(tabs.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 1500 });
		}).toPass({ timeout: 15_000 });
		// Nothing installed yet: the pill is there, and says so in its own words.
		await pick('Plugins');
		await expect(page.getByText('No plugins yet')).toBeVisible();
		await shot('empty');
		await pick('All');

		await importZip(page);
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('Imported 1 plugin(s)');
		await expect(page.locator('[data-sonner-toast]').first()).not.toContainText('0 theme');
		// A plugin-only zip opens on the Plugins pill, and the shelf is not the empty state.
		await expect(tabs.getByRole('tab', { name: 'Plugins', exact: true })).toHaveAttribute('aria-selected', 'true');
		await expect(page.getByText('No saved assets yet')).toHaveCount(0);
		const card = page.locator('[data-library-plugin="gantt-plugin"]');
		await expect(card).toBeVisible();
		await expect(card).toContainText('Gantt (zip)');
		await expect(card).toContainText('Not approved');
		await expect(card).toContainText('```gantt');
		// Manage-only: no select box and no Share, so a plugin's code cannot ride a selection into a bundle.
		await expect(card.getByRole('button', { name: /^Select / })).toHaveCount(0);
		await expect(card.getByRole('button', { name: /Share/ })).toHaveCount(0);
		const box = await card.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'the card fits the width').toBe(true);
		// Every pill is reachable at this width: five pills must not push one off screen.
		for (const name of ['All', 'Design', 'Media', 'Files', 'Plugins']) {
			const tab = tabs.getByRole('tab', { name, exact: true });
			await expect(tab).toBeVisible();
			const b = await tab.boundingBox();
			expect(b && b.x >= 0 && b.x + b.width <= width + 1, `${name} pill is inside the viewport`).toBe(true);
		}
		await shot('card');
		// All shows it too, and a search narrows it.
		await pick('All');
		await expect(card).toBeVisible();
		await page.getByPlaceholder(/^Search themes/).fill('zzz-no-match');
		await expect(card).toHaveCount(0);
		await page.getByPlaceholder(/^Search themes/).fill('gantt');
		await expect(card).toBeVisible();
		await page.getByPlaceholder(/^Search themes/).fill('');
		// Remove.
		await pick('Plugins');
		await card.getByRole('button', { name: /^Delete / }).click();
		await page.getByRole('button', { name: /^Confirm delete / }).click();
		await expect(card).toHaveCount(0);
		await expect(page.getByText('No plugins yet')).toBeVisible();
	});
}
