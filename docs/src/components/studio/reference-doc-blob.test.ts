// @vitest-environment node
// Real IndexedDB (fake-indexeddb): the claim is about WHAT IS STORED, which a mock of the store would only echo.
// A saved PDF is binary at rest (a Blob), not base64 text: a third smaller, and a list read holds no string for it.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { blobToDataUrl, dataUrlToBlob } from './reference-doc';
import { listRefDocs, migrateLegacyRefDocs, recordToDoc, refDocBlob, saveRefDoc, swapLegacyRefDoc } from './reference-doc-store';

const PDF = new Uint8Array(Array.from({ length: 3000 }, (_, i) => (i * 37 + 11) % 256));
const urlOf = (bytes: Uint8Array) => `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
const rawRows = async () => (await listAssets('refdoc')) as Array<Record<string, unknown>>;
const wipe = async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
};
beforeEach(wipe);

describe('with the writer off, a saved PDF is written as base64 text, the format every build reads', () => {
	it('stores the text typed as a PDF, sized from what was decoded, with no Blob', async () => {
		await saveRefDoc({ name: 'a.pdf', kind: 'pdf', dataUrl: `data:text/html;base64,${Buffer.from(PDF).toString('base64')}`, bytes: -1e15 }, 1, { binary: false });
		await saveRefDoc({ name: 'b.pdf', kind: 'pdf', dataUrl: `data:application/octet-stream;base64,${Buffer.from(PDF).toString('base64')}`, bytes: 1 }, 2, { binary: false });
		for (const raw of await rawRows()) {
			expect(raw.dataUrl).toBe(urlOf(PDF));
			expect(raw.blob).toBeUndefined();
			expect(raw.bytes).toBe(PDF.length);
		}
	});

	it('still refuses text that is not base64', async () => {
		await expect(saveRefDoc({ name: 'bad.pdf', kind: 'pdf', dataUrl: 'data:application/pdf;base64,@@@', bytes: 3 }, 3)).rejects.toThrow();
		expect(await rawRows()).toEqual([]);
	});

	it('is not the default: the writer is on (pre-GA, no older build to protect)', async () => {
		await saveRefDoc({ name: 'c.pdf', kind: 'pdf', dataUrl: urlOf(PDF), bytes: PDF.length }, 1);
		const [raw] = await rawRows();
		expect(raw.blob).toBeInstanceOf(Blob);
		expect(raw.dataUrl).toBeUndefined();
	});
});

describe('a saved PDF is stored as binary when the writer is on', () => {
	it('keeps the bytes as a Blob and no base64 text, and gives the request its base64 when it is attached', async () => {
		await saveRefDoc({ name: 'brand.pdf', kind: 'pdf', dataUrl: urlOf(PDF), bytes: PDF.length }, 1, { binary: true });
		const [raw] = await rawRows();
		expect(raw.blob).toBeInstanceOf(Blob);
		expect((raw.blob as Blob).size).toBe(PDF.length);
		expect(raw.dataUrl).toBeUndefined();
		const [rec] = await listRefDocs();
		expect(new Uint8Array(await (refDocBlob(rec) as Blob).arrayBuffer())).toEqual(PDF);
		expect((await recordToDoc(rec)).dataUrl).toBe(urlOf(PDF));
	});

	it('is a third smaller than the text it replaces, measured', () => {
		const text = urlOf(PDF).length - 'data:application/pdf;base64,'.length;
		expect(text / PDF.length).toBeGreaterThan(1.33);
		expect(text / PDF.length).toBeLessThan(1.34);
	});

	it('leaves a text doc alone', async () => {
		await saveRefDoc({ name: 'guide.md', kind: 'text', text: 'cobalt', bytes: 6 }, 2, { binary: true });
		const [raw] = await rawRows();
		expect(raw).toMatchObject({ docKind: 'text', text: 'cobalt' });
		expect(raw.blob).toBeUndefined();
		expect(refDocBlob((await listRefDocs())[0])).toBeNull();
	});

	it('takes the size from the bytes it decoded, not the size the row claims, so a hostile row cannot zero the cost guard', async () => {
		await saveRefDoc({ name: 'cheap.pdf', kind: 'pdf', dataUrl: urlOf(PDF), bytes: -1e15 }, 1, { binary: true });
		await saveRefDoc({ name: 'note.md', kind: 'text', text: 'x', bytes: -1e15 }, 2, { binary: true });
		await saveRefDoc({ name: 'big.md', kind: 'text', text: 'x', bytes: 1e15 }, 3, { binary: true });
		const rows = Object.fromEntries((await listRefDocs()).map((r) => [r.name, r.bytes]));
		expect(rows).toEqual({ 'cheap.pdf': PDF.length, 'note.md': 0, 'big.md': 5 * 1024 * 1024 });
	});

	it('stores a PDF typed as a PDF whatever its text claimed, so the model is never sent another type', async () => {
		await saveRefDoc({ name: 'a.pdf', kind: 'pdf', dataUrl: `data:text/html;base64,${Buffer.from(PDF).toString('base64')}`, bytes: 1 }, 1, { binary: true });
		await saveRefDoc({ name: 'b.pdf', kind: 'pdf', dataUrl: `data:application/octet-stream;base64,${Buffer.from(PDF).toString('base64')}`, bytes: 1 }, 2, { binary: true });
		for (const rec of await listRefDocs()) {
			expect((rec.blob as Blob).type).toBe('application/pdf');
			expect((await recordToDoc(rec)).dataUrl).toBe(urlOf(PDF));
		}
	});

	it('refuses a PDF whose text is not base64 rather than storing it', async () => {
		await expect(saveRefDoc({ name: 'bad.pdf', kind: 'pdf', dataUrl: 'data:application/pdf;base64,@@@', bytes: 3 }, 3, { binary: true })).rejects.toThrow();
		expect(await rawRows()).toEqual([]);
	});
});

describe('records written before PDFs were binary', () => {
	const legacy = async () => {
		const { putAsset } = await import('./library/asset-store.js');
		await putAsset({ kind: 'refdoc', name: 'old.pdf', docKind: 'pdf', dataUrl: urlOf(PDF), bytes: PDF.length, addedAt: 5 });
	};

	it('still read and still download', async () => {
		await legacy();
		const [rec] = await listRefDocs();
		expect(new Uint8Array(await (refDocBlob(rec) as Blob).arrayBuffer())).toEqual(PDF);
		expect((await recordToDoc(rec)).dataUrl).toBe(urlOf(PDF));
	});

	it('are rewritten as binary once, keeping their id, name and date', async () => {
		await legacy();
		const [before] = await listRefDocs();
		expect(await migrateLegacyRefDocs()).toBe(1);
		const [raw] = await rawRows();
		expect(raw).toMatchObject({ id: before.id, name: 'old.pdf', addedAt: 5 });
		expect(raw.dataUrl).toBeUndefined();
		expect((raw.blob as Blob).size).toBe(PDF.length);
		expect(await migrateLegacyRefDocs()).toBe(0);
	});

	it('are left readable when their text cannot be decoded', async () => {
		const { putAsset } = await import('./library/asset-store.js');
		await putAsset({ kind: 'refdoc', name: 'odd.pdf', docKind: 'pdf', dataUrl: 'data:application/pdf;base64,@@@', bytes: 3, addedAt: 6 });
		expect(await migrateLegacyRefDocs()).toBe(0);
		expect((await rawRows())[0].dataUrl).toBe('data:application/pdf;base64,@@@');
	});
});

describe('the rewrite of a legacy record is a compare-and-swap', () => {
	const seed = async (name: string) => {
		const { putAsset } = await import('./library/asset-store.js');
		await putAsset({ kind: 'refdoc', name, docKind: 'pdf', dataUrl: urlOf(PDF), bytes: PDF.length, addedAt: 5 });
		return (await listRefDocs()).find((r) => r.name === name) as Awaited<ReturnType<typeof listRefDocs>>[number];
	};
	const NEWER = new Uint8Array([1, 2, 3]);

	it('does not overwrite a PDF the author saved over the old one after the list was read', async () => {
		const stale = await seed('d.pdf');
		await saveRefDoc({ name: 'd.pdf', kind: 'pdf', dataUrl: urlOf(NEWER), bytes: 3 }, 100, { binary: false });
		expect(await swapLegacyRefDoc(stale, dataUrlToBlob(urlOf(PDF)))).toBe(false);
		const [now] = await listRefDocs();
		expect(now.addedAt).toBe(100);
		expect(now.dataUrl).toBe(urlOf(NEWER));
		expect(now.blob).toBeUndefined();
	});

	it('does not bring back a PDF deleted after the list was read', async () => {
		const stale = await seed('gone.pdf');
		const { deleteAsset: del } = await import('./library/asset-store.js');
		await del(stale.id);
		expect(await swapLegacyRefDoc(stale, dataUrlToBlob(urlOf(PDF)))).toBe(false);
		expect(await listRefDocs()).toEqual([]);
	});

	it('writes when the record is still the one that was read', async () => {
		const rec = await seed('same.pdf');
		expect(await swapLegacyRefDoc(rec, dataUrlToBlob(urlOf(PDF)))).toBe(true);
		expect(await swapLegacyRefDoc(rec, dataUrlToBlob(urlOf(PDF)))).toBe(false); // already binary
	});
});

describe('the data URL helpers', () => {
	it('round-trip, and reject what is not base64', async () => {
		expect(new Uint8Array(await dataUrlToBlob(urlOf(PDF)).arrayBuffer())).toEqual(PDF);
		expect(await blobToDataUrl(new Blob([PDF], { type: 'application/pdf' }))).toBe(urlOf(PDF));
		for (const bad of ['not a url', 'data:application/pdf,plain', 'data:application/pdf;base64,AA=A', 'data:application/pdf;base64,<script>']) expect(() => dataUrlToBlob(bad), bad).toThrow();
	});
});
