import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { History } from './history';
import { type Backend, createFiloStore, idbBackend, memoryBackend, planEviction, type StoredIndex } from './store';

function snapOf(doc: string, text: string, edits = 1) {
	const h = new History(doc, text);
	for (let i = 0; i < edits; i++) h.commit({ base: h.head, next: `${h.text}${'x'.repeat(10)}\n`, label: 'Typing', origin: 'markdown' });
	return h.toSnapshot();
}

const backends: Array<[string, () => Backend]> = [
	['IndexedDB', () => idbBackend(`filo-test-${Math.random()}`, new IDBFactory())],
	['memory', () => memoryBackend()],
];

for (const [name, make] of backends) {
	describe(`the history store (${name})`, () => {
		it('writes and reads a claimed document, and refuses an unclaimed one', async () => {
			const store = createFiloStore(make());
			const snap = snapOf('a', 'hello\n');
			expect(await store.write(snap), 'unclaimed').toBe(false);
			expect(await store.claim('a')).toBe(true);
			expect(await store.write(snap)).toBe(true);
			const back = await store.read('a');
			expect(back?.text).toBe(snap.text);
			const h = new History('a', 'x');
			expect(h.restoreSnapshot(back as NonNullable<typeof back>)).toBe(true);
			expect(h.undo()?.text).toBe('hello\n');
		});

		it('Clear all is final: a write from a store opened before it is refused, and a new store writes', async () => {
			const backend = make();
			const before = createFiloStore(backend);
			await before.claim('a');
			expect(await before.write(snapOf('a', 'one\n'))).toBe(true);
			const clearing = createFiloStore(backend);
			await clearing.claim('a');
			await clearing.clear();
			expect(await before.read('a')).toBeNull();
			// The reload's pagehide flush, from the tab that cleared, and a flush from another tab.
			expect(await clearing.write(snapOf('a', 'two\n'))).toBe(false);
			expect(await before.write(snapOf('a', 'three\n'))).toBe(false);
			expect(await before.read('a')).toBeNull();
			const after = createFiloStore(backend);
			await after.claim('a');
			expect(await after.write(snapOf('a', 'four\n'))).toBe(true);
		});

		it('a deck deleted in another tab is never written back by the tab that still had it open', async () => {
			let t = 100;
			const backend = make();
			const open = createFiloStore(backend, { now: () => t++ });
			await open.claim('a');
			expect(await open.write(snapOf('a', 'one\n'))).toBe(true);
			const deleting = createFiloStore(backend, { now: () => t++ });
			await deleting.remove('a');
			expect(await open.write(snapOf('a', 'two\n')), 'the older claim is refused').toBe(false);
			expect(await open.read('a')).toBeNull();
			const later = createFiloStore(backend, { now: () => t++ });
			await later.claim('a');
			expect(await later.write(snapOf('a', 'three\n')), 'a claim after the delete writes').toBe(true);
		});

		it('clear reports whether it reached storage', async () => {
			const backend = make();
			expect(await createFiloStore(backend).clear()).toBe(true);
			backend.clear = () => Promise.reject(new Error('blocked'));
			expect(await createFiloStore(backend).clear()).toBe(false);
		});

		it('removes a deleted deck', async () => {
			const store = createFiloStore(make());
			await store.claim('a');
			await store.write(snapOf('a', 'one\n'));
			await store.remove('a');
			expect(await store.read('a')).toBeNull();
		});

		it('keeps the budget: the least recently written other deck is compacted, then dropped', async () => {
			let t = 0;
			const evicted: Array<[string, number]> = [];
			const text = `${'line\n'.repeat(200)}`;
			const store = createFiloStore(make(), { budget: 5_000, now: () => ++t, onEvict: (doc, marks) => evicted.push([doc, marks]) });
			for (const d of ['old', 'mid', 'new']) await store.claim(d);
			const old = new History('old', text);
			// A rewrite: its step stores the deleted and the inserted text, so compacting it saves both.
			old.commit({ base: old.head, next: text.toUpperCase(), label: 'AI', origin: 'ai' });
			old.mark('Named');
			await store.write(old.toSnapshot());
			await store.write(snapOf('mid', text, 3));
			// Over budget now: the oldest is compacted first, and its named mark survives.
			const o = await store.read('old');
			expect(o, 'witness: the oldest is still stored').not.toBeNull();
			expect(o?.done.length, 'compacted').toBe(0);
			expect(o?.marks.some((m) => m.label === 'Named')).toBe(true);
			await store.write(snapOf('new', text, 3));
			expect(await store.read('new'), 'the deck being written is never evicted').not.toBeNull();
			expect(evicted.length, 'a drop is reported').toBeGreaterThan(0);
			expect(evicted.find(([d]) => d === 'old')?.[1], 'with its named marks').toBe(1);
		});
	});
}

describe('planEviction', () => {
	const row = (doc: string, bytes: number, writtenAt: number, core = bytes / 2): StoredIndex => ({ doc, bytes, writtenAt, marks: 0, core });
	it('does nothing under budget, and never touches the document being written', () => {
		expect(planEviction([row('a', 10, 1)], 'a', 100, (r) => r.core)).toEqual([]);
		expect(planEviction([row('a', 1000, 1)], 'a', 100, (r) => r.core)).toEqual([]);
	});
	it('compacts least recently written first, and drops only when compaction is not enough', () => {
		const rows = [row('new', 100, 3), row('old', 100, 1), row('mid', 100, 2), row('me', 100, 4)];
		expect(planEviction(rows, 'me', 360, (r) => r.core)).toEqual([{ doc: 'old', action: 'compact' }]);
		expect(planEviction(rows, 'me', 100, (r) => r.core)).toEqual([
			{ doc: 'old', action: 'compact' },
			{ doc: 'mid', action: 'compact' },
			{ doc: 'new', action: 'compact' },
			{ doc: 'old', action: 'drop' },
			{ doc: 'mid', action: 'drop' },
			{ doc: 'new', action: 'drop' },
		]);
	});
});

describe('the one-writer lock', () => {
	it('gives a document to one store at a time, and back on release', async () => {
		// jsdom has no Web Locks: a minimal LockManager with the `ifAvailable` contract the store uses.
		// The real browsers' locks run in the reload e2e.
		const held = new Set<string>();
		const locks = {
			request(name: string, _opts: { ifAvailable: boolean }, cb: (lock: object | null) => unknown) {
				if (held.has(name)) return Promise.resolve(cb(null));
				held.add(name);
				return Promise.resolve(cb({ name })).finally(() => held.delete(name));
			},
		};
		Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
		try {
			const backend = memoryBackend();
			const a = createFiloStore(backend);
			const b = createFiloStore(backend);
			expect(await a.claim('d')).toBe(true);
			expect(await b.claim('d')).toBe(false);
			expect(await b.write(snapOf('d', 'b\n')), 'the second tab writes nothing').toBe(false);
			a.release('d');
			await Promise.resolve();
			expect(await b.claim('d')).toBe(true);
		} finally {
			Reflect.deleteProperty(navigator, 'locks');
		}
	});
});
