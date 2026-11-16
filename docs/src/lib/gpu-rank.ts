// The GPU rank: detect-gpu (pmndrs, MIT) looks the WebGL renderer string up in a table of measured frame rates and returns
// tier 0 to 3 (engineering/decisions/2026-11-12-device-capability-tiers.md §3.1). It ranks real GPUs, an old integrated
// chip against a discrete card, which our own software-renderer test cannot.
//
// SELF-HOSTED. The library fetches its tables from unpkg by default, and the app has no CDN dependency. `loadBenchmarks`
// replaces that fetch: the tables ship with the site as hashed assets (`gpu-rank-tables.ts`), and only the one table the
// renderer's vendor needs is fetched, after first paint, from our own origin.
//
// What the result means here (classify() in device-profile.ts reads `gpuTier`):
//   BENCHMARK, BLOCKLISTED  -> the tier (a blocklisted chip is tier 0)
//   FALLBACK                -> null: a GPU the tables do not know (they were last published 2025-02), and unknown never
//                              lowers the tier
//   WEBGL_UNSUPPORTED, SSR  -> null: no WebGL is already its own weak signal (`renderer === null`)
//
// Every dependency is passed in, so a test hands it a stub library and a stub table loader and never fetches (HARD RULE #32, F6).

export interface GpuTierResult {
	tier: number;
	type: string;
}

export interface GpuRankDeps {
	/** An iPhone or iPad. Only there can detect-gpu tell masked Apple chips apart (its Apple tables are for mobile). */
	appleMobile?: boolean;
	getGPUTier: (opts: { override?: { renderer?: string; loadBenchmarks?: (file: string) => Promise<unknown> } }) => Promise<GpuTierResult>;
	loadBenchmarks: (file: string) => Promise<unknown>;
}

/**
 * Safari reports every Apple GPU as "Apple GPU". On an iPhone or iPad detect-gpu tells the models apart by drawing with its
 * own WebGL context, which it only does when no renderer is passed; for every other renderer we pass the string we already
 * read, so it makes no second context.
 */
function needsOwnContext(renderer: string): boolean {
	return /^apple gpu$/i.test(renderer.trim());
}

/** The detect-gpu tier for this renderer, or null when it cannot rank it. Never throws. */
export async function rankGpu(renderer: string | null, deps: GpuRankDeps): Promise<number | null> {
	if (renderer === null) return null;
	// On a Mac, Safari's "Apple GPU" sends detect-gpu down a path that makes a high-performance WebGL context (which may wake
	// a discrete GPU) only to answer FALLBACK (found by the independent review). Skip it: the rank is unknown either way.
	if (needsOwnContext(renderer) && !deps.appleMobile) return null;
	try {
		const override = needsOwnContext(renderer) ? { loadBenchmarks: deps.loadBenchmarks } : { renderer, loadBenchmarks: deps.loadBenchmarks };
		const r = await deps.getGPUTier({ override });
		if (r.type !== 'BENCHMARK' && r.type !== 'BLOCKLISTED') return null;
		return Number.isInteger(r.tier) && r.tier >= 0 && r.tier <= 3 ? r.tier : null;
	} catch {
		return null;
	}
}
