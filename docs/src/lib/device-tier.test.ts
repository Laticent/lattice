// @vitest-environment node
// The runtime tier: a fully fake window (jsdom's navigator.hardwareConcurrency would report the RUNNER's
// cores, HARD RULE #32 F8), a fake store, a fixed clock, and a probe the test resolves by hand.

import { describe, expect, it } from 'vitest';
import { CPU_KEY, CPU_MAX_AGE_MS, decide, probeAllowed, probeWhileVisible, readCachedCpu, startDeviceTier, TIER_KEY, type TierDeps, type VisibilityDoc, writeCachedCpu } from './device-tier';

const NOON = Date.UTC(2026, 10, 13, 12, 0, 0);

function fakeStore(seed: Record<string, string> = {}) {
	const data = new Map(Object.entries(seed));
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => {
			data.set(k, v);
		},
	};
}

/** A fake window for a strong Chromium machine; `renderer` and `search` vary per test. */
function fakeWin({ renderer = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', search = '' } = {}) {
	const attrs: Record<string, string> = {};
	const gl = {
		RENDERER: 1,
		getExtension: (n: string) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 2 } : null),
		getParameter: () => renderer,
	};
	const win = {
		navigator: { deviceMemory: 16, hardwareConcurrency: 8, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36' },
		CSS: { supports: () => true },
		Worker: function Worker() {},
		indexedDB: {},
		structuredClone: () => null,
		location: { search },
		document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) }, createElement: () => ({ getContext: () => gl }) },
	};
	return { win: win as unknown as Window & typeof globalThis, attrs };
}

/** A probe the test settles by hand, so nothing waits on a clock. */
function manualProbe() {
	let settle: (v: number | null) => void = () => {};
	let calls = 0;
	const probe = () => {
		calls++;
		return new Promise<number | null>((r) => {
			settle = r;
		});
	};
	return { probe, settle: (v: number | null) => settle(v), calls: () => calls };
}

function deps(over: Partial<TierDeps> & { win: TierDeps['win'] }): TierDeps {
	return { store: fakeStore(), now: () => NOON, probe: () => Promise.resolve(null), ...over };
}

describe('readCachedCpu', () => {
	it.each<[string, string | undefined, number | null]>([
		['fresh', JSON.stringify({ score: 180, at: NOON - 1000 }), 180],
		['one ms short of a day', JSON.stringify({ score: 180, at: NOON - CPU_MAX_AGE_MS + 1 }), 180],
		['exactly a day old', JSON.stringify({ score: 180, at: NOON - CPU_MAX_AGE_MS }), null],
		['from the future (a clock moved back)', JSON.stringify({ score: 180, at: NOON + 1000 }), null],
		['missing', undefined, null],
		['garbage', '{not json', null],
		['negative score', JSON.stringify({ score: -1, at: NOON }), null],
	])('%s', (_name, raw, expected) => {
		expect(readCachedCpu(fakeStore(raw === undefined ? {} : { [CPU_KEY]: raw }), NOON)).toBe(expected);
	});

	it('round-trips what writeCachedCpu stores', () => {
		const s = fakeStore();
		writeCachedCpu(s, 392, NOON);
		expect(readCachedCpu(s, NOON + 60_000)).toBe(392);
	});
});

describe('decide', () => {
	const profile = { tier: 'full' as const, detected: 'full' as const, reasons: [] };
	it('saves the detected tier', () => expect(decide(profile, null)).toEqual({ tier: 'full', save: true }));
	it('shows a pin but never saves it', () => expect(decide(profile, 'lite')).toEqual({ tier: 'lite', save: false }));
});

describe('startDeviceTier', () => {
	it('shows the tier from the synchronous signals, saves nothing until the probe lands, then applies and saves', async () => {
		const { win, attrs } = fakeWin();
		const store = fakeStore();
		const p = manualProbe();
		const seen: string[] = [];
		const { state, probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		expect(state.tier).toBe('full');
		expect(attrs['data-device-tier']).toBe('full');
		expect(store.data.has(TIER_KEY)).toBe(false);

		const { onDeviceTierChange } = await import('./device-tier');
		const off = onDeviceTierChange((s) => seen.push(s.tier));
		p.settle(10); // below the floor cut-off: one floor signal alone, so LITE, not a decline
		const after = await probed;
		off();
		expect(after.tier).toBe('lite');
		expect(after.profile.reasons.map((r) => r.code)).toEqual(['floor:cpu']);
		expect(attrs['data-device-tier']).toBe('lite');
		expect(store.data.get(TIER_KEY)).toBe('lite');
		expect(readCachedCpu(store, NOON)).toBe(10);
		expect(seen).toEqual(['lite']);
	});

	it('a fresh cached score skips the probe entirely', async () => {
		const { win } = fakeWin();
		const p = manualProbe();
		const store = fakeStore({ [CPU_KEY]: JSON.stringify({ score: 30, at: NOON - 1000 }) });
		const { state, probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		expect(p.calls()).toBe(0);
		expect(state.signals.cpuScore).toBe(30);
		expect(state.tier).toBe('lite');
		expect(await probed).toBe(state);
	});

	it('a stale cached score runs the probe again', () => {
		const { win } = fakeWin();
		const p = manualProbe();
		const store = fakeStore({ [CPU_KEY]: JSON.stringify({ score: 30, at: NOON - CPU_MAX_AGE_MS }) });
		startDeviceTier(deps({ win, store, probe: p.probe }));
		expect(p.calls()).toBe(1);
	});

	it('a ?tier= pin is shown, labeled as pinned, and never saved', () => {
		const { win, attrs } = fakeWin({ search: '?tier=lite' });
		const store = fakeStore({ [TIER_KEY]: 'full' });
		const { state } = startDeviceTier(deps({ win, store }));
		expect(attrs['data-device-tier']).toBe('lite');
		expect(state).toMatchObject({ tier: 'lite', pinned: 'lite' });
		expect(state.profile.tier).toBe('full');
		expect(store.data.get(TIER_KEY)).toBe('full');
	});

	it('a probe that cannot run leaves the tier as it was and saves nothing', async () => {
		const { win, attrs } = fakeWin({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' });
		const store = fakeStore();
		const p = manualProbe();
		const { probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		p.settle(null);
		expect((await probed).tier).toBe('lite');
		expect(attrs['data-device-tier']).toBe('lite');
		expect(store.data.has(TIER_KEY)).toBe(false);
	});

	// The reviewer's scenario: LITE only because of the CPU, and the cached score has expired. Measurement may lower the
	// tier mid-session but never raise it, so the page must not flash FULL, or save FULL, while the probe re-measures.
	it('a device saved as LITE never shows or saves FULL while its expired score is re-measured', async () => {
		const { win } = fakeWin();
		const shown: string[] = [];
		const realWin = win as unknown as { document: { documentElement: { setAttribute: (k: string, v: string) => void } } };
		const set = realWin.document.documentElement.setAttribute;
		realWin.document.documentElement.setAttribute = (k: string, v: string) => {
			if (k === 'data-device-tier') shown.push(v);
			set(k, v);
		};
		const store = fakeStore({ [TIER_KEY]: 'lite', [CPU_KEY]: JSON.stringify({ score: 30, at: NOON - CPU_MAX_AGE_MS }) });
		const p = manualProbe();
		const { state, probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		expect(state.tier).toBe('lite');
		expect(store.data.get(TIER_KEY)).toBe('lite');
		p.settle(30);
		await probed;
		expect(shown).toEqual(['lite', 'lite']);
		expect(store.data.get(TIER_KEY)).toBe('lite');
	});

	it('a probe that cannot run keeps a saved LITE instead of raising it on no evidence', async () => {
		const { win, attrs } = fakeWin();
		const store = fakeStore({ [TIER_KEY]: 'lite' });
		const p = manualProbe();
		const { probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		p.settle(null);
		await probed;
		expect(attrs['data-device-tier']).toBe('lite');
		expect(store.data.get(TIER_KEY)).toBe('lite');
	});

	it('a good probe result is what raises a saved LITE back to FULL', async () => {
		const { win, attrs } = fakeWin();
		const store = fakeStore({ [TIER_KEY]: 'lite' });
		const p = manualProbe();
		const { probed } = startDeviceTier(deps({ win, store, probe: p.probe }));
		expect(attrs['data-device-tier']).toBe('lite');
		p.settle(200);
		await probed;
		expect(attrs['data-device-tier']).toBe('full');
		expect(store.data.get(TIER_KEY)).toBe('full');
	});

	it('works with storage blocked: applies the tier, saves nothing, still probes', () => {
		const { win, attrs } = fakeWin();
		const p = manualProbe();
		startDeviceTier(deps({ win, store: null, probe: p.probe }));
		expect(attrs['data-device-tier']).toBe('full');
		expect(p.calls()).toBe(1);
	});
});

/** A document whose visibility the test flips by hand, firing `visibilitychange` like the browser. */
function fakeDoc(hidden = false) {
	const fns = new Set<() => void>();
	const doc = {
		hidden,
		addEventListener: (_t: 'visibilitychange', fn: () => void) => fns.add(fn),
		removeEventListener: (_t: 'visibilitychange', fn: () => void) => fns.delete(fn),
	};
	return {
		doc: doc as VisibilityDoc,
		set(h: boolean) {
			doc.hidden = h;
			for (const fn of [...fns]) fn();
		},
		listeners: () => fns.size,
	};
}

describe('probeWhileVisible', () => {
	it('a visible page runs the probe and keeps its score, and leaves no listener behind', async () => {
		const d = fakeDoc(false);
		const p = manualProbe();
		const out = probeWhileVisible(d.doc, p.probe);
		expect(p.calls()).toBe(1);
		p.settle(200);
		expect(await out).toBe(200);
		expect(d.listeners()).toBe(0);
	});

	// A background tab is throttled: its score would read the machine as slow and be saved for a day.
	it('a page hidden at any point during the run throws the score away, even if shown again before it ends', async () => {
		const d = fakeDoc(false);
		const p = manualProbe();
		const out = probeWhileVisible(d.doc, p.probe);
		d.set(true);
		d.set(false);
		p.settle(12);
		expect(await out).toBeNull();
	});

	it('a page hidden at the start waits until it is shown, then runs', async () => {
		const d = fakeDoc(true);
		const p = manualProbe();
		const out = probeWhileVisible(d.doc, p.probe);
		expect(p.calls()).toBe(0);
		d.set(false);
		expect(p.calls()).toBe(1);
		p.settle(150);
		expect(await out).toBe(150);
	});

	it('a probe that rejects resolves null and leaves no listener behind', async () => {
		const d = fakeDoc(false);
		expect(await probeWhileVisible(d.doc, () => Promise.reject(new Error('worker died')))).toBeNull();
		expect(d.listeners()).toBe(0);
	});
});

describe('probeAllowed', () => {
	it('Save-Data skips the probe: nothing downloaded, the CPU stays unknown', () => {
		expect(probeAllowed({ connection: { saveData: true } })).toBe(false);
		expect(probeAllowed({ connection: { saveData: false } })).toBe(true);
		expect(probeAllowed({})).toBe(true);
	});
});
