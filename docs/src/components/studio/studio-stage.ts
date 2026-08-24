// Studio → Stage glue. Builds the single-slide STAGE document the audience
// window shows, from the Studio's own full-deck render (share-export's
// buildDeckRender) — so the projected slide is pixel-identical to the Studio's
// live preview. The window/postMessage machinery lives in the shared kernel
// (present/stage-window.js); this module only assembles the inputs (engine
// render + the vendored fonts + KaTeX/Mermaid/a11y assets) the way
// single-slide-render.ts does for the in-page preview.

import { resolveTokenColor, stageChromeDecls } from '@/components/studio/present/stage-chrome.js';
import { buildStageDoc } from '@/components/studio/present/stage-window.js';
import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { A11Y_DEFS, KATEX_URL, MERMAID_URL } from '@/playground/deck-preview.js';
import { buildDeckRender, type ExtraTheme } from './share-export';

/** `#rrggbb` → [r,g,b]. The letterbox is ours and always a literal, so this is all it needs. */
function hexRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}

/**
 * Render the FULL deck and wrap it as a standalone Stage document. `source` is the
 * deck markdown (front-matter + the slides currently being presented). Resolves to
 * the self-contained doc string + the slide total. Honors a saved library theme
 * (`extraTheme`) and the active palette/mode, exactly like the live preview.
 * `modeOverride` pins the render mode (a deck-dark deck stays dark regardless of the
 * site light/dark), mirroring DeckPreview's own modeOverride.
 */
export async function buildStageDocument(options: SingleSlideOptions, source: string, total: number, paletteOverride?: string, extraTheme?: ExtraTheme, extraCss?: string, modeOverride?: 'light' | 'dark'): Promise<{ doc: string; total: number; bg: string }> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	const render = await buildDeckRender(options, source, palette, mode, extraTheme);
	// THE LETTERBOX, and it is dark in BOTH modes on purpose: a projected deck sits on a
	// black surround whatever the app is set to. Returned as well as baked in, because the
	// audience chrome is painted ON it — its ink has to be resolved against this color and
	// not against the app's background (`paintStageTokens`).
	const bg = mode === 'dark' ? '#0c0c0c' : '#15110d';
	const doc = buildStageDoc({
		html: render.html,
		width: render.geom.w,
		height: render.geom.h,
		bg,
		// Register the vendored faces first (the engine's @import is inert inside an
		// isolated srcdoc — the same reason single-slide-render injects fontCss).
		// Local-component CSS (extraCss) rides last so the deck's `.<name>` slides
		// are styled on the Stage too.
		css: render.fontCss + render.css + (extraCss ? `\n${extraCss}` : ''),
		runtimeUrl: render.runtimeUrl,
		// Inject KaTeX / Mermaid only when the deck actually has math / a diagram, and
		// prefer the Studio's locally-vendored copies (studio.astro passes both) so the
		// projected window renders from our own origin, never jsdelivr. buildStageDoc omits
		// each when its URL is '' — so a plain deck's Stage pulls neither.
		katexUrl: render.html.includes('katex') ? options.katexUrl || KATEX_URL : '',
		mermaidUrl: render.html.includes('language-mermaid') ? options.mermaidUrl || MERMAID_URL : '',
		a11yDefs: A11Y_DEFS,
		// The projected window, not an iframe: this is what adds the audience-chrome
		// hosts, the opener handshake and the `f` fallback (see buildStageDoc).
		standalone: true,
		// …and the chrome's palette, resolved HERE because this is the one place that
		// knows the letterbox. Baked into the document rather than painted after it
		// opens, so the caption crawl is never rendered against unset tokens.
		chromeDecls: stageChromeDecls(hexRgb(bg), resolveTokenColor(document.documentElement, '--accent')),
	});
	return { doc, total, bg };
}
