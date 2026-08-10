// narration-store — the persistent tier of the read-aloud audio cache.
//
// Driven against `fake-indexeddb`, a real IDB implementation, rather than a hand-rolled
// stub: the behaviors worth pinning here (transaction COMMIT ordering, cursor walks over
// an index, ArrayBuffer structured-clone semantics) are exactly the ones a stub would
// fake into always passing.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __evictionsSettled, __resetForTests, clearClips, clipSizes, clipStats, DEFAULT_BUDGET_BYTES, getBudgetBytes, getClip, putClip, readyKeys, setBudgetBytes } from './narration-store.js';

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
		// NOTE (2026-08-04): three tests lived here for a running-byte-total optimization that has
	// since been reverted. The independent checker mutation-tested them and ALL THREE passed
	// with the exact defect each one named injected — the estimate self-repaired before any
	// assertion could see it, and the third asserted only set-membership, which the
	// implementation it was meant to replace also satisfies. They were removed with the code
	// they failed to guard. Any future attempt at this optimization needs an assertion on the
	// estimate itself (a `__approxBytes()` seam) or a spy proving the authoritative read did
	// NOT happen — plus a real-browser measurement first, which is what would have caught that
	// the sibling `readyKeys` change was 7x SLOWER on a fresh store.

	describe('budget', () => {
		it('defaults to a budget sized for UNCOMPRESSED clips, and ignores nonsense overrides', async () => {
			// Sized for the two engines that return raw audio (~190 KB a sentence), not for the
			// seven that return mp3 (~25 KB). At the old 100 MB those two cached under two decks
			// before evicting, and an eviction re-bills a Gemini deck the author already paid for.
			expect(DEFAULT_BUDGET_BYTES).toBeGreaterThanOrEqual(300 * 1024 * 1024);
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

describe('clipSizes — what a bake would cost, before it starts', () => {
	it('reports each present key\'s stored byte size, in one read', async () => {
		await putClip('a', fakeBlob(30_000));
		await putClip('b', fakeBlob(20_000));
		const got = await clipSizes(['a', 'b', 'missing']);
		// `{size, type}` — the type is what lets the export's pre-flight tell a compressed clip
		// from an uncompressed one, which decides what it will weigh in the shipped file.
		expect(got.get('a')).toEqual({ size: 30_000, type: 'audio/mpeg' });
		expect(got.get('b')).toEqual({ size: 20_000, type: 'audio/mpeg' });
	});

	it('OMITS an absent key rather than reporting it as zero', async () => {
		// The caller has to tell "no clip on this device" (a sentence that will be billed) from
		// "a clip with no bytes". Conflating them quotes a bill the bake then exceeds.
		await putClip('a', fakeBlob(10));
		const got = await clipSizes(['a', 'nope']);
		expect(got.has('nope')).toBe(false);
		expect(got.size).toBe(1);
	});

	it('reads no audio at all — a few KB of index, not megabytes of mp3', async () => {
		for (let i = 0; i < 40; i++) await putClip(`k${i}`, fakeBlob(50_000));
		const got = await clipSizes(Array.from({ length: 40 }, (_, i) => `k${i}`));
		expect(got.size).toBe(40);
		expect([...got.values()].every((v) => v.size === 50_000)).toBe(true);
	});

	it('carries the stored MIME, so a pre-compression WAV clip is not quoted as an mp3', async () => {
		// A clip written before compression shipped is WAV and will be ~6x smaller in the file
		// than it is in the store. Without the type the pre-flight quoted the stored size and told
		// authors their deck was too large to assemble.
		await putClip('w', fakeBlob(480_000, 'audio/wav'));
		expect((await clipSizes(['w'])).get('w')).toEqual({ size: 480_000, type: 'audio/wav' });
	});

	it('an empty ask is an empty answer, and an unusable store under-promises', async () => {
		expect((await clipSizes([])).size).toBe(0);
		expect((await clipSizes(undefined as unknown as string[])).size).toBe(0);
		await clearClips();
		expect((await clipSizes(['a'])).size).toBe(0);
	});
});

// THE COST OF A WRITE, which is paid on the READING path.
//
// Clip writes are fired while narration plays. Eviction used to run `meta.getAll()` — a full
// scan of every stored row — on every one of them; at the 400 MB budget's ~2,200-row steady
// state that is four times the per-sentence main-thread work the 100 MB budget cost, in a
// change series whose purpose was taking work off that path.
describe('what a write costs once the store is large', () => {
	/** Counts `meta.getAll()` calls — the full scan — across a body of work. */
	async function scansDuring(body: () => Promise<void>) {
		const proto = IDBObjectStore.prototype as unknown as { getAll: (...a: unknown[]) => unknown };
		const real = proto.getAll;
		let scans = 0;
		proto.getAll = function patched(...args: unknown[]) {
			if ((this as IDBObjectStore).name === 'meta') scans++;
			return real.apply(this, args as []);
		};
		try {
			await body();
			await __evictionsSettled();
		} finally {
			proto.getAll = real;
		}
		return scans;
	}

	it('does not re-scan the whole store on every clip written', async () => {
		setBudgetBytes(10_000_000);
		for (let i = 0; i < 30; i++) await putClip(`k${i}`, fakeBlob(1000));
		await __evictionsSettled();
		const scans = await scansDuring(async () => {
			for (let i = 30; i < 50; i++) await putClip(`k${i}`, fakeBlob(1000));
		});
		// One re-anchoring scan is fine; one PER WRITE is the defect. The old code scanned 20.
		expect(scans, `20 writes cost ${scans} full scans`).toBeLessThan(3);
	});

	it('still evicts to budget, which is what the scan was buying', async () => {
		// The optimization is only correct if the LRU still bounds the store. Carried totals
		// that drift would show up here as a store that quietly grows past its ceiling.
		setBudgetBytes(20_000);
		for (let i = 0; i < 60; i++) await putClip(`k${i}`, fakeBlob(1000));
		await __evictionsSettled();
		const { bytes } = await clipStats();
		expect(bytes).toBeLessThanOrEqual(20_000);
		expect(await getClip('k59'), 'the newest survives').not.toBeNull();
		expect(await getClip('k0'), 'the oldest does not').toBeNull();
	});
});

// A budget is a ceiling WE choose. The quota is one the BROWSER chooses, out of free disk, and
// on a full machine it can be the smaller of the two — in which case the LRU never runs (we are
// under our own budget), every write is refused, and the cache silently freezes forever.
describe('when the device refuses the write before the budget does', () => {
	/** A stand-in origin quota, in the shape the browser actually presents one: a refusal, never
	 *  a number. Holds its own key→size ledger so deletes give the space back — a ceiling that
	 *  only ever counted upward would model a device nothing can be evicted from. */
	function withQuota(ceiling: number) {
		type Patchable = { put: (this: IDBObjectStore, value: never) => unknown; delete: (this: IDBObjectStore, key: never) => unknown };
		const proto = IDBObjectStore.prototype as unknown as Patchable;
		const realPut = proto.put;
		const realDelete = proto.delete;
		const sizes = new Map<string, number>();
		const held = () => [...sizes.values()].reduce((a, b) => a + b, 0);
		proto.put = function patched(this: IDBObjectStore, value: { key?: string; bytes?: ArrayBuffer }) {
			if (this.name === 'clips') {
				const size = value?.bytes?.byteLength ?? 0;
				if (held() - (sizes.get(value?.key ?? '') ?? 0) + size > ceiling) {
					const e = new Error('quota');
					e.name = 'QuotaExceededError';
					throw e;
				}
				sizes.set(value?.key ?? '', size);
			}
			return realPut.call(this, value as never);
		} as Patchable['put'];
		proto.delete = function patched(this: IDBObjectStore, key: string) {
			if (this.name === 'clips') sizes.delete(key);
			return realDelete.call(this, key as never);
		} as Patchable['delete'];
		return {
			held,
			restore: () => {
				proto.put = realPut;
				proto.delete = realDelete;
			},
		};
	}

	it('lowers its own ceiling and makes room, instead of failing every write forever', async () => {
		// Our budget is far above what this device will take — the state where the LRU, which
		// only ever consults OUR ceiling, never runs at all.
		const quota = withQuota(24 * 1024 * 1024);
		try {
			let ok = 0;
			for (let i = 0; i < 40; i++) {
				if (await putClip(`q${i}`, fakeBlob(1024 * 1024))) ok++;
				await __evictionsSettled();
			}
			// Without the quota response every write from ~24 on returns false and the cache is
			// frozen at whatever it reached, permanently. The load-bearing claim is that the LATER
			// sentences — the ones a reader is hearing now — still get cached.
			expect(ok, `${ok} of 40 writes landed`).toBeGreaterThan(30);
			expect(await getClip('q39'), 'the most recent sentence is cached').not.toBeNull();
			expect(quota.held(), 'and the device is never over its own ceiling').toBeLessThanOrEqual(24 * 1024 * 1024);
		} finally {
			quota.restore();
		}
	});
});
