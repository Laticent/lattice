// narration-store — the persistent tier of the read-aloud audio cache.
//
// Driven against `fake-indexeddb`, a real IDB implementation, rather than a hand-rolled
// stub: the behaviors worth pinning here (transaction COMMIT ordering, cursor walks over
// an index, ArrayBuffer structured-clone semantics) are exactly the ones a stub would
// fake into always passing.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __evictionsSettled, __resetForTests, clearClips, clipStats, DEFAULT_BUDGET_BYTES, getBudgetBytes, getClip, putClip, readyKeys, setBudgetBytes } from './narration-store.js';

/** A blob-like in the same duck-typed shape voice-model.js's rungs return. */
function fakeBlob(bytes: number, type = 'audio/mpeg') {
	const buf = new ArrayBuffer(bytes);
	new Uint8Array(buf).fill(7);
	return { size: bytes, type, arrayBuffer: async () => buf.slice(0) };
}

beforeEach(async () => {
	await clearClips();
	__resetForTests();
});

describe('narration-store', () => {
	it('round-trips a clip under its content-complete key', async () => {
		expect(await putClip('openrouter-tts|kokoro · af_heart|1|Hello there.', fakeBlob(1024))).toBe(true);
		const got = await getClip('openrouter-tts|kokoro · af_heart|1|Hello there.');
		expect(got).not.toBeNull();
		expect(got?.size).toBe(1024);
		expect(got?.type).toBe('audio/mpeg');
		expect((await got?.arrayBuffer())?.byteLength).toBe(1024);
	});

	it('misses cleanly on an unknown key', async () => {
		expect(await getClip('nope')).toBeNull();
	});

	it('keys are content-complete: a different voice is a different entry', async () => {
		// The whole point of the key shape — a bare-sentence key would replay a stale-voice
		// clip after a voice switch, which is the bug read-aloud.ts's keyPrefix exists to stop.
		await putClip('openrouter-tts|kokoro · af_heart|1|Same words.', fakeBlob(10));
		await putClip('openrouter-tts|kokoro · am_adam|1|Same words.', fakeBlob(20));
		expect((await getClip('openrouter-tts|kokoro · af_heart|1|Same words.'))?.size).toBe(10);
		expect((await getClip('openrouter-tts|kokoro · am_adam|1|Same words.'))?.size).toBe(20);
	});

	it('hands back a FRESH buffer per call, so a replay after decodeAudioData detaches still works', async () => {
		// decodeAudioData detaches the ArrayBuffer it is given (a spec'd side effect). A shared
		// reference decodes once and throws "Cannot decode detached ArrayBuffer" on every replay.
		await putClip('k', fakeBlob(64));
		const clip = await getClip('k');
		const first = await clip?.arrayBuffer();
		const second = await clip?.arrayBuffer();
		expect(first).not.toBe(second);
		expect(second?.byteLength).toBe(64);
	});

	it('reports count and bytes without materializing audio', async () => {
		await putClip('a', fakeBlob(1000));
		await putClip('b', fakeBlob(2000));
		expect(await clipStats()).toEqual({ count: 2, bytes: 3000 });
	});

	it('re-putting the same key replaces rather than double-counts', async () => {
		await putClip('a', fakeBlob(1000));
		await putClip('a', fakeBlob(1500));
		expect(await clipStats()).toEqual({ count: 1, bytes: 1500 });
	});

	it('clears everything', async () => {
		await putClip('a', fakeBlob(1000));
		await clearClips();
		expect(await clipStats()).toEqual({ count: 0, bytes: 0 });
		expect(await getClip('a')).toBeNull();
	});

	describe('LRU eviction', () => {
		it('trims oldest-first once over budget, and stops as soon as it is under', async () => {
			setBudgetBytes(2500);
			await putClip('oldest', fakeBlob(1000));
			await putClip('middle', fakeBlob(1000));
			await putClip('newest', fakeBlob(1000)); // 3000 > 2500 → evict just `oldest`
			const stats = await clipStats();
			expect(stats.bytes).toBeLessThanOrEqual(2500);
			expect(await getClip('oldest')).toBeNull();
			// It stops the moment it is under budget — the other two survive.
			expect(await getClip('middle')).not.toBeNull();
			expect(await getClip('newest')).not.toBeNull();
		});

		it('a read counts as recent use, so a hot entry outlives a colder older one', async () => {
			setBudgetBytes(2500);
			await putClip('cold', fakeBlob(1000));
			await putClip('hot', fakeBlob(1000));
			await getClip('hot'); // touch() bumps `at`
			// touch() is fire-and-forget; let its write land before the eviction walk reads it.
			await new Promise((r) => setTimeout(r, 20));
			await putClip('new', fakeBlob(1000));
			expect(await getClip('cold')).toBeNull();
			expect(await getClip('hot')).not.toBeNull();
		});

		it('evicts as many as it takes when one put blows well past the budget', async () => {
			setBudgetBytes(1000);
			await putClip('a', fakeBlob(400));
			await putClip('b', fakeBlob(400));
			await putClip('big', fakeBlob(900));
			const stats = await clipStats();
			expect(stats.bytes).toBeLessThanOrEqual(1000);
			expect(await getClip('big')).not.toBeNull();
		});

		// CONCURRENT writes are the normal case, not a corner: the warm window routes up to six
		// unawaited putClip calls through eviction at once (WARM_CONCURRENCY plus Suono's run
		// concurrency). Each pass used to read the SAME total and each delete its own full
		// overage, so a store sitting exactly at budget gutted itself the moment a burst landed
		// — three concurrent puts left 400 of 1000 bytes, six left zero. Found by the red team.
		it('a burst of concurrent puts at budget trims to budget, not to empty', async () => {
			setBudgetBytes(1000);
			for (let i = 0; i < 10; i++) await putClip(`seed-${i}`, fakeBlob(100));
			expect((await clipStats()).bytes).toBe(1000); // exactly at budget

			await Promise.all([putClip('x', fakeBlob(100)), putClip('y', fakeBlob(100)), putClip('z', fakeBlob(100))]);
			await __evictionsSettled();

			const stats = await clipStats();
			expect(stats.bytes).toBe(1000); // three in, three oldest out — still full
			expect(stats.count).toBe(10);
			// The three newest survive; the three oldest are the ones gone.
			for (const k of ['x', 'y', 'z']) expect(await getClip(k)).not.toBeNull();
			for (const k of ['seed-0', 'seed-1', 'seed-2']) expect(await getClip(k)).toBeNull();
		});
	});

	// The running byte total behind the eviction gate. `evictOnce` used to open with a
	// `getAll()` over the whole meta store on EVERY write — so each warm-window write
	// materialized every record of every deck ever presented, on the same main thread as
	// audio decode. The estimate makes the common case (well under budget) cost no read at
	// all; these pin the arithmetic that makes it safe to trust.
		it('answers for the CURRENT deck without depending on how much else is stored', async () => {
		// The readiness poll runs this every 2s while Present is open. It used to read every
		// key in the store — each one a JSON array carrying a whole sentence — so its cost grew
		// with every deck ever presented rather than with the deck being delivered.
		for (let i = 0; i < 200; i++) await putClip(`other-deck-${i}`, fakeBlob(16));
		await putClip('mine-1', fakeBlob(16));
		await putClip('mine-3', fakeBlob(16));
		const ready = await readyKeys(['mine-1', 'mine-2', 'mine-3']);
		expect([...ready].sort()).toEqual(['mine-1', 'mine-3']);
	});

describe('the eviction gate\'s running total', () => {
		it('an OVERWRITE replaces the old size rather than adding to it', async () => {
			setBudgetBytes(1000);
			for (let i = 0; i < 9; i++) await putClip(`k${i}`, fakeBlob(100));
			await putClip('big', fakeBlob(400)); // 1300 → over by 300, evicts k0..k2
			await __evictionsSettled();
			expect((await clipStats()).bytes).toBeLessThanOrEqual(1000);

			// Rewrite `big` SMALLER. A total that added instead of replacing would now believe
			// the store is 400 bytes heavier than it is and evict on the next write for no reason.
			await putClip('big', fakeBlob(100));
			await __evictionsSettled();
			const after = await clipStats();
			expect(after.bytes).toBe(700); // 6 survivors x100 + big at 100
			expect(await getClip('big')).not.toBeNull();
		});

		it('stays correct across a clear, so the next write is measured from zero', async () => {
			setBudgetBytes(1000);
			for (let i = 0; i < 10; i++) await putClip(`k${i}`, fakeBlob(100));
			await clearClips();
			await putClip('fresh', fakeBlob(100));
			await __evictionsSettled();
			const stats = await clipStats();
			expect(stats.count).toBe(1);
			expect(stats.bytes).toBe(100);
			expect(await getClip('fresh')).not.toBeNull();
		});
	});

	describe('budget', () => {
		it('defaults to 100 MB and ignores nonsense overrides', async () => {
			expect(getBudgetBytes()).toBe(DEFAULT_BUDGET_BYTES);
			setBudgetBytes(0);
			setBudgetBytes(-5);
			setBudgetBytes(Number.NaN);
			expect(getBudgetBytes()).toBe(DEFAULT_BUDGET_BYTES);
		});
	});

	describe('degrades rather than throws', () => {
		it('an empty key, a null blob, and a zero-byte blob are all no-ops, not failures', async () => {
			expect(await putClip('', fakeBlob(10))).toBe(false);
			expect(await putClip('k', null as unknown as { arrayBuffer(): Promise<ArrayBuffer> })).toBe(false);
			expect(await putClip('k', fakeBlob(0))).toBe(false);
			expect(await getClip('')).toBeNull();
		});

		it('a blob whose arrayBuffer() rejects never escapes as a throw', async () => {
			const hostile = { size: 10, type: 'audio/mpeg', arrayBuffer: async () => { throw new Error('read failed'); } };
			expect(await putClip('k', hostile)).toBe(false);
		});
	});
});

describe('readyKeys — the rail\'s readiness question', () => {
	it('returns exactly the subset already on this device', async () => {
		await putClip('a', fakeBlob(10));
		await putClip('c', fakeBlob(10));
		const got = await readyKeys(['a', 'b', 'c', 'd']);
		expect([...got].sort()).toEqual(['a', 'c']);
	});

	it('answers in ONE read regardless of how many keys are asked about', async () => {
		// The point of the meta store. Asked naively this is one IDB round trip per sentence —
		// hundreds on a long deck, on a surface that must open instantly.
		for (let i = 0; i < 50; i++) await putClip(`k${i}`, fakeBlob(8));
		const asked = Array.from({ length: 200 }, (_, i) => `k${i}`);
		const got = await readyKeys(asked);
		expect(got.size).toBe(50);
	});

	it('an empty ask is an empty answer, with no store access', async () => {
		expect((await readyKeys([])).size).toBe(0);
		expect((await readyKeys(undefined as unknown as string[])).size).toBe(0);
	});

	it('under-promises rather than over-promises when the store is unusable', async () => {
		// Readiness is a claim that audio can play with no network. If we cannot verify it,
		// the safe answer is "not ready" — a false "ready" would present as a stall.
		await clearClips();
		expect((await readyKeys(['a'])).size).toBe(0);
	});
});
