// THE POSTER STORE — the slide map's posters, kept across visits in IndexedDB.
//
// poster-cache.ts holds the posters a session has captured, in memory, and drops them when the map unmounts. That
// left a returning reader with nothing to show: every load started from sketches and filled in only as each live
// frame rendered and was captured, one engine document per tile. On a 4x-slower CPU, measured with
// `npm run perf:load` (MAP=1 CPU=4), those frames were nearly 5 s of blocking time and kept the page changing on
// screen for 4 s. With this store the map paints the pictures it had last time as soon as they are read back, and
// the live frames take over later (MapRail's `ramp`).
//
// THE KEY IS THE HOST'S, AND IT CARRIES WHAT CHANGES A PICTURE. StudioMap.tsx `keyOf` hashes the slide's text, the look,
// the engine build (`options.themeBase` is the hashed `/playground/v/<hash>/themes/` URL) and the capture's own version
// (`POSTER_FORMAT`), so a new build, palette, edit or capture change simply misses. What it cannot see is a picture that
// changes under the same text: a library photo replaced under its name. The host keeps those slides live instead.
// Nothing here invalidates anything.
//
// A CACHE, NOT USER DATA. Every operation fails soft: no IndexedDB (private mode, a test), a blocked open, a quota
// error, all read as a miss or a skipped write. Its own database, so its schema can never collide with a store that
// holds the reader's work (library/asset-db.js, ONE DATABASE MEANS ONE UPGRADE HANDLER). Bounded: a write that
// takes the store past `max` entries deletes the least recently used first (a read counts as a use).

export interface PosterStore {
	/** The stored picture for `key`, or null. Never rejects. */
	get(key: string): Promise<Blob | null>;
	/** Store a picture under `key`; a write that fails is dropped. Never rejects. */
	put(key: string, blob: Blob): Promise<void>;
}

const STORE = 'posters';
/** How stale a row's use-stamp may get before a read refreshes it. */
const STAMP_EVERY_MS = 60 * 60 * 1000;
const AT = 'at';

/** A picture is stored as its BYTES and type, not as a Blob: Blobs in IndexedDB have failed in WebKit before, and a
 *  structured-clone fake (the unit tests') drops them to a plain object. Bytes clone everywhere. */
interface Row {
	key: string;
	bytes: ArrayBuffer;
	type: string;
	at: number;
}

/** A Blob's bytes. `FileReader` where `Blob.arrayBuffer` is missing: Safari before 14, and jsdom. */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
	if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as ArrayBuffer);
		r.onerror = () => reject(r.error);
		r.readAsArrayBuffer(blob);
	});
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
				let gaveUp = false;
				const req = indexedDB.open(name, 1);
				req.onupgradeneeded = () => {
					const os = req.result.createObjectStore(STORE, { keyPath: 'key' });
					os.createIndex(AT, AT);
				};
				req.onsuccess = () => {
					const d = req.result;
					// Answered already (blocked, then unblocked later): this connection is nobody's, so it goes.
					if (gaveUp) return d.close();
					// Another tab deleting or upgrading the database closes this connection rather than waiting on it, and the next
					// call opens a fresh one: a closed connection kept here would fail every later transaction for the session.
					d.onversionchange = () => {
						d.close();
						db = null;
					};
					d.onclose = () => {
						db = null;
					};
					resolve(d);
				};
				// A failed or blocked open answers this call as a miss and is asked again next time, never remembered.
				req.onerror = () => {
					db = null;
					resolve(null);
				};
				req.onblocked = () => {
					gaveUp = true;
					db = null;
					resolve(null);
				};
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
				// Tested by its tag, not `instanceof`: the bytes may come from another realm (a frame, a test's DOM).
				if (!row || Object.prototype.toString.call(row.bytes) !== '[object ArrayBuffer]') return null;
				// A read is a use: eviction drops the posters least recently SHOWN, so the deck a reader opens every day is not
				// pushed out by a run of palette switches that each wrote a deck's worth of new keys. The stamp is its own
				// write, best effort, and only for a row not stamped in the last hour: a returning load reads a whole window,
				// and rewriting every row it shows, in serialized readwrite transactions, would tax the load this store
				// speeds up. A stamp that fails costs nothing; the picture was read.
				if (Date.now() - row.at > STAMP_EVERY_MS) {
					try {
						d.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...row, at: Date.now() } satisfies Row);
					} catch {
						// the connection closed under it (another tab); the next read stamps it
					}
				}
				return new Blob([row.bytes], { type: row.type });
			} catch {
				return null;
			}
		},
		async put(key, blob) {
			try {
				const d = await open();
				if (!d) return;
				// Read the bytes BEFORE the transaction opens: one that awaits anything else closes itself.
				const bytes = await bytesOf(blob);
				const tx = d.transaction(STORE, 'readwrite');
				const os = tx.objectStore(STORE);
				os.put({ key, bytes, type: blob.type, at: Date.now() } satisfies Row);
				const over = (await settle(os.count())) - max;
				if (over > 0) {
					// Least recently used first (the `at` a write or a read stamps), through the index, inside the write's transaction.
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
