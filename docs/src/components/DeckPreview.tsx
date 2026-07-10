import * as React from 'react';
import {
	createSingleSlideRenderer,
	type SingleSlideOptions,
	type SingleSlideRenderer,
} from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';

// The React single-slide wrapper over single-slide-render.ts — the plain
// single-stage bridge HeroPreview renders through for its Preview face: a figure
// host that live-renders ONE deck on engine-ready and re-renders on the global
// palette/mode flip, deferring while hidden (a tab panel). It NEVER reimplements
// the engine; it owns a stable renderer instance (like the old createLandingEngine
// ref). The font-embed fix rides in single-slide-render.ts, so every consumer
// (landing included) now registers the vendored Caveat/Shantell faces.
//
// RestyleShowcase (carousel) and FieldCardsLive (multi-host, renders null) keep
// their bespoke orchestration and drive createSingleSlideRenderer directly — the
// SAME shared renderer, just not through this declarative figure.

export type DeckPreviewProps = {
	/** Renderer config (themeBase / runtimeUrl / engineUrl) — built from page data. */
	options: SingleSlideOptions;
	/** Slide markdown to render. */
	sample: string;
	/** Whether the deck needs the mermaid runtime injected. */
	mermaid: boolean;
	/** Force a specific palette instead of the global `<html data-palette>`. */
	paletteOverride?: string;
	/** Render against a raw in-memory theme (Fabricate's live derived theme).
	 *  When set, `paletteOverride` should equal `extraTheme.name`. */
	extraTheme?: { name: string; css: string };
	/** Force a specific light/dark mode instead of the global `<html data-mode>`
	 *  — lets a surface audition a theme in both modes (Fabricate's specimen). */
	modeOverride?: 'light' | 'dark';
	/** Raw author CSS appended after the theme — Fabricate's Layout Studio live
	 *  local-component styles. */
	extraCss?: string;
	/**
	 * Render only while true. Lets a host that may be hidden (a tab panel) defer
	 * the render until it is shown — re-renders on the rising edge.
	 */
	active?: boolean;
	/**
	 * Coalesce rapid re-renders (e.g. per-keystroke source edits) to a TRAILING
	 * debounce, so a typing burst triggers ONE engine render after the user
	 * pauses instead of one per keystroke. The first paint is always immediate;
	 * only subsequent changes are debounced. 0 (default) renders eagerly — the
	 * right choice for a static-`sample` host (landing, showcases).
	 */
	debounceMs?: number;
	className?: string;
	'aria-label'?: string;
	role?: React.AriaRole;
};

/**
 * A figure host that live-renders ONE deck through the shared renderer. Renders
 * on engine-ready (lazy bundle load) and re-renders on a global palette/mode
 * flip; defers while `active` is false and renders on the rising edge.
 */
export function DeckPreview({
	options,
	sample,
	mermaid,
	paletteOverride,
	extraTheme,
	modeOverride,
	extraCss,
	active = true,
	debounceMs = 0,
	className,
	role,
	...aria
}: DeckPreviewProps) {
	// One renderer instance for this host (holds the theme + font caches).
	// Lazy-init: `options` is rebuilt each render from page data, so construct the
	// renderer exactly once on first render and keep that instance thereafter
	// (avoids re-running createSingleSlideRenderer every render).
	const engineRef = React.useRef<SingleSlideRenderer | null>(null);
	if (engineRef.current === null) engineRef.current = createSingleSlideRenderer(options);
	const stageRef = React.useRef<HTMLElement>(null);
	const activeRef = React.useRef(active);
	activeRef.current = active;

	// Re-render when the theme's NAME or its CSS CONTENT changes. The live-derived
	// specimen has a content-hash name (so name alone would suffice), but a SAVED
	// library theme keeps a stable slug name while its CSS can change (re-save after
	// an edit) — so we must also depend on the css. Deps compare strings by value,
	// and `extraTheme.css` is a stable reference for a given theme, so identical
	// content never thrashes; only a real css change re-renders.
	// biome-ignore lint/correctness/useExhaustiveDependencies: extraTheme is read whole; its identity is captured by (name, css) — depending on the wrapper object would thrash.
	const render = React.useCallback(() => {
		const host = stageRef.current;
		if (host && activeRef.current) engineRef.current?.renderInto(host, sample, mermaid, paletteOverride, extraTheme, modeOverride, extraCss);
	}, [sample, mermaid, paletteOverride, extraTheme?.name, extraTheme?.css, modeOverride, extraCss]);

	// Always hold the LATEST render closure in a ref, so the active rising-edge
	// effect can reach the current render WITHOUT listing it as a dependency —
	// otherwise that effect re-fires on every content change and renders eagerly,
	// silently defeating the debounce below.
	const renderRef = React.useRef(render);
	renderRef.current = render;

	// Render once the engine bundle has loaded, then again whenever the source
	// (or theme) changes. The FIRST paint runs immediately; with `debounceMs` set
	// each subsequent change is coalesced to a trailing timer, so a typing burst
	// fires ONE engine render after the pause instead of one (~38ms) per keystroke
	// — the per-keystroke render is what blocks the main thread (see
	// `engineering/decisions/2026-06-29-studio-render-debounce.md`).
	const paintedRef = React.useRef(false);
	React.useEffect(() => {
		let cancelled = false;
		const paint = () => {
			// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
			// (not behind it) — whenReady()'s ensureEngine() and this are two
			// independent network round-trips that were previously serialized.
			engineRef.current?.prefetchTheme?.(paletteOverride, modeOverride);
			return engineRef.current?.whenReady().then(() => { if (!cancelled) render(); });
		};
		if (!paintedRef.current || debounceMs <= 0) {
			paintedRef.current = true;
			paint();
			return () => { cancelled = true; };
		}
		const id = setTimeout(paint, debounceMs);
		return () => { cancelled = true; clearTimeout(id); };
		// paletteOverride/modeOverride are already implicit in `render`'s own
		// identity (its useCallback deps list them), so listing them here too is
		// redundant in practice — but explicit, since `paint()` reads them directly
		// for the parallel prefetch, ahead of `render()` actually running.
	}, [render, debounceMs, paletteOverride, modeOverride]);

	// Re-render on palette / mode change (the shared topbar writes <html> attrs).
	React.useEffect(() => {
		const root = document.documentElement;
		let t: ReturnType<typeof setTimeout>;
		const obs = new MutationObserver(() => {
			clearTimeout(t);
			t = setTimeout(render, 80);
		});
		obs.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		return () => {
			clearTimeout(t);
			obs.disconnect();
		};
	}, [render]);

	// Render ONLY on the rising edge of `active` (e.g. switching back to a tab) —
	// reading the latest render via the ref so this effect does NOT re-fire (and
	// eagerly render) on every content change. Depending on `render` here is what
	// leaked a per-keystroke render past the debounce.
	const wasActiveRef = React.useRef(active);
	React.useEffect(() => {
		const rising = active && !wasActiveRef.current;
		wasActiveRef.current = active;
		if (rising) requestAnimationFrame(() => renderRef.current());
	}, [active]);

	// `m-0` neutralizes the `<figure>` UA default margin (`0 40px`) — Tailwind
	// preflight doesn't reach inside the studio island, and that 40px inline margin
	// shoves a `w-full` preview off its track and overflows narrow viewports.
	return <figure ref={stageRef} className={cn('m-0', className)} role={role} {...aria} />;
}

export default DeckPreview;
