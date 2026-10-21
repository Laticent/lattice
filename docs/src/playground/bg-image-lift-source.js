// WHERE THE MARP EXPORT'S `![bg]` LIFT COMES FROM, in the browser: `esm/bg-image-lift.js`, an entry of the ESM
// engine build (tools/build-playground.js). Every render lifts `![bg]` on the engine's own tokens; only the Marp
// bundle, which ships Markdown, rewrites the source (lib/core/bg-image-lift.js). So the line walk is its own
// load: not in the engine's byte budget (docs/route-budget.json engineJsGz), and not a CommonJS file with
// requires imported from docs/src, which the dev server cannot serve (vite-cjs-lib-dev.mjs).
//
// vitest swaps this file for bg-image-lift-source.vitest.js (docs/vitest.config.ts): the same module, from
// the source.

import { chunkLoadMessage } from '@/lib/chunk-load';
import { engineBase, sameOriginAsset } from '@/lib/engine-base';
import { preloadEntry } from '@/lib/ensure-charts';

/* global __LATTICE_ASSET_BASE__ */

/** The lift's exports, `{ liftImageBgImages }`. Rejects with a ChunkLoadError when it will not load. */
export async function loadBgImageLift() {
	const base = engineBase() ?? __LATTICE_ASSET_BASE__;
	const url = sameOriginAsset(base, 'esm/bg-image-lift.js');
	try {
		if (!url) throw new Error(`the bg-image lift is not an asset of this page: ${base}esm/bg-image-lift.js`);
		void preloadEntry(base, 'bg-image-lift.js');
		const mod = await import(/* @vite-ignore */ url.href);
		return mod.default ?? mod;
	} catch (cause) {
		const err = new Error(chunkLoadMessage(), { cause });
		err.name = 'ChunkLoadError';
		throw err;
	}
}
