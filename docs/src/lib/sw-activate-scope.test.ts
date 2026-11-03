// @vitest-environment node
// Gate for the service worker's ACTIVATE cleanup (docs/public/sw.js). It deletes this worker's stale caches and
// nothing else: the origin's Cache Storage also holds the on-device models (`transformers-cache`, about 80 MB for
// the voice; `webllm/model-cache`), and the old "delete everything not current" rule wiped them on every worker
// update. engineering/decisions/2026-10-29-studio-activity-audit.md §5.
//
// Loads the REAL sw.js into a sandbox with mocked caches and self, like sw-version-evict.test.ts.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SW_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'sw.js'), 'utf8');

class MockCache {
	async add() {}
	async delete() {
		return true;
	}
}

async function activateWith(names: string[]): Promise<string[]> {
	const store = new Map(names.map((n) => [n, new MockCache()]));
	const caches = {
		keys: async () => [...store.keys()],
		open: async (n: string) => {
			if (!store.has(n)) store.set(n, new MockCache());
			return store.get(n);
		},
		delete: async (n: string) => store.delete(n),
	};
	const handlers: Record<string, (e: unknown) => void> = {};
	const self = {
		location: { origin: 'https://lattice.test' },
		addEventListener: (type: string, fn: (e: unknown) => void) => {
			handlers[type] = fn;
		},
		skipWaiting: () => {},
		clients: { claim: () => {} },
	};
	new Function('self', 'caches', 'fetch', SW_SRC)(self, caches, () => Promise.reject(new Error('offline')));
	let done: unknown;
	handlers.activate({ waitUntil: (p: unknown) => (done = p) });
	await done;
	return [...store.keys()].sort();
}

describe('sw.js — activate deletes only its own stale caches', () => {
	it('keeps the on-device model caches', async () => {
		const left = await activateWith(['lattice-v1-pages', 'lattice-v1-assets', 'transformers-cache', 'webllm/model-cache']);
		expect(left).toContain('transformers-cache');
		expect(left).toContain('webllm/model-cache');
	});

	it('still deletes a stale cache of its own', async () => {
		const left = await activateWith(['lattice-v0-pages', 'lattice-v0-assets', 'lattice-v1-pages']);
		expect(left).not.toContain('lattice-v0-pages');
		expect(left).not.toContain('lattice-v0-assets');
		expect(left).toContain('lattice-v1-pages');
	});
});
