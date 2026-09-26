// How many images a deck loads from the WEB, and from which sites (portable-packages trio
// follow-up 11). The owner's rule: a deck's web images stay blocked until the reader chooses to
// load them, because each one tells its server who opened the deck and when. The preview frames
// and the exports enforce it (a placeholder and a content-security policy, through
// `lib/core/remote-ref.js` `blockWebImages`); this module counts what they left out for the
// whole deck, so the Studio can say "this deck loads 3 images from 2 sites — load them?".
//
// Counted on the ENGINE's render, not the markdown, for the reason `remote-ref.js` gives: a regex
// over the source disagreed with markdown-it about what a line means eleven different ways. The
// render is skipped outright when the source has no image-shaped web reference at all
// (web-image-hint.ts), which is nearly every deck, so the common case costs one regex test.

import { renderMarkdown } from '@/lib/render-engine';
import remoteRef from '../../../../lib/core/remote-ref.js';
import { mayReferenceWebImage } from './web-image-hint';

// The palette does not change which images a deck loads, so every scan renders with one that
// is always registered (the gallery gate's choice too).
const SCAN_THEME = 'indaco';
/** How long to wait for the engine, which the Studio loads on mount. */
const ENGINE_WAIT_MS = 15_000;

async function engine() {
	for (let waited = 0; waited <= ENGINE_WAIT_MS; waited += 100) {
		const pg = typeof window !== 'undefined' ? window.LatticePlayground : undefined;
		if (pg) return pg;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('the render engine did not load');
}

export type WebImageSummary = {
	/** Distinct web addresses the deck loads: images, video and audio, `url()` backgrounds, diagram images. */
	count: number;
	/** Their distinct origins (`https://host`), first seen first. */
	origins: string[];
	/** How many distinct addresses each origin has. */
	byOrigin: Record<string, number>;
};

export const NO_WEB_IMAGES: WebImageSummary = Object.freeze({ count: 0, origins: [], byOrigin: {} }) as WebImageSummary;

/** Every web reference in the deck `source`. Never throws: a failed render counts nothing. */
export async function deckWebImages(source: string): Promise<WebImageSummary> {
	if (!mayReferenceWebImage(source)) return NO_WEB_IMAGES;
	try {
		const { html } = await renderMarkdown(await engine(), source, SCAN_THEME);
		// Distinct addresses, not references: a logo repeated on twenty slides is one image.
		const seen = new Map<string, string>();
		for (const b of remoteRef.blockWebImages(html, []).blocked as { url: string; origin: string }[]) if (!seen.has(b.url)) seen.set(b.url, b.origin);
		const byOrigin: Record<string, number> = {};
		for (const origin of seen.values()) byOrigin[origin] = (byOrigin[origin] ?? 0) + 1;
		return { count: seen.size, origins: [...new Set(seen.values())], byOrigin };
	} catch {
		return NO_WEB_IMAGES;
	}
}
