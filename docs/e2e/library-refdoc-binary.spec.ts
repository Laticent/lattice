import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The reference-PDF store, read through the real IndexedDB in real Chromium. A PDF is WRITTEN as a Blob of the
// file's own size, with no base64 text (`WRITE_PDFS_AS_BINARY`), and a record saved as base64 text by an earlier
// build is rewritten as its bytes the next time the Library opens (`migrateLegacyRefDocs`).

/** A PDF-shaped file: the `%PDF` header and 600 KB of bytes that do not compress to nothing. */
const PDF_BYTES = 600_000;

const rawRefDocs = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ name: string; blobSize: number | null; blobType: string | null; hasDataUrl: boolean; bytes: number }[]>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const q = r.result.transaction('assets').objectStore('assets').index('kind').getAll('refdoc');
					q.onsuccess = () =>
						resolve(
							(q.result as { name: string; blob?: Blob; dataUrl?: string; bytes: number }[]).map((x) => ({ name: x.name, blobSize: x.blob instanceof Blob ? x.blob.size : null, blobType: x.blob instanceof Blob ? x.blob.type : null, hasDataUrl: typeof x.dataUrl === 'string', bytes: x.bytes })),
						);
					q.onerror = () => reject(q.error);
				};
			}),
	);

async function openFiles(page: Page) {
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Files' }).click();
}

test('a PDF added in the Library is stored as a Blob of its own size, and an old base64 record is rewritten on open', async ({ page }) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	await openFiles(page);
	const buffer = Buffer.alloc(PDF_BYTES);
	for (let i = 0; i < buffer.length; i++) buffer[i] = (i * 2654435761) >>> 24;
	buffer.write('%PDF-1.4\n', 0, 'latin1');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import files', exact: true }).click();
	// A file with no type: the browser reads it as octet-stream, and it is still stored as the PDF's bytes.
	await (await chooser).setFiles({ name: 'Brand Guide.pdf', mimeType: '', buffer });
	await expect(page.getByText('Brand Guide.pdf')).toBeVisible({ timeout: 20_000 });
	expect(await rawRefDocs(page)).toEqual([{ name: 'Brand Guide.pdf', blobSize: PDF_BYTES, blobType: 'application/pdf', hasDataUrl: false, bytes: PDF_BYTES }]);

	// A record shaped the way builds before #2672 could write it: base64 text, no Blob, the wrong type and a size it
	// claimed rather than measured.
	await page.evaluate(
		(n) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onsuccess = () => {
					const t = r.result.transaction('assets', 'readwrite');
					const b64 = btoa(`%PDF-1.4\n${'x'.repeat(n - 9)}`);
					t.objectStore('assets').put({ id: 'legacy-1', kind: 'refdoc', name: 'Old Guide.pdf', docKind: 'pdf', dataUrl: `data:application/octet-stream;base64,${b64}`, bytes: 1, addedAt: 1 });
					t.oncomplete = () => resolve();
					t.onerror = () => reject(t.error);
				};
			}),
		3000,
	);
	await page.reload();
	await openFiles(page);
	await expect(page.getByText('Old Guide.pdf')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('Brand Guide.pdf')).toBeVisible();
	// Opening the Library rewrote it: now bytes and no text, typed as a PDF and sized from what was decoded.
	await expect.poll(async () => (await rawRefDocs(page)).find((d) => d.name === 'Old Guide.pdf'), { timeout: 10_000 }).toMatchObject({ blobSize: 3000, blobType: 'application/pdf', hasDataUrl: false, bytes: 3000 });
	await page.screenshot({ path: test.info().outputPath('library-files.png') });
});
