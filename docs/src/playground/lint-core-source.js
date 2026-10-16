// WHERE THE LINT CORE COMES FROM, in the browser: `esm/lint.js`, an entry of the ESM engine build
// beside `esm/engine.js` (engineering/decisions/2026-10-14-engine-spine.md §10). Loaded from the
// same versioned directory as the engine, so every chunk the two have in common (markdown-it, the
// lib/core readers) is one module the page has already fetched and parsed, not a second copy.
//
// The lint core keeps its OWN boundary parser inside that build (tools/build-playground.js
// `lintEntryPlugin`), so narrowing it to the deck's plugin admission never touches the engine's.
//
// vitest swaps this file for lint-core-source.vitest.js (docs/vitest.config.ts), which loads the
// authoring-core.generated.js (built on install, not committed): the same entry, built for Node.

import { chunkLoadMessage } from '@/lib/chunk-load';
import { engineBase, sameOriginAsset } from '@/lib/engine-base';
import { preloadEntry } from '@/lib/ensure-charts';

/* global __LATTICE_ASSET_BASE__ */

/** The lint core's module namespace. Rejects with a ChunkLoadError when it will not load. */
export async function loadLintCore() {
	// The engine's own directory once the page has loaded it; the build's asset directory before
	// then (a surface can reach the lint before the engine). Both name the same files.
	const base = engineBase() ?? __LATTICE_ASSET_BASE__;
	const url = sameOriginAsset(base, 'esm/lint.js');
	try {
		if (!url) throw new Error(`the lint core is not an asset of this page: ${base}esm/lint.js`);
		void preloadEntry(base, 'lint.js');
		return await import(/* @vite-ignore */ url.href);
	} catch (cause) {
		const err = new Error(chunkLoadMessage(), { cause });
		err.name = 'ChunkLoadError';
		throw err;
	}
}
