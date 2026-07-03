import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteRefDoc, listRefDocs, type RefDocRecord, recordToDoc, saveRefDoc } from './reference-doc-store';

// The shared reference-doc library (#640) is a thin wrapper over the Workbench
// IndexedDB asset store. jsdom has no IndexedDB, so we mock that layer and assert
// the wrapper maps records correctly and stays library-scoped (kind:'refdoc').
const putAsset = vi.fn(async (r: Record<string, unknown>) => ({ ...r, id: 'r_1' }));
const listAssets = vi.fn(async (_kind: string) => [] as RefDocRecord[]);
const deleteAsset = vi.fn(async (_id: string) => {});
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: (r: Record<string, unknown>) => putAsset(r),
	listAssets: (k: string) => listAssets(k),
	deleteAsset: (id: string) => deleteAsset(id),
}));

beforeEach(() => {
	putAsset.mockClear();
	listAssets.mockClear();
	deleteAsset.mockClear();
});

describe('recordToDoc', () => {
	it('rehydrates the in-memory ReferenceDoc a call consumes', () => {
		const rec: RefDocRecord = { id: 'r_1', kind: 'refdoc', name: 'brand.pdf', docKind: 'pdf', dataUrl: 'data:application/pdf;base64,AA', bytes: 2048, addedAt: 5 };
		expect(recordToDoc(rec)).toEqual({ id: 'r_1', name: 'brand.pdf', kind: 'pdf', text: undefined, dataUrl: 'data:application/pdf;base64,AA', bytes: 2048 });
	});
});

describe('saveRefDoc', () => {
	it('persists as a library-scoped refdoc record with a caller-owned timestamp', async () => {
		await saveRefDoc({ name: 'guide.md', kind: 'text', text: 'cobalt', bytes: 6 }, 1234);
		expect(putAsset).toHaveBeenCalledTimes(1);
		const record = putAsset.mock.calls[0][0];
		expect(record).toMatchObject({ kind: 'refdoc', name: 'guide.md', docKind: 'text', text: 'cobalt', bytes: 6, addedAt: 1234 });
	});
});

describe('listRefDocs', () => {
	it('reads only refdoc records', async () => {
		listAssets.mockResolvedValueOnce([{ id: 'r_1', kind: 'refdoc', name: 'a', docKind: 'text', bytes: 1, addedAt: 1 }]);
		const out = await listRefDocs();
		expect(listAssets).toHaveBeenCalledWith('refdoc');
		expect(out).toHaveLength(1);
	});
	it('degrades to empty when the store is unavailable (private mode)', async () => {
		listAssets.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
		expect(await listRefDocs()).toEqual([]);
	});
});

describe('deleteRefDoc', () => {
	it('removes by id', async () => {
		await deleteRefDoc('r_9');
		expect(deleteAsset).toHaveBeenCalledWith('r_9');
	});
});
