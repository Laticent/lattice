// Where the site serves lib/samples/ — the one sample-art folder `sample:<name>` images
// resolve into (lib/core/bg-image.js resolveAssetUrl). docs/scripts/sync-playground-assets.mjs
// stages it as `samples/`, beside `themes/` under the hashed asset root, so it is derived from
// `themeBase` (which ends in `themes/`). ABSOLUTE, because the engine's WHATWG-URL resolver
// needs an absolute base; undefined when no URL can be built from it.
export function samplesBaseFor(themeBase: string): string | undefined {
	try {
		return new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href;
	} catch {
		return undefined;
	}
}
