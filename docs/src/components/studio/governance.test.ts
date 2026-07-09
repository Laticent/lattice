import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { clearDownloadedModels, clearEverything, clearLibraryAssets, clearSiteCache, fmtBytes, loadGovernanceStats, SITE_CACHE_PREFIX } from './governance';
import { createDeck, deckContentStats } from './studio-store';

const listSpy = listAssets as unknown as ReturnType<typeof vi.fn>;
const deleteSpy = deleteAsset as unknown as ReturnType<typeof vi.fn>;

type Entry = { url: string; size: number; noContentLength?: boolean };

// A minimal Cache Storage stand-in — jsdom has no `caches` global either. Keyed
// by cache name → its entries, so byte aggregation (open/keys/match) is
// exercised the same way `cacheBytes` reads a real Cache Storage bucket.
function stubCaches(data: Record<string, Entry[]>) {
	const deleted: string[] = [];
	const names = Object.keys(data);
	(globalThis as unknown as { caches: unknown }).caches = {
		keys: vi.fn(async () => names),
		delete: vi.fn(async (n: string) => {
			deleted.push(n);
			return true;
		}),
		open: vi.fn(async (n: string) => {
			const entries = data[n] ?? [];
			return {
				keys: vi.fn(async () => entries.map((e) => ({ url: e.url }))),
				match: vi.fn(async (req: { url: string }) => {
					const entry = entries.find((e) => e.url === req.url);
					if (!entry) return undefined;
					return {
						headers: { get: (h: string) => (!entry.noContentLength && h.toLowerCase() === 'content-length' ? String(entry.size) : null) },
						clone() {
							return this;
						},
						blob: async () => ({ size: entry.size }),
					};
				}),
			};
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
		stubCaches({ 'lattice-v1-pages': [], 'lattice-v1-assets': [], 'webllm/model-cache': [], 'transformers-cache': [] });
		const stats = await loadGovernanceStats();
		expect(stats.siteCache.count).toBe(2);
		expect(stats.models.count).toBe(2);
	});

	it('aggregates byte size across every entry in a cache bucket, from content-length', async () => {
		stubCaches({
			'webllm/model-cache': [
				{ url: 'https://x/shard-0.bin', size: 100 * 1024 * 1024 },
				{ url: 'https://x/shard-1.bin', size: 250 * 1024 * 1024 },
			],
		});
		const stats = await loadGovernanceStats();
		expect(stats.models.bytes).toBe(350 * 1024 * 1024);
	});

	it('falls back to reading the blob when a cached response has no content-length', async () => {
		stubCaches({ 'lattice-v1-pages': [{ url: 'https://x/page', size: 4096, noContentLength: true }] });
		const stats = await loadGovernanceStats();
		expect(stats.siteCache.bytes).toBe(4096);
	});

	it('reports the Library shelf count from the asset store', async () => {
		stubCaches({});
		const stats = await loadGovernanceStats();
		expect(stats.library.count).toBe(2);
		expect(stats.library.bytes).toBeGreaterThan(0);
	});

	it('reports the deck count from the same source as the Privacy & Data "Decks" row', async () => {
		stubCaches({});
		createDeck('Extra deck');
		const stats = await loadGovernanceStats();
		expect(stats.decks.count).toBe(deckContentStats().count);
	});

	it('totalBytes sums decks + Library + models + site cache (OpenRouter carries no size)', async () => {
		stubCaches({
			'webllm/model-cache': [{ url: 'https://x/shard.bin', size: 10 * 1024 * 1024 }],
			'lattice-v1-assets': [{ url: 'https://x/app.js', size: 2048 }],
		});
		const stats = await loadGovernanceStats();
		expect(stats.totalBytes).toBe(stats.decks.bytes + stats.library.bytes + stats.models.bytes + stats.siteCache.bytes);
		expect(stats.totalBytes).toBeGreaterThan(10 * 1024 * 1024); // the model shard alone clears 10 MB
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
		const deleted = stubCaches({ 'lattice-v1-pages': [], 'webllm/model-cache': [] });
		await clearDownloadedModels();
		expect(deleted).toEqual(['webllm/model-cache']);
	});

	it('clearSiteCache deletes only the site caches, leaving a model cache alone', async () => {
		const deleted = stubCaches({ 'lattice-v1-pages': [], 'lattice-v1-fonts': [], 'webllm/model-cache': [] });
		await clearSiteCache();
		expect(deleted.sort()).toEqual(['lattice-v1-fonts', 'lattice-v1-pages']);
	});

	it('clearEverything clears decks (back to the built-in seed), the Library, and both cache buckets — and reports every category as succeeded', async () => {
		stubCaches({ 'lattice-v1-pages': [], 'webllm/model-cache': [] });
		createDeck('Will be cleared');
		const result = await clearEverything();
		// An emptied index re-seeds from the built-ins on the next read — never zero.
		expect(deckContentStats().count).toBe(DECKS.length);
		expect(deleteSpy).toHaveBeenCalledTimes(2); // the two mocked library assets
		expect(result.succeeded.sort()).toEqual(['cache', 'decks', 'library', 'models', 'openrouter'].sort());
		expect(result.failed).toEqual([]);
	});

	it('clearEverything reports a partial failure honestly — decks stay cleared, and the other categories are attempted independently (allSettled, not fail-fast)', async () => {
		stubCaches({ 'lattice-v1-pages': [], 'webllm/model-cache': [] });
		createDeck('Will still be cleared even if another category fails');
		listSpy.mockRejectedValueOnce(new Error('IndexedDB unavailable')); // clearLibraryAssets's listAssets() call throws
		const result = await clearEverything();
		// Decks clear synchronously and unconditionally BEFORE the other four run —
		// a later rejection can't undo or block it.
		expect(deckContentStats().count).toBe(DECKS.length);
		expect(result.succeeded).toContain('decks');
		expect(result.failed).toContain('library');
		// The categories that don't depend on the failing call still ran — a
		// fail-fast Promise.all would have aborted them the instant library rejected.
		expect(result.succeeded).toEqual(expect.arrayContaining(['openrouter', 'models', 'cache']));
	});
});

describe('governance — SITE_CACHE_PREFIX stays in sync with sw.js', () => {
	it('matches the VERSION-derived cache-name prefix docs/public/sw.js actually uses', () => {
		// sw.js's own comment: "VERSION only needs a bump when the caching STRATEGY
		// changes" — nothing else enforces that governance.ts's hand-duplicated
		// literal tracks it. A silent drift would misclassify every real Cache
		// Storage entry between "downloaded models" and "cache".
		const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
		const match = swSource.match(/const VERSION = '([^']+)'/);
		expect(match).toBeTruthy();
		expect(SITE_CACHE_PREFIX).toBe(`lattice-${match?.[1]}-`);
	});
});

describe('governance — fmtBytes', () => {
	it('formats B/KB/MB/GB (delegating to reference-doc.ts formatBytes), and is empty for zero', () => {
		expect(fmtBytes(0)).toBe('');
		expect(fmtBytes(500)).toBe('~500 B');
		expect(fmtBytes(2048)).toBe('~2.0 KB');
		expect(fmtBytes(2_097_152)).toBe('~2.0 MB');
		expect(fmtBytes(1024 ** 3)).toBe('~1.00 GB');
	});
});
