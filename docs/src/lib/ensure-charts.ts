// CHART KERNELS ON DEMAND (engineering/decisions/2026-10-14-engine-spine.md §3.2).
//
// The ESM engine ships with no chart kernels: 24 of them are 178KB gz, and a deck uses a few. Each is
// its own module beside the engine (`esm/chart-<layout>.js`); importing it registers the kernel. The
// engine's render is synchronous, so the kernels a deck needs are loaded ABOVE it, in renderMarkdown,
// the way KaTeX and the fence grammars are.
//
// A failure is never quiet. The browser caches a failed `import()` for the page's lifetime, so a tab
// that outlived a deploy (each deploy replaces `/playground/v/<hash>/`) cannot get the kernel back, and
// drawing the chart as its source list would be a confident wrong answer. So a failed load throws a
// ChunkLoadError, which the hosts already turn into "part of the app didn't load" with a reload offer.

import { chunkLoadMessage } from './chunk-load';
import { engineBase } from './engine-base';

const loads = new Map<string, Promise<void>>();
let chunkList: Promise<Record<string, string[]>> | null = null;

/** esm/chunks.json: each entry's static chunks, so all of them start downloading at once. */
function chunksFor(base: string): Promise<Record<string, string[]>> {
	if (!chunkList) {
		chunkList = fetch(`${base}esm/chunks.json`)
			.then((r) => (r.ok ? r.json() : { entries: {} }))
			.then((j: { entries?: Record<string, string[]> }) => j.entries ?? {})
			.catch(() => ({}));
	}
	return chunkList;
}

/** Hint every static chunk of `entry` at once, so the module graph is not discovered one level per round trip. */
export async function preloadEntry(base: string, entry: string): Promise<void> {
	if (typeof document === 'undefined') return;
	const chunks = (await chunksFor(base))[entry] ?? [];
	for (const file of chunks) {
		const href = `${base}esm/${file}`;
		if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = href;
		document.head.appendChild(link);
	}
}

function chunkLoadError(cause: unknown): Error {
	const err = new Error(chunkLoadMessage(), { cause });
	err.name = 'ChunkLoadError';
	return err;
}

/**
 * Load the kernels for these chart layouts. Resolves at once for none (every deck without a chart,
 * and every page on the single-file engine, which carries them all). Rejects with a ChunkLoadError
 * when one will not load.
 */
export function ensureCharts(layouts: readonly string[]): Promise<void> {
	if (!layouts.length) return Promise.resolve();
	const base = engineBase();
	if (!base) return Promise.reject(chunkLoadError(new Error('the engine has not loaded')));
	return Promise.all(
		layouts.map((layout) => {
			let p = loads.get(layout);
			if (!p) {
				const entry = `chart-${layout}.js`;
				void preloadEntry(base, entry);
				p = import(/* @vite-ignore */ `${base}esm/${entry}`).then(
					() => undefined,
					(e) => {
						throw chunkLoadError(e);
					},
				);
				loads.set(layout, p);
			}
			return p;
		}),
	).then(() => undefined);
}

/** For tests. */
export function resetChartLoads(): void {
	loads.clear();
	chunkList = null;
}
