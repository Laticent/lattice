// Studio → presenter-window glue. Builds the single-slide STAGE document the
// shared presenter kernel feeds its current/next iframes, from the Studio's own
// full-deck render (share-export's buildDeckRender) — so the second-screen slide
// is pixel-identical to the Studio's live preview. The window/postMessage
// machinery lives in the shared kernel (presenter-window.js); this module only
// assembles the inputs (engine render + the vendored fonts + KaTeX/Mermaid/a11y
// assets) the way single-slide-render.ts does for the in-page preview.

import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { A11Y_DEFS, KATEX_URL, MERMAID_URL } from '@/playground/deck-preview.js';
import { buildStageDoc } from '@/playground/presenter-window.js';
import { buildDeckRender, type ExtraTheme } from './share-export';

/**
 * Render the FULL deck and wrap it as a presenter stage document. `source` is the
 * deck markdown (front-matter + the slides currently being presented). Resolves to
 * the self-contained doc string + the slide total. Honors a saved library theme
 * (`extraTheme`) and the active palette/mode, exactly like the live preview.
 * `modeOverride` pins the render mode (a deck-dark deck stays dark regardless of the
 * site light/dark), mirroring DeckPreview's own modeOverride.
 */
export async function buildPresenterStageDoc(options: SingleSlideOptions, source: string, total: number, paletteOverride?: string, extraTheme?: ExtraTheme, extraCss?: string, modeOverride?: 'light' | 'dark'): Promise<{ doc: string; total: number }> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	const render = await buildDeckRender(options, source, palette, mode, extraTheme);
	const bg = mode === 'dark' ? '#0c0c0c' : '#15110d';
	const doc = buildStageDoc({
		html: render.html,
		width: render.geom.w,
		height: render.geom.h,
		bg,
		// Register the vendored faces first (the engine's @import is inert inside an
		// isolated srcdoc — the same reason single-slide-render injects fontCss).
		// Local-component CSS (extraCss) rides last so the deck's `.<name>` slides
		// are styled on the second screen too.
		css: render.fontCss + render.css + (extraCss ? `\n${extraCss}` : ''),
		runtimeUrl: render.runtimeUrl,
		// Inject KaTeX / Mermaid only when the deck actually has math / a diagram, and
		// prefer the Studio's locally-vendored copies (studio.astro passes both) so the
		// second screen renders from our own origin, never jsdelivr. buildStageDoc omits
		// each when its URL is '' — so a plain deck's presenter pulls neither.
		katexUrl: render.html.includes('katex') ? options.katexUrl || KATEX_URL : '',
		mermaidUrl: render.html.includes('language-mermaid') ? options.mermaidUrl || MERMAID_URL : '',
		a11yDefs: A11Y_DEFS,
	});
	return { doc, total };
}
