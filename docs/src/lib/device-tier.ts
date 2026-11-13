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

import { browserEnv, classify, type DeviceSignals, type Profile, pinnedTier, readSignals, type Tier } from './device-profile';

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

function apply(deps: TierDeps, signals: DeviceSignals, pinned: Tier | null): TierState {
	const profile = classify(signals);
	const { tier, save } = decide(profile, pinned);
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
 * Decide the tier for this visit. Resolves once the tier from the synchronous signals is applied; the probe,
 * when it has to run, applies again when its score lands (the returned `probed` promise).
 */
export function startDeviceTier(deps: TierDeps): { state: TierState; probed: Promise<TierState> } {
	const pinned = pinnedTier(deps.win.location.search);
	const signals = readSignals(browserEnv(deps.win));
	const cached = deps.store ? readCachedCpu(deps.store, deps.now()) : null;
	if (cached !== null) signals.cpuScore = cached;
	const first = apply(deps, signals, pinned);
	if (cached !== null) return { state: first, probed: Promise.resolve(first) };
	const probed = deps
		.probe()
		.then((score) => {
			if (score === null) return state ?? first;
			if (deps.store) writeCachedCpu(deps.store, score, deps.now());
			return apply(deps, { ...signals, cpuScore: score }, pinned);
		})
		.catch(() => state ?? first);
	return { state: first, probed };
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
	return {
		win,
		store,
		now: () => Date.now(),
		probe: () =>
			new Promise<number | null>((resolve) => {
				let worker: Worker;
				try {
					worker = new Worker(new URL('./cpu-probe.worker.ts', import.meta.url), { type: 'module' });
				} catch {
					resolve(null);
					return;
				}
				// A hang guard, not a measurement: a worker a phone killed silently never answers.
				const guard = win.setTimeout(() => {
					worker.terminate();
					resolve(null);
				}, 10_000);
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
			}),
	};
}
