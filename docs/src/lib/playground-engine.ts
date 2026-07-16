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
import { renderMarkdown } from './render-engine';
import { createThemeFetcher } from './theme-fetch';

type PreviewState = { frameSig: string; lastSections: unknown };

// `window.LatticePlayground` / `window.LatticeDeckPreview` (the engine + filmstrip
// globals the bridge reads against) are declared once, canonically, in
// playground-global.d.ts.

export type RenderResult =
	// `patched` is the render REGIME: true when renderDeck swapped only the changed
	// <section> nodes (cheap, ~2ms), false on a full srcdoc rewrite (theme/mode/size
	// reparse). The frame scheduler reads it to render a patch next-frame-instant but
	// coalesce a heavy write.
	| { status: 'rendered'; count: number; state: PreviewState; geom: { w: number; h: number }; patched: boolean }
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
	 * Fire the theme CSS fetch WITHOUT waiting on the engine bundle — call this
	 * alongside `ensure()` so the two independent network round-trips run in
	 * parallel instead of serialized. `renderInto`'s `themes.ensure()` only
	 * registers a theme once `window.LatticePlayground` exists (it needs
	 * `PG.addThemes`), so before this fix the render loop's 60ms `ready()` poll
	 * meant the theme fetch never even STARTED until the engine had already
	 * fully loaded — same bug already fixed in single-slide-render.ts's
	 * `prefetchTheme`, mirrored here. `theme-fetch.ts`'s `fetch()` is a pure,
	 * cached-by-name network call with no engine dependency, so it's safe to
	 * fire early. Best-effort: a deck's own `theme:` front matter can pick a
	 * DIFFERENT palette than the site's current one (resolved later in
	 * `renderInto` via `resolveDeckTheme`) — this only prefetches the site's
	 * current palette as a guess; a miss just means that one theme's CSS
	 * fetch isn't pre-warmed, not a correctness issue (theme-fetch.ts caches
	 * by name, so a later real request for the same name is a no-op).
	 */
	function prefetchTheme(): void {
		const root = document.documentElement;
		const palette = root.getAttribute('data-palette') || 'indaco';
		const mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
		void themes.fetch('lattice').catch(() => {});
		void themes.fetch(palette).catch(() => {});
		if (mode === 'dark') void themes.fetch(palette + '-dark').catch(() => {});
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
			const out = await renderMarkdown(PGref, source, theme, { baseUrl: samplesBase });
			const geom = { w: out.width || 1280, h: out.height || 720 };
			// Letterbox the filmstrip in the BRAND background (the pane's `--bg-alt` for the
			// active palette + mode), not the engine's generic `#0c0c0c`/`#e7e7ea` default: the
			// preview pane shows solid `--bg-alt` while the engine loads, so matching the iframe
			// body to it makes the slide surround the SAME color before and after the reveal —
			// the fade-in has no background color shift (no flicker).
			let paneBg = '';
			try {
				paneBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-alt').trim();
			} catch {
				/* SSR / no DOM — fall through to the engine default */
			}
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
				...(paneBg ? { background: () => paneBg } : {}),
				gap: 16,
				contentVisibility: true,
				center: true,
			});
			return { status: 'rendered', count: r.count, state: r.state, geom, patched: r.patched };
		} catch (e) {
			return { status: 'error', message: String((e as Error)?.message || e) };
		}
	}

	return { ready, ensure, prefetchTheme, renderInto };
}

export type EngineBridge = ReturnType<typeof createEngineBridge>;
export type { PreviewState };
