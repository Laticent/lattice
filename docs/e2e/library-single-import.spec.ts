import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The Library's ONE Import button, driven on the real Studio. What a file is decides where it goes, and
// the Library opens on what was just added; a mixed batch opens All with the new items first.
// A real file chooser, not a stand-in: the button must open the browser's own picker for every kind.

const require = createRequire(import.meta.url);
const spine = require('../../lib/packages/index.js');
const ROOT = path.resolve(import.meta.dirname, '../..');

/** A repo component written by the spine as `probe-content` (a shipped name would import as -custom). */
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

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function openLibrary(page: Page, width: number) {
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

async function addPhotos(page: Page) {
	const dialog = page.getByRole('dialog', { name: /^Add \d+ photo/ });
	await dialog.getByRole('radio', { name: 'Keep original' }).click();
	await dialog.getByRole('button', { name: /^Add photo/ }).click();
}

/** The kind the Filter menu is set to, read the way a person reads it: open the menu and look. */
async function filterIs(page: Page, label: string) {
	await page.getByRole('button', { name: 'Filter' }).click();
	await expect(page.getByRole('menuitemradio', { name: label })).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
}

const selected = (page: Page, name: string, label: string) => expect(page.getByRole('tablist', { name }).getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');

for (const vw of [1440, 820, 390]) {
	test.describe(`at ${vw}px`, () => {
		test.use({ viewport: { width: vw, height: vw === 1440 ? 900 : 1000 } });

		test(`one Import button: a photo opens Images, a note opens Files, a mix opens All newest first @smoke${vw === 1440 ? " @webkit-tablet @gecko" : ""}`, async ({ page }, testInfo) => {
			test.slow();
			await gotoStudio(page);
			await openLibrary(page, vw);
			// The same control on every section.
			for (const label of ['All', 'Design', 'Media', 'Files']) {
				await page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: label, exact: true }).click();
				await expect(page.getByRole('button', { name: 'Import files', exact: true })).toBeVisible();
			}
			await expect(page.getByRole('button', { name: /^Add (image|video|file)/ })).toHaveCount(0);
			// What iOS and Android build their picker from: `image/*` and `video/*` in `accept` and NO `capture`
			// (a `capture` skips the choice and opens the camera). With these, a phone offers Take Photo, Photo Library
			// and Choose Files. The sheet itself is the phone's and is not reachable from here (UNVERIFIED on a device).
			const input = page.getByTestId('library-import-input');
			const accept = (await input.getAttribute('accept')) ?? '';
			for (const t of ['image/*', 'video/*', '.zip', '.pdf']) expect(accept.split(','), `accept lists ${t}`).toContain(t);
			await expect(input).not.toHaveAttribute('capture', /.*/);

			// A photo, imported from the Files section: it opens Media → Images.
			await importFiles(page, [{ name: 'one.png', mimeType: 'image/png', buffer: PNG }]);
			await addPhotos(page);
			await expect(page.locator('[data-media-card="one"]')).toBeVisible({ timeout: 20_000 });
			await selected(page, 'Library sections', 'Media');
			await filterIs(page, 'Images');

			// A reference file, imported from Images: it opens Files.
			await importFiles(page, [{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n') }]);
			await expect(page.getByText('notes.md')).toBeVisible({ timeout: 20_000 });
			await selected(page, 'Library sections', 'Files');

			// A mix opens All, and what just landed sorts above what was already there.
			await importFiles(page, [
				{ name: 'two.png', mimeType: 'image/png', buffer: PNG },
				{ name: 'brief.md', mimeType: 'text/markdown', buffer: Buffer.from('# Brief\n') },
			]);
			await addPhotos(page);
			await expect(page.locator('[data-media-card="two"]')).toBeVisible({ timeout: 20_000 });
			await expect(page.getByText('brief.md')).toBeVisible();
			await selected(page, 'Library sections', 'All');
			const text = await page.locator('.grid.grid-cols-1').first().innerText();
			expect(text.indexOf('two'), 'two.png sorts above one.png').toBeGreaterThan(-1);
			expect(text.indexOf('brief.md'), 'brief.md sorts above notes.md').toBeLessThan(text.indexOf('notes.md'));
			expect(text.indexOf('notes.md'), 'notes.md sorts above one.png').toBeLessThan(text.indexOf('one'));
			await page.screenshot({ path: testInfo.outputPath(`library-import-${vw}.png`) });
		});
	});
}

test('a package .zip opens Design and wears the Imported tag; a photo beside it opens All', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openLibrary(page, 1440);
	await importFiles(page, [{ name: 'probe-content.zip', mimeType: 'application/zip', buffer: await probeZip() }]);
	await expect(page.getByRole('button', { name: 'Share .probe-content' })).toBeVisible({ timeout: 20_000 });
	await selected(page, 'Library sections', 'Design');
	const card = page.locator('div.rounded-xl', { hasText: '.probe-content' }).first();
	await expect(card.getByText('Imported', { exact: true })).toBeVisible();
	// It survives a reload as imported: the tag is stored on the record, not held in memory.
	await page.reload();
	await openLibrary(page, 1440);
	await page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Design', exact: true }).click();
	await expect(page.locator('div.rounded-xl', { hasText: '.probe-content' }).first().getByText('Imported', { exact: true })).toBeVisible();

	await importFiles(page, [
		{ name: 'probe-content.zip', mimeType: 'application/zip', buffer: await probeZip() },
		{ name: 'three.png', mimeType: 'image/png', buffer: PNG },
	]);
	await addPhotos(page);
	await expect(page.locator('[data-media-card="three"]')).toBeVisible({ timeout: 20_000 });
	await selected(page, 'Library sections', 'All');
});
