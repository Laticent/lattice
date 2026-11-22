// The device tier at RUNTIME: reads the device after the first slide is showing, sets `data-device-tier` on <html> (again
// as the CPU score, the GPU rank and the boot probe land), saves the tier so the next page load can set it before first
// paint, and runs the CPU probe in a worker at most once a day. Design: engineering/decisions/2026-11-12-device-capability-tiers.md
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
import { browserEnv, classify, type DeviceSignals, type Profile, pinnedTier, readSignals, type Tier, type TierOverride } from './device-profile';
import { CONTINUE_KEY, OVERRIDE_KEY, TIER_KEY } from './device-tier-keys';
import { rankGpu } from './gpu-rank';

/** Where the decided tier is saved for the next page load's pre-paint read (the inline boot script reads it too). */
export { CONTINUE_KEY, OVERRIDE_KEY, TIER_KEY };
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
export function decide(profile: Profile, pinned: Tier | null, continued = false): { tier: Tier; save: boolean } {
	// "Continue anyway" gets past a pinned decline too, so the screen can be tested with `?tier=unsupported`.
	if (pinned === 'unsupported' && continued) return { tier: 'lite', save: false };
	return pinned ? { tier: pinned, save: false } : { tier: profile.tier, save: true };
}

/** The stored Auto / Full / Lite choice; anything unknown reads as Auto. */
export function readTierOverride(store: KeyStore | null): TierOverride {
	try {
		const v = store?.getItem(OVERRIDE_KEY);
		return v === 'full' || v === 'lite' ? v : 'auto';
	} catch {
		return 'auto';
	}
}

/** Whether this tab chose "continue anyway" (sessionStorage is per tab). */
export function readContinued(session: KeyStore | null): boolean {
	try {
		return session?.getItem(CONTINUE_KEY) === '1';
	} catch {
		return false;
	}
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
	/** sessionStorage, for "continue anyway". Omitted: no session store, so a decline always shows. */
	session?: KeyStore | null;
}

/**
 * Where the GPU rank stands, so the System panel can say why there is no rank instead of hiding the row:
 * `pending` (not answered yet), `ranked` (detect-gpu gave a tier), `unknown` (it answered without one: a chip newer than its
 * tables, a Mac's masked "Apple GPU", Save-Data, or a failure), `none` (no WebGL, so there is nothing to rank).
 */
export type GpuRankStatus = 'pending' | 'ranked' | 'unknown' | 'none';

export interface TierState {
	profile: Profile;
	signals: DeviceSignals;
	tier: Tier;
	pinned: Tier | null;
	gpuRank: GpuRankStatus;
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

/** What `apply` needs to know besides the signals: where in the visit it is, and what the page showed before. */
interface ApplyMode {
	/** A measurement that can decline (the CPU score, the GPU rank) has not answered yet. */
	pending: boolean;
	/** The tier the previous visit saved. */
	saved: Tier | null;
	/** The CPU probe could not run, so this visit has no CPU evidence of its own. */
	noCpuEvidence: boolean;
	/** The tier this visit showed before this apply; null on the first. */
	shownBefore: Tier | null;
	/** Where the GPU rank stands (carried onto the state for the System panel). */
	gpuRank: GpuRankStatus;
}

/**
 * Apply the tier. Four rules on top of classify() (decision note §3.3 and §6.1, and the independent reviews):
 *   - PENDING: until the CPU score and the GPU rank have both answered, the page shows the lower of the saved and the signal
 *     tier, and saves nothing, so a device LITE (or declined) only by a measurement never flashes or saves FULL meanwhile.
 *     A missing feature is a fact, not a guess awaiting a probe, so a feature decline is saved at once.
 *   - NO CPU EVIDENCE: a probe that could not run keeps a saved LITE, but never a saved decline, which the signals alone
 *     must support or it lifts. (A stale decline otherwise stayed up for good under Save-Data.)
 *   - HELD DECLINE: a decline first found once the page is in use does not cover live work. This visit holds at LITE, and
 *     the decline is saved, so the next visit declines from its first paint.
 *   - CONTINUED: "continue anyway" runs this tab as LITE and saves the decline; once the browser is no longer declined, the
 *     flag is cleared, which takes the Lite banner down (device-gate.ts).
 * A person's explicit Full or Lite is never lowered to a saved tier: it is not a guess.
 */
function apply(deps: TierDeps, signals: DeviceSignals, pinned: Tier | null, mode: ApplyMode): TierState {
	const override = readTierOverride(deps.store);
	const continued = readContinued(deps.session ?? null);
	const profile = classify(signals, { override, continueAnyway: continued });
	let { tier, save } = decide(profile, pinned, continued);
	let held = false;
	if (!pinned) {
		if (mode.pending) {
			const floor = continued && mode.saved === 'unsupported' ? 'lite' : mode.saved;
			if (floor && override === 'auto') tier = lowerTier(tier, floor);
			save = profile.reasons.some((r) => r.kind === 'feature');
		} else {
			if (mode.noCpuEvidence) {
				const floor = mode.saved === 'unsupported' ? 'lite' : mode.saved;
				if (floor && override === 'auto') tier = lowerTier(tier, floor);
			}
			held = tier === 'unsupported' && mode.shownBefore !== null && mode.shownBefore !== 'unsupported';
			if (held) tier = 'lite';
			if (continued && profile.detected !== 'unsupported') {
				try {
					(deps.session as Storage | null | undefined)?.removeItem?.(CONTINUE_KEY);
				} catch {}
			}
		}
	}
	deps.win.document.documentElement.setAttribute('data-device-tier', tier);
	if (save && deps.store) {
		try {
			// A continued or held decline is saved as the decline, so the NEXT visit declines from its first paint; this one
			// stays LITE (a continued tab because its session flag says so: device-gate.ts reads the same flag pre-paint).
			deps.store.setItem(TIER_KEY, profile.detected === 'unsupported' && (continued || held) ? 'unsupported' : tier);
		} catch {}
	}
	state = { profile, signals, tier, pinned, gpuRank: mode.gpuRank };
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
 * probe (`settled` waits for all three). See `apply` for the rules; in short, a measurement lowers the tier and never raises
 * it, except that the interim (saved) tier gives way once the CPU score and the GPU rank have answered. A drop from FULL to
 * LITE after the first paint calls `onDrop` (the toast).
 */
export function startDeviceTier(deps: TierDeps): { state: TierState; probed: Promise<TierState>; settled: Promise<TierState> } {
	const pinned = pinnedTier(deps.win.location.search);
	let signals = readSignals(browserEnv(deps.win));
	const cached = deps.store ? readCachedCpu(deps.store, deps.now()) : null;
	if (cached !== null) signals.cpuScore = cached;
	let cpuPending = cached === null;
	let gpuPending = !!deps.gpu && signals.renderer !== null;
	let noCpuEvidence = false;
	let gpuRank: GpuRankStatus = signals.renderer === null ? 'none' : gpuPending ? 'pending' : 'unknown';
	const saved = readSavedTier(deps.store);
	const reapply = (silent = false): TierState => {
		const before = state?.tier ?? null;
		const next = apply(deps, signals, pinned, { pending: cpuPending || gpuPending, saved, noCpuEvidence, shownBefore: before, gpuRank });
		if (!silent && before === 'full' && next.tier === 'lite' && !pinned) {
			try {
				deps.onDrop?.(next);
			} catch {}
		}
		return next;
	};
	state = null;
	rerun = () => reapply(true);
	const first = reapply();
	const probed = cpuPending
		? deps
				.probe()
				.then((score) => {
					cpuPending = false;
					// A probe that cannot run brings no CPU evidence: the saved LITE stands (see `apply`), a saved decline does not.
					if (score === null) noCpuEvidence = true;
					else {
						if (deps.store) writeCachedCpu(deps.store, score, deps.now());
						signals = { ...signals, cpuScore: score };
					}
					return reapply();
				})
				.catch(() => {
					cpuPending = false;
					noCpuEvidence = true;
					return reapply();
				})
		: Promise.resolve(first);
	const ranked = gpuPending
		? (deps.gpu as NonNullable<TierDeps['gpu']>)(signals.renderer)
				.catch(() => null)
				.then((tier) => {
					gpuPending = false;
					gpuRank = tier === null ? 'unknown' : 'ranked';
					if (tier !== null) signals = { ...signals, gpuTier: tier };
					reapply();
				})
		: Promise.resolve();
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

let rerun: (() => TierState) | null = null;
let started: { state: TierState; probed: Promise<TierState>; settled: Promise<TierState> } | null = null;

/**
 * Start the tier once per page, whoever asks first: the Studio's warm-up, the Playground's gate, or the decline screen when
 * a saved decline paints before either. Later calls get the same run.
 */
export function ensureDeviceTier(win: Window & typeof globalThis = window): { state: TierState; probed: Promise<TierState>; settled: Promise<TierState> } {
	started ??= startDeviceTier(browserTierDeps(win));
	return started;
}

/**
 * The person's Auto / Full / Lite choice: stored, then applied at once with the signals already measured. It picks FULL
 * or LITE but never lifts a decline (classify's rule). Applied silently: they chose it, so there is no toast.
 */
export function setTierOverride(store: KeyStore | null, choice: TierOverride): TierState | null {
	try {
		store?.setItem(OVERRIDE_KEY, choice);
	} catch {}
	return rerun ? rerun() : null;
}

/** "Continue anyway": this tab runs as LITE from now on. Returns the applied state. */
export function continueAnyway(session: KeyStore | null): TierState | null {
	try {
		session?.setItem(CONTINUE_KEY, '1');
	} catch {}
	return rerun ? rerun() : null;
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
	let session: KeyStore | null = null;
	try {
		session = win.sessionStorage;
		session.getItem(CONTINUE_KEY);
	} catch {
		session = null;
	}
	return {
		win,
		store,
		session,
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
