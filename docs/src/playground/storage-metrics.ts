// Storage diagnostic metrics — the pure, dependency-free data behind the STORAGE
// overlay (StorageOverlay.tsx). Reads the browser's client-side storage so both
// the overlay AND a test can compute the same numbers.
//
// WHY THIS EXISTS. A returning visitor's REGULAR profile accumulates persistent
// client-side state — the Studio's localStorage decks/checkpoints/chats/snapshots
// and the service-worker Cache Storage — that the app re-reads, deserializes, and
// re-scans on every boot. Private browsing starts each session empty, so it never
// pays that tax: that's the whole reason an incognito reload stays fast while a
// normal one slowly degrades. This module measures the footprint AND the live
// O(n) scan cost (the same shape as studio-store's hasPriorStudioUse /
// deckContentStats / loadDeckList), so the accumulation is visible, not folklore.
// See engineering/decisions/2026-07-21-storage-accumulation-diagnostic.md.
//
// Kept free of any Studio import (studio-store et al.) so the overlay stays light
// on every surface — the category matchers below mirror studio-store's key
// prefixes by hand, the same way deckContentStats scans by prefix rather than
// importing the key list.

// localStorage stores UTF-16, so a stored string costs ~2 bytes per code unit
// (key + value). The browser counts its ~5MB origin quota the same way, so this
// is the honest on-disk figure (still an approximation — implementations vary).
// NOTE: studio-store's own `deckContentStats` counts code UNITS (×1), so this
// overlay reports ~2× its figure for the same decks — this one is the byte-honest
// number; the divergence is intentional, not a bug.
export const BYTES_PER_UNIT = 2;

/** A rough localStorage ceiling (~5MB origin quota) — the yardstick the footprint
 *  rating uses when no Storage-API quota is available. */
export const LOCAL_STORAGE_CEILING = 5 * 1024 * 1024;

export type Rating = 'good' | 'needs-improvement' | 'poor';

/** Rate a value against a (good, ni) upper-edge pair — smaller is better. */
export function rate(value: number, good: number, ni: number): Rating {
	return value < good ? 'good' : value < ni ? 'needs-improvement' : 'poor';
}

export type StorageCategory = {
	/** Stable id (e.g. 'checkpoints'). */
	key: string;
	/** Human label shown in the overlay. */
	label: string;
	/** Number of localStorage keys in this category. */
	keys: number;
	/** Approximate bytes (UTF-16) held by this category. */
	bytes: number;
};

// The categories, in display order. First match wins, so the specific Studio
// prefixes are listed before the `lattice-` catch-all; anything not ours falls to
// 'other'. Mirrors the key prefixes owned by studio-store.ts / slide-comments.ts /
// snapshot-cache.js — kept in sync by hand (deckContentStats does the same).
type CategoryDef = { key: string; label: string; match: (k: string) => boolean };
const CATEGORY_DEFS: CategoryDef[] = [
	{ key: 'sources', label: 'deck sources', match: (k) => k.startsWith('lattice-studio-src-') },
	{ key: 'checkpoints', label: 'checkpoints', match: (k) => k.startsWith('lattice-studio-snap-') },
	{ key: 'chats', label: 'AI chats', match: (k) => k.startsWith('lattice-studio-chat-') },
	{ key: 'drafts', label: 'chat drafts', match: (k) => k.startsWith('lattice-studio-chatdraft-') },
	{ key: 'comments', label: 'review comments', match: (k) => k.startsWith('lattice-studio-comments-') },
	{ key: 'snapshots', label: 'preview snapshots', match: (k) => k === 'lattice-studio-last-slide' || k === 'lattice-docs-pg-last-slide' },
	// Catch-all for every OTHER lattice- key (settings, instructions, overlay prefs, the
	// deck index, the active pointer, backups, …) — deliberately last so the content
	// prefixes above win. If a NEW content prefix is added to studio-store without a
	// matcher here, it lands in this bucket silently — the drift the routing test guards.
	{ key: 'app', label: 'app state & prefs', match: (k) => k.startsWith('lattice-') },
	// Same-origin keys that aren't ours (analytics, injected scripts). localStorage is
	// single-origin, so these are NOT "other origins" — just other keys on this origin.
	{ key: 'other', label: 'other keys', match: () => true },
];

export type LocalScan = {
	/** Total localStorage keys on the origin. */
	keys: number;
	/** Total approximate bytes (UTF-16) across all keys. */
	bytes: number;
	/** Per-category breakdown, display order, empty categories dropped. */
	categories: StorageCategory[];
	/** The single largest entry, or null if storage is empty. */
	largest: { key: string; bytes: number } | null;
	/** Wall-clock ms this scan took — the live proxy for the O(n) cost the boot
	 *  path pays on every load (and which grows as the store fills). */
	scanMs: number;
};

/** Bytes (UTF-16) a single key+value pair occupies. */
function entryBytes(key: string, value: string | null): number {
	return (key.length + (value?.length ?? 0)) * BYTES_PER_UNIT;
}

/**
 * Enumerate localStorage once, categorized + timed. The timing is the point as
 * much as the sizes: it reads every value (materializing the string, exactly as
 * the boot-path scans do), so `scanMs` is a faithful proxy for what a returning
 * visitor's boot pays — near zero on an empty (or private-browsing) store, and
 * climbing with accumulation. Returns an empty scan (never throws) where
 * localStorage is unavailable.
 */
export function scanLocalStorage(now: () => number = () => performance.now()): LocalScan {
	const empty: LocalScan = { keys: 0, bytes: 0, categories: [], largest: null, scanMs: 0 };
	try {
		if (typeof localStorage === 'undefined') return empty;
		const start = now();
		const totals = new Map<string, { keys: number; bytes: number }>();
		let bytes = 0;
		let largest: { key: string; bytes: number } | null = null;
		const n = localStorage.length;
		for (let i = 0; i < n; i++) {
			const key = localStorage.key(i);
			if (key == null) continue;
			const b = entryBytes(key, localStorage.getItem(key));
			bytes += b;
			if (!largest || b > largest.bytes) largest = { key, bytes: b };
			const def = CATEGORY_DEFS.find((d) => d.match(key)) as CategoryDef; // 'other' matches all → never undefined
			const acc = totals.get(def.key) ?? { keys: 0, bytes: 0 };
			acc.keys += 1;
			acc.bytes += b;
			totals.set(def.key, acc);
		}
		const scanMs = now() - start;
		const categories: StorageCategory[] = [];
		for (const d of CATEGORY_DEFS) {
			const t = totals.get(d.key);
			if (t) categories.push({ key: d.key, label: d.label, keys: t.keys, bytes: t.bytes });
		}
		return { keys: n, bytes, categories, largest, scanMs };
	} catch {
		return empty;
	}
}

export type QuotaEstimate = {
	/** Bytes the origin is estimated to be using across all storage (localStorage,
	 *  Cache Storage, IndexedDB, …). */
	usage: number;
	/** The origin's total storage quota in bytes. */
	quota: number;
};

/**
 * The origin's overall storage-quota usage via the Storage API — the widest view
 * of the accumulation (it counts Cache Storage + IndexedDB, not just
 * localStorage). Returns null where the API is unavailable (older Safari, insecure
 * contexts) so the overlay can degrade gracefully.
 */
export async function estimateQuota(): Promise<QuotaEstimate | null> {
	try {
		const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
		if (!s?.estimate) return null;
		const { usage, quota } = await s.estimate();
		if (typeof usage !== 'number' || typeof quota !== 'number') return null;
		return { usage, quota };
	} catch {
		return null;
	}
}

export type CacheEntry = { name: string; entries: number };
export type CacheScan = {
	/** Per-cache entry counts, largest first. */
	caches: CacheEntry[];
	/** Total entries across all caches. */
	totalEntries: number;
};

/**
 * The service-worker Cache Storage footprint — one entry count per named cache
 * (the SW's `lattice-v1-{pages,assets,fonts}` buckets, plus any others). This is
 * the OTHER half of the accumulation the SW's stale-while-revalidate strategy
 * fills across deploys; incognito's cache is ephemeral, so it stays tiny. Returns
 * null where the Cache API is unavailable.
 */
export async function scanCaches(): Promise<CacheScan | null> {
	try {
		if (typeof caches === 'undefined' || !caches.keys) return null;
		const names = await caches.keys();
		const entries: CacheEntry[] = [];
		let total = 0;
		for (const name of names) {
			try {
				const cache = await caches.open(name);
				const count = (await cache.keys()).length;
				entries.push({ name, entries: count });
				total += count;
			} catch {
				/* a cache we can't open — skip it, don't fail the whole scan */
			}
		}
		entries.sort((a, b) => b.entries - a.entries);
		return { caches: entries, totalEntries: total };
	} catch {
		return null;
	}
}

/** Format a byte count as a compact human string: "512 B" / "1.2 KB" / "3.4 MB". */
export function formatBytes(n: number): string {
	if (n < 1024) return `${Math.round(n)} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format milliseconds for the SCAN readout as a COARSE figure. Browsers clamp
 *  `performance.now()` (Chrome ~100µs, Firefox 1ms, and up to ~100ms under private
 *  browsing / resistFingerprinting), so a sub-millisecond decimal would advertise a
 *  precision the clock doesn't have — it's jitter, not signal. Whole ms, and "<1ms"
 *  below the resolution floor, keeps the readout honest as a threshold indicator. */
export function formatMs(ms: number): string {
	if (ms <= 0) return '0ms';
	if (ms < 1) return '<1ms';
	return `${Math.round(ms)}ms`;
}
