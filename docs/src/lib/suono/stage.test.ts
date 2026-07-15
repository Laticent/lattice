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
	vi.useRealTimers(); // safe even when a test never enabled fake timers
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

	it("a DIFFERENT handle finishing on the shared stage does NOT unfreeze a paused handle's clock", async () => {
		// The Voice-tab sample audition plays on the SAME module-singleton stage as the Present read-along.
		// The pause-clock state is stage-global, so a one-off play ENDING must not clear a still-paused
		// clip's freeze — finish()'s unfreeze is scoped to the handle that actually paused (checker finding).
		const { ctx, sources } = installTrackingAudio();
		const stage = createStage();
		const clipA = await stage.decode(bytesOfSize(8), 'a'); // the "read-along"
		const clipB = await stage.decode(bytesOfSize(8), 'b'); // the "audition"
		const a = stage.play(clipA);
		ctx.currentTime = 0.5;
		a.pause(); // freezes the shared clock at 500ms
		expect(stage.clockMs()).toBeCloseTo(500, 3);
		const b = stage.play(clipB); // a one-off audition on the shared stage
		ctx.currentTime = 3;
		sources[sources.length - 1].onended?.(); // B ends naturally
		await b.done;
		ctx.currentTime = 5; // more time passes while A is STILL paused
		expect(stage.clockMs()).toBeCloseTo(500, 3); // A's clock still frozen — B's finish didn't touch it
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

// A mock with a REAL createOscillator so the keep-alive route-warmer (a low-frequency TONE) actually
// builds — the minimal mocks above have no createOscillator, so the keep-alive best-effort no-ops there
// (which is why those tests' clip counts are untouched by this feature). Clip playback uses
// createBufferSource; the keep-alive uses createOscillator, so the two are tracked SEPARATELY.
function installKeepAliveAudio() {
	const clipSources: Array<{ stopped: boolean; onended: null | (() => void) }> = [];
	const oscillators: Array<{ frequency: { value: number }; started: boolean; stopped: boolean }> = [];
	const gains: Array<{ gain: { value: number } }> = [];
	class ClipSrc {
		buffer: unknown = null;
		stopped = false;
		onended: null | (() => void) = null;
		connect() {}
		disconnect() {}
		start() {}
		stop() {
			this.stopped = true;
		}
	}
	function makeOscillator() {
		const o = {
			frequency: { value: 0 },
			started: false,
			stopped: false,
			connect() {},
			disconnect() {},
			start() {
				o.started = true;
			},
			stop() {
				o.stopped = true;
			},
		};
		oscillators.push(o);
		return o;
	}
	function makeGain() {
		const g = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} };
		gains.push(g);
		return g;
	}
	const ctx = {
		state: 'running',
		currentTime: 0,
		baseLatency: 0,
		sampleRate: 48000,
		destination: {},
		decodeAudioData: (_ab: ArrayBuffer, ok: (b: unknown) => void) => ok({ length: 48000, numberOfChannels: 1, duration: 1 }),
		createBuffer: () => ({}), // only the unlock() 1-sample bless buffer needs this now
		createBufferSource() {
			const s = new ClipSrc();
			clipSources.push(s);
			return s;
		},
		createOscillator: makeOscillator,
		createGain: makeGain,
		resume: () => Promise.resolve(),
		suspend: () => {},
		close: () => {},
	};
	// biome-ignore lint/complexity/useArrowFunction: must be `new`-able — createStage calls `new AC()`.
	(window as unknown as { AudioContext: unknown }).AudioContext = function () {
		return ctx;
	};
	return { ctx, clipSources, oscillators, gains };
}

describe('createStage — keep-alive route-warmer (Bluetooth / CarPlay anti-choppiness)', () => {
	it('starts ONE low-frequency tone on unlock, at the configured gain + Hz, WITHOUT moving the clock', () => {
		const { ctx, oscillators, gains } = installKeepAliveAudio();
		const stage = createStage({ keepAliveGain: 0.002, keepAliveHz: 55 });
		stage.unlock();
		expect(oscillators.length).toBe(1); // exactly one continuous route-warmer
		expect(oscillators[0].started).toBe(true);
		expect(oscillators[0].frequency.value).toBe(55); // in the low, inaudible band — not broadband hiss
		expect(gains.some((g) => g.gain.value === 0.002)).toBe(true); // attenuated to the configured sub-audible level
		// The keep-alive is invisible to the play-clock: caption sync rides clockMs(), which must read the
		// raw context time regardless of the extra always-on source.
		expect(stage.clockMs()).toBe(0);
		ctx.currentTime = 1;
		expect(stage.clockMs()).toBeCloseTo(1000, 3);
	});

	it('is idempotent — a second unlock and a later play add NO further keep-alive tones', async () => {
		const { oscillators } = installKeepAliveAudio();
		const stage = createStage();
		stage.unlock();
		stage.unlock();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		stage.play(clip);
		expect(oscillators.length).toBe(1);
	});

	it('keepAlive:false suppresses it entirely', () => {
		const { oscillators } = installKeepAliveAudio();
		const stage = createStage({ keepAlive: false });
		stage.unlock();
		expect(oscillators.length).toBe(0);
	});

	it('a barge-in (stopAll) does NOT stop the keep-alive — the route stays warm across it', async () => {
		const { oscillators } = installKeepAliveAudio();
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		stage.play(clip);
		stage.stopAll();
		expect(oscillators[0]?.stopped).toBe(false); // survives the barge-in (that's the whole point)
	});

	it('dispose() DOES stop the keep-alive (it lives outside activeSources)', async () => {
		const { oscillators } = installKeepAliveAudio();
		const stage = createStage();
		const clip = await stage.decode(bytesOfSize(8), 'k');
		stage.play(clip);
		stage.dispose();
		expect(oscillators[0]?.stopped).toBe(true);
	});

	it('SURVIVES a natural clip finish, then releases on the idle timeout; a later play re-arms a fresh one', async () => {
		vi.useFakeTimers();
		const { clipSources, oscillators } = installKeepAliveAudio();
		const stage = createStage({ keepAliveIdleMs: 30000 });
		const clip = await stage.decode(bytesOfSize(8), 'k');
		const handle = stage.play(clip);
		const osc1 = oscillators[0];
		// The clip ends naturally (its onended → finish()).
		clipSources.at(-1)?.onended?.();
		await handle.done;
		expect(osc1.stopped).toBe(false); // the per-clip finish itself must NOT stop the warmer (route stays warm)
		vi.advanceTimersByTime(30000); // ...only the idle timer does
		expect(osc1.stopped).toBe(true);
		// A fresh read re-arms a NEW keep-alive tone (the released one isn't reused).
		const clip2 = await stage.decode(bytesOfSize(8), 'k2');
		stage.play(clip2);
		expect(oscillators.length).toBe(2);
		expect(oscillators[1].stopped).toBe(false);
	});

	it('a next clip before the idle timeout CANCELS the release — the route never goes cold mid-read', async () => {
		vi.useFakeTimers();
		const { clipSources, oscillators } = installKeepAliveAudio();
		const stage = createStage({ keepAliveIdleMs: 30000 });
		const clipA = await stage.decode(bytesOfSize(8), 'a');
		const hA = stage.play(clipA);
		clipSources.at(-1)?.onended?.(); // clip A ends → arms the 30s release
		await hA.done;
		vi.advanceTimersByTime(10000); // partway through the idle window
		const clipB = await stage.decode(bytesOfSize(8), 'b'); // the next sentence arrives in time
		stage.play(clipB);
		vi.advanceTimersByTime(30000); // well past the ORIGINAL deadline — the cancelled timer must not fire
		expect(oscillators.length).toBe(1); // same warmer throughout — never released, never re-created
		expect(oscillators[0].stopped).toBe(false);
	});
});
