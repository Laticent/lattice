// detect-gpu's benchmark tables, served from OUR origin (engineering/decisions/2026-11-12-device-capability-tiers.md §3.1).
//
// `import.meta.glob` with `?url` makes Vite copy each table into the build as a hashed asset and gives back a loader per
// file that resolves its URL. Nothing is fetched until detect-gpu asks for one table (`d-nvidia.json` and so on), after
// first paint, and only that one. The library's own default is unpkg, which the app does not depend on.
//
// Kept apart from gpu-rank.ts so the unit tests of the ranking never import a Vite-only glob.

const TABLES = import.meta.glob<string>('../../node_modules/detect-gpu/dist/benchmarks/*.json', { query: '?url', import: 'default' });

/** detect-gpu's `loadBenchmarks`: the table named `file`, parsed, from our own origin. */
export async function loadGpuTable(file: string): Promise<unknown> {
	const key = Object.keys(TABLES).find((k) => k.endsWith(`/${file}`));
	if (!key) throw new Error(`no detect-gpu table named ${file}`);
	const url = await TABLES[key]();
	const res = await fetch(url);
	if (!res.ok) throw new Error(`detect-gpu table ${file}: HTTP ${res.status}`);
	// Each table starts with its format version ("5"); detect-gpu's own loader drops it, so this one does too.
	const rows = (await res.json()) as unknown[];
	if (typeof rows[0] === 'string') rows.shift();
	return rows;
}

/** The real dependencies for rankGpu: the library itself, loaded lazily, and the self-hosted tables. */
export async function browserGpuRankDeps(nav: Navigator = navigator) {
	const { getGPUTier } = await import('detect-gpu');
	// iPadOS reports a Mac user agent; a touch screen tells it apart.
	const appleMobile = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
	return { getGPUTier: getGPUTier as unknown as import('./gpu-rank').GpuRankDeps['getGPUTier'], loadBenchmarks: loadGpuTable, appleMobile };
}
