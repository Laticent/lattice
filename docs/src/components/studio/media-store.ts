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
/** The most one photo may be, on import and on restore. The two must agree, or a photo the Library
 *  accepted would be one a backup could never bring back (workspace-media.ts). */
export const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024;

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

/** What the leading bytes say a file is, for the five types the Library stores. Null for anything else
 *  (HEIC and SVG included: the importer handles those by the type the browser reports). A file's own
 *  `type` comes from its extension, so a JPEG renamed `.png` claims to be a PNG; the bytes do not lie. */
export function sniffImageMime(b: Uint8Array): string | null {
	const at = (i: number, s: string) => s.split('').every((ch, k) => b[i + k] === ch.charCodeAt(0));
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b[0] === 0x89 && at(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
	if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'image/gif';
	if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
	if (at(4, 'ftyp') && (at(8, 'avif') || at(8, 'avis'))) return 'image/avif';
	return null;
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
	const id = newId();
	try {
		return await putMedia(input, id, addedAt, false);
	} catch (first) {
		// A refusal of ours (a name clash) is the author's to fix: never retried, never reworded.
		if (isRefusal(first)) throw first;
		// A full disk is not a Blob problem, and a second attempt would only copy the bytes into memory
		// and fail the same way. Say what is true.
		if (isQuota(first)) throw new Error(`${MEDIA_REFUSAL_PREFIX} this browser has no room left to store photos. Delete some photos or other saved items and try again.`);
		// Some engines refuse to store a Blob at all: Safari in a private window answers
		// "UnknownError: Error preparing Blob/File data to be stored in object store" (reproduced on real
		// WebKit), while an ArrayBuffer stores fine. So the bytes go in as an ArrayBuffer and are rebuilt
		// into a Blob on the way out. A Blob stays the first choice: IndexedDB hands it back file-backed, so
		// a shelf of photos is not held in memory, and an ArrayBuffer is.
		try {
			return await putMedia(input, id, addedAt, true);
		} catch (second) {
			if (isRefusal(second)) throw second;
			if (isQuota(second)) throw new Error(`${MEDIA_REFUSAL_PREFIX} this browser has no room left to store photos. Delete some photos or other saved items and try again.`);
			throw new Error(`${MEDIA_REFUSAL_PREFIX} this browser would not store the photo. A private window often cannot; open Lattice in a normal window and try again.`);
		}
	}
}

const isRefusal = (e: unknown): boolean => e instanceof Error && e.message.startsWith(MEDIA_REFUSAL_PREFIX);
const isQuota = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'QuotaExceededError';

/** One attempt: the name check and the write share one readwrite transaction. `asBuffer` stores the
 *  bytes as an ArrayBuffer (`data`) instead of a Blob. */
async function putMedia(input: NewMedia, id: string, addedAt: number, asBuffer: boolean): Promise<MediaRecord> {
	const data = asBuffer ? await input.blob.arrayBuffer() : null;
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
				stored = { ...input, id, addedAt };
				if (asBuffer) {
					const { blob: _blob, ...rest } = stored;
					store.put({ ...rest, data });
				} else {
					store.put(stored);
				}
			};
		};
		read(0);
	});
}

/** A record as the app uses it: a `blob`, whichever way the bytes were stored. */
function readable(row: MediaRecord & { data?: ArrayBuffer }): MediaRecord {
	if (row.blob || !row.data) return row;
	const { data, ...rest } = row;
	return { ...rest, blob: new Blob([data], { type: row.mime }) } as MediaRecord;
}

/** Every saved image and video, newest first. IndexedDB unavailable → an empty shelf. */
export async function listMedia(): Promise<MediaRecord[]> {
	try {
		const db = await openDB();
		const store = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE);
		const rows = await Promise.all(KINDS.map((k) => reqAsPromise(store.index('kind').getAll(k)) as Promise<MediaRecord[]>));
		return rows.flat().map(readable).sort((a, b) => b.addedAt - a.addedAt);
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
			// The raw row keeps whichever of `blob` or `data` it was stored with; only the copy handed back is made readable.
			store.put({ ...row, scope });
			out = readable({ ...row, scope });
		};
	});
}

/** Remove one asset. */
export async function deleteMedia(id: string): Promise<void> {
	await deleteAsset(id);
}

/** `hero` → `hero-2`, `hero-3`… the first name not in `taken`. For a batch whose file names would
 *  otherwise refuse each other, and for a restore that must not overwrite a different photo. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
	if (!taken.has(name)) return name;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${name.slice(0, 44)}-${n}`;
		if (!taken.has(candidate) && isMediaName(candidate)) return candidate;
	}
	return `${name.slice(0, 40)}-${Date.now().toString(36)}`;
}

/** Delete every photo kept to ONE deck, whichever deck: "Clear decks" removes the decks, and a photo
 *  kept to a deck that no longer exists is invisible and unreachable but still holds the quota.
 *  Shared photos stay. Resolves how many went. */
export async function deleteDeckScopedMedia(): Promise<number> {
	const mine = (await listMedia()).filter((m) => m.scope !== LIBRARY_SCOPE);
	for (const m of mine) await deleteMedia(m.id);
	return mine.length;
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
	const ref = new RegExp(`\\basset:${name.replace(/[-_]/g, (c) => `\\${c}`)}(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])`, 'i');
	return sources.filter((s) => ref.test(s)).length;
}
