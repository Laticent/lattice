import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The reference-PDF store, read through the real IndexedDB in real Chromium. This release WRITES a PDF as base64
// text (the format every build reads, so rolling back loses nothing) and READS both that and a Blob record (what the
// next release will write). The record carries the size that was decoded, typed as a PDF.

/** A PDF-shaped file: the `%PDF` header and 600 KB of bytes that do not compress to nothing. */
const PDF_BYTES = 600_000;

const rawRefDocs = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ name: string; blobSize: number | null; hasDataUrl: boolean; bytes: number; pdfTyped: boolean }[]>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const q = r.result.transaction('assets').objectStore('assets').index('kind').getAll('refdoc');
					q.onsuccess = () =>
						resolve(
							(q.result as { name: string; blob?: Blob; dataUrl?: string; bytes: number }[]).map((x) => ({ name: x.name, blobSize: x.blob instanceof Blob ? x.blob.size : null, hasDataUrl: typeof x.dataUrl === 'string', bytes: x.bytes, pdfTyped: typeof x.dataUrl === 'string' && x.dataUrl.startsWith('data:application/pdf;base64,') })),
						);
					q.onerror = () => reject(q.error);
				};
			}),
	);

async function openFiles(page: Page) {
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Files' }).click();
}

test('a PDF added in the Library is written as base64 text with its decoded size, and a binary-shaped record still lists', async ({ page }) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	await openFiles(page);
	const buffer = Buffer.alloc(PDF_BYTES);
	for (let i = 0; i < buffer.length; i++) buffer[i] = (i * 2654435761) >>> 24;
	buffer.write('%PDF-1.4\n', 0, 'latin1');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a reference doc' }).click();
	// A file with no type: the browser reads it as octet-stream, and the stored text must still say it is a PDF.
	await (await chooser).setFiles({ name: 'Brand Guide.pdf', mimeType: '', buffer });
	await expect(page.getByText('Brand Guide.pdf')).toBeVisible({ timeout: 20_000 });
	expect(await rawRefDocs(page)).toEqual([{ name: 'Brand Guide.pdf', blobSize: null, hasDataUrl: true, bytes: PDF_BYTES, pdfTyped: true }]);

	// A record shaped the way the next release will write it: a Blob and no text.
	await page.evaluate(
		(n) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onsuccess = () => {
					const t = r.result.transaction('assets', 'readwrite');
					t.objectStore('assets').put({ id: 'future-1', kind: 'refdoc', name: 'Future Guide.pdf', docKind: 'pdf', blob: new Blob([new Uint8Array(n)], { type: 'application/pdf' }), bytes: n, addedAt: 1 });
					t.oncomplete = () => resolve();
					t.onerror = () => reject(t.error);
				};
			}),
		3000,
	);
	await page.reload();
	await openFiles(page);
	await expect(page.getByText('Future Guide.pdf')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('Brand Guide.pdf')).toBeVisible();
	expect((await rawRefDocs(page)).find((d) => d.name === 'Future Guide.pdf')).toMatchObject({ blobSize: 3000, hasDataUrl: false });
	await page.screenshot({ path: test.info().outputPath('library-files.png') });
});
