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
//   · Narration audio  IndexedDB, lattice-narration (narration-store.js owns it) — the
//                      synthesized read-aloud clips Present keeps on the device so a
//                      rehearsed deck presents instantly and without re-billing
//
// Settings/preferences (handle style, validation, language, onboarding…) are
// deliberately NOT part of any Privacy & Data action — this clears data, not prefs.

import { deleteAsset, listAssets } from '@/components/studio/library/asset-store.js';
import { clearClips, clipStats } from '@/playground/narration-store.js';
import { disconnectOpenRouter } from './architect';
import { formatBytes } from './reference-doc';
import { clearAllDecks, deckContentStats } from './studio-store';

// Cache Storage names this SITE owns — kept in sync BY HAND with the PAGES/
// ASSETS/FONTS names in docs/public/sw.js (its VERSION-derived `lattice-${VERSION}-*`
// convention). Everything else in Cache Storage on this origin is a library's own
// model-weight cache, which is what "Downloaded models" targets and "Cache"
// deliberately leaves alone (and vice versa). Exported so governance.test.ts can
// assert this literal still matches sw.js's VERSION — sw.js's own comment says
// VERSION bumps whenever the caching strategy changes, and nothing else enforces
// the two staying in sync; a silent drift would misclassify every cache entry.
export const SITE_CACHE_PREFIX = 'lattice-v1-';
// The retired Drawing Board's IndexedDB. Its owning module was deleted with the route
// (2026-07-03-studio-succession.md P5), which left the database live on the origin with no
// code able to see or remove it — while this panel's "Delete everything" claimed to erase
// everything it manages. Deleting it is the only operation we still offer on it; the decks
// inside are NOT imported (no importer shipped), so this is a real erase, not a migration.
const RETIRED_DB = 'lattice-drawing-board';

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
	narration: { count: number; bytes: number };
	/** Sum of every category's bytes above — OpenRouter carries no size (it's a
	 *  credential, not stored content), so it's the only one left out. */
	totalBytes: number;
};

/** One read of every category's stat line, for the Privacy & Data tab on open. */
export async function loadGovernanceStats(): Promise<GovernanceStats> {
	const [deck, assets, names, narration] = await Promise.all([
		Promise.resolve(deckContentStats()),
		listAssets().catch(() => []),
		cacheNames(),
		clipStats().catch(() => ({ count: 0, bytes: 0 })),
	]);
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
	return { decks: deck, library, models, siteCache, narration, totalBytes: deck.bytes + library.bytes + models.bytes + siteCache.bytes + narration.bytes };
}

export async function clearLibraryAssets(): Promise<void> {
	const all = await listAssets();
	await Promise.all(all.map((a: { id: string }) => deleteAsset(a.id)));
}

export async function clearDownloadedModels(): Promise<void> {
	const names = await cacheNames();
	await Promise.all(names.filter((n) => !n.startsWith(SITE_CACHE_PREFIX)).map((n) => caches.delete(n)));
}

/** Drop every synthesized narration clip held on this device. Nothing breaks — the next
 *  present re-synthesizes (and re-bills) what it needs. */
export async function clearNarrationAudio(): Promise<void> {
	await clearClips();
}

export async function clearSiteCache(): Promise<void> {
	const names = await cacheNames();
	await Promise.all(names.filter((n) => n.startsWith(SITE_CACHE_PREFIX)).map((n) => caches.delete(n)));
}

export type ClearEverythingResult = { succeeded: string[]; failed: string[] };

/**
 * Delete everything Privacy & Data manages in one go — decks, Library, the
 * OpenRouter connection, downloaded models, the site cache, and narration audio. Preferences
 * (language, handle style, validation toggles, onboarding flag…) are left as-is.
 *
 * Decks clear synchronously and unconditionally first — that step never fails
 * partway (it's a plain localStorage sweep) — so it's always in `succeeded`.
 * The other four run via `allSettled`, not `all`: a fail-fast `Promise.all`
 * would abort the remaining clears the instant one rejects, while decks were
 * ALREADY irreversibly gone — the caller needs to know exactly what did and
 * didn't clear, not a single all-or-nothing error.
 */
/** Erase the retired Drawing Board's IndexedDB and its orphaned preference keys.
 *  Nothing else in the app can reach either any more — the modules that owned them were
 *  deleted with the route — so without this "Delete everything" silently left a database
 *  and two localStorage keys behind on the user's origin. Best-effort: a blocked delete
 *  (another tab holding the DB open) resolves rather than failing the whole erase. */
export async function clearRetiredDrawingBoardData(): Promise<void> {
	try {
		// The Drawing Board's standing-instructions key. ORPHANED, not live: the Studio keeps
		// its own in `lattice-studio-instructions` (studio-store) and never adopted this one,
		// and its last reader was removed from the spend kernel. Clearing it therefore erases
		// Drawing-Board residue, not a current preference.
		localStorage.removeItem('lattice-db-architect-instructions');
	} catch {
		/* storage unavailable */
	}
	if (typeof indexedDB === 'undefined') return;
	await new Promise<void>((resolve) => {
		let req: IDBOpenDBRequest;
		try {
			req = indexedDB.deleteDatabase(RETIRED_DB);
		} catch {
			resolve();
			return;
		}
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
		// `blocked` fires when another tab still holds it open; the delete completes when
		// they close, and we must not hang the erase waiting for that.
		req.onblocked = () => resolve();
	});
}

export async function clearEverything(): Promise<ClearEverythingResult> {
	clearAllDecks();
	const tasks: [string, () => Promise<void>][] = [
		['library', clearLibraryAssets],
		['openrouter', disconnectOpenRouter],
		['models', clearDownloadedModels],
		['cache', clearSiteCache],
		['narration', clearNarrationAudio],
		['retired', clearRetiredDrawingBoardData],
	];
	const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
	const succeeded = ['decks'];
	const failed: string[] = [];
	for (const [i, r] of results.entries()) (r.status === 'fulfilled' ? succeeded : failed).push(tasks[i][0]);
	return { succeeded, failed };
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
