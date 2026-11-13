// The device profile: ONE place that reads the machine and sorts it into a tier.
//
//   FULL         today's app, unchanged
//   LITE         every feature works; GPU-heavy visuals and resource-hungry defaults are swapped
//   UNSUPPORTED  a decline screen that names the failed check, with "continue anyway" (runs LITE)
//
// Design and the owner's thresholds: engineering/decisions/2026-11-12-device-capability-tiers.md.
// Nothing else in the app reads `deviceMemory`, the WebGL renderer string or the CPU probe; it asks
// this module. The split is the same as prefetch-engine.ts: `classify` is a PURE function of the
// signals (unit-tested over a table, no browser), and `readSignals` is the only part that touches the
// browser — and even it takes the browser as an argument, so a test hands it a fake (HARD RULE #32:
// a test never reads the runner's cores, memory or GPU).

export type Tier = 'full' | 'lite' | 'unsupported';
export type TierOverride = 'auto' | Tier;

/** A feature the app cannot run without. Each is on the list because something breaks without it. */
export type RequiredFeature = 'worker' | 'indexedDB' | 'cssHas' | 'containerQueries' | 'structuredClone';

export const REQUIRED_FEATURES: readonly RequiredFeature[] = ['worker', 'indexedDB', 'cssHas', 'containerQueries', 'structuredClone'];

/** What a person reads when the feature is missing. */
export const FEATURE_LABEL: Record<RequiredFeature, string> = {
	worker: 'Web Workers',
	indexedDB: 'IndexedDB storage',
	cssHas: 'CSS :has()',
	containerQueries: 'CSS container queries',
	structuredClone: 'structuredClone()',
};

export interface DeviceSignals {
	/** Required features, true when present. */
	features: Record<RequiredFeature, boolean>;
	/** WebGL unmasked renderer string; `null` when WebGL is unavailable. */
	renderer: string | null;
	/** detect-gpu tier 0–3, or `null` before it has loaded or when it could not run. */
	gpuTier: number | null;
	/** `navigator.deviceMemory` in GB; `null` when the browser does not report it (Safari, Firefox). */
	memoryGB: number | null;
	/** `navigator.hardwareConcurrency`; `null` when absent or known to be clamped (Safari). */
	cores: number | null;
	/** Median units the CPU probe ran per window; `null` until it has run. */
	cpuScore: number | null;
	/** The boot probe saw the main thread fall behind (sustained long tasks). */
	bootProbeSlow: boolean;
}

export type ReasonKind = 'feature' | 'floor' | 'weak';

export interface Reason {
	/** Stable id, for tests and the System panel. */
	code: string;
	kind: ReasonKind;
	/** Plain words for the person reading the panel or the decline screen. */
	text: string;
}

export interface Profile {
	tier: Tier;
	/** The tier the signals alone produce, before an override or "continue anyway". */
	detected: Tier;
	reasons: Reason[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────
// LITE triggers are the owner's (2026-11-12, decision note §7.4). The FLOOR column is the proposal in
// §3.1, open for the owner to change on the PR. The CPU cut-offs are PROVISIONAL: they come from one
// machine (the cloud sandbox: 178 units unthrottled, 24 at 4x CDP throttling) and are recalibrated
// against the macOS and Windows runners before they decline anyone.
export const LITE_MEMORY_GB = 4;
export const FLOOR_MEMORY_GB = 1;
export const LITE_CORES = 4;
export const FLOOR_CORES = 2;
export const LITE_GPU_TIER = 1;
export const FLOOR_GPU_TIER = 0;
export const LITE_CPU_SCORE = 60;
export const FLOOR_CPU_SCORE = 20;
/** Two FLOOR signals must agree before hardware declines (§3: one guess never turns a user away). */
export const FLOOR_SIGNALS_TO_DECLINE = 2;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|microsoft basic render|software rasterizer|mesa offscreen/i;

/**
 * A renderer string short enough to read in a panel: the software rasterizer's own name, or ANGLE's
 * device field without the driver noise. The full string stays in the copied report.
 */
export function shortRenderer(renderer: string): string {
	const sw = renderer.match(SOFTWARE_RENDERER);
	if (sw) return { swiftshader: 'SwiftShader', llvmpipe: 'llvmpipe', softpipe: 'softpipe' }[sw[0].toLowerCase()] ?? sw[0];
	const angle = renderer.match(/^ANGLE \([^,]+,\s*(.+?)(?:\s+Direct3D|\s+\(0x|,|\)$)/);
	const name = (angle ? angle[1] : renderer).replace(/^ANGLE Metal Renderer:\s*/, '').trim();
	return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

/** True when the WebGL renderer string names a software rasterizer, i.e. there is no real GPU. */
export function isSoftwareRenderer(renderer: string | null): boolean {
	return renderer !== null && SOFTWARE_RENDERER.test(renderer);
}

/**
 * The tier, as a PURE function of the signals and the person's choices. Rules (decision note §3):
 *   - a missing required feature declines on its own;
 *   - hardware declines only when FLOOR_SIGNALS_TO_DECLINE floor signals agree;
 *   - any one weak signal makes LITE;
 *   - an absent signal (null) is unknown, and unknown never lowers the tier;
 *   - an override picks FULL or LITE but never lifts a decline; "continue anyway" turns a decline into LITE.
 */
export function classify(signals: DeviceSignals, opts: { override?: TierOverride; continueAnyway?: boolean } = {}): Profile {
	const reasons: Reason[] = [];

	for (const f of REQUIRED_FEATURES) {
		if (!signals.features[f]) reasons.push({ code: `feature:${f}`, kind: 'feature', text: `This browser doesn't support ${FEATURE_LABEL[f]}.` });
	}

	const hw = (code: string, floor: boolean, weak: boolean, floorText: string, weakText: string) => {
		if (floor) reasons.push({ code: `floor:${code}`, kind: 'floor', text: floorText });
		else if (weak) reasons.push({ code: `weak:${code}`, kind: 'weak', text: weakText });
	};

	const { renderer, gpuTier, memoryGB, cores, cpuScore } = signals;
	hw(
		'gpu',
		renderer === null || (gpuTier !== null && gpuTier <= FLOOR_GPU_TIER),
		isSoftwareRenderer(renderer) || (gpuTier !== null && gpuTier <= LITE_GPU_TIER),
		renderer === null ? 'This browser has no WebGL, so it has no usable graphics.' : 'The graphics chip is too slow for Lattice.',
		isSoftwareRenderer(renderer) ? `The browser draws in software (${shortRenderer(renderer ?? '')}), with no graphics chip.` : 'The graphics chip is slow.',
	);
	if (memoryGB !== null) hw('memory', memoryGB <= FLOOR_MEMORY_GB, memoryGB <= LITE_MEMORY_GB, `This device reports ${memoryGB} GB of memory.`, `This device reports ${memoryGB} GB of memory.`);
	if (cores !== null) hw('cores', cores <= FLOOR_CORES, cores <= LITE_CORES, `This device reports ${cores} CPU cores.`, `This device reports ${cores} CPU cores.`);
	if (cpuScore !== null) hw('cpu', cpuScore < FLOOR_CPU_SCORE, cpuScore < LITE_CPU_SCORE, 'A quick speed test found this browser very slow.', 'A quick speed test found this browser slow.');
	if (signals.bootProbeSlow) reasons.push({ code: 'weak:boot', kind: 'weak', text: 'Lattice fell behind while starting up.' });

	const missing = reasons.some((r) => r.kind === 'feature');
	const floors = reasons.filter((r) => r.kind === 'floor').length;
	const detected: Tier = missing || floors >= FLOOR_SIGNALS_TO_DECLINE ? 'unsupported' : reasons.length > 0 ? 'lite' : 'full';

	let tier: Tier = detected;
	if (detected === 'unsupported') {
		if (opts.continueAnyway) tier = 'lite';
	} else if (opts.override === 'full' || opts.override === 'lite') {
		tier = opts.override;
	}
	return { tier, detected, reasons };
}

// ── Pinning ───────────────────────────────────────────────────────────────────
// `?tier=full|lite|unsupported` pins the tier for this page load. Tests depend on it: the CI browser is
// software-rendered and would otherwise land in LITE by accident (decision note §2).

/** The pinned tier from a URL query string, or `null` when none (or an unknown value) is given. */
export function pinnedTier(search: string): Tier | null {
	const v = new URLSearchParams(search).get('tier');
	return v === 'full' || v === 'lite' || v === 'unsupported' ? v : null;
}

// ── The CPU probe ─────────────────────────────────────────────────────────────
// A fixed unit of the work Lattice does (typed-array math, a JSON round trip, string building), counted
// in short windows; the median is the score. Counted WORK, so a test drives it with a fake clock and
// asserts the count, never a duration (HARD RULE #32, F1).

export function probeUnit(): number {
	const a = new Float64Array(2000);
	for (let i = 0; i < a.length; i++) a[i] = Math.sqrt(i) * Math.sin(i);
	const o = JSON.parse(JSON.stringify({ a: Array.from(a.subarray(0, 200)) })) as { a: number[] };
	let s = '';
	for (let i = 0; i < 200; i++) s += o.a[i].toFixed(2);
	return s.length;
}

export interface ProbeOptions {
	/** A clock in milliseconds. In the app, `performance.now`; in a test, a fake. */
	now: () => number;
	/** The work counted. Defaults to `probeUnit`. */
	unit?: () => unknown;
	windows?: number;
	windowMs?: number;
}

/** Units of work per window, for each window, and the median (the first window runs cold, so not the mean). */
export function runCpuProbe({ now, unit = probeUnit, windows = 7, windowMs = 20 }: ProbeOptions): { counts: number[]; score: number } {
	const counts: number[] = [];
	for (let w = 0; w < windows; w++) {
		const t0 = now();
		let n = 0;
		while (now() - t0 < windowMs) {
			unit();
			n++;
		}
		counts.push(n);
	}
	const sorted = [...counts].sort((x, y) => x - y);
	return { counts, score: sorted[Math.floor(sorted.length / 2)] };
}

// ── Reading the browser ───────────────────────────────────────────────────────

/** The slice of the browser `readSignals` reads. The real one is `window`; a test passes a fake. */
export interface BrowserEnv {
	navigator: { deviceMemory?: number; hardwareConcurrency?: number; userAgent?: string };
	supports: (condition: string) => boolean;
	has: (global: 'Worker' | 'indexedDB' | 'structuredClone') => boolean;
	/** The WebGL renderer string, or `null` when no WebGL context can be made. */
	webglRenderer: () => string | null;
}

/** Safari clamps `hardwareConcurrency` for privacy, so its number is not evidence of a weak CPU. */
function isSafari(ua: string | undefined): boolean {
	return !!ua && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
}

/** The synchronous signals: features, GPU, memory, cores. The CPU probe and detect-gpu fill in later. */
export function readSignals(env: BrowserEnv): DeviceSignals {
	const memory = env.navigator.deviceMemory;
	const cores = env.navigator.hardwareConcurrency;
	return {
		features: {
			worker: env.has('Worker'),
			indexedDB: env.has('indexedDB'),
			cssHas: env.supports('selector(:has(a))'),
			containerQueries: env.supports('container-type: inline-size'),
			structuredClone: env.has('structuredClone'),
		},
		renderer: env.webglRenderer(),
		gpuTier: null,
		memoryGB: typeof memory === 'number' && memory > 0 ? memory : null,
		cores: typeof cores === 'number' && cores > 0 && !isSafari(env.navigator.userAgent) ? cores : null,
		cpuScore: null,
		bootProbeSlow: false,
	};
}

/** The real browser as a `BrowserEnv`. Only called in the app, never from a unit test. */
export function browserEnv(win: Window & typeof globalThis): BrowserEnv {
	return {
		navigator: win.navigator as BrowserEnv['navigator'],
		supports: (c) => {
			try {
				return !!win.CSS?.supports(c);
			} catch {
				return false;
			}
		},
		has: (g) => typeof (win as unknown as Record<string, unknown>)[g] !== 'undefined',
		webglRenderer: () => {
			try {
				const gl = win.document.createElement('canvas').getContext('webgl');
				if (!gl) return null;
				const ext = gl.getExtension('WEBGL_debug_renderer_info');
				const r = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
				gl.getExtension('WEBGL_lose_context')?.loseContext();
				return typeof r === 'string' ? r : '';
			} catch {
				return null;
			}
		},
	};
}
