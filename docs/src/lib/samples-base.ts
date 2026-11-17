// Where the site serves lib/samples/ — the one sample-art folder `sample:<name>` images
// resolve into (lib/core/bg-image.js resolveAssetUrl). docs/scripts/sync-playground-assets.mjs
// stages it as `samples/`, beside `themes/` under the hashed asset root, so it is derived from
// `themeBase` (which ends in `themes/`). ABSOLUTE, because the engine's WHATWG-URL resolver
// needs an absolute base; undefined when no URL can be built from it.
/** The Studio page's sample folder, from the boot data it publishes (studio.astro), or null off the Studio. One reader for every
 *  Studio surface that draws a `sample:` picture outside the engine (Compose's image node, the photo-ink read). */
export function studioSamplesBase(): string | null {
	try {
		const boot = JSON.parse(document.querySelector('script[data-studio-boot]')?.textContent ?? 'null') as { themeBase?: string } | null;
		return boot?.themeBase ? (samplesBaseFor(boot.themeBase) ?? null) : null;
	} catch {
		return null;
	}
}

export function samplesBaseFor(themeBase: string): string | undefined {
	try {
		return new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href;
	} catch {
		return undefined;
	}
}
