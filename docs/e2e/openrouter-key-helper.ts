import type { Page } from '@playwright/test';

/**
 * The stored OpenRouter key, recovered the way any script on the Studio's own origin could:
 * read the sealed envelope from localStorage, fetch the non-extractable sealing key from
 * IndexedDB, and ask the browser to decrypt (docs/src/lib/openrouter-key.js). A plaintext key
 * left from before encryption is returned as it is. Null when nothing is stored.
 *
 * Two uses. The specs check what was saved with it. And it is the honest CONTROL for the
 * isolation specs: same-origin script CAN recover the key, so encryption at rest is not what
 * keeps a hostile deck or plugin away from it — the sanitizer and the plugin sandbox are
 * (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §9).
 */
export function storedOpenRouterKey(page: Page): Promise<string | null> {
	return page.evaluate(async () => {
		const raw = localStorage.getItem('lattice-db-or-key');
		if (!raw) return null;
		if (!raw.startsWith('v1:')) return raw;
		const [iv, ct] = raw.slice(3).split(':');
		const key = await new Promise<CryptoKey | undefined>((resolve, reject) => {
			const open = indexedDB.open('lattice-secrets', 1);
			open.onerror = () => reject(open.error);
			open.onsuccess = () => {
				const req = open.result.transaction('keys').objectStore('keys').get('openrouter-at-rest');
				req.onsuccess = () => {
					open.result.close();
					resolve(req.result as CryptoKey | undefined);
				};
				req.onerror = () => reject(req.error);
			};
		});
		if (!key) return null;
		const bytes = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct));
		return new TextDecoder().decode(pt);
	});
}

/** The raw stored value: the sealed envelope, or null. */
export function storedOpenRouterRaw(page: Page): Promise<string | null> {
	return page.evaluate(() => localStorage.getItem('lattice-db-or-key'));
}
