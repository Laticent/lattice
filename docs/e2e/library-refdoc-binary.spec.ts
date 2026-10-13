import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// A saved reference PDF is binary at rest. The unit tests prove it against fake-indexeddb; this reads the real
// IndexedDB in real Chromium: the record holds a Blob the size of the file, no base64 text, and a record
// written the old way (base64 text) is rewritten as binary the first time the Library opens.

/** A PDF-shaped file: the `%PDF` header and 600 KB of bytes that do not compress to nothing. */
const PDF_BYTES = 600_000;

const rawRefDocs = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ name: string; blobSize: number | null; hasDataUrl: boolean; bytes: number }[]>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const q = r.result.transaction('assets').objectStore('assets').index('kind').getAll('refdoc');
					q.onsuccess = () =>
						resolve(
							(q.result as { name: string; blob?: Blob; dataUrl?: string; bytes: number }[]).map((x) => ({ name: x.name, blobSize: x.blob instanceof Blob ? x.blob.size : null, hasDataUrl: typeof x.dataUrl === 'string', bytes: x.bytes })),
						);
					q.onerror = () => reject(q.error);
				};
			}),
	);

async function openFiles(page: Page) {
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Files' }).click();
}

test('a PDF added in the Library is stored as binary, and a legacy base64 record is rewritten as binary on open', async ({ page }) => {
	test.setTimeout(90_000);
	await gotoStudio(page);
	await openFiles(page);
	const buffer = Buffer.alloc(PDF_BYTES);
	for (let i = 0; i < buffer.length; i++) buffer[i] = (i * 2654435761) >>> 24;
	buffer.write('%PDF-1.4\n', 0, 'latin1');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a reference doc' }).click();
	await (await chooser).setFiles({ name: 'Brand Guide.pdf', mimeType: 'application/pdf', buffer });
	await expect(page.getByText('Brand Guide.pdf')).toBeVisible({ timeout: 20_000 });
	expect(await rawRefDocs(page)).toEqual([{ name: 'Brand Guide.pdf', blobSize: PDF_BYTES, hasDataUrl: false, bytes: PDF_BYTES }]);

	// Write one the way the app used to: PDF bytes as base64 text, no blob.
	await page.evaluate(
		(b64) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('lattice-workbench');
				r.onsuccess = () => {
					const t = r.result.transaction('assets', 'readwrite');
					t.objectStore('assets').put({ id: 'legacy-1', kind: 'refdoc', name: 'Old Guide.pdf', docKind: 'pdf', dataUrl: `data:application/pdf;base64,${b64}`, bytes: 3000, addedAt: 1 });
					t.oncomplete = () => resolve();
					t.onerror = () => reject(t.error);
				};
			}),
		Buffer.alloc(3000, 7).toString('base64'),
	);
	expect((await rawRefDocs(page)).find((d) => d.name === 'Old Guide.pdf')).toMatchObject({ blobSize: null, hasDataUrl: true });

	await page.reload();
	await openFiles(page);
	await expect.poll(async () => (await rawRefDocs(page)).find((d) => d.name === 'Old Guide.pdf'), { timeout: 20_000 }).toMatchObject({ blobSize: 3000, hasDataUrl: false });
	await expect(page.getByText('Old Guide.pdf')).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('library-files.png') });
});
