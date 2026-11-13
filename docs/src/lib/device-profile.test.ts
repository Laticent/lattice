// The device profile's tests. Every input is handed in: a fake browser for readSignals, a fake clock
// for the CPU probe, a signal table for classify. Nothing here reads the runner's cores, memory, GPU
// or clock, so the result is the same on a laptop and a loaded CI box (HARD RULE #32, F1 and F8).

import { describe, expect, it } from 'vitest';
import {
	type BrowserEnv,
	classify,
	type DeviceSignals,
	isSoftwareRenderer,
	pinnedTier,
	REQUIRED_FEATURES,
	readSignals,
	runCpuProbe,
	shortRenderer,
} from './device-profile';

const ALL_FEATURES = Object.fromEntries(REQUIRED_FEATURES.map((f) => [f, true])) as DeviceSignals['features'];

/** A strong machine: a real GPU, 16 GB, 8 cores, a fast probe. Each case changes one field. */
function strong(over: Partial<DeviceSignals> = {}): DeviceSignals {
	return {
		features: { ...ALL_FEATURES },
		renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
		gpuTier: 3,
		memoryGB: 16,
		cores: 8,
		cpuScore: 180,
		bootProbeSlow: false,
		...over,
	};
}

const codes = (s: DeviceSignals, opts?: Parameters<typeof classify>[1]) => classify(s, opts).reasons.map((r) => r.code);

describe('classify', () => {
	it('a strong machine is FULL with no reasons', () => {
		expect(classify(strong())).toEqual({ tier: 'full', detected: 'full', reasons: [] });
	});

	it('unknown is not weak: no memory, no cores, no probe, masked renderer stays FULL', () => {
		const p = classify(strong({ memoryGB: null, cores: null, cpuScore: null, gpuTier: null, renderer: 'Apple GPU' }));
		expect(p.tier).toBe('full');
	});

	// The owner's LITE triggers (decision note §7.4): any ONE is enough.
	it.each<[string, Partial<DeviceSignals>, string]>([
		['software renderer', { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', gpuTier: null }, 'weak:gpu'],
		['detect-gpu tier 1', { gpuTier: 1 }, 'weak:gpu'],
		['4 GB reported', { memoryGB: 4 }, 'weak:memory'],
		['4 cores reported', { cores: 4 }, 'weak:cores'],
		['slow probe', { cpuScore: 59 }, 'weak:cpu'],
		['boot probe fell behind', { bootProbeSlow: true }, 'weak:boot'],
	])('one weak signal makes LITE: %s', (_name, over, code) => {
		const p = classify(strong(over));
		expect(p.tier).toBe('lite');
		expect(p.reasons.map((r) => r.code)).toEqual([code]);
	});

	it('the LITE edges are inclusive for memory and cores, exclusive for the probe', () => {
		expect(classify(strong({ memoryGB: 8, cores: 5, cpuScore: 60 })).tier).toBe('full');
	});

	it('a missing required feature declines on its own and names the feature', () => {
		const p = classify(strong({ features: { ...ALL_FEATURES, cssHas: false } }));
		expect(p.tier).toBe('unsupported');
		expect(p.reasons).toEqual([{ code: 'feature:cssHas', kind: 'feature', text: "This browser doesn't support CSS :has()." }]);
	});

	it('ONE hardware floor signal only makes LITE: one guess never turns a user away', () => {
		expect(classify(strong({ memoryGB: 1 })).tier).toBe('lite');
		expect(classify(strong({ renderer: null })).tier).toBe('lite');
	});

	it('TWO agreeing floor signals decline', () => {
		const p = classify(strong({ memoryGB: 1, cores: 2 }));
		expect(p.tier).toBe('unsupported');
		expect(p.reasons.map((r) => r.code)).toEqual(['floor:memory', 'floor:cores']);
	});

	it('a floor signal counts once, as floor, not also as weak', () => {
		expect(codes(strong({ cpuScore: 19 }))).toEqual(['floor:cpu']);
	});

	it('an override picks FULL or LITE when the device is supported', () => {
		expect(classify(strong({ cores: 4 }), { override: 'full' })).toMatchObject({ tier: 'full', detected: 'lite' });
		expect(classify(strong(), { override: 'lite' })).toMatchObject({ tier: 'lite', detected: 'full' });
	});

	it('an override never lifts a decline; "continue anyway" turns it into LITE', () => {
		const declined = strong({ features: { ...ALL_FEATURES, worker: false } });
		expect(classify(declined, { override: 'full' }).tier).toBe('unsupported');
		expect(classify(declined, { continueAnyway: true })).toMatchObject({ tier: 'lite', detected: 'unsupported' });
	});
});

describe('isSoftwareRenderer', () => {
	it.each([
		['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', true],
		['llvmpipe (LLVM 15.0.7, 256 bits)', true],
		['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)', true],
		['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', false],
		['Apple GPU', false],
	])('%s → %s', (renderer, expected) => {
		expect(isSoftwareRenderer(renderer)).toBe(expected);
	});

	it('no WebGL is not a software renderer (it is the floor case, handled by classify)', () => {
		expect(isSoftwareRenderer(null)).toBe(false);
	});
});

describe('shortRenderer', () => {
	it.each([
		['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'SwiftShader'],
		['llvmpipe (LLVM 15.0.7, 256 bits)', 'llvmpipe'],
		['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA GeForce RTX 3060'],
		['ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2'],
		['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) UHD Graphics 620'],
		['Apple GPU', 'Apple GPU'],
	])('%s → %s', (renderer, expected) => {
		expect(shortRenderer(renderer)).toBe(expected);
	});

	it('cuts an unknown long name at 40 characters', () => {
		expect(shortRenderer('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`);
	});
});

describe('pinnedTier', () => {
	it('reads ?tier= and ignores anything else', () => {
		expect(pinnedTier('?tier=lite')).toBe('lite');
		expect(pinnedTier('?a=1&tier=unsupported')).toBe('unsupported');
		expect(pinnedTier('?tier=turbo')).toBeNull();
		expect(pinnedTier('')).toBeNull();
	});
});

/** A fake browser. Defaults to a capable Chromium; each test overrides one part. */
function env(over: Partial<BrowserEnv> & { nav?: BrowserEnv['navigator'] } = {}): BrowserEnv {
	return {
		navigator: over.nav ?? { deviceMemory: 8, hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36' },
		supports: over.supports ?? (() => true),
		has: over.has ?? (() => true),
		webglRenderer: over.webglRenderer ?? (() => 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)'),
	};
}

describe('readSignals', () => {
	it('reads every field from a capable browser', () => {
		expect(readSignals(env())).toEqual({
			features: { ...ALL_FEATURES },
			renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
			gpuTier: null,
			memoryGB: 8,
			cores: 8,
			cpuScore: null,
			bootProbeSlow: false,
		});
	});

	it('memory and cores the browser does not report are null, not zero', () => {
		const s = readSignals(env({ nav: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' } }));
		expect(s.memoryGB).toBeNull();
		expect(s.cores).toBeNull();
	});

	it("Safari's clamped core count is discarded; Chrome's is kept", () => {
		const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
		expect(readSignals(env({ nav: { hardwareConcurrency: 4, userAgent: safari } })).cores).toBeNull();
	});

	it('maps each missing API to its feature', () => {
		const s = readSignals(env({ has: (g) => g !== 'indexedDB', supports: (c) => !c.includes(':has(') }));
		expect(s.features).toEqual({ ...ALL_FEATURES, indexedDB: false, cssHas: false });
	});

	it('no WebGL context is a null renderer', () => {
		expect(readSignals(env({ webglRenderer: () => null })).renderer).toBeNull();
	});
});

describe('runCpuProbe', () => {
	/** A clock that moves only when read or when the unit "costs" time, so the count is exact. */
	function fakeClock(readCost: number) {
		let t = 0;
		return {
			now: () => {
				t += readCost;
				return t;
			},
			spend: (ms: number) => {
				t += ms;
			},
		};
	}

	it('counts units per window and takes the median', () => {
		// Each read advances 1 ms, so a 20 ms window fits 19 units (reads at 1..19 pass, 20 stops).
		const clock = fakeClock(1);
		const r = runCpuProbe({ now: clock.now, unit: () => {}, windows: 7, windowMs: 20 });
		expect(r.counts).toEqual([19, 19, 19, 19, 19, 19, 19]);
		expect(r.score).toBe(19);
	});

	it('a slower unit runs fewer times, and the score drops in proportion', () => {
		const clock = fakeClock(0);
		const fast = runCpuProbe({ now: clock.now, unit: () => clock.spend(1), windowMs: 20 });
		const slow = runCpuProbe({ now: clock.now, unit: () => clock.spend(4), windowMs: 20 });
		expect(fast.score).toBe(20);
		expect(slow.score).toBe(5);
	});

	it('the median ignores one cold window', () => {
		const clock = fakeClock(0);
		let calls = 0;
		// The first 10 units are slow (a cold JIT), the rest fast.
		const r = runCpuProbe({ now: clock.now, unit: () => clock.spend(calls++ < 10 ? 2 : 1), windows: 5, windowMs: 20 });
		expect(r.counts).toEqual([10, 20, 20, 20, 20]);
		expect(r.score).toBe(20);
	});
});
