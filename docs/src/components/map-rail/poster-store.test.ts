// The slide map's posters kept across visits (poster-store.ts): a picture comes back under its key, the store keeps its
// newest `max` writes, and a browser with no IndexedDB reads every key as a miss without throwing.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPosterStore } from './poster-store';

// A fresh database per test; each test names its own store too, so nothing is shared through the module.
let n = 0;
const name = () => `posters-test-${++n}`;
const pic = (s: string) => new Blob([s], { type: 'image/jpeg' });
const text = (b: Blob | null) =>
	b
		? new Promise<string>((resolve) => {
				const r = new FileReader();
				r.onload = () => resolve(String(r.result));
				r.readAsText(b);
			})
		: null;

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	// The eviction order is the write time: pin the clock and move it a step per write.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('createPosterStore', () => {
	it('gives back the picture stored under a key, and null for a key never stored', async () => {
		const store = createPosterStore(name());
		await store.put('a', pic('one'));
		expect(await text(await store.get('a'))).toBe('one');
		expect(await store.get('b')).toBeNull();
	});

	it('keeps the newest `max` pictures, deleting the oldest writes first', async () => {
		const store = createPosterStore(name(), { max: 2 });
		for (const k of ['a', 'b', 'c']) {
			await store.put(k, pic(k));
			vi.advanceTimersByTime(1000);
		}
		expect(await store.get('a')).toBeNull();
		expect(await text(await store.get('b'))).toBe('b');
		expect(await text(await store.get('c'))).toBe('c');
	});

	it('reads every key as a miss, and drops writes, where there is no IndexedDB', async () => {
		// @ts-expect-error a browser without IndexedDB (a private window in some engines)
		globalThis.indexedDB = undefined;
		const store = createPosterStore(name());
		await expect(store.put('a', pic('one'))).resolves.toBeUndefined();
		expect(await store.get('a')).toBeNull();
	});
});
