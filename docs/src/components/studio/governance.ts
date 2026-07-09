// Privacy & Data — the Workspace tab that surfaces every store the Studio writes
// to in this browser and lets the user clear it, per-category or all at once. Same
// "one module knows the keys" split as studio-store.ts / workspace-backup.ts: this
// is the one place that knows what "your data" means, so WorkspaceSheet stays a
// thin renderer over these stats + actions.
//
// Five categories, five different storage mechanisms:
//   · Decks           localStorage, lattice-studio-* (studio-store.ts owns it)
//   · Library assets  IndexedDB, lattice-workbench   (asset-store.js owns it)
//   · OpenRouter       localStorage, lattice-db-or-*  (architect-model.js owns it;
//                      reuses the existing disconnectOpenRouter — same action as
//                      the AI tab's "Disconnect" button)
//   · Downloaded models  Cache Storage — WebLLM / Transformers.js cache their model
//                        weights there themselves; Lattice owns no key for it, so
//                        this targets every Cache Storage entry that ISN'T ours
//   · Cache            Cache Storage, lattice-v1-{pages,assets,fonts} (sw.js owns it)
//
// Settings/preferences (handle style, validation, language, onboarding…) are
// deliberately NOT part of any Privacy & Data action — this clears data, not prefs.

import { deleteAsset, listAssets } from '@/playground/asset-store.js';
import { disconnectOpenRouter } from './architect';
import { formatBytes } from './reference-doc';
import { clearAllDecks, deckContentStats } from './studio-store';

// Cache Storage names this SITE owns — kept in sync BY HAND with the PAGES/
// ASSETS/FONTS names in docs/public/sw.js. Everything else in Cache Storage on
// this origin is a library's own model-weight cache, which is what "Downloaded
// models" targets and "Cache" deliberately leaves alone (and vice versa).
const SITE_CACHE_PREFIX = 'lattice-v1-';

async function cacheNames(): Promise<string[]> {
	if (typeof caches === 'undefined') return [];
	try {
		return await caches.keys();
	} catch {
		return [];
	}
}

/**
 * Aggregate byte size across a set of Cache Storage buckets — a model download
 * can be several hundred MB to 1GB+, so this is worth the real read rather than
 * a rough estimate. Prefers each cached response's `content-length` header
 * (the common case — fetch preserves it); falls back to materializing the
 * blob only when a response was stored without one. Best-effort throughout: a
 * single unreadable entry never blocks the rest of the count.
 */
async function cacheBytes(names: string[]): Promise<number> {
	if (typeof caches === 'undefined') return 0;
	let total = 0;
	for (const name of names) {
		try {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) {
				try {
					const res = await cache.match(request);
					if (!res) continue;
					const len = res.headers.get('content-length');
					total += len ? Number(len) || 0 : (await res.clone().blob()).size;
				} catch {
					/* one unreadable entry doesn't sink the total */
				}
			}
		} catch {
			/* a cache that vanished mid-read (or a locked-down browser) — skip it */
		}
	}
	return total;
}

export type GovernanceStats = {
	decks: { count: number; bytes: number };
	library: { count: number; bytes: number };
	models: { count: number; bytes: number };
	siteCache: { count: number; bytes: number };
	/** Sum of every category's bytes above — OpenRouter carries no size (it's a
	 *  credential, not stored content), so it's the only one left out. */
	totalBytes: number;
};

/** One read of every category's stat line, for the Privacy & Data tab on open. */
export async function loadGovernanceStats(): Promise<GovernanceStats> {
	const [deck, assets, names] = await Promise.all([Promise.resolve(deckContentStats()), listAssets().catch(() => []), cacheNames()]);
	let libraryBytes = 0;
	try {
		for (const a of assets) libraryBytes += JSON.stringify(a).length;
	} catch {
		/* best-effort size — never blocks the stat line */
	}
	const modelNames = names.filter((n) => !n.startsWith(SITE_CACHE_PREFIX));
	const siteCacheNames = names.filter((n) => n.startsWith(SITE_CACHE_PREFIX));
	const [modelBytes, siteCacheBytesTotal] = await Promise.all([cacheBytes(modelNames), cacheBytes(siteCacheNames)]);
	const library = { count: assets.length, bytes: libraryBytes };
	const models = { count: modelNames.length, bytes: modelBytes };
	const siteCache = { count: siteCacheNames.length, bytes: siteCacheBytesTotal };
	return { decks: deck, library, models, siteCache, totalBytes: deck.bytes + library.bytes + models.bytes + siteCache.bytes };
}

export async function clearLibraryAssets(): Promise<void> {
	const all = await listAssets();
	await Promise.all(all.map((a: { id: string }) => deleteAsset(a.id)));
}

export async function clearDownloadedModels(): Promise<void> {
	const names = await cacheNames();
	await Promise.all(names.filter((n) => !n.startsWith(SITE_CACHE_PREFIX)).map((n) => caches.delete(n)));
}

export async function clearSiteCache(): Promise<void> {
	const names = await cacheNames();
	await Promise.all(names.filter((n) => n.startsWith(SITE_CACHE_PREFIX)).map((n) => caches.delete(n)));
}

/**
 * Delete everything Privacy & Data manages in one go — decks, Library, the
 * OpenRouter connection, downloaded models, and the site cache. Preferences
 * (language, handle style, validation toggles, onboarding flag…) are left as-is.
 */
export async function clearEverything(): Promise<void> {
	clearAllDecks();
	await Promise.all([clearLibraryAssets(), disconnectOpenRouter(), clearDownloadedModels(), clearSiteCache()]);
}

/** A short human size for a stat line ("~2.3 MB", "~1.05 GB"); '' when there's
 *  nothing to show. Every Governance size is an estimate (a JSON-stringified
 *  proxy for Library assets, a content-length/blob-size read for caches), so
 *  it's prefixed accordingly — reuses the one byte formatter (reference-doc.ts)
 *  the refdoc cards already use, rather than a second KB/MB/GB ladder. */
export function fmtBytes(bytes: number): string {
	if (!bytes) return '';
	return `~${formatBytes(bytes)}`;
}
