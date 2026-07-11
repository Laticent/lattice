// Live narration from the component-aware DOM projection — the Studio Present twin
// of the CLI export's caption projection (2026-07-11-manifest-speech-contract.md).
//
// WHY this exists: read-aloud once had TWO producers that narrated the same deck
// DIFFERENTLY — Present flattened raw MARKDOWN (`slideToSpeech`), while the export
// narrated the rendered, component-aware DOM (`projectDeckToSpeech`). So a KPI tile
// read "…dollars. Total revenue." live but "Total revenue: … dollars" in the export;
// a hidden pull-quote gloss was spoken live but not exported; a QR URL was read live
// but stripped in the DOM. This runs the SAME shared kernel (`prose-projection.mjs`,
// via the player-core bundle) against Present's live slide DOM, so live and export
// draw narration from one source of truth. Charts keep their richer markdown narrator
// (`narrateChart`) on BOTH surfaces — folding those into the export is a follow-on.
//
// The projection is theme-invariant (it reads textContent, not computed style), so
// the render palette/mode only need to be VALID, not "correct" — we resolve them the
// same way the presenter stage doc does, for consistency.

import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { buildDeckRender, type ExtraTheme } from './share-export';

/**
 * Render the whole deck once and project each slide's DOM to natural narration
 * DISPLAY text — a per-slide `string[]` index-aligned to the slides in `source`
 * (joined `\n\n---\n\n`). Downstream `buildTrack` expands the display text to spoken
 * form, exactly as it does for a speaker note. Reuses the export's `buildDeckRender`
 * (engine + theme glue) and the shared `projectDeckToSpeech` (HARD RULE #1/#15) — no
 * projection byte lives twice. Async + dynamic-imported so the heavy engine/bundle
 * cost is paid only when Present actually opens.
 *
 * Each section is sanitized (HARD RULE #22 — the caller-sanitizes contract the
 * projection expects) before projecting. A section that fails to parse yields '' at
 * its index rather than dropping — dropping would misalign every later slide's
 * narration with its slide.
 */
export async function projectDeckSpeech(
	options: SingleSlideOptions,
	source: string,
	paletteOverride?: string,
	extraTheme?: ExtraTheme,
	extraCss?: string,
	modeOverride?: 'light' | 'dark',
): Promise<string[]> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	const { html } = await buildDeckRender(options, source, palette, mode, extraTheme, extraCss);

	const [deckMod, coreMod, sanitizeMod] = await Promise.all([
		import('@/playground/deck-preview.js'),
		import('@/playground/player-core.generated.js'),
		import('@/lib/sanitize-slide-html.js'),
	]);
	const splitSections = (deckMod as unknown as { splitSections: (h: string) => string[] }).splitSections;
	const projectDeckToSpeech = (coreMod as unknown as { projectDeckToSpeech: (s: Element[]) => string[] }).projectDeckToSpeech;
	const sanitize = sanitizeMod.sanitizeSlideHtml;

	const parser = new DOMParser();
	return splitSections(html).map((secHtml) => {
		const doc = parser.parseFromString(sanitize(secHtml), 'text/html');
		const section = doc.querySelector('section');
		return section ? (projectDeckToSpeech([section])[0] ?? '') : '';
	});
}
