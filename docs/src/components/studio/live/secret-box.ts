// Secrets at rest for a live session (CodeQL: no clear-text storage of sensitive data). A room
// secret and a rejoin token are sealed with AES-GCM before they touch sessionStorage or
// localStorage, and the sealing key — like the host's signing key — is a NON-EXTRACTABLE CryptoKey
// kept in IndexedDB: a script can ask WebCrypto to use it, but nothing can read its bytes, so a
// copy of the browser's storage on disk is not a copy of the secrets.

const DB = 'lattice-live';
const STORE = 'keys';

function db(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function get<T>(key: string): Promise<T | undefined> {
	const d = await db();
	return new Promise((resolve, reject) => {
		const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
		req.onsuccess = () => resolve(req.result as T | undefined);
		req.onerror = () => reject(req.error);
	});
}
async function put(key: string, value: unknown): Promise<void> {
	const d = await db();
	return new Promise((resolve, reject) => {
		const tx = d.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
async function del(key: string): Promise<void> {
	const d = await db();
	return new Promise((resolve) => {
		const tx = d.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
	});
}

let boxKey: Promise<CryptoKey> | null = null;
function sealingKey(): Promise<CryptoKey> {
	boxKey ??= (async () => {
		const have = await get<CryptoKey>('box');
		if (have) return have;
		const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
		await put('box', k);
		return k;
	})();
	return boxKey;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** `text`, sealed: `s1.<iv>.<ciphertext>`. */
export async function seal(text: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(), new TextEncoder().encode(text)));
	return `s1.${b64(iv)}.${b64(ct)}`;
}

/** The text in `sealed`, or null when it is not ours or cannot be opened (a cleared key store). */
export async function unseal(sealed: string | null | undefined): Promise<string | null> {
	if (!sealed?.startsWith('s1.')) return null;
	const [, iv, ct] = sealed.split('.');
	try {
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealingKey(), unb64(ct));
		return new TextDecoder().decode(pt);
	} catch {
		return null;
	}
}

/** The host's private signing key, kept as a CryptoKey object (never exported). */
export const putHostPrivateKey = (room: string, key: CryptoKey) => put(`host:${room}`, key);
export const getHostPrivateKey = (room: string) => get<CryptoKey>(`host:${room}`);
export const deleteHostPrivateKey = (room: string) => del(`host:${room}`);
