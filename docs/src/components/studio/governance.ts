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

export type GovernanceStats = {
	decks: { count: number; bytes: number };
	library: { count: number; bytes: number };
	models: { count: number };
	siteCache: { count: number };
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
	return {
		decks: deck,
		library: { count: assets.length, bytes: libraryBytes },
		models: { count: names.filter((n) => !n.startsWith(SITE_CACHE_PREFIX)).length },
		siteCache: { count: names.filter((n) => n.startsWith(SITE_CACHE_PREFIX)).length },
	};
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

/** A short human size for a stat line; '' when there's nothing to show. */
export function fmtBytes(bytes: number): string {
	if (!bytes) return '';
	const kb = bytes / 1024;
	return kb >= 1024 ? `~${(kb / 1024).toFixed(1)} MB` : `~${Math.max(1, Math.round(kb))} KB`;
}
