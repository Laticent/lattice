// lib/core/slide-camera.mjs's three CSS url readers as they were at 9dc7f3e, before followups.d/3024 moved the camera onto
// `cssRefSpans`. Frozen, verbatim (only exported). test/unit/core/slide-camera-css-differential.test.js reads it as the oracle;
// nothing in lib/ may. Do not fix bugs here.

// A relative `url(...)` has no base inside a data: SVG document, so every one is made absolute against the page first.
const REL_URL = /url\(\s*(["']?)(?![a-z][a-z0-9+.-]*:|#)([^)"']+?)\1\s*\)/gi;
export function absolutizeCssUrls(text, base) {
	if (!text.includes('url(')) return text;
	return text.replace(REL_URL, (whole, _q, ref) => {
		try {
			return `url("${new URL(ref.trim(), base).href}")`;
		} catch {
			return whole;
		}
	});
}

export const CSS_URL = /url\(\s*(&quot;|&#39;|["']?)((?:file|blob|https?):[^)"']+?)\1\s*\)/gi;

/** The addresses the camera noted from a piece of CSS text (the sheet, an inline style, a `<style>`'s text). */
export function remoteCssUrls(css) {
	return [...String(css).matchAll(CSS_URL)].map((m) => m[2]);
}

/** The address inside one `url(...)` layer, or null for a gradient or `none`. */
export function layerUrl(layer) {
	const m = /^url\(\s*(["']?)(.*)\1\s*\)$/s.exec(layer);
	return m ? m[2] : null;
}
