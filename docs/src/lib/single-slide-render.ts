// Shared single-slide live renderer — the de-duplicated successor of
// landing-engine.ts (landing islands) AND live-render.js (component specimens).
//
// WRAP, DON'T REINVENT. The marp render path lives in window.LatticePlayground
// (the on-demand engine bundle, injected by load-engine.ts). This module only
// orchestrates the SAME calls both copies made — fetch theme css → PG.addThemes
// (via theme-fetch.ts) → PG.render → write an isolated `srcdoc` iframe + scale
// it to fill its host. Nothing here reimplements the engine; it touches
// window/fetch/DOM, so it stays OUTSIDE the React tree (DeckPreview.tsx wraps it
// for the React islands; specimen.js consumes the function form directly).
//
// SIBLINGS (kept divergent on purpose): src/playground/deck-preview.js is the
// MULTI-slide filmstrip superset (playground, drawing-board, both studios). The
// drawing-board inline controller + practice/focus builders are Tier 2 and own
// their surface-specific srcdoc. This module is the SINGLE-slide twin only.
//
// THE FONT FIX (carried from live-render, now landing gets it too): the engine's
// Google-Fonts @import is inert inside the srcdoc <style> (it lands after the
// frame CSS, and CSS ignores an @import that isn't first), so the iframe loads
// none of its own webfonts and would render only the faces the parent docs page
// happens to load — never the sketch finish's Caveat/Shantell. We register the
// vendored faces ourselves (font-embed.js), lazily-imported + cached: font-embed
// pulls bundled .woff2 that Node can't load, so a static import would break this
// module in a Node/SSR context — the lazy import keeps construction Node-safe.

import { applyDebug } from '../playground/debug-overlay.js';
import { linkGuardAgent } from '../playground/deck-preview.js';
import { DEFAULT_H, DEFAULT_W, singleSlideFrame } from '../playground/frame-css.js';
import { hasRenderListeners, type RenderStats, recordRenderSample } from '../playground/render-metrics';
import { installVideoBridge } from '../playground/video-overlay.js';
import { ensureEngine } from './load-engine';
import { renderMarkdown } from './render-engine';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';
import { createThemeFetcher } from './theme-fetch';

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

// ── Drag-time observer gating (2026-07-02 resizable-panes decision §8) ──────
// Every live host gets a ResizeObserver that re-runs scaleFrame on any host
// resize — during a split-divider drag that's one rescale per host per frame.
// The Studio suspends the callbacks for the drag's duration and resumes with
// ONE authoritative re-fit per live host (the single-slide analog of the
// Playground's __latticeFitSuspend/__latticeFitResume pair). Module-level so
// one gate covers every renderer instance on the page.
let scaleSuspended = false;
const scaleTargets = new Map<HTMLElement, () => void>();
export function suspendScaleObservers(on: boolean): void {
	scaleSuspended = on;
	if (on) return;
	for (const [host, refit] of scaleTargets) {
		// Prune unmounted hosts on resume: the module-level Map would otherwise
		// root every detached preview subtree forever (Studio's mobile pane
		// swaps, Compose↔Fabricate) and refit dead iframes each resume.
		if (host.isConnected) refit();
		else scaleTargets.delete(host);
	}
}

export type Geom = { width: number; height: number };
export type RenderStatus = { ok: boolean; slides: number; error: string | null };

export type SingleSlideOptions = {
	/** Base URL the theme CSS is fetched from (`<themeBase><name>.css`). */
	themeBase: string;
	/** URL of the runtime bundle injected into each slide iframe. */
	runtimeUrl: string;
	/**
	 * On-demand engine bundle URL. When present, whenReady() triggers the inject
	 * (load-engine.ts) on first need; absent → whenReady() falls back to a poll
	 * (tests, or a legacy eager tag already on the page).
	 */
	engineUrl?: string;
	/**
	 * URL of the UMD Mermaid bundle injected into a `mermaid` slide's iframe.
	 * Absent → the jsdelivr CDN (back-compat). A docs surface that wants Mermaid
	 * to render offline / under a strict CSP / from its own origin passes the
	 * locally-vendored copy (`<assetBase>mermaid.min.js`, staged by
	 * sync-playground-assets) so previews never depend on a third-party CDN.
	 */
	mermaidUrl?: string;
	/**
	 * URL of the KaTeX stylesheet for surfaces that render the full deck through the
	 * presenter/stage path (studio-presenter). Absent → the jsdelivr CDN. A docs
	 * surface passes the locally-vendored copy (`<assetBase>katex/katex.min.css`,
	 * staged by sync-playground-assets) so math previews stay off a third-party CDN.
	 */
	katexUrl?: string;
};

/** Resolve `<html data-palette/-mode>` → the palette + mode to render with. */
export function currentPaletteMode(paletteOverride?: string): { palette: string; mode: 'light' | 'dark' } {
	const root = document.documentElement;
	return {
		palette: paletteOverride || root.getAttribute('data-palette') || 'indaco',
		mode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
	};
}

// Host carries its resolved slide box so scaleFrame divides by the right width
// (a `size: 4K` deck pins a 3840×2160 box, not the HD default).
type LiveHost = HTMLElement & { __latticeGeom?: Geom };

/**
 * Build a single-slide renderer bound to a theme source + runtime URL. Returns:
 *   - renderInto(host, markdown, mermaid, paletteOverride?, extra?, modeOverride?) → Promise<RenderStatus>
 *   - whenReady()       → Promise<void> (triggers on-demand engine load)
 *   - onThemeChange(cb) → re-run cb (debounced) on a data-palette/-mode flip
 *   - scaleFrame(host)  → re-fit the host's iframe (after a reveal/resize)
 *   - ready()           → window.LatticePlayground present?
 */
export function createSingleSlideRenderer(opts: SingleSlideOptions) {
	const { themeBase, runtimeUrl, engineUrl } = opts;
	// Prefer a locally-vendored Mermaid (no CDN); fall back to jsdelivr.
	const mermaidUrl = opts.mermaidUrl || MERMAID;
	const themes = createThemeFetcher(themeBase);

	// Last sanitize duration (ms), stashed by srcdoc() and read by renderInto for
	// the perf-overlay RENDER group. A closure var (not a return value) keeps the
	// srcdoc signature — and the #22 sanitize call site — untouched; renderInto
	// copies it into a local right after the call so a second concurrent host
	// can't clobber the sample.
	let lastSanitizeMs = 0;

	// Self-hosted preview fonts. Lazy-imported + cached: font-embed.js pulls
	// bundled .woff2 that Node can't load, so a static import would break this
	// module's unit test. The @font-face references the woff2 by URL (browser
	// caches once), not inlined per render.
	let fontFaceCss = '';
	let fontFacesReady: Promise<void> | null = null;
	function ensurePreviewFonts(): Promise<void> {
		if (!fontFacesReady) {
			fontFacesReady = import('../playground/font-embed.js')
				.then((m) => {
					fontFaceCss = m.previewFontFaceCss();
				})
				.catch(() => {
					fontFaceCss = '';
				});
		}
		return fontFacesReady;
	}

	// Render the slide at its INTRINSIC `@size` box and scale the iframe ELEMENT
	// (never the SVG) to fit the host — sidesteps the Safari foreignObject scaling
	// bug (see frame-css.js + index.astro srcdoc note). `geom` is the render's
	// reported { width, height } (px).
	function srcdoc(html: string, css: string, mode: 'light' | 'dark', mermaid: boolean, geom: Geom, extraCss = ''): string {
		// Strip script-bearing content before it enters this same-origin,
		// un-sandboxed frame (#616 T-CONTENT) — the runtime/Mermaid scripts are
		// appended separately below, so they're untouched.
		const tSanitize = performance.now();
		html = sanitizeSlideHtml(html);
		lastSanitizeMs = performance.now() - tSanitize;
		const bg = mode === 'dark' ? '#0c0c0c' : '#e7e7ea';
		// Register the vendored faces first (@font-face is position-independent,
		// but keeping it up top documents intent). Without this the iframe has no
		// Caveat/Shantell and sketch decks render body in a system sans.
		// Force the canvas color-scheme to the rendered mode so a theme's
		// `light-dark()` pairs resolve as chosen (the same knob deck-preview.js's
		// renderDeck exposes as `colorScheme`). Without it a derived theme rendered
		// in dark would still resolve its light sides.
		let s =
			'<!doctype html><html><head><meta charset="utf-8"><style>' +
			fontFaceCss +
			singleSlideFrame(geom.width, geom.height) +
			':root{color-scheme:' +
			mode +
			'}html,body{background:' +
			bg +
			'}' +
			css +
			// Author-supplied CSS appended AFTER the theme — the Fabricate Layout
			// Studio's live local-component styles, the same order the Workbench
			// previews them (out.css + the component CSS).
			(extraCss ? '\n/* studio-extra-css */\n' + extraCss : '') +
			'</style></head><body>' +
			html;
		if (mermaid) s += '<scr' + 'ipt src="' + mermaidUrl + '"></scr' + 'ipt>';
		s += '<scr' + 'ipt src="' + runtimeUrl + '"></scr' + 'ipt>';
		// Preview-only link guard: an external link tap (a video poster, a contact/qr
		// URL) must not navigate — and blank — this scaled srcdoc frame on iOS. Also
		// carries the video-playback bridge (window.__videoPlay) for the Studio.
		s += '<scr' + 'ipt>' + linkGuardAgent() + '</scr' + 'ipt>';
		s += '</body></html>';
		return s;
	}

	/** Scale the fixed-box iframe to fill its (16:9) host; driven by host width. */
	function scaleFrame(host: HTMLElement) {
		const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
		if (!fr) return;
		const w = host.clientWidth;
		// Scale by the slide's OWN box (stashed by renderInto), not a hardcoded
		// 1280×720 — otherwise a 4K (3840-wide) slide is scaled 3× too large. The
		// element's CSS pins it to HD by default, so a non-HD deck also needs the
		// element resized to its real box here before the transform fits it.
		const geom = (host as LiveHost).__latticeGeom || { width: DEFAULT_W, height: DEFAULT_H };
		fr.style.width = geom.width + 'px';
		fr.style.height = geom.height + 'px';
		if (w > 0) fr.style.transform = 'scale(' + (w / geom.width).toFixed(5) + ')';
	}

	/** True once the engine bundle has loaded. */
	function ready(): boolean {
		return Boolean(window.LatticePlayground);
	}

	/**
	 * Fire the theme CSS + preview-font fetches WITHOUT waiting on the engine —
	 * `theme-fetch.ts`'s `fetch()` is a pure network call cached by name, so this
	 * can run in parallel with `whenReady()`'s engine-bundle load instead of
	 * behind it. `renderInto`'s later `themes.ensure()` reuses the same cached
	 * promise (a no-op network-wise) once the engine is ready to register it.
	 * Best-effort only: a network error here is swallowed — `renderInto`'s own
	 * `ensure()` still surfaces it through the normal render-failure path.
	 */
	function prefetchTheme(paletteOverride?: string, modeOverride?: 'light' | 'dark'): void {
		const { palette, mode } = currentPaletteMode(paletteOverride);
		void themes.fetch('lattice').catch(() => {});
		void themes.fetch(palette).catch(() => {});
		if ((modeOverride ?? mode) === 'dark') void themes.fetch(palette + '-dark').catch(() => {});
		void ensurePreviewFonts();
	}

	/**
	 * Render `markdown` into `host` (creating/updating its `iframe.live`), themed
	 * by the current (or overridden) palette + mode. Resolves to a status object.
	 */
	function renderInto(
		host: HTMLElement,
		markdown: string,
		mermaid: boolean,
		paletteOverride?: string,
		// Opt-in: render against a RAW in-memory theme (e.g. Fabricate's live
		// derived theme) instead of fetching `<themeBase><name>.css`. Registered
		// once per distinct name. Existing callers omit it → unchanged behaviour.
		extra?: { name: string; css: string },
		// Opt-in: render in a SPECIFIC light/dark mode instead of the global
		// `<html data-mode>` — lets a surface audition a theme in both modes (the
		// Fabricate specimen toggle) without flipping the whole page. Existing
		// callers omit it → mode still follows data-mode.
		modeOverride?: 'light' | 'dark',
		// Opt-in: raw author CSS appended after the theme (Fabricate's Layout Studio
		// previews a live local component's styles). Existing callers omit it.
		extraCss?: string,
	): Promise<RenderStatus> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.resolve({ ok: false, slides: 0, error: 'engine not loaded' });
		const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
		const mode = modeOverride ?? docMode;
		// Perf-overlay timing: whole edit→paint span starts here (includes the
		// usually-warm theme ensure below); per-stage deltas are taken inline.
		const tStart = performance.now();
		const themeReady = extra
			? Promise.all([themes.ensureBase(), ensurePreviewFonts()]).then(() => {
					// ALWAYS (re-)register — addThemes overwrites by name, so an edited
					// theme re-saved under the same name takes effect immediately. A
					// hasTheme() guard would silently keep rendering the stale CSS.
					PG.addThemes([extra.css]);
				})
			: Promise.all([themes.ensure(palette, mode), ensurePreviewFonts()]);
		return themeReady
			.then(async () => {
				const theme = extra ? extra.name : mode === 'dark' && PG.hasTheme(palette + '-dark') ? palette + '-dark' : palette;
				let out: { html: string; css: string; width?: number; height?: number; stats?: RenderStats };
				let engineMs = 0;
				try {
					// Resolve a sample deck's `![bg](sample-image-*.svg)` against the
					// staged samples/ dir (sibling of themes/ under the hashed root).
					// Make it ABSOLUTE — themeBase is root-relative, and the engine's
					// WHATWG-URL resolver needs an absolute base.
					const samplesBase = new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href;
					const tEngine = performance.now();
					// Ask the engine for its per-stage breakdown ONLY while the overlay is
					// subscribed — otherwise it collects nothing (off = free).
					out = await renderMarkdown(PG, markdown, theme, { baseUrl: samplesBase, stats: hasRenderListeners() });
					engineMs = performance.now() - tEngine;
					// engineMs brackets the WHOLE renderMarkdown call, which also does the
					// math prescan + (cold) KaTeX load before the engine's own render. Fold
					// that gap into an `other` bucket so the breakdown reconciles to
					// engineMs — otherwise the bars silently under-sum the headline and
					// point a perf-debugging user at the wrong stage.
					if (out.stats) {
						const s = out.stats;
						s.otherMs = Math.max(0, engineMs - (s.parseMs + s.transformsMs + s.assembleMs + s.cssMs));
					}
				} catch (e) {
					console.error('single-slide render failed', e);
					return { ok: false, slides: 0, error: String((e as Error)?.message || e) };
				}
				// Stash the resolved slide box so scaleFrame divides by the right width.
				const geom: Geom = { width: out.width || DEFAULT_W, height: out.height || DEFAULT_H };
				(host as LiveHost).__latticeGeom = geom;
				// Section count — computed here so the onload sample below captures it.
				const slides = (out.html.match(/<\/section>/g) || []).length;
				let fr = host.querySelector<HTMLIFrameElement>('iframe.live');
				if (!fr) {
					fr = document.createElement('iframe');
					fr.className = 'live';
					fr.setAttribute('title', 'Live-rendered Lattice slide');
					fr.setAttribute('scrolling', 'no');
					fr.setAttribute('tabindex', '-1');
					// Fixed intrinsic slide box, scaled to fit via a CSS transform set in
					// scaleFrame. transform-origin top-left so the scaled box aligns to the
					// host's corner (without it, scaling shrinks around center → offset).
					fr.style.position = 'absolute';
					fr.style.top = '0';
					fr.style.left = '0';
					fr.style.border = '0';
					fr.style.width = geom.width + 'px';
					fr.style.height = geom.height + 'px';
					fr.style.transformOrigin = 'top left';
					host.appendChild(fr);
					if (typeof ResizeObserver !== 'undefined') {
						// The callback honors the module-level drag gate above; the host is
						// registered so a resume can re-fit it once, authoritatively.
						// Sweep dead hosts on each registration so no-drag sessions
						// (where the resume-time prune never runs) stay bounded too.
						for (const h of scaleTargets.keys()) if (!h.isConnected) scaleTargets.delete(h);
						scaleTargets.set(host, () => scaleFrame(host));
						new ResizeObserver(() => {
							if (!scaleSuspended) scaleFrame(host);
						}).observe(host);
					}
				}
				// After the frame loads: fit it, then draw the layout debug overlay if the
				// deck opted in (`data-debug`, stamped from `debug:` front matter). This
				// single-slide path strictly FOLLOWS THE DECK (force:null) — it never reads
				// the toolbar override, so a specimen on the landing/showcase pages can't
				// inherit a debug flag a viewer flipped in the Studio/Playground.
				// Declared before onload so the (async) load handler closes over the
				// final values, stamped just below after the synchronous srcdoc setup.
				// srcBytes is captured as a number here so the closure doesn't retain
				// the whole `markdown` source string per live host.
				let tFrameStart = 0;
				let sanitizeMs = 0;
				const srcBytes = markdown.length;
				fr.onload = () => {
					// Fit first (timed around the existing clientWidth read — no extra
					// reflow), then debug overlay + video bridge which are outside the
					// measured fit. frameMs is the browser's own parse/layout of the
					// srcdoc: from the end of our synchronous setup below to this load event.
					const tFit = performance.now();
					scaleFrame(host);
					const fitMs = performance.now() - tFit;
					applyDebug(fr, { force: null });
					// Parent-hosted video playback: tap a video poster in a Studio preview
					// to play the clip in a centered lightbox (the link guard bridges to it).
					installVideoBridge(fr.contentWindow);
					const now = performance.now();
					recordRenderSample({
						engineMs,
						sanitizeMs,
						frameMs: now - tFrameStart,
						fitMs,
						totalMs: now - tStart,
						slides,
						srcBytes,
						stats: out.stats,
					});
				};
				fr.srcdoc = srcdoc(out.html, out.css, mode, mermaid, geom, extraCss);
				// srcdoc() runs the sanitize pass; copy its duration out of the shared
				// closure var before an interleaved render can overwrite it.
				sanitizeMs = lastSanitizeMs;
				scaleFrame(host);
				host.classList.add('is-live');
				// Stamp AFTER the synchronous setup (srcdoc build + sanitize + pre-load
				// fit) so frameMs isolates the browser's async parse/layout — the build
				// and sanitize costs are still captured by totalMs and sanitizeMs.
				tFrameStart = performance.now();
				return { ok: true, slides, error: null };
			})
			.catch((e) => {
				// Surface failures in the console (the old landing bridge did; the
				// specimen also shows them via its status line) so a broken theme fetch
				// / engine error isn't swallowed silently on the landing islands.
				console.error('single-slide render failed', e);
				return { ok: false, slides: 0, error: String((e as Error)?.message || e) };
			});
	}

	/**
	 * Resolve when the engine bundle is present. On first call this also triggers
	 * the on-demand injection of the engine <script> (ensureEngine) if an
	 * engineUrl was supplied — so the bundle loads only when an island actually
	 * needs to render. Falls back to a bare poll if no URL was wired.
	 */
	function whenReady(): Promise<void> {
		if (ready()) return Promise.resolve();
		if (engineUrl) return ensureEngine(engineUrl);
		return new Promise((resolve) => {
			const t = setInterval(() => {
				if (ready()) {
					clearInterval(t);
					resolve();
				}
			}, 50);
		});
	}

	/** Call `cb` (debounced) whenever the palette or light/dark mode changes. */
	function onThemeChange(cb: () => void) {
		let timer: ReturnType<typeof setTimeout>;
		new MutationObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(cb, 80);
		}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
	}

	return { renderInto, whenReady, onThemeChange, scaleFrame, ready, prefetchTheme };
}

export type SingleSlideRenderer = ReturnType<typeof createSingleSlideRenderer>;
