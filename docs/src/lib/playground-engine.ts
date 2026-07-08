// The thin imperative bridge to the irreducible engine pieces: the marp render
// (window.LatticePlayground, loaded as a classic <script>) and the filmstrip
// iframe controller (window.LatticeDeckPreview, the deck-preview.js module
// exposed on window). Neither is reimplemented — this module only orchestrates
// the SAME calls the old inline IIFE made (ensureThemes → PG.render →
// DP.renderDeck), with theme fetch/caching, so the React layer can call one
// `renderInto(...)` and get a status back.
//
// Everything here touches window/fetch, so it lives outside the React tree and
// the pure controller (playground-controller.ts). PlaygroundApp drives it.

import { resolveDeckTheme } from './deck-theme';
import { ensureEngine } from './load-engine';
import { renderSig, resolveThemeName } from './playground-controller';
import { createThemeFetcher } from './theme-fetch';

type PreviewState = { frameSig: string; lastSections: unknown };

// `window.LatticePlayground` / `window.LatticeDeckPreview` (the engine + filmstrip
// globals the bridge reads against) are declared once, canonically, in
// playground-global.d.ts.

export type RenderResult =
	| { status: 'rendered'; count: number; state: PreviewState; geom: { w: number; h: number } }
	| { status: 'error'; message: string }
	| { status: 'pending' }; // engine not loaded yet — caller should retry

/** Build the per-page engine bridge. `themeBase`/`runtimeUrl`/`engineUrl` come from pgData.
 *  `validPalettes` is the registered-theme vocabulary — it gates whether a deck's own
 *  `theme:` front matter is honored (an unknown name falls back to the site palette
 *  instead of 404-ing its theme CSS). */
export function createEngineBridge(
	themeBase: string,
	runtimeUrl: string,
	engineUrl?: string,
	validPalettes: string[] = [],
	// Self-hosted Mermaid / KaTeX (staged assets). Passed through to the filmstrip,
	// which injects them only when a deck actually has a diagram / math. Omitted →
	// deck-preview.js falls back to its jsdelivr defaults.
	assets: { mermaidUrl?: string; katexUrl?: string } = {},
) {
	const isKnownTheme = (name: string) => validPalettes.includes(name);
	// Theme fetch + addThemes (the "ensureThemes" pattern) is shared — see
	// theme-fetch.ts. The bridge only orchestrates render around it.
	const themes = createThemeFetcher(themeBase);
	// Resolve a deck's relative image refs (a loaded gallery deck's
	// `![bg](image/sample-photo-wide.svg)`, the inventory logo-wall) against the
	// staged samples/ base — the same base the component studio uses. Absolute,
	// since the engine's WHATWG-URL resolver needs one. themeBase ends in `themes/`.
	let samplesBase: string | undefined;
	try { samplesBase = new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href; }
	catch { samplesBase = undefined; }

	/** True once both irreducible globals are present (engine bundle + bridge). */
	function ready(): boolean {
		return Boolean(window.LatticePlayground && window.LatticeDeckPreview);
	}

	/**
	 * Trigger the on-demand load of the engine bundle (load-engine.ts). Call this
	 * once the app has mounted/painted (e.g. on idle) so the chrome paints before
	 * the ~554KB-gz bundle loads. Idempotent; no-op if no engineUrl was wired
	 * (the render loop's existing poll still works against any legacy eager tag).
	 */
	function ensure(): void {
		if (engineUrl) void ensureEngine(engineUrl);
	}

	/**
	 * One render pass: ensure themes, run the engine, hand the output to the
	 * shared filmstrip controller with the SAME args the inline controller used.
	 * `fresh` resets the iframe (explicit deck swaps) vs patching (edits).
	 */
	async function renderInto(
		frame: HTMLIFrameElement,
		source: string,
		palette: string,
		mode: 'light' | 'dark',
		state: PreviewState,
		fresh: boolean,
	): Promise<RenderResult> {
		const PGref = window.LatticePlayground;
		const DPref = window.LatticeDeckPreview;
		if (!PGref || !DPref) return { status: 'pending' };
		try {
			// The deck's own `theme:` wins over the site palette; the site palette is
			// the fallback for an un-themed deck. A deck-dark pin (`-dark` theme /
			// `class: dark`) overrides the site mode. See deck-theme.ts.
			const { palette: deckPalette, mode: deckMode } = resolveDeckTheme(source, {
				sitePalette: palette,
				siteMode: mode,
				isKnownTheme,
			});
			await themes.ensure(deckPalette, deckMode);
			const theme = resolveThemeName(deckPalette, deckMode, PGref.hasTheme(deckPalette + '-dark'));
			const out = PGref.render(source, theme, { baseUrl: samplesBase });
			const geom = { w: out.width || 1280, h: out.height || 720 };
			const r = DPref.renderDeck({
				frame,
				html: out.html,
				css: out.css,
				mode: deckMode,
				geom,
				sig: renderSig(theme, deckMode, geom.w, geom.h),
				state: fresh ? { ...state, frameSig: '' } : state,
				fresh,
				runtimeUrl,
				...(assets.mermaidUrl ? { mermaidUrl: assets.mermaidUrl } : {}),
				...(assets.katexUrl ? { katexUrl: assets.katexUrl } : {}),
				gap: 16,
				contentVisibility: true,
				center: true,
			});
			return { status: 'rendered', count: r.count, state: r.state, geom };
		} catch (e) {
			return { status: 'error', message: String((e as Error)?.message || e) };
		}
	}

	return { ready, ensure, renderInto };
}

export type EngineBridge = ReturnType<typeof createEngineBridge>;
export type { PreviewState };
