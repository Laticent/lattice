// The capabilities the Studio injects into `assemblePlayer` (lib/export/player-core.mjs), the
// browser twin of lib/export/html-player.js's Node caps. Their own module so the host-parity test
// (test/integration/export/player-host-parity.test.js) bundles and drives exactly what the Webpage
// export runs, rather than a copy of it (decisions/2026-10-16-player-as-library-audit.md §11).

import { encodeJpegInPage } from '../../../../lib/core/image-recode.mjs';

/** The injected capabilities `assemblePlayer` needs, backed by browser APIs. */
export type PlayerCaps = {
	parseHtml: (html: string) => Document;
	sanitize: (html: string) => string;
	sha256: (s: string) => Promise<string>;
	inlineAssets: (html: string) => { html: string; count: number; missing: string[] };
	katexCss?: () => string | null;
	subsetFonts?: (html: string, fonts?: { text: string; emoji: string }) => Promise<{ html: string; applied: boolean; saved: number }>;
	encodeImage?: (bytes: Uint8Array, mime: string, plan: { width: number; height: number; quality: number; checkAlpha: boolean }) => Promise<Uint8Array | null>;
};

/**
 * The browser `sha256` capability: UTF-8 bytes → SHA-256 → base64, matching the
 * Node adapter's `crypto.createHash('sha256').update(s,'utf8').digest('base64')`
 * exactly (the value goes into the CSP `script-src 'sha256-…'`, so the encoding
 * must be identical or the hashed player script is refused).
 */
export async function sha256Base64(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	const bytes = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
	}
	return btoa(bin);
}

/**
 * Build the caps. `media` is the tally of the pictures the export embedded before assembly: the
 * core's `inlineAssets` is synchronous and the browser's fetch is not, so the embedding happens
 * up front and this only reports it.
 */
export function browserPlayerCaps(p: {
	sanitize: (html: string) => string;
	media?: { count: number; missing: string[] };
	katexCss?: () => string | null;
	subsetFonts?: PlayerCaps['subsetFonts'];
}): PlayerCaps {
	const media = p.media ?? { count: 0, missing: [] };
	return {
		parseHtml: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
		sanitize: p.sanitize,
		sha256: sha256Base64,
		inlineAssets: (html: string) => ({ html, count: media.count, missing: media.missing }),
		katexCss: p.katexCss ?? (() => null),
		// The shared image policy's encoder: this tab's canvas, the same function the CLI runs in its Chrome.
		encodeImage: encodeJpegInPage,
		...(p.subsetFonts ? { subsetFonts: p.subsetFonts } : {}),
	};
}
