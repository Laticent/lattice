// The Studio's half of `asset:<name>` resolution at render time. Importing this module (the Studio
// shell does, once) registers a hook on the docs render chokepoint (lib/render-engine.ts) that hands
// the engine the name → URL map for the shared Library photos plus the open deck's own.
//
// It is a hook, not code in render-engine.ts, so the home page and the Playground — which share that
// file and have no Library — do not carry it (docs/route-budget.json). The heavy part, the registry
// and its IndexedDB read, is a dynamic import that runs only when a source names a photo, so a deck
// without one never reads the shelf.
import { type RenderOptsHook, setRenderOptsHook } from '@/lib/render-engine';

// Same grammar as lib/core/remote-ref.js `assetName`: lowercase letters and digits first.
const NAMES_AN_ASSET = /\basset:[a-z0-9]/i;

export const studioRenderOptsHook: RenderOptsHook = async (source, opts) => {
	// A caller that passes its own map (a test, another host) keeps it.
	if (opts?.assetUrls || !NAMES_AN_ASSET.test(source)) return opts;
	try {
		const { ensureAssetAlts, ensureAssetUrls } = await import('./media-urls');
		const assetUrls = await ensureAssetUrls();
		return { ...opts, assetUrls, assetAlts: await ensureAssetAlts() };
	} catch {
		// The registry or IndexedDB is unavailable: render without a map, and the reference passes
		// through untouched exactly as it does in the CLI.
		return opts;
	}
};

setRenderOptsHook(studioRenderOptsHook);
