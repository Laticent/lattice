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
