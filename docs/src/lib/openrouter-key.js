// THE ONE READER OF THE AUTHOR'S OPENROUTER KEY.
//
// The Studio, the Playground and the /suono and /cadenza library pages all run on the
// author's own OpenRouter key (BYOK). It used to be read in four places, each with its own
// copy of the storage name, so "what can read the key?" had no short answer. Every reader
// and writer now goes through this module, and `openrouter-key.test.ts` fails if the name
// appears anywhere else under `docs/src`. That makes OUR code auditable. It is not the
// shared-deck defense: a script injected into a same-origin frame can do what this module
// does. That defense is the slide sanitizer
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §3–§4).
//
// ENCRYPTED AT REST (§9, owner decision 2026-11-06). localStorage holds an envelope,
// `v1:<iv>:<ciphertext>`, sealed with AES-GCM-256 under a NON-EXTRACTABLE WebCrypto key that
// lives in IndexedDB: the browser can use that key, but no code can read its bytes, so the
// browser profile's files on disk (a backup, a synced profile folder, another program reading
// them) hold no usable secret. It does NOT stop script running on this origin, which can ask
// the browser to decrypt exactly as this module does.
//
// The key is decrypted ONCE into memory (`loadOpenRouterKey`), so every reader stays
// synchronous. A plaintext key stored before this change is read, then re-sealed on first
// load. Where WebCrypto or IndexedDB is missing, a key the author saves is kept in memory
// only (lost on reload) rather than written in clear.

const KEY = 'lattice-db-or-key';
// '1' once OpenRouter answered 401 for the stored key (revoked, deleted or expired).
const REJECTED = 'lattice-db-or-key-invalid';
const ENVELOPE = 'v1:';
const DB = 'lattice-secrets';
const STORE = 'keys';
const WRAP_ID = 'openrouter-at-rest';

function read(name) {
	try {
		return localStorage.getItem(name);
	} catch {
		return null;
	}
}
function write(name, value) {
	try {
		if (value == null) localStorage.removeItem(name);
		else localStorage.setItem(name, value);
	} catch {
		/* storage unavailable — the key simply is not there */
	}
}

const sealed = (raw) => typeof raw === 'string' && raw.startsWith(ENVELOPE);

// ── The at-rest key: AES-GCM-256, non-extractable, kept in IndexedDB ───────────────────────

const cryptoOk = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';

function idb(mode, fn) {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const db = open.result;
			const fail = (e) => {
				db.close();
				reject(e);
			};
			// A quota or eviction abort fires `abort`, not `error`, and `transaction()` itself can
			// throw: without these the promise never settles and every later write stalls behind it.
			try {
				const tx = db.transaction(STORE, mode);
				const req = fn(tx.objectStore(STORE));
				tx.oncomplete = () => {
					db.close();
					resolve(req?.result);
				};
				tx.onerror = () => fail(tx.error);
				tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'));
			} catch (e) {
				fail(e);
			}
		};
	});
}

// ONE sealing key per browser. The lookup is memoized, so two seals that start together in this
// tab share it; and a new key is written with `add`, not `put`, so a second tab that raced to
// create one fails, re-reads, and uses the first tab's key instead of overwriting it (an envelope
// sealed under an overwritten key could never be opened again).
let wrapKey = null; // Promise<CryptoKey | null>
async function lookupOrCreate(create) {
	const found = await idb('readonly', (s) => s.get(WRAP_ID));
	if (found || !create) return found ?? null;
	const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
	try {
		await idb('readwrite', (s) => s.add(made, WRAP_ID));
		return made;
	} catch {
		const winner = await idb('readonly', (s) => s.get(WRAP_ID));
		if (winner) return winner;
		throw new Error('could not store the sealing key');
	}
}
/** The sealing key. `create: false` answers null only when the database opened and has none. */
function sealingKey(create) {
	if (!wrapKey) {
		const p = lookupOrCreate(create);
		wrapKey = p;
		// A failure or a "none yet" must not stick: the next caller looks again.
		p.then(
			(k) => {
				if (!k && wrapKey === p) wrapKey = null;
			},
			() => {
				if (wrapKey === p) wrapKey = null;
			},
		);
		return p;
	}
	return wrapKey.then((k) => {
		if (k || !create) return k ?? null;
		wrapKey = null; // the memoized lookup found none; this caller needs one made
		return sealingKey(true);
	});
}

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function seal(plain) {
	const k = await sealingKey(true);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plain));
	return `${ENVELOPE}${b64(iv)}:${b64(ct)}`;
}

/**
 * Open an envelope. `{ key }` on success; `{ gone: true }` when it can NEVER open (the database
 * opened and holds no sealing key, the envelope is malformed, or AES-GCM rejected it). Anything
 * else (IndexedDB failed to open, a transaction aborted) THROWS: a transient fault must never
 * cost the author their stored key.
 */
async function unseal(envelope) {
	const [iv, ct] = envelope.slice(ENVELOPE.length).split(':');
	if (!iv || !ct) return { gone: true };
	const k = await sealingKey(false);
	if (!k) return { gone: true };
	try {
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct));
		return { key: new TextDecoder().decode(pt) };
	} catch (e) {
		if (e?.name === 'OperationError') return { gone: true }; // wrong key or tampered data
		throw e;
	}
}

// ── The in-memory copy every reader uses ─────────────────────────────────────────────────
//
// `cached` is the key (null = none; undefined = not known yet) and `cachedRaw` is the stored
// value it came from. A read checks the stored value still matches, so a change made outside
// this module (another tab, a test seeding storage) is seen on the next read rather than
// hidden behind a stale copy, except while one of our own sealed writes is still in flight.

let cached;
let cachedRaw;
let loading = null;
let pending = 0;
let generation = 0; // bumped by every write, so a load that started earlier cannot overwrite it
let migrating = null;
let persisting = Promise.resolve();

function announce() {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(new Event('db-model-changed'));
	} catch {
		/* no event support — the next status read still sees the change */
	}
}

/** Re-seal a plaintext key left from before encryption, in place, when this browser can. Single-flight. */
function migrate(raw) {
	if (!cryptoOk()) return Promise.resolve();
	migrating ??= (async () => {
		try {
			const env = await seal(raw);
			if (read(KEY) === raw && pending === 0) {
				write(KEY, env);
				if (cached === raw) cachedRaw = env;
			}
		} catch {
			/* sealing failed: the plaintext stays until a later load manages it */
		} finally {
			migrating = null;
		}
	})();
	return migrating;
}

/**
 * Decrypt the stored key into memory. Idempotent; await it before the first read that matters
 * (the model adapter, the library pages). An envelope that no longer opens (its sealing key
 * was cleared with the site's IndexedDB) can never be read again, so it is removed and the
 * author connects again.
 */
export function loadOpenRouterKey() {
	const raw = read(KEY);
	if (cached !== undefined && (pending > 0 || raw === cachedRaw)) return Promise.resolve(cached);
	loading ??= (async () => {
		const startedAt = generation;
		const now = read(KEY);
		let key = null;
		let transient = false;
		if (now && !sealed(now)) {
			key = now;
			await migrate(now);
		} else if (now && cryptoOk()) {
			try {
				const opened = await unseal(now);
				if (opened.gone) {
					// It can never open again (its sealing key is gone): remove it, and the author
					// connects again. Only when nothing newer was written meanwhile.
					if (read(KEY) === now && generation === startedAt) write(KEY, null);
				} else key = opened.key;
			} catch {
				transient = true; // keep the stored envelope; a later load tries again
			}
		}
		// A write that started after this load wins: never put an older key back.
		if (pending === 0 && generation === startedAt) {
			cached = key || null;
			cachedRaw = transient ? undefined : read(KEY);
		}
		loading = null;
		announce();
		return cached ?? null;
	})();
	return loading;
}

/** Wait for any sealed write still in flight (tests, and a page about to unload). */
export function openRouterKeySettled() {
	return persisting;
}

/**
 * The stored key, or null. Synchronous: it answers from memory. A plaintext key from before
 * encryption is answered at once (and re-sealed in the background); a sealed one is answered
 * once `loadOpenRouterKey` has opened it, and until then this returns null and starts the
 * load, which announces `db-model-changed` when the key is in.
 */
export function readOpenRouterKey() {
	const raw = read(KEY);
	if (cached !== undefined && (pending > 0 || raw === cachedRaw)) return cached;
	if (!raw) {
		cached = null;
		cachedRaw = null;
		return null;
	}
	if (!sealed(raw)) {
		cached = raw;
		cachedRaw = raw;
		migrate(raw);
		return raw;
	}
	cached = undefined;
	loadOpenRouterKey();
	return null;
}

/**
 * Store a key (or remove it with null). Memory changes now; the sealed copy is written next,
 * in order. A new key, or none, always clears the rejected mark. Returns the write's promise.
 */
export function writeOpenRouterKey(key) {
	const next = key || null;
	cached = next;
	generation++;
	pending++;
	write(REJECTED, null);
	persisting = persisting.then(async () => {
		try {
			if (next === null || !cryptoOk()) {
				// None, or memory only: never written in clear.
				write(KEY, null);
			} else {
				const env = await seal(next);
				if (cached === next) write(KEY, env); // a newer write supersedes this one
			}
		} catch {
			write(KEY, null);
		} finally {
			pending--;
			if (cached === next) cachedRaw = read(KEY);
		}
	});
	return persisting;
}

/** A safe label for the stored key — its last four characters — or null. Never the key. */
export function openRouterKeyHint() {
	const key = readOpenRouterKey();
	return key && key.length > 8 ? `…${key.slice(-4)}` : key ? '…' : null;
}

/** True when OpenRouter has rejected the stored key with a 401. */
export function openRouterKeyRejected() {
	return !!readOpenRouterKey() && read(REJECTED) === '1';
}

/**
 * Feed the status of a request made WITH `key` into the rejected mark. A 401 marks the key
 * rejected; any 2xx clears a mark it earned earlier (a one-off 401 must not stick). A request
 * made with a key that is no longer the stored one is ignored: its answer is about the old
 * key, and letting a late 401 land after a reconnect would mark the NEW key rejected.
 * Returns true when the mark changed, so the caller can announce it once.
 */
export function noteOpenRouterStatus(status, key) {
	if (!key || key !== readOpenRouterKey()) return false;
	const marked = read(REJECTED) === '1';
	if (status === 401 && !marked) write(REJECTED, '1');
	else if (status >= 200 && status < 300 && marked) write(REJECTED, null);
	else return false;
	announce();
	return true;
}

/**
 * Whether a `storage` event (another tab) changed the key. A cleared store (`key === null`)
 * counts. The memory copy is dropped so the next read loads what the other tab wrote.
 */
export function isOpenRouterKeyEvent(event) {
	const hit = event?.key === KEY || event?.key === null;
	if (hit) wrapKey = null; // the other tab may have made the sealing key; read it afresh
	return hit;
}

/** Test seam: forget the memory copy, as a fresh page load would. */
export function __resetOpenRouterKeyForTests() {
	cached = undefined;
	cachedRaw = undefined;
	loading = null;
	migrating = null;
	pending = 0;
	generation = 0;
	wrapKey = null;
	persisting = Promise.resolve();
}
