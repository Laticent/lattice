import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetOpenRouterKeyForTests, isOpenRouterKeyEvent, loadOpenRouterKey, noteOpenRouterStatus, openRouterKeyRejected, openRouterKeySettled, readOpenRouterKey, writeOpenRouterKey } from './openrouter-key.js';

// THE ONE READER. "What can read the author's key?" must have a one-module answer, because
// the shared-deck isolation proof (2026-11-06-studio-byok-key-lifecycle.md) stands on it.
// Tests may seed the key by name; app code may not name it at all.
describe('openrouter-key — the only module that names the stored key', () => {
	it('no other non-test file under docs/src names lattice-db-or-key', () => {
		const src = path.resolve(__dirname, '..');
		let out = '';
		try {
			out = execFileSync('git', ['grep', '--untracked', '-l', '-F', 'lattice-db-or-key', '--', '.'], { cwd: src, encoding: 'utf8' });
		} catch (e) {
			// git grep exits 1 for "no match", which is the passing case. Anything else (git
			// missing, not a repository) must fail loudly, or this test passes without running.
			if ((e as { status?: number }).status !== 1) throw e;
			out = String((e as { stdout?: string }).stdout ?? '');
		}
		const offenders = out
			.split('\n')
			.filter(Boolean)
			.filter((f) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f))
			.filter((f) => f !== 'lib/openrouter-key.js');
		expect(offenders).toEqual([]);
	});
});

async function freshPage() {
	await openRouterKeySettled();
	localStorage.clear();
	__resetOpenRouterKeyForTests();
	await new Promise<void>((r) => {
		const del = indexedDB.deleteDatabase('lattice-secrets');
		del.onsuccess = del.onerror = del.onblocked = () => r();
	});
}

describe('openrouter-key — read, write, reject', () => {
	afterEach(freshPage);
	it('reads what it wrote, and null clears it', () => {
		expect(readOpenRouterKey()).toBeNull();
		writeOpenRouterKey('sk-or-a');
		expect(readOpenRouterKey()).toBe('sk-or-a');
		writeOpenRouterKey(null);
		expect(readOpenRouterKey()).toBeNull();
	});
	it('a 401 marks the stored key once; a 2xx or a new key clears it', () => {
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(false); // no stored key, nothing to mark
		writeOpenRouterKey('sk-or-a');
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(true);
		expect(noteOpenRouterStatus(401, 'sk-or-a')).toBe(false); // already marked: announced once
		expect(openRouterKeyRejected()).toBe(true);
		expect(noteOpenRouterStatus(402, 'sk-or-a')).toBe(false); // not a key-health answer
		expect(noteOpenRouterStatus(200, 'sk-or-a')).toBe(true); // a one-off 401 does not stick
		expect(openRouterKeyRejected()).toBe(false);
		noteOpenRouterStatus(401, 'sk-or-a');
		writeOpenRouterKey('sk-or-b');
		expect(openRouterKeyRejected()).toBe(false);
	});
	it('a late 401 about an OLD key never marks the new one', () => {
		writeOpenRouterKey('sk-or-new');
		expect(noteOpenRouterStatus(401, 'sk-or-old')).toBe(false);
		expect(openRouterKeyRejected()).toBe(false);
	});
	it('recognizes a storage event for the key, or a cleared store', () => {
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-key' })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: null })).toBe(true);
		expect(isOpenRouterKeyEvent({ key: 'lattice-db-or-model' })).toBe(false);
	});
});

// The name guard above covers source. This covers the other way a value leaves: code that SWEEPS
// storage. Every sweep in docs/src today (found by `localStorage.key(` — the storage meter, the
// settings-row summary, the deck stats, the workspace backup) reports names and byte counts only.
// If one ever starts returning values, the seeded key must not ride out with them. The workspace
// backup has its own pin (workspace-backup.test.ts, "never packs the OpenRouter key").
describe('openrouter-key — no storage sweep returns the key value', () => {
	afterEach(freshPage);
	it('the storage meter, summary and deck stats never carry the seeded value', async () => {
		const SECRET = 'sk-or-v1-sweep-canary-0123456789';
		writeOpenRouterKey(SECRET);
		const { scanLocalStorage } = await import('../playground/storage-metrics');
		const { storageSummary } = await import('../components/studio/workspace-backup-meta');
		const { deckContentStats } = await import('../components/studio/studio-store');
		const outputs = [scanLocalStorage(), await storageSummary(), deckContentStats()];
		for (const out of outputs) expect(JSON.stringify(out)).not.toContain(SECRET);
	});
});

// At rest the key is SEALED (owner decision 2026-11-06, decision note §9): localStorage holds an
// AES-GCM envelope, and the sealing key is a non-extractable WebCrypto key in IndexedDB. These run
// on Node's WebCrypto and fake-indexeddb; the browser half is docs/e2e/workspace-api-key.spec.ts.
describe('openrouter-key — encrypted at rest', () => {
	const KEY = 'lattice-db-or-key';
	const SECRET = 'sk-or-v1-at-rest-canary-77aa';
	afterEach(freshPage);
	it('what reaches localStorage is an envelope that does not contain the key', async () => {
		writeOpenRouterKey(SECRET);
		expect(readOpenRouterKey()).toBe(SECRET); // memory answers at once
		await openRouterKeySettled();
		const stored = String(localStorage.getItem(KEY));
		expect(stored.startsWith('v1:')).toBe(true);
		expect(stored).not.toContain(SECRET);
		expect(stored).not.toContain(SECRET.slice(-8));
	});
	it('a fresh page load opens the envelope again', async () => {
		writeOpenRouterKey(SECRET);
		await openRouterKeySettled();
		__resetOpenRouterKeyForTests(); // memory gone, as on reload; IndexedDB and storage stay
		expect(readOpenRouterKey()).toBeNull(); // sealed and not opened yet
		expect(await loadOpenRouterKey()).toBe(SECRET);
		expect(readOpenRouterKey()).toBe(SECRET);
	});
	it('a plaintext key from before encryption is used, then re-sealed in place', async () => {
		// Deliberately plaintext: this fixture IS the pre-encryption storage the migration reads.
		// A fake key, never a real one.
		const LEGACY = 'sk-or-v1-legacy-plaintext-5e1f';
		localStorage.setItem(KEY, LEGACY);
		expect(readOpenRouterKey()).toBe(LEGACY);
		await loadOpenRouterKey();
		await vi.waitFor(() => expect(String(localStorage.getItem(KEY)).startsWith('v1:')).toBe(true));
		__resetOpenRouterKeyForTests();
		expect(await loadOpenRouterKey()).toBe(LEGACY);
	});
	it('an envelope whose sealing key was cleared reads as no key, and is removed', async () => {
		writeOpenRouterKey(SECRET);
		await openRouterKeySettled();
		await new Promise<void>((r) => {
			const del = indexedDB.deleteDatabase('lattice-secrets');
			del.onsuccess = del.onerror = del.onblocked = () => r();
		});
		__resetOpenRouterKeyForTests();
		expect(await loadOpenRouterKey()).toBeNull();
		expect(localStorage.getItem(KEY)).toBeNull();
	});
	it('the sealing key cannot be exported', async () => {
		writeOpenRouterKey(SECRET);
		await openRouterKeySettled();
		const wrap = await new Promise<CryptoKey>((resolve, reject) => {
			const open = indexedDB.open('lattice-secrets', 1);
			open.onsuccess = () => {
				const req = open.result.transaction('keys').objectStore('keys').get('openrouter-at-rest');
				// Close the connection, or the next test's database delete waits on it forever.
				req.onsuccess = () => {
					open.result.close();
					resolve(req.result);
				};
				req.onerror = () => reject(req.error);
			};
		});
		expect(wrap.extractable).toBe(false);
		await expect(crypto.subtle.exportKey('raw', wrap)).rejects.toThrow();
	});
	it('without IndexedDB, a saved key stays in memory only and is never written in clear', async () => {
		const idb = globalThis.indexedDB;
		vi.stubGlobal('indexedDB', undefined);
		try {
			writeOpenRouterKey(SECRET);
			await openRouterKeySettled();
			expect(readOpenRouterKey()).toBe(SECRET);
			expect(localStorage.getItem(KEY)).toBeNull();
		} finally {
			vi.stubGlobal('indexedDB', idb);
			vi.unstubAllGlobals();
		}
	});
});

// From the checker's reproductions of the first version of this module (all three lost or
// staled the author's key). Each runs on the same stack as the module's other tests.
describe('openrouter-key — encrypted at rest, under races and faults', () => {
	const KEY = 'lattice-db-or-key';
	afterEach(async () => {
		vi.restoreAllMocks();
		await freshPage();
	});
	it('a load and a read racing to migrate a plaintext key share ONE sealing key, so a reload opens it', async () => {
		localStorage.setItem(KEY, 'sk-or-v1-legacy-race-1234');
		const loading = loadOpenRouterKey();
		readOpenRouterKey(); // before the load lands: used to start a second migration and a second key
		await loading;
		await vi.waitFor(() => expect(String(localStorage.getItem(KEY)).startsWith('v1:')).toBe(true));
		__resetOpenRouterKeyForTests();
		expect(await loadOpenRouterKey()).toBe('sk-or-v1-legacy-race-1234');
	});
	it('two writes from a browser with no sealing key yet leave an envelope a reload can open', async () => {
		writeOpenRouterKey('sk-or-v1-first-aaaa');
		writeOpenRouterKey('sk-or-v1-second-bbbb');
		await openRouterKeySettled();
		__resetOpenRouterKeyForTests();
		expect(await loadOpenRouterKey()).toBe('sk-or-v1-second-bbbb');
	});
	it('a write that lands while an older envelope is still decrypting wins', async () => {
		writeOpenRouterKey('sk-or-v1-OLD-aaaa');
		await openRouterKeySettled();
		__resetOpenRouterKeyForTests();
		// The decrypt is held open until the newer write has fully landed: an explicit gate, not a
		// duration, so the order is the code's alone.
		const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
		let release: () => void = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...a) => {
			await gate;
			return decrypt(...(a as Parameters<typeof decrypt>));
		});
		const loading = loadOpenRouterKey();
		writeOpenRouterKey('sk-or-v1-NEW-bbbb');
		await openRouterKeySettled();
		release();
		await loading;
		expect(readOpenRouterKey()).toBe('sk-or-v1-NEW-bbbb');
		__resetOpenRouterKeyForTests();
		expect(await loadOpenRouterKey()).toBe('sk-or-v1-NEW-bbbb');
	});
	it('an IndexedDB failure while opening keeps the stored envelope, and a later load recovers the key', async () => {
		writeOpenRouterKey('sk-or-v1-GOOD-cccc');
		await openRouterKeySettled();
		const envelope = localStorage.getItem(KEY);
		__resetOpenRouterKeyForTests();
		const open = indexedDB.open.bind(indexedDB);
		let calls = 0;
		vi.spyOn(indexedDB, 'open').mockImplementation((...a) => {
			if (calls++ > 0) return open(...a);
			const req = {} as IDBOpenDBRequest & { error: Error };
			// Fail on the next microtask, after the caller has attached `onerror`, as a real request does.
			queueMicrotask(() => {
				Object.assign(req, { error: new Error('UnknownError') });
				req.onerror?.(new Event('error'));
			});
			return req;
		});
		expect(await loadOpenRouterKey()).toBeNull(); // this load could not open it…
		expect(localStorage.getItem(KEY)).toBe(envelope); // …and did not delete it
		expect(await loadOpenRouterKey()).toBe('sk-or-v1-GOOD-cccc'); // the next one does
	});
});
