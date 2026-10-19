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

import type { DeckIndex } from './deck-outline';
import { resolveDeckTheme } from './deck-theme';
import { ensureEngine } from './load-engine';
import { renderSig, resolveThemeName } from './playground-controller';
import { renderMarkdown } from './render-engine';
import type { RenderedIndex } from './rendered-index';
import { samplesBaseFor } from './samples-base';
import { createStyleLoader, type StyleLoader } from './style-loader';
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
	// `anchor` is where the reader was in the document a full write just replaced (null on a
	// patch, or at the top) — the host scrolls the new document back to it.
	// `index` says which authored slide and part each page belongs to (rendered-index.ts). It reads the
	// stamps of the one `splitForPreview` call below, and it is LAZY: nothing is computed until a
	// map of the preview asks, so a Playground with no map pays nothing per keystroke. Each call
	// returns the same promise.
	| { status: 'rendered'; count: number; state: PreviewState; geom: { w: number; h: number }; patched: boolean; anchor: { index: number; frac: number; slide?: string } | null; index: () => Promise<RenderedIndex> }
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
	// which injects them only when a deck actually has a diagram / math AND the URL is
	// present. Omitted → no tag is injected and the diagram or math does not render;
	// deck-preview.js has no jsdelivr defaults any more.
	// See engineering/decisions/2026-09-03-self-hosted-runtime-deps.md.
	assets: { dagreUrl?: string; katexUrl?: string } = {},
	// On-demand engine styles (style-loader.ts), OPT-IN: `?styles=modules` in the page URL (with a
	// `stylesBase`, the folder the sync script stages the modules and their index in). Off by default, so
	// the Playground registers the whole `lattice.css` as it always did. The reviews of 2026-10-19 found the
	// default-on case unsupported: first visitors take the newcomer bake, which carries the whole sheet, and
	// the runtime-token list that keeps the scan honest needs a live-frame gate and a device check first
	// (engineering/decisions/2026-10-18-on-demand-styles.md §11).
	options: { stylesBase?: string; stylesIndex?: string } = {},
) {
	const isKnownTheme = (name: string) => validPalettes.includes(name);
	// The deck outline of the last source rendered, so the next render re-parses only what changed.
	let deckIndex: DeckIndex | undefined;
	// Slides each part makes on its own, by part text: only a deck whose slide count differs from its
	// part count needs it (rendered-index.ts `renderedIndexOf`), and an edit re-renders one part.
	const partCounts = new Map<string, number>();
	// Theme fetch + addThemes (the "ensureThemes" pattern) is shared — see
	// theme-fetch.ts. The bridge only orchestrates render around it.
	const loaderOn = typeof location !== 'undefined' && /[?&]styles=modules(?:&|$)/.test(location.search);
	let styles: StyleLoader | undefined;
	if (options.stylesBase && loaderOn) {
		// What the frame document holds that the engine's HTML does not (the host's own `<html>`
		// attributes, the texture <defs>, the classes and attributes its agents add later) is declared
		// by the preview module, which loads after this bridge is built: so it is read per scan.
styles = createStyleLoader(options.stylesBase, { indexName: options.stylesIndex, shell: () => window.LatticeDeckPreview?.scanShell });
	}
	const themes = createThemeFetcher(themeBase, { styles });
	// `sample:<name>` images resolve into the staged lib/samples/ copy (./samples-base.ts), and a
	// bare relative ref resolves against the same folder — the site has no deck directory.
	const samplesBase = samplesBaseFor(themeBase);

	/** True once both irreducible globals are present (engine bundle + bridge). */
	let backstopArmed = false;
	const BACKSTOP_MS = 4000;

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
	function prefetchTheme(source?: string): void {
		const root = document.documentElement;
		const palette = root.getAttribute('data-palette') || 'cuoio';
		const mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
		// With the style loader the whole sheet is not what the first render needs: fetch the index and
		// the always-needed modules instead (the floor), which is what `ensureBase` registers.
		if (styles) {
			void themes.prefetchFloor?.()?.catch(() => {});
			// The source the first render will take is already known, and its class words name most of
			// the modules the slides will need: start those fetches now, in parallel with the engine
			// bundle, instead of after the first render finds them out. Cache only (style-loader.ts `warm`).
			if (source) styles.warm(source);
		}
		else void themes.fetch('lattice').catch(() => {});
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
			// User-timing marks, so a trace says where the time went when the loader is on: the floor, the
			// first render, the scan and module fetch, the second render (`performance.getEntriesByName`).
			const mark = (name: string) => styles && typeof performance !== 'undefined' && performance.mark?.(`lattice-styles:${name}`);
			mark('start');
			styles?.warm(source);
			await themes.ensure(deckPalette, deckMode);
			mark('floor');
			const theme = resolveThemeName(deckPalette, deckMode, PGref.hasTheme(deckPalette + '-dark'));
			// The base this render starts under: `growBase` answers true if it has moved by the time the
			// scan is done, even when the scan itself finds nothing new.
			const startedUnder = themes.baseVersion();
			let out = await renderMarkdown(PGref, source, theme, { baseUrl: samplesBase, samplesUrl: samplesBase });
			mark('render1');
			// What the FRAME will hold is what must be scanned, not what the engine returned: the structural split
			// adds the cover and card classes of a portrait or square deck, and a scan of the unsplit HTML never
			// asked for their modules (found by the red team, 2026-10-19: 30 of 38 portrait and square examples
			// painted a plain cover). Everything the host does to the HTML happens before the scan.
			const geom = { w: out.width || 1280, h: out.height || 720 };
			// Split on STRUCTURE, the way the PDF export does (lib/core/structural-split.js). The
			// render is one section per authored slide; at portrait/square the export cuts each
			// multi-member slide into cover → one element per page → closing, and without this the
			// preview showed the whole slide squeezed onto one tall page instead. The PREVIEW opts in
			// here, not `renderMarkdown`: Studio exports share that function and stay unsplit until
			// they opt in themselves. A no-op at landscape, and on a bundle without the function.
			const html = PGref.splitForPreview ? PGref.splitForPreview(out.html, source, geom.w, geom.h).html : out.html;
			// The slides are rendered; now the styles they need. A scan that brings in a module the base
			// lacks re-registers the base, and the engine recomposes the sheet so it has the
			// module BEFORE anything paints (no flash of unstyled content). Warm, this is a no-op.
			if (await themes.growBase(html, startedUnder)) {
				mark('modules');
				// The sheet for this deck against the base as it is now: the engine recomputes it without
				// rendering the slides again (a result that lost the hook, through a spread or a clone,
				// renders again, which is the same answer at the price of the whole render).
				const sheet = out.restyle?.();
				out = sheet !== undefined ? { ...out, css: sheet } : await renderMarkdown(PGref, source, theme, { baseUrl: samplesBase, samplesUrl: samplesBase });
				mark('restyled');
			}
			// The net under the loader: once the page has been quiet for a few seconds, fetch the whole sheet and
			// make it the base. A module no scan could know to ask for heals; a tab that outlives a deploy keeps a
			// complete sheet. Once per bridge; a failed fetch changes nothing.
			if (styles && !backstopArmed) {
				backstopArmed = true;
				setTimeout(() => void themes.backstop(), BACKSTOP_MS);
			}
			// Which authored slide and part each page of this render is: read later and once, when a map
			// asks (rendered-index.ts). The outline too is built there, so a Playground with no map does
			// not parse the deck a second time per keystroke.
			let indexed: Promise<RenderedIndex> | null = null;
			const index = () =>
				(indexed ??= (async () => {
					// Loaded when a map asks, not with the Playground: the outline, the index and the glossary
					// kernel are only needed to place pages on slides.
					const [{ updateDeckIndex }, { blanksOf, chromeProbeOf, deckChromeOf, NO_CHROME, renderedIndexOf, stampsOf }, { autoGlossarySections }] = await Promise.all([import('./deck-outline'), import('./rendered-index'), import('../../../lib/core/glossary-auto.mjs')]);
					const deck = (deckIndex = updateDeckIndex(deckIndex, source));
					// The chrome the front matter gives every slide, so a blank slide is told from one that set its own.
					// Rendered from the front matter plus one slide; a deck that sets none skips the render.
					const probe = chromeProbeOf(source);
					const deckChrome = probe ? deckChromeOf((await renderMarkdown(PGref, probe, theme, { baseUrl: samplesBase, samplesUrl: samplesBase })).html) : NO_CHROME;
					return renderedIndexOf(
						stampsOf(html),
						deck,
						async (md) => stampsOf((await renderMarkdown(PGref, md, theme, { baseUrl: samplesBase, samplesUrl: samplesBase })).html).length,
						partCounts,
						autoGlossarySections(source),
						blanksOf(html, deckChrome),
					);
				})());
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
				html,
				css: out.css,
				mode: deckMode,
				geom,
				// The loader's part of the signature is read off the sheet THIS render produced, not off the
				// loader's current state: another render can register a module between this one's second pass
				// and this write, and a signature that claimed it would let the next patch skip a sheet that
				// lacks it. (The length moves whenever a module joins the base; the theme is already above.)
				sig: renderSig(theme, deckMode, geom.w, geom.h) + (themes.baseSignature() ? `|${themes.baseSignature().charAt(0)}${out.css.length}` : ''),
				// What the document's SHAPE depends on. When only the theme or mode moved, the
				// live document restyles in place (deck-preview.js `restyleDocument`) instead of
				// being rewritten — no blank frame, and the reader keeps their scroll position.
				restyleKey: `${geom.w}x${geom.h}`,
				// A VIRTUAL filmstrip: only the slides in view are real in the frame; the rest are
				// same-size placeholders (virtual-window.js). The host moves the window with
				// `attachVirtual` / `syncVirtual` / `mountAround`.
				virtual: true,
				// The runtime waits for the faces these slides use, not all 17 the engine declares
				// (lib/core/font-settle.js `settleLaidOutFonts`).
				previewFonts: true,
				state: fresh ? { ...state, frameSig: '' } : state,
				fresh,
				runtimeUrl,
				...(assets.dagreUrl ? { dagreUrl: assets.dagreUrl } : {}),
				...(assets.katexUrl ? { katexUrl: assets.katexUrl } : {}),
				...(paneBg ? { background: () => paneBg } : {}),
				gap: 16,
				contentVisibility: true,
				center: true,
				// The slide's own edge — because the letterbox above deliberately paints the
				// surround in `--bg-alt`, and in a palette where a slide's background sits near
				// that token the two are the same color and the slide has no edge at all. The
				// ENGINE draws it in the deck's own --border (base.modifiers.css, "The slide's
				// EDGE"); this flag only has the fit agent tell it the on-screen scale.
				slideEdge: true,
			});
			return { status: 'rendered', count: r.count, state: r.state, geom, patched: r.patched, anchor: r.anchor ?? null, index };
		} catch (e) {
			return { status: 'error', message: String((e as Error)?.message || e) };
		}
	}

	return { ready, ensure, prefetchTheme, renderInto };
}

export type EngineBridge = ReturnType<typeof createEngineBridge>;
export type { PreviewState };
