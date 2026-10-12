// The Studio's live name → URL map for `asset:<name>` Library photos, handed to the engine as
// `opts.assetUrls` (lib/core/bg-image.js resolveAssetUrl). Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §2.
//
// A photo's bytes live in IndexedDB, so a render needs a URL the browser can load. Each record
// gets ONE object URL, kept for the session and revoked only when the record is deleted: a
// preview, a presenter window or an export that is still painting a slide must never lose its
// picture because the shelf was re-read. A scope flip keeps the id, so it keeps the URL.
//
// WHAT THE MAP HOLDS is the assets the open deck may see: every shared asset plus that deck's
// own. Another deck's asset is deliberately absent, so a reference to it renders the missing-image
// stand-in rather than quietly working.
import { listMedia, type MediaRecord, visibleMedia } from './media-store';

const urlById = new Map<string, string>();
let current: Record<string, string> = {};
let activeDeckId: string | null = null;
let rev = 0;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

const signature = (m: Record<string, string>) => Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join('|');

function urlFor(rec: MediaRecord): string {
	let u = urlById.get(rec.id);
	if (!u) {
		u = URL.createObjectURL(rec.blob);
		urlById.set(rec.id, u);
	}
	return u;
}

/** Re-read the shelf and rebuild the map. Bumps the revision (and tells listeners) only when the
 *  map actually changed, so an unrelated Library refresh does not re-render every preview. */
export async function refreshAssetUrls(): Promise<void> {
	const all = await listMedia();
	// Free the URL of any record that no longer exists on the shelf.
	const live = new Set(all.map((m) => m.id));
	for (const [id, u] of urlById) {
		if (!live.has(id)) {
			URL.revokeObjectURL(u);
			urlById.delete(id);
		}
	}
	const next: Record<string, string> = {};
	for (const m of visibleMedia(all, activeDeckId)) next[m.name] = urlFor(m);
	if (signature(next) !== signature(current)) {
		current = next;
		rev++;
		for (const cb of listeners) cb();
	}
}

/** The deck whose own assets the map includes. Changing it re-reads the shelf. */
export function setActiveAssetDeck(deckId: string | null): Promise<void> {
	if (deckId === activeDeckId && loaded) return loaded;
	activeDeckId = deckId;
	loaded = refreshAssetUrls().catch(() => {});
	return loaded;
}

/** The map, after the first read has finished. A render awaits this once; it is a cached promise
 *  afterwards. An unavailable store yields an empty map: every reference shows the stand-in. */
export async function ensureAssetUrls(): Promise<Record<string, string>> {
	if (!loaded) loaded = refreshAssetUrls().catch(() => {});
	await loaded;
	return current;
}

/** A CSS-comment stamp that changes when the map does. It rides in the preview's extra CSS,
 *  which every preview and export cache already keys on (the code-package stamp does the same),
 *  so adding, deleting or re-scoping an image re-renders the slides that showed the old state. */
export function assetStamp(): string {
	return rev > 0 ? `/* lattice assets: ${rev} */` : '';
}

/** Hear about map changes. Returns the unsubscribe. */
export function onAssetUrlsChanged(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/** Does this source name a Library photo? The cheap test that keeps a deck without one from
 *  loading this module's data at all. */
export function sourceUsesAssets(source: string): boolean {
	return /\basset:[a-z0-9]/i.test(source);
}

/** Test seam: forget everything. */
export function resetAssetUrlsForTests(): void {
	for (const u of urlById.values()) URL.revokeObjectURL(u);
	urlById.clear();
	current = {};
	activeDeckId = null;
	rev = 0;
	loaded = null;
	listeners.clear();
}
