import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { CHROME, expect, gotoStudio, openSection, test } from './studio-fixture';

// A real workspace backup, restored on an empty device, brings back every Library item.
//
// The backup is the file the real Workspace sheet downloads, not one built by hand: a package .zip, a photo
// and a reference note go in through the one Import button, "Download backup" writes the zip, and a SECOND
// browser context (an empty IndexedDB, the nearest thing to a new device) restores it. The oracle is the
// Library a person sees: every item is on its shelf after the restore.
//
// Also pinned: the Imported tag. A package item wears it because its record says `origin: 'imported'`; the
// backup's library.zip is package folders, which carry no `origin`, so a restored item has NO tag. This
// asserts that as the contract (the tag marks "arrived from a package this session", not provenance for
// life), so a change to it is a decision rather than a drift.

const require = createRequire(import.meta.url);
const spine = require('../../lib/packages/index.js');
const ROOT = path.resolve(import.meta.dirname, '../..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function probeZip(): Promise<Buffer> {
	const dir = path.join(ROOT, 'lib/components/statement/content');
	const files: Record<string, string> = {};
	for (const f of ['content.manifest.json', 'content.styles.css', 'content.gallery.md', 'content.docs.md']) files[f] = fs.readFileSync(path.join(dir, f), 'utf8');
	const r = spine.readPackage(files, { type: 'component', strict: true });
	const out = spine.writePackage({ ...r.pkg, name: 'probe-content', manifest: { ...r.pkg.manifest, name: 'probe-content' } });
	const zip = new JSZip();
	for (const [f, text] of Object.entries(out)) zip.file(`probe-content/${f}`, text as string);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function openLibrary(page: Page) {
	const width = page.viewportSize()?.width ?? 1440;
	if (width >= 1100) await page.getByRole('button', { name: CHROME.library }).click();
	else if (width >= 700) {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
		await page.getByRole('menuitem', { name: /^Library/ }).click();
	} else {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: /^Library/ }).click();
	}
}

async function importFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import files', exact: true }).click();
	await (await chooser).setFiles(files);
}

const section = (page: Page, label: string) => page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: label, exact: true }).click();

test('a real backup restored on an empty device brings back every Library item @smoke', async ({ page, browser }, testInfo) => {
	test.slow();
	await gotoStudio(page);
	await openLibrary(page);
	await importFiles(page, [{ name: 'probe-content.zip', mimeType: 'application/zip', buffer: await probeZip() }]);
	await expect(page.getByRole('button', { name: 'Share .probe-content' })).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('div.rounded-xl', { hasText: '.probe-content' }).first().getByText('Imported', { exact: true })).toBeVisible();
	await importFiles(page, [{ name: 'one.png', mimeType: 'image/png', buffer: PNG }]);
	const dialog = page.getByRole('dialog', { name: /^Add \d+ photo/ });
	await dialog.getByRole('radio', { name: 'Keep original' }).click();
	await dialog.getByRole('button', { name: /^Add photo/ }).click();
	await expect(page.locator('[data-media-card="one"]')).toBeVisible({ timeout: 20_000 });
	await importFiles(page, [{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n') }]);
	await expect(page.getByText('notes.md')).toBeVisible({ timeout: 20_000 });
	await page.keyboard.press('Escape');

	// Back up through the real sheet.
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
	const pending = page.waitForEvent('download', { timeout: 120_000 });
	await page.getByRole('button', { name: 'Download backup' }).click();
	const backupPath = (await (await pending).path()) as string;
	const zip = await JSZip.loadAsync(fs.readFileSync(backupPath));
	const manifest = JSON.parse(await (zip.file('manifest.json') as JSZip.JSZipObject).async('string'));
	expect(manifest.counts.components, 'the package component is in the backup').toBe(1);
	expect(manifest.counts.media, 'the photo is in the backup').toBe(1);

	// An empty device: a fresh context has its own empty IndexedDB.
	const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, acceptDownloads: true });
	const fresh = await ctx.newPage();
	try {
		await gotoStudio(fresh);
		await fresh.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
		await expect(fresh.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
		await openSection(fresh, 'Data');
		await fresh.getByLabel('Restore a workspace backup').setInputFiles(backupPath);
		await expect(fresh.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first()).toBeVisible({ timeout: 60_000 });
		await fresh.waitForLoadState('load');

		await openLibrary(fresh);
		await section(fresh, 'All');
		await expect(fresh.getByRole('button', { name: 'Share .probe-content' })).toBeVisible({ timeout: 30_000 });
		await expect(fresh.locator('[data-media-card="one"]')).toBeVisible();
		await expect(fresh.getByText('notes.md')).toBeVisible();
		// The tag: package folders carry no `origin`, so the restored item is untagged.
		await section(fresh, 'Design');
		const card = fresh.locator('div.rounded-xl', { hasText: '.probe-content' }).first();
		await expect(card).toBeVisible();
		await expect(card.getByText('Imported', { exact: true })).toHaveCount(0);
		await fresh.screenshot({ path: testInfo.outputPath('library-after-restore.png') });
	} finally {
		await ctx.close();
	}
});
