import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no IndexedDB — mirror the established pattern (component-library.test.ts)
// of mocking the asset-store boundary rather than reaching for a polyfill.
vi.mock('@/playground/asset-store.js', () => ({
	listAssets: vi.fn(async () => [
		{ id: 't1', kind: 'theme', name: 'a' },
		{ id: 'c1', kind: 'component', name: 'b' },
	]),
	deleteAsset: vi.fn(async () => {}),
}));

import { deleteAsset, listAssets } from '@/playground/asset-store.js';
import { DECKS } from './decks';
import { clearDownloadedModels, clearEverything, clearLibraryAssets, clearSiteCache, fmtBytes, loadGovernanceStats } from './governance';
import { createDeck, deckContentStats } from './studio-store';

const listSpy = listAssets as unknown as ReturnType<typeof vi.fn>;
const deleteSpy = deleteAsset as unknown as ReturnType<typeof vi.fn>;

// A minimal Cache Storage stand-in — jsdom has no `caches` global either.
function stubCaches(names: string[]) {
	const deleted: string[] = [];
	(globalThis as unknown as { caches: unknown }).caches = {
		keys: vi.fn(async () => names),
		delete: vi.fn(async (n: string) => {
			deleted.push(n);
			return true;
		}),
	};
	return deleted;
}

afterEach(() => {
	localStorage.clear();
	deleteSpy.mockClear();
	(globalThis as unknown as { caches?: unknown }).caches = undefined;
});

describe('governance — stats', () => {
	it('splits Cache Storage names into "downloaded models" (ours excluded) vs "cache" (ours only)', async () => {
		stubCaches(['lattice-v1-pages', 'lattice-v1-assets', 'webllm/model-cache', 'transformers-cache']);
		const stats = await loadGovernanceStats();
		expect(stats.siteCache.count).toBe(2);
		expect(stats.models.count).toBe(2);
	});

	it('reports the Library shelf count from the asset store', async () => {
		stubCaches([]);
		const stats = await loadGovernanceStats();
		expect(stats.library.count).toBe(2);
		expect(stats.library.bytes).toBeGreaterThan(0);
	});

	it('reports the deck count from the same source as the Privacy & Data "Decks" row', async () => {
		stubCaches([]);
		createDeck('Extra deck');
		const stats = await loadGovernanceStats();
		expect(stats.decks.count).toBe(deckContentStats().count);
	});
});

describe('governance — clear actions', () => {
	it('clearLibraryAssets deletes every asset the store lists', async () => {
		await clearLibraryAssets();
		expect(listSpy).toHaveBeenCalled();
		expect(deleteSpy).toHaveBeenCalledTimes(2);
		expect(deleteSpy).toHaveBeenCalledWith('t1');
		expect(deleteSpy).toHaveBeenCalledWith('c1');
	});

	it('clearDownloadedModels deletes only non-site caches, leaving the PWA cache alone', async () => {
		const deleted = stubCaches(['lattice-v1-pages', 'webllm/model-cache']);
		await clearDownloadedModels();
		expect(deleted).toEqual(['webllm/model-cache']);
	});

	it('clearSiteCache deletes only the site caches, leaving a model cache alone', async () => {
		const deleted = stubCaches(['lattice-v1-pages', 'lattice-v1-fonts', 'webllm/model-cache']);
		await clearSiteCache();
		expect(deleted.sort()).toEqual(['lattice-v1-fonts', 'lattice-v1-pages']);
	});

	it('clearEverything clears decks (back to the built-in seed), the Library, and both cache buckets', async () => {
		stubCaches(['lattice-v1-pages', 'webllm/model-cache']);
		createDeck('Will be cleared');
		await clearEverything();
		// An emptied index re-seeds from the built-ins on the next read — never zero.
		expect(deckContentStats().count).toBe(DECKS.length);
		expect(deleteSpy).toHaveBeenCalledTimes(2); // the two mocked library assets
	});
});

describe('governance — fmtBytes', () => {
	it('formats KB/MB, and is empty for zero', () => {
		expect(fmtBytes(0)).toBe('');
		expect(fmtBytes(500)).toBe('~1 KB');
		expect(fmtBytes(2048)).toBe('~2 KB');
		expect(fmtBytes(2_097_152)).toBe('~2.0 MB');
	});
});
