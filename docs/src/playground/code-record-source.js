// WHERE THE CODE RECORD'S WRITER COMES FROM, in the browser: `esm/code-record.js`, an entry of the ESM
// engine build beside `esm/lint.js` (tools/build-playground.js). Only the Studio's code-block options
// panel writes a record, so the writer is its own load rather than part of the lint core, which has a
// size ceiling (docs/route-budget.json lintCoreGz). Loaded from the engine's versioned directory, so the
// reader it shares with the lint core (lib/plugins/code/shared/record.js) is one module, not a copy.
//
// vitest swaps this file for code-record-source.vitest.js (docs/vitest.config.ts): the same module, from
// the source.

import { chunkLoadMessage } from '@/lib/chunk-load';
import { engineBase, sameOriginAsset } from '@/lib/engine-base';
import { preloadEntry } from '@/lib/ensure-charts';

/* global __LATTICE_ASSET_BASE__ */

/** The writer's exports, `{ editRecord, fieldProblem }`. Rejects with a ChunkLoadError when it will not load. */
export async function loadCodeRecordWriter() {
	const base = engineBase() ?? __LATTICE_ASSET_BASE__;
	const url = sameOriginAsset(base, 'esm/code-record.js');
	try {
		if (!url) throw new Error(`the code record writer is not an asset of this page: ${base}esm/code-record.js`);
		void preloadEntry(base, 'code-record.js');
		const mod = await import(/* @vite-ignore */ url.href);
		return mod.default ?? mod;
	} catch (cause) {
		const err = new Error(chunkLoadMessage(), { cause });
		err.name = 'ChunkLoadError';
		throw err;
	}
}
