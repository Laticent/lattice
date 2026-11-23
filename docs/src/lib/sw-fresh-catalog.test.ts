// @vitest-environment node
// The Studio's component catalog is fetched NETWORK-FIRST by docs/public/sw.js (2026-11-23). It used to
// ride the stale-while-revalidate branch, so the first add-slide gallery open after a deploy searched the
// previous deploy's catalog. Loaded the way sw-version-evict.test.ts loads the worker: its own source,
// run against mock `self`, `caches` and `fetch`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SW_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://lattice.test';
type Res = { ok: boolean; body: string; clone: () => Res };

function loadSw() {
	const stores = new Map<string, Map<string, Res>>();
	const caches = {
		open: async (n: string) => {
			if (!stores.has(n)) stores.set(n, new Map());
			const s = stores.get(n)!;
			return { put: async (r: { url: string }, v: Res) => void s.set(r.url, v), keys: async () => [...s.keys()].map((url) => ({ url })), delete: async (r: { url: string }) => s.delete(r.url), match: async (r: { url: string }) => s.get(r.url) };
		},
		keys: async () => [...stores.keys()],
		delete: async (n: string) => stores.delete(n),
		match: async (r: string | { url: string }) => {
			const url = typeof r === 'string' ? r : r.url;
			for (const s of stores.values()) if (s.has(url)) return s.get(url);
			return undefined;
		},
	};
	// The "server": the deploy's current bytes, or offline.
	const net = { deploy: 'v1', offline: false, status: 200 };
	const res = (body: string, ok: boolean): Res => ({ ok, body, clone: () => res(body, ok) });
	const fetch = async () => {
		if (net.offline) throw new TypeError('offline');
		return res(net.deploy, net.status < 400);
	};
	const handlers: Record<string, (e: unknown) => void> = {};
	const self = { location: { origin: ORIGIN }, addEventListener: (t: string, f: (e: unknown) => void) => void (handlers[t] = f), skipWaiting: () => {}, clients: { claim: () => {} } };
	new Function('self', 'caches', 'fetch', 'Response', SW_SRC)(self, caches, fetch, { error: () => res('ERROR', false) });
	const get = async (path: string): Promise<Res> => {
		let responded: Promise<Res> | undefined;
		const waits: unknown[] = [];
		handlers.fetch({ request: { url: ORIGIN + path, method: 'GET', mode: 'cors', cache: 'default', headers: { has: () => false } }, respondWith: (p: Promise<Res>) => (responded = p), waitUntil: (p: unknown) => waits.push(p) });
		const out = await responded!;
		await Promise.all(waits.map((p) => Promise.resolve(p).catch(() => {})));
		return out;
	};
	return { get, net };
}

describe('sw.js: the Studio catalog is network-first', () => {
	it('the first request after a deploy gets the NEW catalog, not the cached one', async () => {
		const sw = loadSw();
		expect((await sw.get('/studio/component-catalog.json')).body).toBe('v1');
		sw.net.deploy = 'v2';
		expect((await sw.get('/studio/component-catalog.json')).body).toBe('v2');
		expect((await sw.get('/studio/modifier-vocab.json')).body).toBe('v2');
	});

	it('offline, it serves the last good copy, so the gallery still opens', async () => {
		const sw = loadSw();
		await sw.get('/studio/component-catalog.json');
		sw.net.offline = true;
		expect((await sw.get('/studio/component-catalog.json')).body).toBe('v1');
	});

	it('a failed response is passed through and never replaces the good copy', async () => {
		const sw = loadSw();
		await sw.get('/studio/component-catalog.json');
		sw.net.deploy = 'broken';
		sw.net.status = 500;
		expect((await sw.get('/studio/component-catalog.json')).ok).toBe(false);
		sw.net.offline = true;
		expect((await sw.get('/studio/component-catalog.json')).body).toBe('v1');
	});

	it('works under a base path, and other same-origin assets stay stale-while-revalidate', async () => {
		const sw = loadSw();
		await sw.get('/lattice/studio/component-catalog.json');
		await sw.get('/logo.svg');
		sw.net.deploy = 'v2';
		expect((await sw.get('/lattice/studio/component-catalog.json')).body).toBe('v2');
		expect((await sw.get('/logo.svg')).body).toBe('v1'); // the cached copy now; the refreshed one next time
	});
});
