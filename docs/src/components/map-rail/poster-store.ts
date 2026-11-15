// THE POSTER STORE — the slide map's posters, kept across visits in IndexedDB.
//
// poster-cache.ts holds the posters a session has captured, in memory, and drops them when the map unmounts. That
// left a returning reader with nothing to show: every load started from sketches and filled in only as each live
// frame rendered and was captured, one engine document per tile. On a 4x-slower CPU, measured with
// `npm run perf:load` (MAP=1 CPU=4), those frames were nearly 5 s of blocking time and kept the page changing on
// screen for 4 s. With this store the map paints the pictures it had last time as soon as they are read back, and
// the live frames take over later (MapRail's `ramp`).
//
// A KEY IS ALREADY A COMPLETE ADDRESS. The host's key (StudioMap.tsx `keyOf`) hashes the slide's text, the look and
// the engine build (`options.themeBase` is the hashed `/playground/v/<hash>/themes/` URL), so an entry can never
// answer for a different picture: a new build, palette or edit simply misses. Nothing here invalidates anything.
//
// A CACHE, NOT USER DATA. Every operation fails soft: no IndexedDB (private mode, a test), a blocked open, a quota
// error, all read as a miss or a skipped write. Its own database, so its schema can never collide with a store that
// holds the reader's work (library/asset-db.js, ONE DATABASE MEANS ONE UPGRADE HANDLER). Bounded: a write that
// takes the store past `max` entries deletes the oldest writes first.

export interface PosterStore {
	/** The stored picture for `key`, or null. Never rejects. */
	get(key: string): Promise<Blob | null>;
	/** Store a picture under `key`; a write that fails is dropped. Never rejects. */
	put(key: string, blob: Blob): Promise<void>;
}

const STORE = 'posters';
const AT = 'at';

interface Row {
	key: string;
	blob: Blob;
	at: number;
}

const settle = <T>(req: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

/**
 * Open (lazily, on the first call) the poster store named `name`, keeping at most `max` pictures.
 * At about 6 to 15 KB a poster (poster-cache.ts), the default of 400 is a few MB.
 */
export function createPosterStore(name: string, { max = 400 }: { max?: number } = {}): PosterStore {
	let db: Promise<IDBDatabase | null> | null = null;
	const open = () => {
		db ??= new Promise<IDBDatabase | null>((resolve) => {
			try {
				if (typeof indexedDB === 'undefined') return resolve(null);
				const req = indexedDB.open(name, 1);
				req.onupgradeneeded = () => {
					const os = req.result.createObjectStore(STORE, { keyPath: 'key' });
					os.createIndex(AT, AT);
				};
				req.onsuccess = () => {
					const d = req.result;
					// Another tab deleting or upgrading the database closes this connection rather than waiting on it.
					d.onversionchange = () => d.close();
					resolve(d);
				};
				req.onerror = () => resolve(null);
				req.onblocked = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
		return db;
	};
	return {
		async get(key) {
			try {
				const d = await open();
				if (!d) return null;
				const row = (await settle(d.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as Row | undefined;
				return row?.blob instanceof Blob ? row.blob : null;
			} catch {
				return null;
			}
		},
		async put(key, blob) {
			try {
				const d = await open();
				if (!d) return;
				const tx = d.transaction(STORE, 'readwrite');
				const os = tx.objectStore(STORE);
				os.put({ key, blob, at: Date.now() } satisfies Row);
				const over = (await settle(os.count())) - max;
				if (over > 0) {
					// Oldest writes first, through the index, inside the same transaction as the write.
					const cur = os.index(AT).openCursor();
					let left = over;
					await new Promise<void>((resolve, reject) => {
						cur.onsuccess = () => {
							const c = cur.result;
							if (!c || left <= 0) return resolve();
							c.delete();
							left--;
							c.continue();
						};
						cur.onerror = () => reject(cur.error);
					});
				}
				await new Promise<void>((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
					tx.onabort = () => reject(tx.error);
				});
			} catch {
				// A cache write that fails costs one capture next time, nothing more.
			}
		},
	};
}
