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
import { engineBase, SAFE_CHUNK, sameOriginAsset } from './engine-base';

const loads = new Map<string, Promise<void>>();
const CALLOUT_ENTRY = 'callout-place.js';
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

const preloaded = new Set<string>();

/**
 * Hint every static chunk of `entry` at once, so the module graph is not discovered one level per
 * round trip. Each address is resolved as a URL and must stay on this page's origin, and each name
 * must be a plain chunk file name, so nothing read from the page or from chunks.json can steer it.
 */
export async function preloadEntry(base: string, entry: string): Promise<void> {
	if (typeof document === 'undefined') return;
	const chunks = (await chunksFor(base))[entry] ?? [];
	for (const file of chunks) {
		const url = sameOriginAsset(base, `esm/${file}`);
		if (!url || !SAFE_CHUNK.test(file) || preloaded.has(url.href)) continue;
		preloaded.add(url.href);
		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = url.href;
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
				const url = /^chart-[a-z0-9-]+\.js$/.test(entry) ? sameOriginAsset(base, `esm/${entry}`) : null;
				p = (url ? import(/* @vite-ignore */ url.href) : Promise.reject(new Error(`not an engine asset: ${entry}`))).then(
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

/**
 * Load the half of the callout layer that draws a note, for a deck that writes one. Every chart kernel
 * reads callouts through it, and none carries it (it is `legend-svg.js` and the lane and marker code),
 * so a deck with no `@callout` never downloads it. Resolves at once when the engine says nothing is
 * needed. Rejects with a ChunkLoadError: a chart drawn without the callouts its author wrote is a
 * confident wrong answer, the same as a chart drawn as its source list.
 */
export function ensureCalloutLayer(needed: boolean): Promise<void> {
	if (!needed) return Promise.resolve();
	const base = engineBase();
	if (!base) return Promise.reject(chunkLoadError(new Error('the engine has not loaded')));
	let p = loads.get(CALLOUT_ENTRY);
	if (!p) {
		void preloadEntry(base, CALLOUT_ENTRY);
		const url = sameOriginAsset(base, `esm/${CALLOUT_ENTRY}`);
		p = (url ? import(/* @vite-ignore */ url.href) : Promise.reject(new Error(`not an engine asset: ${CALLOUT_ENTRY}`))).then(
			() => undefined,
			(e) => {
				loads.delete(CALLOUT_ENTRY);
				throw chunkLoadError(e);
			},
		);
		loads.set(CALLOUT_ENTRY, p);
	}
	return p;
}

/** For tests. */
export function resetChartLoads(): void {
	loads.clear();
	preloaded.clear();
	chunkList = null;
}
