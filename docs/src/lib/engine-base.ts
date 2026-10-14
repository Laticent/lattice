// WHERE THE ENGINE CAME FROM. Every engine asset (KaTeX, the fence grammars, plugin data, chart
// kernels) is staged in the same content-hashed directory, `/playground/v/<hash>/`, so a loader only
// needs that directory. This module is the one place that knows it.
//
// The loaders used to read it off the engine's `<script data-lattice-engine>` tag. The docs site now
// loads the ESM engine with `import()`, which leaves no tag, and every one of those loaders would have
// found nothing and quietly skipped its asset: math as source text, grey fences, missing icons
// (engineering/decisions/2026-10-14-engine-spine.md §6). `ensureEngine` records the URL here instead;
// the tag stays a fallback for a page that still loads the single-file bundle.

import { ENGINE_FILE } from '@/playground/engine-file.mjs';

/** The ESM engine's entry, relative to the versioned asset directory. */
export const ENGINE_ENTRY = ENGINE_FILE;
/** The single-file engine some tools and fixtures still load. */
const ENGINE_IIFE = 'lattice-playground.js';

let recorded: string | null = null;

/** The asset directory for an engine URL (ESM or single-file), or null when it is neither. */
export function engineBaseFor(engineUrl: string): string | null {
	for (const file of [ENGINE_ENTRY, ENGINE_IIFE]) {
		const at = engineUrl.lastIndexOf(file);
		if (at !== -1 && at + file.length === engineUrl.split(/[?#]/)[0].length) return engineUrl.slice(0, at);
	}
	return null;
}

/** Record the engine URL a page is loading. Called by `ensureEngine`. */
export function recordEngineUrl(engineUrl: string): void {
	recorded = engineBaseFor(engineUrl) ?? recorded;
}

/** The asset directory of the engine this page loaded, or null before one is loaded. */
export function engineBase(): string | null {
	if (recorded) return recorded;
	if (typeof document === 'undefined') return null;
	const src = document.querySelector<HTMLScriptElement>('script[data-lattice-engine]')?.getAttribute('src');
	return src ? engineBaseFor(src) : null;
}

/** For tests: forget the recorded URL. */
export function resetEngineBase(): void {
	recorded = null;
}
