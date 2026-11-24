// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteRefDoc, listRefDocs, type RefDocRecord, recordToDoc, refDocDeckFile, saveRefDoc } from './reference-doc-store';

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
	REFUSAL_PREFIX: 'refused:',
}));

beforeEach(() => {
	putAsset.mockClear();
	listAssets.mockClear();
	deleteAsset.mockClear();
});

describe('recordToDoc', () => {
	it('rehydrates the in-memory ReferenceDoc a call consumes', async () => {
		const rec: RefDocRecord = { id: 'r_1', kind: 'refdoc', name: 'brand.pdf', docKind: 'pdf', dataUrl: 'data:application/pdf;base64,AA', bytes: 2048, addedAt: 5 };
		expect(await recordToDoc(rec)).toEqual({ id: 'r_1', name: 'brand.pdf', kind: 'pdf', text: undefined, dataUrl: 'data:application/pdf;base64,AA', bytes: 2048 });
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

// A deck kept as reference (library-deck-ref.ts): its text grounds a call, its file is kept for "Open as deck".
describe('a deck kept as reference', () => {
	const deck = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 7])], { type: 'application/zip' });

	it('stores the deck file beside the reference text, and hands it back as a File under the doc\'s name', async () => {
		const saved = await saveRefDoc({ name: 'q3.lattice', kind: 'text', text: 'Slide 1', bytes: 7 }, 9, { deck });
		const record = putAsset.mock.calls[0][0];
		expect(record).toMatchObject({ kind: 'refdoc', name: 'q3.lattice', docKind: 'text', text: 'Slide 1', deck });
		const f = refDocDeckFile(saved);
		expect(f?.name).toBe('q3.lattice');
		expect(new Uint8Array(await (f as File).arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 7]));
	});

	it('falls back to an ArrayBuffer where an engine refuses a Blob, and reads it back as the deck', async () => {
		putAsset.mockRejectedValueOnce(Object.assign(new Error('could not be cloned'), { name: 'DataCloneError' }));
		const saved = await saveRefDoc({ name: 'q3.lattice', kind: 'text', text: 'Slide 1', bytes: 7 }, 9, { deck });
		const second = putAsset.mock.calls[1][0];
		expect(second.deck).toBeUndefined();
		expect(second.deckData).toBeInstanceOf(ArrayBuffer);
		expect(saved.deckData).toBeUndefined();
		expect(new Uint8Array(await (refDocDeckFile(saved) as File).arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 7]));
	});

	it('rebuilds a Markdown doc whose text is the file, and keeps no second copy of it', async () => {
		const saved = await saveRefDoc({ name: 'brief.md', kind: 'text', text: '# Brief\n', bytes: 8 }, 9, { sourceExact: true });
		const record = putAsset.mock.calls[0][0];
		expect(record).toMatchObject({ sourceExact: true });
		expect(record).not.toHaveProperty('deck');
		const f = refDocDeckFile(saved) as File;
		expect(f.name).toBe('brief.md');
		expect(await f.text()).toBe('# Brief\n');
	});

	it('gives no deck file for a doc that is not a deck', async () => {
		const saved = await saveRefDoc({ name: 'notes.txt', kind: 'text', text: 'x', bytes: 1 }, 9);
		expect(putAsset.mock.calls[0][0]).not.toHaveProperty('deck');
		expect(refDocDeckFile(saved)).toBeNull();
	});
});
