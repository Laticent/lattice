import { describe, expect, it, vi } from 'vitest';
import { createFiloStore, History, memoryBackend, type Snapshot, toSnapshot } from '@/lib/filo';
import { adoptStored, createFiloPersistence, EARLY_LABEL, reloadCase, sourceSum, UNSAVED_LABEL } from './studio-filo-persist';

const A = '# Deck\n\nOne.\n';
const B = '# Deck\n\nOne. Two.\n';
const C = '# Deck\n\nOne. Two. Three.\n';

/** A stored history: A, then the edit to B. */
function storedAB(): Snapshot {
	const h = new History('deck', A);
	h.commit({ base: h.head, next: B, label: 'Typing', origin: 'markdown' });
	return toSnapshot(h);
}

describe('reloadCase (Filo note §5)', () => {
	const stored = storedAB();
	it('in step: the source is the stored text', () => expect(reloadCase(B, sourceSum(B), stored)).toBe('in-step'));
	it('in step wins even with a stale sidecar', () => expect(reloadCase(B, 123, stored)).toBe('in-step'));
	it('ahead: the Studio wrote the source after Filo stored', () => expect(reloadCase(C, sourceSum(C), stored)).toBe('ahead'));
	it('outside: the source is not what the Studio wrote', () => {
		expect(reloadCase(C, sourceSum(B), stored)).toBe('outside');
		expect(reloadCase(C, null, stored)).toBe('outside');
	});
});

describe('adoptStored', () => {
	it('in step: ⌘Z after the reload undoes the edit before it', () => {
		const h = new History('deck', B);
		expect(adoptStored(h, B, sourceSum(B), storedAB())).toBe('in-step');
		expect(h.undo()?.text).toBe(A);
	});
	it('ahead: one "Unsaved changes" step, then the stored past', () => {
		const h = new History('deck', C);
		expect(adoptStored(h, C, sourceSum(C), storedAB())).toBe('ahead');
		expect(h.text).toBe(C);
		expect(h.state().undoLabel).toBe(UNSAVED_LABEL);
		expect(h.undo()?.text).toBe(B);
		expect(h.undo()?.text).toBe(A);
	});
	it('outside: one gap step, and the stack is applied only past it', () => {
		const h = new History('deck', C);
		expect(adoptStored(h, C, sourceSum(B), storedAB())).toBe('outside');
		const gap = h.undo();
		expect(gap?.gap).toBe(true);
		expect(gap?.text, 'the gap stops: the text the author sees stays').toBe(C);
		expect(h.undo()?.text).toBe(B);
		expect(h.undo()?.text).toBe(A);
	});
	it('an edit made before storage answered stays its own step on top of the stored past', () => {
		const h = new History('deck', B);
		h.commit({ base: h.head, next: C, label: 'Typing', origin: 'markdown' });
		expect(adoptStored(h, B, sourceSum(B), storedAB())).toBe('in-step');
		expect(h.text, 'the screen is untouched').toBe(C);
		expect(h.state().undoLabel).toBe('Typing');
		expect(h.undo()?.text).toBe(B);
		expect(h.undo()?.text, 'the stored past survived').toBe(A);
	});
	it('two ops before storage answered are two undos, not one', () => {
		const D = `${C}\n---\n\n# Copy\n`;
		const h = new History('deck', B);
		h.commit({ base: h.head, next: C, label: 'Duplicate slide', origin: 'structure' });
		h.closeGroup();
		h.commit({ base: h.head, next: D, label: 'Move slide', origin: 'structure' });
		adoptStored(h, B, sourceSum(B), storedAB());
		expect(h.state().undoLabel).toBe('Move slide');
		expect(h.undo()?.text).toBe(C);
		expect(h.undo()?.text).toBe(B);
		expect(h.undo()?.text, 'the stored past survived').toBe(A);
	});
	it('early edits that do not replay from the opened text fall back to one step', () => {
		const h = new History('deck', B);
		h.commit({ base: h.head, next: C, label: 'Typing', origin: 'markdown' });
		h.closeGroup();
		h.commit({ base: h.head, next: `${C}x`, label: 'Typing', origin: 'markdown' });
		h.undo();
		expect(adoptStored(h, B, sourceSum(B), storedAB())).toBe('in-step');
		expect(h.text).toBe(C);
		expect(h.state().undoLabel).toBe(EARLY_LABEL);
		expect(h.undo()?.text).toBe(B);
	});
	it('never adopts under a history that recorded an outside change', () => {
		const h = new History('deck', B);
		h.sync(C);
		expect(adoptStored(h, B, sourceSum(B), storedAB())).toBeNull();
	});
});

describe('createFiloPersistence', () => {
	// A macrotask turn: every microtask queued before it runs first. Used only where the code under test
	// continues on a promise it exposes nowhere (a write's tail after `store.write` answers), so there is
	// no signal to await; once `flush()` has run, that chain holds no timer, so this is an ordering point.
	const tick = () => new Promise((r) => setTimeout(r, 0)); // flaky-ok: a 0 ms macrotask turn that drains a timer-free promise chain, not a guessed duration

	it('stores on change, and a reload in a new page restores the stack', async () => {
		const backend = memoryBackend();
		const sums = new Map<string, number>();
		const store1 = createFiloStore(backend);
		const page1 = createFiloPersistence({ store: store1, sidecar: (d) => sums.get(d) ?? null, delayMs: 0 });
		const h1 = new History('deck', A);
		await page1.open(h1, A);
		h1.commit({ base: h1.head, next: B, label: 'Typing', origin: 'markdown' });
		sums.set('deck', sourceSum(B));
		page1.flush();
		await store1.settled();
		const opened: string[] = [];
		const page2 = createFiloPersistence({ store: createFiloStore(backend), sidecar: (d) => sums.get(d) ?? null, onOpen: (_d, c) => opened.push(c) });
		const h2 = new History('deck', B);
		await page2.open(h2, B);
		expect(opened).toEqual(['in-step']);
		expect(h2.undo()?.text).toBe(A);
	});

	it('a deck changed before storage answered keeps its undo in memory and leaves the stored past alone', async () => {
		const backend = memoryBackend();
		const store1 = createFiloStore(backend);
		const page1 = createFiloPersistence({ store: store1, sidecar: () => null, delayMs: 0 });
		const h1 = new History('deck', A);
		await page1.open(h1, A);
		h1.commit({ base: h1.head, next: B, label: 'Typing', origin: 'markdown' });
		page1.flush();
		await store1.settled();
		const opened: string[] = [];
		const store2 = createFiloStore(backend);
		const page2 = createFiloPersistence({ store: store2, sidecar: () => sourceSum(B), delayMs: 0, onOpen: (_d, c) => opened.push(c) });
		const h2 = new History('deck', B);
		// The Studio asks at load; the author makes two strip ops before storage answers.
		const asked = page2.open(h2, B, h2.state().revision);
		h2.commit({ base: h2.head, next: C, label: 'Duplicate slide', origin: 'structure' });
		h2.closeGroup();
		h2.commit({ base: h2.head, next: `${C}x\n`, label: 'Move slide', origin: 'structure' });
		await asked;
		expect(opened).toEqual(['touched']);
		expect(h2.undo()?.text, 'the session undoes its own ops, one by one').toBe(C);
		expect(h2.undo()?.text).toBe(B);
		expect(h2.state().canUndo, 'nothing merged under them').toBe(false);
		page2.flush(); // a write it made would be queued on the store synchronously, inside flush()
		await store2.settled();
		expect((await store2.read('deck'))?.text, 'the stored past waits for the next load').toBe(B);
	});

	it('verifies in the worker: a refused replay leaves the history untouched, a passed one restores without replaying here', async () => {
		for (const [verdict, want] of [
			[false, 'refused'],
			[true, 'in-step'],
		] as const) {
			const backend = memoryBackend();
			const writer = createFiloStore(backend);
			await writer.claim('deck');
			await writer.write(storedAB());
			writer.release('deck');
			const opened: string[] = [];
			const asked: Snapshot[] = [];
			const p = createFiloPersistence({ store: createFiloStore(backend), sidecar: () => sourceSum(B), verify: async (s) => {
					asked.push(s);
					return verdict;
				}, onOpen: (_d, c) => opened.push(c) });
			const h = new History('deck', B);
			await p.open(h, B);
			expect(asked.length, 'witness: the replay was asked of the worker').toBe(1);
			expect(opened).toEqual([want]);
			expect(h.state().canUndo).toBe(verdict);
		}
	});

	it('a fresh deck with nothing stored opens fresh, and a dropped deck is gone from the store', async () => {
		const backend = memoryBackend();
		const store = createFiloStore(backend);
		const opened: string[] = [];
		const p = createFiloPersistence({ store, sidecar: () => null, onOpen: (_d, c) => opened.push(c), delayMs: 0 });
		const h = new History('deck', A);
		await p.open(h, A);
		h.commit({ base: h.head, next: B, label: 'Typing', origin: 'markdown' });
		p.flush();
		await store.settled();
		expect(await store.read('deck')).not.toBeNull();
		p.drop('deck');
		await store.settled();
		expect(opened).toEqual(['fresh']);
		expect(await store.read('deck')).toBeNull();
	});

	it('an older write still in the worker never lands after a newer flush', async () => {
		const backend = memoryBackend();
		const store = createFiloStore(backend);
		let release: (() => void) | null = null;
		const p = createFiloPersistence({
			store,
			sidecar: () => null,
			delayMs: 0,
			// A slow worker: it answers only when the test lets it.
			narrow: (snap) => new Promise((r) => (release = () => r(snap))),
		});
		const big = 'line\n'.repeat(400);
		const h = new History('deck', big);
		await p.open(h, big);
		h.commit({ base: h.head, next: big.toUpperCase(), label: 'AI', origin: 'ai' });
		// The idle write starts and waits on the worker: wait for the worker to be asked.
		await vi.waitFor(() => expect(release, 'witness: the broad step went to the worker').not.toBeNull());
		h.commit({ base: h.head, next: `${big.toUpperCase()}tail\n`, label: 'Typing', origin: 'markdown' });
		p.flush(); // the page hides: the newer history is written now
		await store.settled();
		(release as unknown as () => void)();
		await tick();
		await store.settled();
		expect((await store.read('deck'))?.text).toBe(`${big.toUpperCase()}tail\n`);
	});

	it('a failed write is retried by the flush', async () => {
		const backend = memoryBackend();
		let fail = true;
		const real = backend.write.bind(backend);
		backend.write = (...a: Parameters<typeof real>) => (fail ? Promise.reject(new Error('quota')) : real(...a));
		const store = createFiloStore(backend);
		const p = createFiloPersistence({ store, sidecar: () => null, delayMs: 0 });
		const h = new History('deck', A);
		await p.open(h, A);
		h.commit({ base: h.head, next: B, label: 'Typing', origin: 'markdown' });
		p.flush();
		await store.settled();
		await tick();
		expect(await store.read('deck'), 'witness: the first write failed').toBeNull();
		fail = false;
		p.flush();
		await store.settled();
		await tick();
		expect((await store.read('deck'))?.text).toBe(B);
	});

	it('a broad step crosses to the worker once, narrowed or not', async () => {
		// Fake timers: each idle write (the 0 ms schedule, then the idle callback) runs when the test
		// steps the clock, so every write below happens between two commits, on any machine.
		vi.useFakeTimers();
		try {
			const store = createFiloStore(memoryBackend());
			let crossings = 0;
			const p = createFiloPersistence({
				store,
				sidecar: () => null,
				delayMs: 0,
				narrow: async (snap) => {
					crossings++;
					return structuredClone(snap); // nothing to narrow: two unrelated texts
				},
			});
			const big = 'line\n'.repeat(400);
			const h = new History('deck', big);
			await p.open(h, big);
			h.commit({ base: h.head, next: 'other\n'.repeat(400), label: 'Import', origin: 'import' });
			const writes: string[] = [];
			const realWrite = store.write.bind(store);
			store.write = (snap) => {
				writes.push(snap.text);
				return realWrite(snap);
			};
			for (let i = 0; i < 4; i++) {
				await vi.advanceTimersByTimeAsync(20);
				h.commit({ base: h.head, edits: [{ from: 0, to: 0, insert: 'x' }], label: 'Typing', origin: 'markdown' });
			}
			await vi.advanceTimersByTimeAsync(20);
			await store.settled();
			// Witness: every step was written on its own, so the worker had four more chances to be asked.
			expect(writes.length).toBe(5);
			expect(crossings).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('a deck dropped while storage answers gives its lock back', async () => {
		const store = createFiloStore(memoryBackend());
		const released: string[] = [];
		const realRelease = store.release.bind(store);
		store.release = (d) => {
			released.push(d);
			realRelease(d);
		};
		const p = createFiloPersistence({ store, sidecar: () => null });
		const h = new History('deck', A);
		const opening = p.open(h, A);
		p.drop('deck');
		await opening;
		expect(released).toContain('deck');
	});
});
