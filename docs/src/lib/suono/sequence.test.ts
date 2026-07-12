import { describe, expect, it, vi } from 'vitest';
import { makeSequence, type SequenceStage } from './sequence';
import type { Bytes, Clip, PlayOptions, StageState } from './types';

const flush = () => new Promise((r) => setTimeout(r, 0));
const bytes = (): Bytes => ({ size: 8, type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(8) });

/** A fake stage that records play order and lets a test observe onStart. Decode/play are instant.
 *  `opts.hangDecode` makes decode() never resolve (to exercise the run's decode watchdog/abort race);
 *  `opts.stateNone` makes state() return 'none' (to exercise warm's pre-gesture decode guard). */
function fakeStage(opts?: { hangDecode?: boolean; stateNone?: boolean }) {
	const played: number[] = [];
	const onStarts: Array<{ onsetMs: number; durationMs: number }> = [];
	let clock = 0;
	const decodedKeys: string[] = [];
	const stage: SequenceStage & { played: number[]; onStarts: typeof onStarts; decodedKeys: string[] } = {
		played,
		onStarts,
		decodedKeys,
		async decode(_b: Bytes, key?: string): Promise<Clip> {
			decodedKeys.push(key ?? '');
			if (opts?.hangDecode) return new Promise<Clip>(() => {}); // never resolves
			return { buffer: {} as AudioBuffer, durationMs: 10 };
		},
		play(clip: Clip, playOpts?: PlayOptions) {
			clock += 10;
			played.push(clock);
			if (playOpts?.onStart) {
				const o = { onsetMs: clock, durationMs: clip.durationMs };
				onStarts.push(o);
				playOpts.onStart(o);
			}
			return { done: Promise.resolve({ ok: true }), stop() {} };
		},
		suspend: vi.fn(),
		resume: vi.fn(),
		state: (): StageState => (opts?.stateNone ? 'none' : 'running'),
	};
	return stage;
}

/** A produce() whose per-item promise a test resolves by hand, counting how many were started. */
function deferredProduce(n: number) {
	const resolvers: Array<(b: Bytes | null) => void> = [];
	const promises = Array.from({ length: n }, (_, i) => new Promise<Bytes | null>((res) => (resolvers[i] = res)));
	let started = 0;
	const started_ = () => started;
	const produce = (_item: number, { index }: { index: number }) => {
		started++;
		return promises[index];
	};
	return { produce, resolve: (i: number, b: Bytes | null = bytes()) => resolvers[i](b), started: started_ };
}

describe('makeSequence — playback', () => {
	it('plays every item in order and forwards measured onsets with the item index', async () => {
		const stage = fakeStage();
		const onItemStart = vi.fn();
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1, 2],
			produce: async () => bytes(),
			keyOf: (i) => `k${i}`,
			onItemStart,
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.play();
		await finished;
		expect(stage.played.length).toBe(3);
		expect(onItemStart).toHaveBeenCalledTimes(3);
		expect(onItemStart.mock.calls.map((c) => c[0].index)).toEqual([0, 1, 2]);
		expect(onItemStart.mock.calls[0][0].onsetMs).toBe(stage.onStarts[0].onsetMs);
	});

	it('never rejects when produce throws — it skips the item and reports via onState.error', async () => {
		const stage = fakeStage();
		let done: (e?: string) => void;
		const finished = new Promise<string | undefined>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1],
			produce: async (i) => {
				if (i === 0) throw new Error('synth boom');
				return bytes();
			},
			keyOf: (i) => `k${i}`,
			produceTimeoutMs: 200,
			onState: (e) => {
				if (!e.playing) done(e.error);
			},
		});
		seq.play();
		const error = await finished;
		expect(error).toContain('synth boom');
		expect(stage.played.length).toBe(1); // only the good item played; the throw didn't kill the run
	});
});

describe('makeSequence — scheduler', () => {
	it('keeps at most `concurrency` produce() calls in flight', async () => {
		const stage = fakeStage();
		const d = deferredProduce(5);
		const seq = makeSequence(stage, { items: [0, 1, 2, 3, 4], produce: d.produce, keyOf: (i) => `k${i}`, concurrency: 2, produceTimeoutMs: 5000 });
		seq.play();
		await flush();
		expect(d.started()).toBe(2); // only 2 fired up front
		d.resolve(0);
		await flush();
		expect(d.started()).toBe(3); // a slot freed → the next one started
		d.resolve(1);
		d.resolve(2);
		d.resolve(3);
		d.resolve(4);
		await flush();
		seq.stop();
	});

	it('PAUSE-GATING: a paused run does not start new produce() calls (the cost-control guarantee)', async () => {
		const stage = fakeStage();
		const d = deferredProduce(5);
		const seq = makeSequence(stage, { items: [0, 1, 2, 3, 4], produce: d.produce, keyOf: (i) => `k${i}`, concurrency: 2, produceTimeoutMs: 5000 });
		seq.play();
		await flush();
		expect(d.started()).toBe(2);
		seq.pause();
		// Resolve the two in-flight producers. A NON-gated scheduler would refill slots 3, 4, 5…
		// off these completions and quietly synthesize the whole rest of the run while paused.
		d.resolve(0);
		d.resolve(1);
		await flush();
		await flush();
		expect(d.started()).toBe(2); // still 2 — pause stopped the scheduler dead
		seq.resume();
		await flush();
		expect(d.started()).toBeGreaterThan(2); // resume re-drives it
		d.resolve(2);
		d.resolve(3);
		d.resolve(4);
		await flush();
		seq.stop();
	});

	it('BARGE-IN: a superseded run does not clobber the new run\'s playing state (checker #1)', async () => {
		const stage = fakeStage();
		// A large gap parks run A between items so a barge-in catches it mid-run.
		const seq = makeSequence(stage, { items: [0, 1], produce: async () => bytes(), keyOf: (i) => `k${i}`, gapMs: () => 5000, produceTimeoutMs: 5000 });
		seq.play(); // run A
		await flush();
		expect(stage.played.length).toBe(1); // A played item 0, now parked in the 5s gap
		seq.play(); // barge-in → stop() aborts A, run B starts
		await flush();
		await flush();
		// B is now mid-run (played item 0 from cache, parked in its own gap). Pre-fix, A's aborted
		// tail ran `running = false` unguarded and clobbered B → playing() wrongly false.
		expect(seq.playing()).toBe(true);
		expect(stage.played.length).toBe(2);
		seq.stop();
	});

	it('pause() while IDLE does not poison the next play() (checker #3)', async () => {
		const stage = fakeStage();
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1],
			produce: async () => bytes(),
			keyOf: (i) => `k${i}`,
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.pause(); // idle pause — no run active
		seq.play(); // must actually start, not silently no-op via a stale gate
		await finished;
		expect(stage.played.length).toBe(2);
	});

	it('BARGE-IN: stop() aborts the signal handed to produce', async () => {
		const stage = fakeStage();
		let captured: AbortSignal | null = null;
		const seq = makeSequence(stage, {
			items: [0],
			produce: (_i, { signal }) => {
				captured = signal;
				return new Promise<Bytes | null>(() => {}); // never resolves
			},
			keyOf: (i) => `k${i}`,
			produceTimeoutMs: 5000,
		});
		seq.play();
		await flush();
		expect(captured).not.toBeNull();
		expect(captured!.aborted).toBe(false);
		seq.stop();
		expect(captured!.aborted).toBe(true);
	});
});

describe('makeSequence — dedup & warm', () => {
	it('two identical keys in one run share ONE produce call', async () => {
		const stage = fakeStage();
		const produce = vi.fn(async () => bytes());
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: ['same', 'same'],
			produce,
			keyOf: () => 'one-key', // identical identity
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.play();
		await finished;
		expect(produce).toHaveBeenCalledTimes(1); // the second joined the first's in-flight request
		expect(stage.played.length).toBe(2); // …but both still played (cache hit for the second)
	});

	it('warm() prefetches into the cache so a later play() produces nothing new', async () => {
		const stage = fakeStage();
		const produce = vi.fn(async () => bytes());
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1],
			produce,
			keyOf: (i) => `k${i}`,
			produceTimeoutMs: 5000,
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.warm([0, 1]);
		await flush();
		await flush();
		expect(produce).toHaveBeenCalledTimes(2); // both prefetched, no playback
		expect(stage.played.length).toBe(0);
		// PRELOAD: warm also decoded both clips into the stage cache (not just fetched bytes).
		expect(stage.decodedKeys.sort()).toEqual(['k0', 'k1']);

		// Now play: every item is a warm-cache hit, so produce is NOT called again.
		seq.play();
		await finished;
		expect(produce).toHaveBeenCalledTimes(2); // unchanged — cache hits
		expect(stage.played.length).toBe(2); // …and both still played
	});

	it('warm() does NOT create a context / decode-ahead when state is none (pre-gesture guard)', async () => {
		const stage = fakeStage({ stateNone: true });
		const produce = vi.fn(async () => bytes());
		const seq = makeSequence(stage, { items: [0, 1], produce, keyOf: (i) => `k${i}`, produceTimeoutMs: 5000 });
		seq.warm([0, 1]);
		await flush();
		await flush();
		expect(produce).toHaveBeenCalledTimes(2); // bytes still prefetched
		expect(stage.decodedKeys.length).toBe(0); // but NO decode-ahead — that would instantiate the context
		seq.stop();
	});
});

describe('makeSequence — hardening (adversarial trio)', () => {
	it('keyOf throwing does not reject the run — the item is produced uncached (never-rejects)', async () => {
		const stage = fakeStage();
		const produce = vi.fn(async () => bytes());
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1],
			produce,
			keyOf: () => {
				throw new Error('keyOf boom');
			},
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.play();
		await finished;
		expect(produce).toHaveBeenCalledTimes(2); // still produced (just uncached)
		expect(stage.played.length).toBe(2);
	});

	it('gapMs throwing does not reject the run (never-rejects)', async () => {
		const stage = fakeStage();
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0, 1],
			produce: async () => bytes(),
			keyOf: (i) => `k${i}`,
			gapMs: () => {
				throw new Error('gap boom');
			},
			onState: (e) => {
				if (!e.playing) done();
			},
		});
		seq.play();
		await finished;
		expect(stage.played.length).toBe(2);
	});

	it('a hung decode does not wedge the run — stop() unwedges it and emits an aborted terminal', async () => {
		const stage = fakeStage({ hangDecode: true });
		let terminal: { playing: boolean; aborted?: boolean } | null = null;
		const seq = makeSequence(stage, {
			items: [0],
			produce: async () => bytes(),
			keyOf: (i) => `k${i}`,
			produceTimeoutMs: 100000, // long — so the ABORT, not the watchdog, is what settles it
			onState: (e) => {
				if (!e.playing) terminal = e;
			},
		});
		seq.play();
		await flush();
		expect(terminal).toBeNull(); // parked at the never-resolving decode
		seq.stop();
		await flush();
		expect(terminal).not.toBeNull(); // stop() unwedged it
		expect(terminal!.aborted).toBe(true); // …and marked it cut-short (Munger #1)
	});

	it('a natural end emits a terminal playing:false with aborted falsy', async () => {
		const stage = fakeStage();
		let terminal: { playing: boolean; aborted?: boolean } | null = null;
		let done: () => void;
		const finished = new Promise<void>((r) => (done = r));
		const seq = makeSequence(stage, {
			items: [0],
			produce: async () => bytes(),
			keyOf: (i) => `k${i}`,
			onState: (e) => {
				if (!e.playing) {
					terminal = e;
					done();
				}
			},
		});
		seq.play();
		await finished;
		expect(terminal!.playing).toBe(false);
		expect(terminal!.aborted).toBeFalsy(); // natural end ≠ aborted
	});

	it('clamps caller concurrency to the ceiling (no million-wide produce burst)', async () => {
		const stage = fakeStage();
		const d = deferredProduce(30);
		const seq = makeSequence(stage, {
			items: Array.from({ length: 30 }, (_, i) => i),
			produce: d.produce,
			keyOf: (i) => `k${i}`,
			concurrency: 1000, // absurd — must be clamped
			produceTimeoutMs: 100000,
		});
		seq.play();
		await flush();
		expect(d.started()).toBe(16); // MAX_CONCURRENCY, not 1000 or 30
		seq.stop();
	});
});
