// Gate for the service worker's cross-deploy VERSION EVICTION (docs/public/sw.js).
// A content deploy re-hashes every `playground/v/<hash>/…` asset; without eviction
// the ASSETS cache keeps every past deploy's engine bundle / theme sheets, bloating
// Cache Storage across the lifetime a returning visitor spans. The eviction runs at
// `put()` time (NOT `activate`, which only fires on a SW-strategy bump): caching a
// current-hash asset drops every OLDER-hash copy of the SAME logical asset.
//
// We load the REAL sw.js into a sandbox with mocked caches/fetch/self and drive two
// deploys, so this tests the shipped code, not a re-implementation.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const SW_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://lattice.test';
const ASSETS = 'lattice-v1-assets';

class MockCache {
	store = new Map<string, unknown>();
	async put(req: { url: string }, res: unknown) {
		this.store.set(req.url, res);
	}
	async keys() {
		return [...this.store.keys()].map((url) => ({ url }));
	}
	async match(req: string | { url: string }) {
		return this.store.get(typeof req === 'string' ? req : req.url);
	}
	async delete(req: string | { url: string }) {
		return this.store.delete(typeof req === 'string' ? req : req.url);
	}
}
class MockCaches {
	map = new Map<string, MockCache>();
	async open(name: string) {
		if (!this.map.has(name)) this.map.set(name, new MockCache());
		return this.map.get(name)!;
	}
	async keys() {
		return [...this.map.keys()];
	}
	async delete(name: string) {
		return this.map.delete(name);
	}
	async match(req: string | { url: string }) {
		for (const c of this.map.values()) {
			const m = await c.match(req);
			if (m) return m;
		}
		return undefined;
	}
}

function loadSw() {
	const cachesMock = new MockCaches();
	const handlers: Record<string, (e: unknown) => void> = {};
	const selfMock = {
		location: { origin: ORIGIN },
		addEventListener: (type: string, fn: (e: unknown) => void) => {
			handlers[type] = fn;
		},
		skipWaiting: () => {},
		clients: { claim: () => {} },
	};
	const fetchMock = (req: string | { url: string }) => {
		const url = typeof req === 'string' ? req : req.url;
		const res = { ok: true, clone: () => res, _url: url };
		return Promise.resolve(res);
	};
	// eslint-disable-next-line no-new-func
	new Function('self', 'caches', 'fetch', SW_SRC)(selfMock, cachesMock, fetchMock);

	const asset = async (path: string) => {
		const request = { url: ORIGIN + path, method: 'GET', mode: 'cors', headers: { has: () => false } };
		const waits: unknown[] = [];
		let responded: unknown;
		handlers.fetch({ request, respondWith: (p: unknown) => (responded = p), waitUntil: (p: unknown) => waits.push(p) });
		await Promise.all([responded, ...waits].map((p) => Promise.resolve(p).catch(() => {})));
	};
	const assetKeys = () => [...(cachesMock.map.get(ASSETS)?.store.keys() ?? [])];
	return { asset, assetKeys };
}

describe('sw.js — cross-deploy version eviction', () => {
	let sw: ReturnType<typeof loadSw>;
	beforeEach(() => {
		sw = loadSw();
	});

	it('a new-hash copy evicts the old-hash copy of the SAME asset', async () => {
		await sw.asset('/playground/v/aaaaaaaa1111/lattice-runtime.js');
		expect(sw.assetKeys()).toContain(`${ORIGIN}/playground/v/aaaaaaaa1111/lattice-runtime.js`);

		await sw.asset('/playground/v/bbbbbbbb2222/lattice-runtime.js'); // a redeploy
		const keys = sw.assetKeys();
		expect(keys).toContain(`${ORIGIN}/playground/v/bbbbbbbb2222/lattice-runtime.js`);
		expect(keys).not.toContain(`${ORIGIN}/playground/v/aaaaaaaa1111/lattice-runtime.js`);
		expect(keys).toHaveLength(1);
	});

	it('keeps DIFFERENT assets under the current hash (only same-suffix siblings evict)', async () => {
		await sw.asset('/playground/v/cccccccc3333/lattice-runtime.js');
		await sw.asset('/playground/v/cccccccc3333/themes/indaco.css');
		expect(sw.assetKeys()).toHaveLength(2); // different suffixes, both current → both kept
	});

	it('does NOT touch a non-versioned same-origin asset', async () => {
		await sw.asset('/_astro/chunk.js');
		await sw.asset('/playground/v/dddddddd4444/lattice-runtime.js');
		expect(sw.assetKeys()).toContain(`${ORIGIN}/_astro/chunk.js`); // untouched by version eviction
	});

	it('does NOT evict itself when the SAME current-hash asset is re-cached (SWR revalidate)', async () => {
		await sw.asset('/playground/v/eeeeeeee5555/lattice-runtime.js');
		await sw.asset('/playground/v/eeeeeeee5555/lattice-runtime.js'); // revalidation re-put, same URL
		const keys = sw.assetKeys();
		expect(keys).toContain(`${ORIGIN}/playground/v/eeeeeeee5555/lattice-runtime.js`);
		expect(keys).toHaveLength(1); // survived — the self-skip (key.url === request.url) held
	});
});
