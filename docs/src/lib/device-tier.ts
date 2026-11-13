// The device tier at RUNTIME: reads the device once after the first slide is showing, sets
// `data-device-tier` on <html>, saves the tier so the next page load can set it before first paint, and
// runs the CPU probe in a worker at most once a day. Design: engineering/decisions/2026-11-12-device-capability-tiers.md
// §3 and §3.2 (and "Slice 1b, as built").
//
// Why after the first slide and not before first paint: the Studio's HTML sits about 250 bytes under its
// route-budget ceiling, so a full pre-paint detector does not fit. The page's inline boot script instead
// applies the tier saved by the PREVIOUS visit (or a `?tier=` pin), which costs about 160 bytes; this module,
// loaded lazily so it adds no eager JS, decides the tier for this visit and saves it for the next.
//
// Every browser dependency (storage, the clock, the worker) is passed in, so the tests drive it with fakes
// and never read the runner's machine or clock (HARD RULE #32).

import { browserLongTasks, watchBoot } from './boot-probe';
import { browserEnv, classify, type DeviceSignals, type Profile, pinnedTier, readSignals, type Tier } from './device-profile';
import { rankGpu } from './gpu-rank';

/** Where the decided tier is saved for the next page load's pre-paint read. The inline boot script reads this key. */
export const TIER_KEY = 'lattice-device-tier';
/** Where the last CPU probe score is saved, with when it was taken. */
export const CPU_KEY = 'lattice-device-cpu';
/** A probe result is reused for a day: long enough that the 140 ms of work is rare, short enough to see a slower machine. */
export const CPU_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface KeyStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The cached probe score, or null when there is none, it is unreadable, or it is older than a day (or from the future). */
export function readCachedCpu(store: KeyStore, now: number): number | null {
	try {
		const v = JSON.parse(store.getItem(CPU_KEY) ?? 'null') as { score?: unknown; at?: unknown } | null;
		if (!v || typeof v.score !== 'number' || typeof v.at !== 'number' || !Number.isFinite(v.score) || v.score < 0) return null;
		const age = now - v.at;
		return age >= 0 && age < CPU_MAX_AGE_MS ? v.score : null;
	} catch {
		return null;
	}
}

export function writeCachedCpu(store: KeyStore, score: number, now: number): void {
	try {
		store.setItem(CPU_KEY, JSON.stringify({ score, at: now }));
	} catch {}
}

/**
 * The tier to show, and whether to save it. A pin (`?tier=`) is shown but never saved, so a test URL or a
 * shared link cannot change what the next ordinary visit paints.
 */
export function decide(profile: Profile, pinned: Tier | null): { tier: Tier; save: boolean } {
	return pinned ? { tier: pinned, save: false } : { tier: profile.tier, save: true };
}

export interface TierDeps {
	win: Window & typeof globalThis;
	store: KeyStore | null;
	now: () => number;
	/** Run the probe off the main thread and resolve its score, or null when it cannot run. */
	probe: () => Promise<number | null>;
	/** detect-gpu's tier 0-3 for this renderer, or null when it cannot rank it (gpu-rank.ts). Omitted: never ranked. */
	gpu?: (renderer: string | null) => Promise<number | null>;
	/** Whether the boot fell behind (boot-probe.ts): true, false, or null when this browser cannot tell. Omitted: never asked. */
	boot?: () => Promise<boolean | null>;
	/** Told when a measurement drops this visit from FULL to LITE after it was first shown, so the page can say so. */
	onDrop?: (s: TierState) => void;
}

export interface TierState {
	profile: Profile;
	signals: DeviceSignals;
	tier: Tier;
	pinned: Tier | null;
}

let state: TierState | null = null;
const listeners = new Set<(s: TierState) => void>();

/** The current state, or null before `startDeviceTier` has run. */
export function deviceTierState(): TierState | null {
	return state;
}

/** Called on every change of tier or signals; returns an unsubscribe function. */
export function onDeviceTierChange(fn: (s: TierState) => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

const RANK: Record<Tier, number> = { unsupported: 0, lite: 1, full: 2 };

/** The lower of two tiers. */
export function lowerTier(a: Tier, b: Tier): Tier {
	return RANK[a] <= RANK[b] ? a : b;
}

/** The tier the previous visit saved, or null when there is none or it is not a known tier. */
export function readSavedTier(store: KeyStore | null): Tier | null {
	try {
		const v = store?.getItem(TIER_KEY);
		return v === 'full' || v === 'lite' || v === 'unsupported' ? v : null;
	} catch {
		return null;
	}
}

/**
 * `interim`: the CPU probe has not answered yet. Measurement may lower the tier mid-session but never raise it (§3),
 * so until it answers the page shows the LOWER of the saved tier and the tier the other signals give, and saves nothing:
 * a device that is LITE only because of its CPU must not flash FULL, or save FULL, while its expired score is re-measured.
 */
function apply(deps: TierDeps, signals: DeviceSignals, pinned: Tier | null, interim: { saved: Tier | null } | null = null): TierState {
	const profile = classify(signals);
	let { tier, save } = decide(profile, pinned);
	if (interim && !pinned) {
		if (interim.saved) tier = lowerTier(tier, interim.saved);
		save = false;
	}
	deps.win.document.documentElement.setAttribute('data-device-tier', tier);
	if (save && deps.store) {
		try {
			deps.store.setItem(TIER_KEY, tier);
		} catch {}
	}
	state = { profile, signals, tier, pinned };
	for (const fn of listeners) {
		try {
			fn(state);
		} catch {}
	}
	return state;
}

/**
 * Decide the tier for this visit. Resolves once the tier from the synchronous signals is applied. Three measurements land
 * later and each applies again: the CPU probe when it has to run (the returned `probed` promise), the GPU rank and the boot
 * probe (`settled` waits for all three). Each only ADDS evidence, so after the first paint a measurement can lower the tier
 * but never raise it, with one exception kept from slice 1b: while the CPU score is pending the page shows the lower of the
 * saved and the signal tier, and the score, once it lands, decides. A drop from FULL to LITE after the first paint calls
 * `onDrop` (the toast).
 */
export function startDeviceTier(deps: TierDeps): { state: TierState; probed: Promise<TierState>; settled: Promise<TierState> } {
	const pinned = pinnedTier(deps.win.location.search);
	let signals = readSignals(browserEnv(deps.win));
	const cached = deps.store ? readCachedCpu(deps.store, deps.now()) : null;
	if (cached !== null) signals.cpuScore = cached;
	let cpuPending = cached === null;
	const saved = readSavedTier(deps.store);
	const reapply = (): TierState => {
		const before = state?.tier;
		const next = apply(deps, signals, pinned, cpuPending ? { saved } : null);
		if (before === 'full' && next.tier === 'lite' && !pinned) {
			try {
				deps.onDrop?.(next);
			} catch {}
		}
		return next;
	};
	state = null;
	const first = reapply();
	const probed = cpuPending
		? deps
				.probe()
				// A probe that cannot run brings no new evidence, so the interim tier stays and nothing is saved: the saved tier
				// keeps whatever the last real measurement decided.
				.then((score) => {
					if (score === null) return state ?? first;
					if (deps.store) writeCachedCpu(deps.store, score, deps.now());
					cpuPending = false;
					signals = { ...signals, cpuScore: score };
					return reapply();
				})
				.catch(() => state ?? first)
		: Promise.resolve(first);
	const ranked = (deps.gpu ? deps.gpu(signals.renderer) : Promise.resolve(null))
		.then((tier) => {
			if (tier === null) return;
			signals = { ...signals, gpuTier: tier };
			reapply();
		})
		.catch(() => {});
	const booted = (deps.boot ? deps.boot() : Promise.resolve(null))
		.then((slow) => {
			if (slow !== true) return;
			signals = { ...signals, bootProbeSlow: true };
			reapply();
		})
		.catch(() => {});
	const settled = Promise.all([probed, ranked, booted]).then(() => state ?? first);
	return { state: first, probed, settled };
}

/** The slice of `document` the visibility guard reads. */
export interface VisibilityDoc {
	readonly hidden: boolean;
	addEventListener(type: 'visibilitychange', fn: () => void): void;
	removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/**
 * Run the probe only while the page is visible, and throw its score away if the page is hidden at ANY point during the
 * run. A background tab is throttled, so its score would read the machine as slow and that low score would be saved for
 * a day. A page hidden at the start waits until it is shown. (Raised by the card grader, 2026-11-13.)
 */
export function probeWhileVisible(doc: VisibilityDoc, run: () => Promise<number | null>): Promise<number | null> {
	const start = (): Promise<number | null> => {
		let hiddenDuring = false;
		const onChange = () => {
			if (doc.hidden) hiddenDuring = true;
		};
		doc.addEventListener('visibilitychange', onChange);
		return run().then(
			(score) => {
				doc.removeEventListener('visibilitychange', onChange);
				return hiddenDuring ? null : score;
			},
			() => {
				doc.removeEventListener('visibilitychange', onChange);
				return null;
			},
		);
	};
	if (!doc.hidden) return start();
	return new Promise((resolve) => {
		const onShow = () => {
			if (doc.hidden) return;
			doc.removeEventListener('visibilitychange', onShow);
			resolve(start());
		};
		doc.addEventListener('visibilitychange', onShow);
	});
}

/** Save-Data asks the page to spend nothing it does not need: no probe, so the CPU stays unknown, and unknown never lowers the tier. */
export function probeAllowed(nav: { connection?: { saveData?: boolean } }): boolean {
	return nav.connection?.saveData !== true;
}

/** The real dependencies: localStorage (when it can be read), the wall clock, and the probe in a module worker. */
export function browserTierDeps(win: Window & typeof globalThis): TierDeps {
	let store: KeyStore | null = null;
	try {
		store = win.localStorage;
		store.getItem(TIER_KEY);
	} catch {
		store = null;
	}
	const allowed = () => probeAllowed(win.navigator as Navigator & { connection?: { saveData?: boolean } });
	return {
		win,
		store,
		now: () => Date.now(),
		probe: () => {
			if (!allowed()) return Promise.resolve(null);
			return probeWhileVisible(win.document, runWorkerProbe(win));
		},
		// The GPU rank fetches one 2-14 KB table from our own origin; Save-Data skips it like the CPU probe, and the GPU stays
		// ranked by our own software-renderer test alone. With no WebGL there is nothing to rank, so not even the library loads.
		gpu: (renderer) => (renderer !== null && allowed() ? import('./gpu-rank-tables').then(async (m) => rankGpu(renderer, await m.browserGpuRankDeps())) : Promise.resolve(null)),
		boot: () => watchBoot({ observe: browserLongTasks(win), now: () => win.performance.now(), setTimeout: (fn, ms) => win.setTimeout(fn, ms) }),
		onDrop: (s) => {
			const why = s.profile.reasons.find((r) => r.kind !== 'feature')?.text ?? '';
			void import('./notify').then(({ notify }) => notify(`Lattice switched to Lite mode to stay smooth. ${why}`.trim())).catch(() => {});
		},
	};
}

/** The probe in a module worker, or null when the worker cannot start, errors, or never answers. */
function runWorkerProbe(win: Window & typeof globalThis): () => Promise<number | null> {
	return () =>
			new Promise<number | null>((resolve) => {
				let worker: Worker;
				try {
					worker = new Worker(new URL('./cpu-probe.worker.ts', import.meta.url), { type: 'module' });
				} catch {
					resolve(null);
					return;
				}
				// A hang guard, not a measurement: a worker a phone killed silently never answers. Generous, because the probe
				// is ~140 ms of work and a slow or busy machine is exactly the one whose score matters.
				const guard = win.setTimeout(() => {
					worker.terminate();
					resolve(null);
				}, 30_000);
				worker.onmessage = (e: MessageEvent<unknown>) => {
					win.clearTimeout(guard);
					worker.terminate();
					resolve(typeof e.data === 'number' && Number.isFinite(e.data) ? e.data : null);
				};
				worker.onerror = () => {
					win.clearTimeout(guard);
					worker.terminate();
					resolve(null);
				};
			});
}
