// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStage } from './stage';

// A minimal mock AudioContext — jsdom has none. Parameterized so a test can make decode return a
// specific PCM size, or make createGain / the ramp throw (to exercise the declick fallback).
function installMockAudio(cfg?: { decoded?: { length: number; channels: number; duration: number }; gainThrows?: boolean; rampThrows?: boolean }) {
	const decodeAudioData = vi.fn((_ab: ArrayBuffer, ok: (b: unknown) => void) => {
		const d = cfg?.decoded ?? { length: 1000, channels: 1, duration: 1 };
		ok({ length: d.length, numberOfChannels: d.channels, duration: d.duration });
	});
	const srcConnect = vi.fn();
	function makeSource() {
		return { buffer: null as unknown, connect: srcConnect, disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
	}
	function makeGain() {
		if (cfg?.gainThrows) throw new Error('createGain unsupported');
		const ramp = cfg?.rampThrows
			? () => {
					throw new Error('ramp unsupported');
				}
			: vi.fn();
		return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: ramp }, connect: vi.fn(), disconnect: vi.fn() };
	}
	class MockAudioContext {
		state = 'running';
		currentTime = 0;
		baseLatency = 0;
		destination = {};
		decodeAudioData = decodeAudioData;
		createBufferSource = makeSource;
		createGain = makeGain;
		createBuffer = () => ({});
		resume = () => Promise.resolve();
		suspend = () => {};
		close = () => {};
	}
	(window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
	return { decodeAudioData, srcConnect };
}

afterEach(() => {
	(window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
	vi.restoreAllMocks();
});

const bytesOfSize = (size: number) => ({ size, type: 'audio/wav', arrayBuffer: vi.fn(async () => new ArrayBuffer(Math.min(size, 8))) });

describe('createStage — decode-bomb guard', () => {
	it('rejects an oversized input from its DECLARED size WITHOUT reading it', async () => {
		installMockAudio();
		const stage = createStage({ maxDecodeBytes: 1024 });
		const big = bytesOfSize(2048);
		await expect(stage.decode(big)).rejects.toThrow(/too large/);
		expect(big.arrayBuffer).not.toHaveBeenCalled(); // never materialized — the OOM window is closed
	});
});

describe('createStage — decoded cache eviction', () => {
	it('evicts by ENTRY COUNT (FIFO) — an evicted key re-decodes', async () => {
		const { decodeAudioData } = installMockAudio();
		const stage = createStage({ decodedCacheLimit: 2, maxDecodedBytes: 1e12 });
		await stage.decode(bytesOfSize(8), 'A');
		await stage.decode(bytesOfSize(8), 'B');
		await stage.decode(bytesOfSize(8), 'C'); // evicts A (limit 2)
		expect(decodeAudioData).toHaveBeenCalledTimes(3);
		await stage.decode(bytesOfSize(8), 'B'); // still cached — no new decode
		expect(decodeAudioData).toHaveBeenCalledTimes(3);
		await stage.decode(bytesOfSize(8), 'A'); // was evicted — re-decodes
		expect(decodeAudioData).toHaveBeenCalledTimes(4);
	});

	it('evicts by AGGREGATE BYTES even when the entry count is fine', async () => {
		// Each clip ≈ 1000 samples × 1 ch × 4 = 4000 bytes; budget holds ~1.
		const { decodeAudioData } = installMockAudio({ decoded: { length: 1000, channels: 1, duration: 1 } });
		const stage = createStage({ decodedCacheLimit: 100, maxDecodedBytes: 5000 });
		await stage.decode(bytesOfSize(8), 'A');
		await stage.decode(bytesOfSize(8), 'B'); // A+B = 8000 > 5000 → evict A
		expect(decodeAudioData).toHaveBeenCalledTimes(2);
		await stage.decode(bytesOfSize(8), 'A'); // evicted by bytes — re-decodes
		expect(decodeAudioData).toHaveBeenCalledTimes(3);
	});

	it('does NOT retain a single clip larger than the whole budget (it plays once, then GCs)', async () => {
		const { decodeAudioData } = installMockAudio({ decoded: { length: 100000, channels: 2, duration: 5 } }); // 800000 bytes
		const stage = createStage({ maxDecodedBytes: 1000 });
		await stage.decode(bytesOfSize(8), 'huge');
		await stage.decode(bytesOfSize(8), 'huge'); // not retained → re-decodes
		expect(decodeAudioData).toHaveBeenCalledTimes(2);
	});
});

describe('createStage — declick fallback (reliability downgrade guard)', () => {
	it('still PLAYS when createGain throws — falls back to a plain connect, no silence', async () => {
		const { srcConnect } = installMockAudio({ gainThrows: true });
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		const handle = stage.play(clip);
		// onended isn't wired by the mock; assert the source connected (to destination) and no throw.
		expect(srcConnect).toHaveBeenCalledTimes(1);
		handle.stop();
		await expect(handle.done).resolves.toMatchObject({ ok: true });
	});

	it('still PLAYS when the gain ramp throws mid-schedule', async () => {
		const { srcConnect } = installMockAudio({ rampThrows: true });
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		const handle = stage.play(clip);
		expect(srcConnect).toHaveBeenCalled(); // fell back to a direct connect
		handle.stop();
		await expect(handle.done).resolves.toMatchObject({ ok: true });
	});
});

// A richer mock that tracks every created source and lets a test advance the clock — so we can prove
// pause STOPS the live source and resume plays a FRESH one from the paused OFFSET (the reliable
// cross-device resume, not a context un-freeze), and that onStart fires exactly once.
function installTrackingAudio() {
	const sources: Array<{ started: Array<number | undefined>; stopped: boolean; onended: null | (() => void) }> = [];
	class Src {
		buffer: unknown = null;
		started: Array<number | undefined> = [];
		stopped = false;
		onended: null | (() => void) = null;
		connect() {}
		disconnect() {}
		start(_when?: number, offset?: number) {
			this.started.push(offset);
		}
		stop() {
			this.stopped = true;
		}
	}
	function makeGain() {
		return {
			gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
			connect: () => {},
			disconnect: () => {},
		};
	}
	const ctx = {
		state: 'running',
		currentTime: 0,
		baseLatency: 0,
		destination: {},
		decodeAudioData: (_ab: ArrayBuffer, ok: (b: unknown) => void) => ok({ length: 24000, numberOfChannels: 1, duration: 1 }),
		createBufferSource() {
			const s = new Src();
			sources.push(s);
			return s;
		},
		createGain: makeGain,
		createBuffer: () => ({}),
		resume: () => Promise.resolve(),
		suspend: () => {},
		close: () => {},
	};
	// biome-ignore lint/complexity/useArrowFunction: must be `new`-able — createStage calls `new AC()`; an arrow throws.
	(window as unknown as { AudioContext: unknown }).AudioContext = function () {
		return ctx;
	};
	return { ctx, sources };
}

describe('createStage — pause/resume (stop + re-arm)', () => {
	it('pause stops the live clip; resume plays a FRESH source from the paused offset; onStart fires once', async () => {
		const { ctx, sources } = installTrackingAudio();
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k'); // duration 1000ms
		const onStart = vi.fn();
		const handle = stage.play(clip, { onStart });
		expect(sources.length).toBe(1); // armed once
		expect(sources[0].started[0]).toBe(0); // started at offset 0
		expect(onStart).toHaveBeenCalledTimes(1);

		ctx.currentTime = 0.4; // 400ms into the clip
		handle.pause();
		expect(sources[0].stopped).toBe(true); // the live source was stopped, not left to the context

		ctx.currentTime = 5; // (a long pause — real wall time)
		handle.resume();
		expect(sources.length).toBe(2); // a NEW source was armed
		expect(sources[1].started[0]).toBeCloseTo(0.4, 5); // …from the paused offset (~400ms in)
		expect(onStart).toHaveBeenCalledTimes(1); // NOT re-fired on resume (would re-anchor the caption)

		// The fresh source ending naturally settles the handle.
		sources[1].onended?.();
		const res = await handle.done;
		expect(res.ok).toBe(true);
		expect(res.aborted).toBeFalsy(); // a natural end, not a stop()/barge-in
	});

	it('freezes clockMs() at the pause TAP (not the deferred suspend) and resumes without drift', async () => {
		const { ctx } = installTrackingAudio();
		const stage = createStage(); // baseLatency 0 → clockMs is the raw play-clock
		const clip = await stage.decode(bytesOfSize(8), 'k');
		const handle = stage.play(clip);
		ctx.currentTime = 0.4;
		expect(stage.clockMs()).toBeCloseTo(400, 3); // 400ms in
		handle.pause();
		// The context keeps ticking before the deferred suspend fires (and during the whole pause). The
		// clock must stay FROZEN at the tap regardless — else the caption drifts ahead of the audio.
		ctx.currentTime = 5;
		expect(stage.clockMs()).toBeCloseTo(400, 3); // still 400 — frozen at the tap, not 5000
		handle.resume();
		ctx.currentTime = 5.5; // 500ms of real playback after resume
		expect(stage.clockMs()).toBeCloseTo(900, 3); // 400 + 500; the 4600ms pause is excluded, no accrual
	});

	it("a pause-stopped source's late onended does NOT settle the handle (no premature clip-end)", async () => {
		const { ctx, sources } = installTrackingAudio();
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		let settled = false;
		const handle = stage.play(clip);
		handle.done.then(() => {
			settled = true;
		});
		ctx.currentTime = 0.3;
		handle.pause();
		handle.resume();
		// The old (pause-stopped) source fires onended AFTER resume re-armed — it's stale, must be ignored.
		sources[0].onended?.();
		await Promise.resolve();
		expect(settled).toBe(false); // still playing the re-armed source
		sources[1].onended?.(); // the current source ends → NOW it settles
		await expect(handle.done).resolves.toMatchObject({ ok: true });
	});
});
