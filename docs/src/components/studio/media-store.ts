// The shared media library — photos and videos a person adds, either for every deck
// (`scope: 'library'`) or for one deck (`scope: <deckId>`). Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md.
//
// Records live in the existing Workbench IndexedDB `assets` store as kind 'image' or 'video'.
// They hold a real `Blob`, not a data URL: IndexedDB stores Blobs natively without the 33%
// base64 inflation, and a video as a string would sit whole in memory.
//
// ONE NAME, ONE ASSET. A deck writes `asset:<name>`, so `<name>` has to mean exactly one
// thing. The generic store enforces `(kind, name)`; that is too weak here, because an image
// and a video would then share a name, and a deck-scoped asset would shadow a library one.
// `saveMedia` checks both kinds and both scopes inside the same transaction as the write
// (the reasoning in `asset-store.js` `putAsset` applies: a React snapshot goes stale, a
// transaction does not). A clash is REFUSED, never resolved by overwriting.
import { ASSET_STORE, openDB, reqAsPromise } from '@/components/studio/library/asset-db.js';
import { deleteAsset } from '@/components/studio/library/asset-store.js';

export type MediaKind = 'image' | 'video';
/** `'library'` — every deck — or the id of the one deck that owns the asset. */
export type MediaScope = string;
export const LIBRARY_SCOPE: MediaScope = 'library';

export type MediaRecord = {
	id: string;
	kind: MediaKind;
	/** The `asset:<name>` a deck writes. Unique across both kinds and both scopes. */
	name: string;
	scope: MediaScope;
	blob: Blob;
	mime: string;
	bytes: number;
	width: number;
	height: number;
	/** The file name the person picked, before it was turned into `name`. */
	sourceName: string;
	/** False once the importer downscaled a photo; the stored pixels are not the camera's. */
	original: boolean;
	addedAt: number;
};

export type NewMedia = Omit<MediaRecord, 'id' | 'addedAt'>;

const KINDS: MediaKind[] = ['image', 'video'];

/** The opening words of a refusal this module raised — the UI shows it as is. */
export const MEDIA_REFUSAL_PREFIX = "Can't add —";

// Same shape as the `sample:` grammar in lib/core/remote-ref.js, minus the dot: one path
// segment of plain characters, so a name can never carry `..` or a scheme.
const NAME_OK = /^[a-z0-9][a-z0-9_-]*$/;

/** Is this a name a deck can write as `asset:<name>`? */
export function isMediaName(name: string): boolean {
	return NAME_OK.test(name);
}

/** A file name turned into a legal asset name: `Team Offsite (2).JPG` → `team-offsite-2`.
 *  Never empty — an unusable name falls back to the kind. */
export function mediaNameFromFile(fileName: string, kind: MediaKind): string {
	const stem = fileName.replace(/\.[^.]*$/, '');
	const slug = stem
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
		.replace(/-+$/g, '');
	return NAME_OK.test(slug) ? slug : kind;
}

function newId(): string {
	return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save a new asset. Refuses (rejects with a `MEDIA_REFUSAL_PREFIX` message, writing nothing)
 * when the name is illegal or when any image or video — in any scope — already holds it.
 * The check and the write share one readwrite transaction.
 */
export async function saveMedia(input: NewMedia, addedAt: number): Promise<MediaRecord> {
	if (!isMediaName(input.name)) {
		throw new Error(`${MEDIA_REFUSAL_PREFIX} “${input.name}” isn't a usable asset name. Use lowercase letters, digits, - and _.`);
	}
	const db = await openDB();
	return new Promise<MediaRecord>((resolve, reject) => {
		const t = db.transaction(ASSET_STORE, 'readwrite');
		const store = t.objectStore(ASSET_STORE);
		let refusal: Error | null = null;
		let stored: MediaRecord | null = null;
		t.oncomplete = () => resolve(stored as MediaRecord);
		t.onabort = () => reject(refusal || t.error || new Error('saveMedia: the save was rolled back'));
		t.onerror = () => reject(t.error || new Error('saveMedia: the save failed'));
		// Chained from each request's `onsuccess`, never awaited: an IndexedDB transaction
		// deactivates when control returns to the event loop (asset-store.js `putAsset`).
		const found: MediaRecord[] = [];
		const read = (i: number) => {
			const req = store.index('kind').getAll(KINDS[i]);
			req.onsuccess = () => {
				found.push(...(req.result as MediaRecord[]));
				if (i + 1 < KINDS.length) {
					read(i + 1);
					return;
				}
				const clash = found.find((a) => a.name === input.name);
				if (clash) {
					refusal = new Error(`${MEDIA_REFUSAL_PREFIX} “${input.name}” is already another saved ${clash.kind}. Rename that one first.`);
					t.abort();
					return;
				}
				stored = { ...input, id: newId(), addedAt };
				store.put(stored);
			};
		};
		read(0);
	});
}

/** Every saved image and video, newest first. IndexedDB unavailable → an empty shelf. */
export async function listMedia(): Promise<MediaRecord[]> {
	try {
		const db = await openDB();
		const store = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE);
		const rows = await Promise.all(KINDS.map((k) => reqAsPromise(store.index('kind').getAll(k)) as Promise<MediaRecord[]>));
		return rows.flat().sort((a, b) => b.addedAt - a.addedAt);
	} catch {
		return [];
	}
}

/** What the shelf shows while a deck is open: the shared assets plus that deck's own.
 *  Another deck's assets are never listed. */
export function visibleMedia(all: MediaRecord[], activeDeckId: string | null): MediaRecord[] {
	return all.filter((m) => m.scope === LIBRARY_SCOPE || (activeDeckId !== null && m.scope === activeDeckId));
}

/** Flip an asset between shared and one deck's. The NAME does not change, so no deck's
 *  markdown is rewritten. Resolves the updated record, or null when it no longer exists. */
export async function setMediaScope(id: string, scope: MediaScope): Promise<MediaRecord | null> {
	const db = await openDB();
	return new Promise<MediaRecord | null>((resolve, reject) => {
		const t = db.transaction(ASSET_STORE, 'readwrite');
		const store = t.objectStore(ASSET_STORE);
		let out: MediaRecord | null = null;
		t.oncomplete = () => resolve(out);
		t.onabort = t.onerror = () => reject(t.error || new Error('setMediaScope: the change failed'));
		const get = store.get(id);
		get.onsuccess = () => {
			const row = get.result as MediaRecord | undefined;
			if (!row || !KINDS.includes(row.kind)) return;
			out = { ...row, scope };
			store.put(out);
		};
	});
}

/** Remove one asset. */
export async function deleteMedia(id: string): Promise<void> {
	await deleteAsset(id);
}

/** Delete every asset a deck owns (the deck is being deleted). Resolves how many went. */
export async function deleteDeckMedia(deckId: string): Promise<number> {
	const mine = (await listMedia()).filter((m) => m.scope === deckId);
	for (const m of mine) await deleteMedia(m.id);
	return mine.length;
}

/** How many decks' sources reference `asset:<name>`. Pure, so the delete warning and the
 *  tests share it. `sources` is every deck's markdown. */
export function decksUsing(name: string, sources: string[]): number {
	const ref = new RegExp(`\\basset:${name.replace(/[-_]/g, (c) => `\\${c}`)}(?![A-Za-z0-9_-])`, 'i');
	return sources.filter((s) => ref.test(s)).length;
}
