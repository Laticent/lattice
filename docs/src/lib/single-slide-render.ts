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

import { sourceHasMath } from '../../../lib/engine/math-detect.mjs';
import { applyDebug } from '../playground/debug-overlay.js';
import { hashString, linkGuardAgent } from '../playground/deck-preview.js';
import { DEFAULT_H, DEFAULT_W, singleSlideFrame } from '../playground/frame-css.js';
import { hasRenderListeners, patchOverflow, type RenderStats, recordRenderSample } from '../playground/render-metrics';
import { installVideoBridge } from '../playground/video-overlay.js';
import { hasVizScanListeners, recordVizScan, scanBlackFills } from '../playground/viz-findings';
import { ensureEngine } from './load-engine';
import { renderMarkdown } from './render-engine';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';
import { createThemeFetcher } from './theme-fetch';

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

// ── Drag-time observer gating (2026-07-02 resizable-panes decision §8) ──────
// Every live host gets a ResizeObserver that re-runs scaleFrame on any host
// resize. The single-slide preview scales via one cheap outer CSS transform, so
// the Studio lets it (and the shared host's positioning) track the divider LIVE
// through a drag — suspending it froze the `position:fixed` host at its pre-drag
// geometry and bled the slide over the neighbor pane (2026-07-19 post-ship fix).
// So `suspendScaleObservers(true)` is no longer called on drag; the Studio calls
// only `suspendScaleObservers(false)` at drag-END, which is now purely the
// authoritative "refit every live host once + prune unmounted hosts" pass (the
// `on=true` suspend branch is retired but kept inert for any future re-fit gate).
// Module-level so one gate covers every renderer instance on the page.
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
export type RenderStatus = {
	ok: boolean;
	slides: number;
	error: string | null;
	/** Which regime drew this render: 'patch' swapped only the `.lattice` body (cheap,
	 * ~2ms); 'restyle' swapped the resident theme `<style>` in place + the body (a
	 * theme/mode/palette change with no srcdoc rewrite — no new iframe realm minted, the
	 * fix for the theme-toggle realm-churn leak); 'write' rebuilt the whole srcdoc (a full
	 * iframe reparse + a fresh realm, tens–hundreds of ms). Lets a scheduling caller
	 * (DeckPreview's frame loop) render a patch/restyle instantly but coalesce a heavy
	 * write. Absent on a failed render. */
	writePath?: 'patch' | 'restyle' | 'write';
};

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
// (a `size: 4K` deck pins a 3840×2160 box, not the HD default). It also carries
// the debounce's coalesce count for the NEXT render (set by DeckPreview), which
// renderInto consumes synchronously at render start — binding the count to THIS
// render's sample instead of a shared module global that an overlapping render
// could steal. And the render SIGNATURE of everything baked into its live srcdoc
// OUTSIDE the <section> (theme, mode, geom, mermaid, extra/author CSS) — an
// unchanged sig means the next render can PATCH the section in place; plus a
// pending-load flag so a same-sig render can't patch an outgoing (still-loading)
// full-write document.
type LiveHost = HTMLElement & { __latticeGeom?: Geom; __latticeCoalesce?: number; __latticeFrameSig?: string; __latticeRestyleSig?: string; __latticePendingLoad?: boolean };
// "Has the live iframe actually painted a slide yet?" — true once its document holds a
// rendered `.lattice`. scaleFrame reveals the frame only when this is true, so it never
// unhides the pre-load `about:blank` white document (no `.lattice`) — the white-flash
// gate — WITHOUT depending on the `onload` event, which iOS Safari fires unreliably for
// srcdoc (the on-device stuck-hidden blank). Best-effort: a cross-doc read can't actually
// throw for a same-origin srcdoc, but guard anyway for teardown races.
function frameHasPainted(fr: HTMLIFrameElement): boolean {
	try {
		return !!fr.contentDocument?.querySelector('.lattice');
	} catch {
		return false;
	}
}

// Replace ONLY the live document's `.lattice` contents with a new (already
// sanitized) slide — the resident theme <style> + runtime <script> stay parsed and
// executed, so the runtime's body observer re-processes the swapped section for
// free. Returns false if the live document is gone (caller falls back to a full
// srcdoc write). The single-slide twin of deck-preview.js's patchSections.
function patchSlideBody(fr: HTMLIFrameElement, safeHtml: string): boolean {
	const doc = fr.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!doc || !lattice) return false;
	const holder = doc.createElement('div');
	holder.innerHTML = safeHtml;
	const fresh = holder.querySelector('.lattice');
	lattice.innerHTML = (fresh || holder).innerHTML;
	return true;
}

// Scan the just-rendered slide for dropped-to-black SVG chart paint (the #956
// signal), feeding the live VizDiagnosticsOverlay — but ONLY while it's subscribed
// (off = free). Deferred ~650ms like the overflow re-read: an SVG chart is stamped
// by the runtime shortly after load, and a `mermaid` slide renders its SVG async,
// so an immediate scan would miss them. Best-effort: a cross-doc read can throw
// during teardown. getDoc is a thunk so a torn-down/replaced frame resolves late.
function scheduleVizScan(getDoc: () => Document | null | undefined): void {
	if (!hasVizScanListeners()) return;
	setTimeout(() => {
		try {
			const doc = getDoc();
			if (doc?.querySelector('.lattice svg')) recordVizScan(scanBlackFills(doc), performance.now());
			else if (doc) recordVizScan([], performance.now()); // no SVG on this slide → clear stale findings
		} catch {}
	}, 650);
}

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

	// Teardown bookkeeping — everything THIS renderer instance creates that would
	// otherwise outlive it: the per-host ResizeObservers, the hosts it registered
	// in the module-level scaleTargets Map (a GC ROOT — the leak vector), the
	// theme-change MutationObserver(s) on the immortal document.documentElement,
	// and the pending 4s reveal timers. dispose() releases them. Without it a
	// REMOUNTING host — HeroPreview's Preview<->Source tab flip, the Slide
	// Overview (one host per slide), the Studio overlays — leaks a fully-parsed
	// ~560KB theme iframe per cycle, invisible to GC because scaleTargets roots it.
	// See engineering/decisions/2026-07-17-preview-accumulation-leaks.md.
	const ownedObservers = new Set<ResizeObserver>();
	const ownedHosts = new Set<HTMLElement>();
	const themeObservers = new Set<MutationObserver>();
	const themeUnsubscribes = new Set<() => void>();
	const ownedTimers = new Set<ReturnType<typeof setTimeout>>();
	const ownedIntervals = new Set<ReturnType<typeof setInterval>>();
	// Latch: renderInto is async (awaits theme fetch + the engine render), so an
	// unmount can land mid-render. Without this the settling continuation would
	// re-register the host in scaleTargets + re-add its observer AFTER dispose()
	// emptied those sets — re-rooting the detached iframe the fix is meant to free.
	// dispose() sets it; the continuation bails before it touches the DOM.
	let disposed = false;

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

	// The inner text of the srcdoc's resident `<style id="lattice-theme">` — the ONE place a
	// slide's theme, mode, size-box, and author CSS are baked. Extracted so srcdoc() (full write)
	// and the RESTYLE fast path (renderInto) build it identically: a theme/mode change swaps THIS
	// string into the live document's existing <style> instead of rewriting the whole srcdoc, so
	// no new iframe realm is minted per palette/mode toggle (the theme-toggle realm-churn leak,
	// 2026-07-20-studio-audit-instrument-fix). @font-face is position-independent but kept up top
	// to document intent; color-scheme is forced to the rendered mode so a theme's `light-dark()`
	// pairs resolve as chosen; author-supplied `extraCss` (Fabricate Layout Studio's live component
	// styles) is appended AFTER the theme, the same order the Workbench previews it.
	function themeStyleContent(css: string, mode: 'light' | 'dark', geom: Geom, extraCss = ''): string {
		const bg = mode === 'dark' ? '#0c0c0c' : '#e7e7ea';
		return (
			fontFaceCss +
			singleSlideFrame(geom.width, geom.height) +
			':root{color-scheme:' +
			mode +
			'}html,body{background:' +
			bg +
			'}' +
			css +
			(extraCss ? '\n/* studio-extra-css */\n' + extraCss : '')
		);
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
		let s =
			// The theme <style> carries an id so the RESTYLE fast path (renderInto) can find
			// and swap it in place on a theme/mode change — no srcdoc rewrite, no new realm.
			'<!doctype html><html><head><meta charset="utf-8"><style id="lattice-theme">' +
			themeStyleContent(css, mode, geom, extraCss) +
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
		if (w > 0) {
			fr.style.transform = 'scale(' + (w / geom.width).toFixed(5) + ')';
			// Reveal once we have (a) a real width to scale to — else the frame shows UNSCALED
			// at its intrinsic 1280px and the centered content falls outside the box (blank) —
			// AND (b) the srcdoc has actually PAINTED its slide, detected by a `.lattice` in the
			// frame's document. Keying on CONTENT, not the `onload` event, is load-bearing:
			// iOS Safari fires `onload` UNRELIABLY for srcdoc (re)assignment, which left the
			// frame stuck hidden forever (rev:NO on-device — the "blank"). Content-presence is
			// onload-independent AND closes the white about:blank window (about:blank has no
			// `.lattice`, so the pre-load scaleFrame below can't reveal a blank white frame).
			// Reveal by fading OPACITY 0→1 (a quick ~180ms transition set on the element) rather
			// than a hard visibility cut, so the slide eases in over the loader instead of
			// popping — no flicker. opacity:0 hides the about:blank white just as well.
			if (fr.style.opacity === '0' && frameHasPainted(fr)) fr.style.opacity = '1';
		}
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
		// Consume the coalesce count DeckPreview stamped on the host for this render
		// (edits collapsed by the debounce), synchronously here so it's bound to THIS
		// render. Reset to 1 so a follow-up palette/rising-edge render (which doesn't
		// go through the debounce) correctly reports "no coalescing".
		const liveHost = host as LiveHost;
		const coalesced = liveHost.__latticeCoalesce ?? 1;
		liveHost.__latticeCoalesce = 1;
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
				// Bail if the host was disposed/detached while the theme fetch was in
				// flight — don't spend an engine render on a torn-down preview.
				if (disposed || !host.isConnected) return { ok: false, slides: 0, error: 'renderer disposed' };
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
						// Deck context (item 2): count chart-layout sections + mermaid fences
						// in the output, detect math from the source. Chart slides carry their
						// layout class (piechart/gantt/…) on the <section> in the engine HTML
						// string; the `chart-frame` marker is added at RUNTIME (applyToDom) and
						// isn't in the string yet — so we match the layout class, not the marker.
						// This alternation MIRRORS `CHART_LAYOUTS` in
						// lib/components/chart/_chart-family/chart-family.js (all 13 layouts) —
						// keep it in sync when a chart type is added there (neither the engine
						// nor the playground re-exports the list, so it can't be imported here).
						// Overflow is read from the live frame after it settles (below) — 0 here
						// as a placeholder.
						s.charts = (out.html.match(/<section\b[^>]*\bclass="[^"]*\b(?:progress|timeline-list|piechart|gantt|kanban|radar|quadrant|state-chart|funnel|map|journey|word-cloud|roadmap)\b/g) || []).length;
						s.mermaid = (out.html.match(/language-mermaid/g) || []).length;
						// Match the engine's OWN KaTeX gate exactly — renderMarkdown
						// (render-engine.ts) loads KaTeX when `sourceHasMath(source)` is true on
						// the UN-stripped source, and that cold-load cost lands in `other`. Using
						// the same gate makes the "math" chip mean precisely "this render
						// triggered a KaTeX load"; stripping code here would hide math whose cost
						// the engine still paid (e.g. a `$…$` inside a code fence).
						s.math = sourceHasMath(markdown);
						s.overflow = 0;
					}
				} catch (e) {
					console.error('single-slide render failed', e);
					return { ok: false, slides: 0, error: String((e as Error)?.message || e) };
				}
				// dispose()/unmount may have landed during the (awaited) engine render.
				// Bail BEFORE any DOM mutation or observer/scaleTargets registration below,
				// so a settling render can't re-root a host dispose() just released.
				if (disposed || !host.isConnected) return { ok: false, slides: 0, error: 'renderer disposed' };
				// Stash the resolved slide box so scaleFrame divides by the right width.
				const geom: Geom = { width: out.width || DEFAULT_W, height: out.height || DEFAULT_H };
				(host as LiveHost).__latticeGeom = geom;
				// Section count — computed here so the onload sample below captures it.
				const slides = (out.html.match(/<\/section>/g) || []).length;

				// PATCH FAST PATH. Everything baked into the srcdoc OUTSIDE the section —
				// the theme <style> (out.css + extra/author CSS) and the runtime <script> —
				// is fingerprinted here. When it's unchanged and a live document already
				// exists, swap ONLY the `.lattice` body: the browser skips re-parsing the
				// ~560KB theme sheet and re-executing the runtime (a ~485ms full-write on a
				// throttled phone → ~2ms), and the resident runtime's observer re-processes
				// the new section. Any change to theme/mode/size/mermaid/author-CSS misses
				// the sig and falls through to a full rewrite so the new <style>/<script>
				// take effect. The single-slide twin of deck-preview.js's renderDeck gate.
				// mermaid is keyed on the PROP (not a content scan like deck-preview's K/M
				// suffix) DELIBERATELY: this path's mermaid <script> injection is itself
				// prop-driven (see srcdoc()), so a constant prop means constant script
				// presence — a mermaid-content edit needs no full write, and the resident
				// runtime re-renders the swapped fence. KaTeX needs no flag either: single
				// -slide never injects a katex <link>; math rides the patch as static HTML.
				const sig = `${theme}|${mode}|${geom.width}x${geom.height}|${mermaid ? 'M' : ''}|${hashString(extraCss || '')}|${hashString(extra?.css || '')}`;
				// RESTYLE sig — everything a theme/mode change CANNOT re-render in place: the frame
				// box (geom, which sizes the resident <style>'s singleSlideFrame + the iframe element)
				// and the mermaid <script> presence (prop-driven, so it can't be injected post-hoc).
				// Theme, mode, the composed CSS, and author extraCss all bake into the swappable
				// <style>, so they are DELIBERATELY absent here — a change in any of them keeps the
				// same geom+mermaid, hits the restyle path, and swaps the <style> instead of rewriting.
				const restyleSig = `${geom.width}x${geom.height}|${mermaid ? 'M' : ''}`;
				const live = host.querySelector<HTMLIFrameElement>('iframe.live');
				// Skip the patch while a full-write srcdoc is still loading: its
				// contentDocument is briefly the OUTGOING one (which still has `.lattice`),
				// and patching THAT would be lost when the pending navigation commits. The
				// full write below sets __latticePendingLoad and clears it in onload.
				if (
					live &&
					!(host as LiveHost).__latticePendingLoad &&
					(host as LiveHost).__latticeFrameSig === sig &&
					live.contentDocument?.querySelector('.lattice')
				) {
					const tSan = performance.now();
					const safe = sanitizeSlideHtml(out.html);
					const patchSanitizeMs = performance.now() - tSan;
					const tFrame = performance.now();
					if (patchSlideBody(live, safe)) {
						const tFit = performance.now();
						scaleFrame(host);
						const patchFitMs = performance.now() - tFit;
						// Defer the debug overlay one frame so it measures AFTER the resident
						// runtime re-stamps the swapped section's geometry (the full-write path
						// gets this for free by drawing in onload, post-layout).
						requestAnimationFrame(() => applyDebug(live, { force: null }));
						const now = performance.now();
						// Feed the SAME overlay signals the full-write path does (coalesce
						// count + engine per-stage stats + settled overflow), so the RENDER
						// breakdown / COALESCE / overflow chip stay accurate on patched renders
						// too — not just on full writes.
						const rec = recordRenderSample({ engineMs, sanitizeMs: patchSanitizeMs, frameMs: now - tFrame, fitMs: patchFitMs, totalMs: now - tStart, slides, srcBytes: markdown.length, coalesced, stats: out.stats, writePath: 'patch' });
						if (out.stats) {
							const countOverflow = () => {
								try {
									return live.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
								} catch {
									return 0;
								}
							};
							const shown = patchOverflow(rec, countOverflow());
							setTimeout(() => patchOverflow(shown, countOverflow()), 600);
						}
						scheduleVizScan(() => live.contentDocument);
						return { ok: true, slides, error: null, writePath: 'patch' as const };
					}
					// The live document vanished between the guard and the patch — fall
					// through to a full write below.
				}

				// RESTYLE FAST PATH. A theme / mode / palette change (the frame box + mermaid
				// unchanged) is the DOMINANT repeated action — and the full-write path below rewrites
				// the whole srcdoc for it, minting a fresh iframe realm every time; those detached
				// realms accumulate (~1.3 MB per toggle across the live previews — the theme-toggle
				// realm-churn leak, 2026-07-20-studio-audit-instrument-fix). Instead, when a live doc
				// already exists, swap the resident `<style id="lattice-theme">` in place and patch
				// the body — the same iframe + same realm, restyled. No reparse of the runtime, no new
				// realm. Falls through to a full write only when there is no live doc, a write is still
				// in flight, or the frame box / mermaid changed (which the resident <style>/<script>
				// can't express).
				const themeStyleEl = live?.contentDocument?.getElementById('lattice-theme') as HTMLStyleElement | null | undefined;
				if (
					live &&
					!(host as LiveHost).__latticePendingLoad &&
					(host as LiveHost).__latticeRestyleSig === restyleSig &&
					themeStyleEl &&
					live.contentDocument?.querySelector('.lattice')
				) {
					const tSan = performance.now();
					const safe = sanitizeSlideHtml(out.html);
					const restyleSanitizeMs = performance.now() - tSan;
					const tFrame = performance.now();
					// Swap the theme <style> in place FIRST, then the body — the new palette applies
					// atomically with the new section, so a viewer never sees the old theme on the new
					// body (or vice-versa) for a frame.
					themeStyleEl.textContent = themeStyleContent(out.css, mode, geom, extraCss);
					if (patchSlideBody(live, safe)) {
						(host as LiveHost).__latticeFrameSig = sig;
						(host as LiveHost).__latticeRestyleSig = restyleSig;
						const tFit = performance.now();
						scaleFrame(host);
						const restyleFitMs = performance.now() - tFit;
						requestAnimationFrame(() => applyDebug(live, { force: null }));
						const now = performance.now();
						const rec = recordRenderSample({ engineMs, sanitizeMs: restyleSanitizeMs, frameMs: now - tFrame, fitMs: restyleFitMs, totalMs: now - tStart, slides, srcBytes: markdown.length, coalesced, stats: out.stats, writePath: 'restyle' });
						if (out.stats) {
							const countOverflow = () => {
								try {
									return live.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
								} catch {
									return 0;
								}
							};
							const shown = patchOverflow(rec, countOverflow());
							setTimeout(() => patchOverflow(shown, countOverflow()), 600);
						}
						scheduleVizScan(() => live.contentDocument);
						return { ok: true, slides, error: null, writePath: 'restyle' as const };
					}
					// patchSlideBody failed (the live doc vanished mid-swap) — fall through to a full write.
				}

				let fr = host.querySelector<HTMLIFrameElement>('iframe.live');
				// The once-guarded onload-side work, shared by the reveal poll (below, iOS paint
				// path) and the browser `onload` (assigned near the srcdoc write). Declared out here
				// so both the `if (!fr)` create branch's poll and the write path can see it.
				let onFrameLoad: (() => void) | null = null;
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
					// Invisible until the FIRST srcdoc actually paints (revealed by scaleFrame's
					// content gate). A freshly-appended iframe with no srcdoc is `about:blank`,
					// which iOS Safari paints as an OPAQUE WHITE document ON TOP OF the element's
					// CSS `background` — so a cold load flashed a white slide card. `opacity:0`
					// makes the whole element (white content included) transparent, so the dark
					// pane behind covers that window — AND, unlike `visibility`, opacity animates,
					// so the reveal is a quick fade-in (transition below) instead of a hard pop.
					fr.style.opacity = '0';
					fr.style.transition = 'opacity 180ms ease-out';
					host.appendChild(fr);
					// Reveal is CONTENT-DRIVEN, not onload-driven. The reveal rides scaleFrame's
					// `frameHasPainted` gate, but we must call scaleFrame once the srcdoc has
					// actually painted — and iOS Safari fires `onload` UNRELIABLY for srcdoc, so
					// we cannot wait on it (on-device: frame scaled but stuck hidden forever,
					// rev:NO — the blank). Poll on a rAF-ish cadence: each tick re-fits + reveals
					// the moment BOTH the host has width AND the slide has painted, with no
					// dependence on the load event or a host-resize firing. Stops once the load-work
					// has cleared pendingLoad or the ~30s budget elapses. There is deliberately NO force-reveal of a
					// still-not-good frame: the SKELETON model prefers the loader staying up over
					// flashing an unscaled/broken slide (DeckPreview keys its loader-fade on this
					// reveal), and the persistent host ResizeObserver keeps re-fitting after the
					// poll ends, so a later width change still reveals the frame the instant it's
					// good. A frame that never becomes good simply stays behind the skeleton.
					const revealFr = fr;
					let revealTicks = 0;
					// The onload-side work (clear __latticePendingLoad → re-enable the patch/restyle
					// fast-paths; run the debug overlay / video bridge / render sample) must happen
					// even when iOS Safari DROPS the srcdoc `onload` — else pendingLoad stays true
					// forever and every subsequent edit falls back to a full realm-churning re-write.
					// `onFrameLoad` (declared above the create branch, assigned after the synchronous
					// setup below) is once-guarded, so the poll can safely fire it on first paint
					// whether or not `onload` ever comes.
					const revealPoll = setInterval(() => {
						revealTicks++;
						// Stop once the load-work has cleared `__latticePendingLoad` (its once-guarded run
						// both reveals the frame AND re-enables the patch/restyle fast paths) — or the host
						// is gone, or the ~30s budget is spent. Keying the stop on pendingLoad (NOT "looks
						// revealed", `opacity !== '0'`) is load-bearing: the persistent ResizeObserver can
						// reveal the frame via its OWN scaleFrame before this poll fires onFrameLoad, and
						// stopping on opacity there would strand `pendingLoad = true` → the fast paths stay
						// disabled and every edit falls to a full realm-churning re-write. The budget is
						// generous (~30s): a first paint this slow is pathological, but until pendingLoad
						// clears we KEEP polling so even a slow paint re-enables the fast paths. A frame that
						// truly never paints simply stays on the safe write path (we never patch an unpainted doc).
						if (disposed || !host.isConnected || (host as LiveHost).__latticePendingLoad === false || revealTicks > 300) {
							clearInterval(revealPoll);
							ownedIntervals.delete(revealPoll);
							return;
						}
						scaleFrame(host); // reveals IFF host width>0 AND the srcdoc has painted .lattice — never a broken frame
						if (frameHasPainted(revealFr)) onFrameLoad?.(); // iOS: onload may never fire — run its work on paint (once-guarded)
					}, 100);
					ownedIntervals.add(revealPoll);
					if (typeof ResizeObserver !== 'undefined') {
						// The callback honors the module-level drag gate above; the host is
						// registered so a resume can re-fit it once, authoritatively.
						// Sweep dead hosts on each registration so no-drag sessions
						// (where the resume-time prune never runs) stay bounded too.
						for (const h of scaleTargets.keys()) if (!h.isConnected) scaleTargets.delete(h);
						scaleTargets.set(host, () => scaleFrame(host));
						// Keep the observer instance (was anonymous) so dispose() can
						// disconnect it — and remember the host so dispose() can also drop
						// its scaleTargets entry (the module-level root that leaks it).
						const ro = new ResizeObserver(() => {
							if (!scaleSuspended) scaleFrame(host);
						});
						ro.observe(host);
						ownedObservers.add(ro);
						ownedHosts.add(host);
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
				// Run exactly once — via the browser's `onload` (normal) OR the reveal poll's paint
				// detection (iOS, where onload is unreliable). The guard makes a double-trigger a no-op.
				let loadRan = false;
				onFrameLoad = () => {
					if (loadRan) return;
					loadRan = true;
					// Fit first (timed around the existing clientWidth read — no extra
					// reflow), then debug overlay + video bridge which are outside the
					// measured fit. frameMs is the browser's own parse/layout of the
					// srcdoc: from the end of our synchronous setup below to this load event.
					// This srcdoc has committed — future same-sig renders may now patch it.
					(host as LiveHost).__latticePendingLoad = false;
					const tFit = performance.now();
					// onload, when it DOES fire, is just one more reveal trigger — scaleFrame
					// fits and reveals via the content gate (frameHasPainted). The reveal poll
					// above is the reliable path on iOS where this event may never come.
					scaleFrame(host);
					const fitMs = performance.now() - tFit;
					applyDebug(fr, { force: null });
					// Parent-hosted video playback: tap a video poster in a Studio preview
					// to play the clip in a centered lightbox (the link guard bridges to it).
					installVideoBridge(fr.contentWindow);
					const now = performance.now();
					const rec = recordRenderSample({
						engineMs,
						sanitizeMs,
						frameMs: now - tFrameStart,
						fitMs,
						totalMs: now - tStart,
						slides,
						srcBytes,
						coalesced,
						stats: out.stats,
						writePath: 'write',
					});
					// Overflow settles AFTER load (font settle → the runtime's overflow
					// watcher toggles `section.overflow` inside the same-origin frame). Read
					// it once now and again after it settles, patching the sample in place
					// so the count is accurate without re-timing the render. Best-effort:
					// a cross-doc read can throw during teardown.
					if (out.stats) {
						const countOverflow = () => {
							try {
								return fr?.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
							} catch {
								return 0;
							}
						};
						// Publish the immediate read AND a settled re-read through patchOverflow
						// — never an in-place mutation of the recorded sample. Mutating
						// `out.stats.overflow` here would poison patchOverflow's own
						// `overflow === n` change-guard, so a slide that already overflows at
						// load (immediate read == settled read) would never fire a re-render and
						// the chip would stay hidden. patchOverflow returns whichever sample is
						// now displayed, so the settled read patches the CURRENT one, not `rec`.
						const shownSample = patchOverflow(rec, countOverflow());
						setTimeout(() => patchOverflow(shownSample, countOverflow()), 600);
					}
					scheduleVizScan(() => fr?.contentDocument);
				};
				fr.onload = onFrameLoad;
				// Mark the navigation in flight BEFORE assigning srcdoc: until onload
				// clears it, the patch guard above must not touch the outgoing document.
				(host as LiveHost).__latticePendingLoad = true;
				fr.srcdoc = srcdoc(out.html, out.css, mode, mermaid, geom, extraCss);
				// srcdoc() runs the sanitize pass; copy its duration out of the shared
				// closure var before an interleaved render can overwrite it.
				sanitizeMs = lastSanitizeMs;
				scaleFrame(host);
				host.classList.add('is-live');
				// Record the sig this full document was built for, so the NEXT render can
				// take the patch fast path above when nothing outside the section changed.
				(host as LiveHost).__latticeFrameSig = sig;
				// Record the frame box + mermaid this srcdoc was built for, so the NEXT theme/mode/
				// palette change can take the RESTYLE fast path above (swap the <style> in place)
				// instead of rewriting the whole srcdoc and minting a new realm.
				(host as LiveHost).__latticeRestyleSig = restyleSig;
				// Stamp AFTER the synchronous setup (srcdoc build + sanitize + pre-load
				// fit) so frameMs isolates the browser's async parse/layout — the build
				// and sanitize costs are still captured by totalMs and sanitizeMs.
				tFrameStart = performance.now();
				return { ok: true, slides, error: null, writePath: 'write' as const };
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
					ownedIntervals.delete(t);
					resolve();
				}
			}, 50);
			// Tracked so dispose() cancels it — otherwise a host unmounted before the
			// engine loads (only the no-engineUrl fallback path: tests/legacy) would
			// leave this poll spinning forever.
			ownedIntervals.add(t);
		});
	}

	/**
	 * Call `cb` (debounced) whenever the palette or light/dark mode changes.
	 * Returns an unsubscribe that disconnects the observer. The observer sits on
	 * document.documentElement — a PERMANENT node — so it can NEVER be garbage-
	 * collected while the page lives, and its closure pins the whole renderer; a
	 * caller that can outlive the page (Astro soft-nav, or any re-init) MUST call
	 * the unsubscribe (specimen.js does, on teardown). dispose() also drops it.
	 */
	function onThemeChange(cb: () => void): () => void {
		let timer: ReturnType<typeof setTimeout>;
		const mo = new MutationObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(cb, 80);
		});
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		themeObservers.add(mo);
		const unsub = () => {
			clearTimeout(timer); // clear the in-flight debounce so cb can't fire post-teardown
			mo.disconnect();
			themeObservers.delete(mo);
			themeUnsubscribes.delete(unsub);
		};
		themeUnsubscribes.add(unsub);
		return unsub;
	}

	/**
	 * Release everything this renderer owns — the per-host ResizeObservers, their
	 * module-level `scaleTargets` entries (the GC root that would otherwise keep a
	 * detached preview `<figure>`→`<iframe>` subtree alive), the theme-change
	 * observer(s) on the immortal documentElement, and the pending reveal timers.
	 * Idempotent. React hosts call this on unmount (DeckPreview); imperative
	 * callers (specimen) call it on page teardown. It does NOT remove the iframe
	 * from the DOM — the caller owns the host node's lifecycle (React unmounts it).
	 */
	function dispose(): void {
		disposed = true; // stop any in-flight renderInto from re-registering below
		for (const ro of ownedObservers) {
			try {
				ro.disconnect();
			} catch {}
		}
		ownedObservers.clear();
		for (const h of ownedHosts) scaleTargets.delete(h);
		ownedHosts.clear();
		// Unsubscribe theme watchers via their own closures so the pending debounce
		// timer is cleared too (a bare mo.disconnect() would leave it armed).
		for (const unsub of [...themeUnsubscribes]) unsub();
		themeUnsubscribes.clear();
		for (const mo of themeObservers) {
			try {
				mo.disconnect();
			} catch {}
		}
		themeObservers.clear();
		for (const t of ownedTimers) clearTimeout(t);
		ownedTimers.clear();
		for (const iv of ownedIntervals) clearInterval(iv);
		ownedIntervals.clear();
	}

	return { renderInto, whenReady, onThemeChange, scaleFrame, ready, prefetchTheme, dispose };
}

export type SingleSlideRenderer = ReturnType<typeof createSingleSlideRenderer>;
