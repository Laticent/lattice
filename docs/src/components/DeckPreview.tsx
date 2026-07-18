import * as React from 'react';
import { createFrameScheduler } from '@/lib/frame-scheduler';
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
	 * FRAME-ALIGNED coalescing for a live-editing host (per-keystroke source
	 * edits). Instead of a trailing timer, a change marks the preview dirty and
	 * schedules ONE render on the next animation frame; a burst of keystrokes
	 * within a frame collapses into a single render of the LATEST state (the
	 * video-game render-loop model). An in-flight guard means a slow render never
	 * backs up — the newest state paints as soon as the previous one settles. The
	 * first paint is always immediate. Omit (default false) for a static-`sample`
	 * host (landing, showcases): it renders eagerly, a one-shot. See
	 * `engineering/decisions/2026-07-15-frame-aligned-preview-render.md`.
	 */
	coalesce?: boolean;
	className?: string;
	'aria-label'?: string;
	/** Hide the whole preview subtree from assistive tech — for a thumbnail whose
	 *  wrapping control already carries the accessible name (the figure would else
	 *  duplicate it). */
	'aria-hidden'?: boolean;
	role?: React.AriaRole;
	/**
	 * Fired ONCE, after the first successful render resolves — the signal that the
	 * live preview has taken over. studio.astro's SSG instant-shell listens for
	 * this to dismiss itself, so the static first slide stays up until the live one
	 * is ready (never a blank-preview gap).
	 */
	onFirstRender?: () => void;
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
	coalesce = false,
	className,
	role,
	onFirstRender,
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
	// One-shot first-render signal (SSG instant-shell dismissal). Held in refs so
	// firing it never enters `render`'s dependency list.
	const onFirstRenderRef = React.useRef(onFirstRender);
	onFirstRenderRef.current = onFirstRender;
	const firstRenderFiredRef = React.useRef(false);

	// Re-render when the theme's NAME or its CSS CONTENT changes. The live-derived
	// specimen has a content-hash name (so name alone would suffice), but a SAVED
	// library theme keeps a stable slug name while its CSS can change (re-save after
	// an edit) — so we must also depend on the css. Deps compare strings by value,
	// and `extraTheme.css` is a stable reference for a given theme, so identical
	// content never thrashes; only a real css change re-renders.
	// biome-ignore lint/correctness/useExhaustiveDependencies: extraTheme is read whole; its identity is captured by (name, css) — depending on the wrapper object would thrash.
	const render = React.useCallback(() => {
		const host = stageRef.current;
		if (!host || !activeRef.current) return;
		const done = engineRef.current?.renderInto(host, sample, mermaid, paletteOverride, extraTheme, modeOverride, extraCss);
		if (done && !firstRenderFiredRef.current) {
			done
				.then((st) => {
					if (!st?.ok || firstRenderFiredRef.current) return;
					const fire = () => {
						if (firstRenderFiredRef.current) return;
						firstRenderFiredRef.current = true;
						onFirstRenderRef.current?.();
					};
					// renderInto resolves when the srcdoc is SET — the iframe's own load
					// (parse + scale/reveal) fires LATER. Wait for that so a consumer
					// (the SSG instant-shell dismissal) doesn't swap out its static slide
					// while the live frame is still blank. Resolve runs as a microtask
					// before the load macrotask, so the listener attaches in time; the
					// readyState guard covers the already-loaded edge.
					const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
					if (!fr) fire();
					else if (fr.contentDocument?.readyState === 'complete') fire();
					else fr.addEventListener('load', fire, { once: true });
				})
				.catch(() => {});
		}
		// Return the render promise so the frame scheduler can await it for
		// backpressure — never overlap two renders on the same host.
		return done;
	}, [sample, mermaid, paletteOverride, extraTheme?.name, extraTheme?.css, modeOverride, extraCss]);

	// Always hold the LATEST render closure in a ref, so the frame scheduler and the
	// active rising-edge effect can reach the current render WITHOUT listing it as a
	// dependency — otherwise those effects re-fire on every content change and render
	// eagerly, silently defeating the frame-aligned coalescing below.
	const renderRef = React.useRef(render);
	renderRef.current = render;

	// FRAME-ALIGNED RENDER LOOP — driven by the SHARED scheduler (@/lib/frame-scheduler),
	// the same kernel the Playground filmstrip uses. A change schedules ONE render on the
	// next frame; a burst collapses to a single render of the LATEST state; a cheap patch
	// fires next-frame-instant while a heavy render (a full write, or one over the
	// scheduler's wall-clock backstop) coalesces so a slider drag / theme audition on a
	// full-write host (Finish, Fabricate, Layout) can't strobe. First paint / eager hosts
	// flush immediately. See `engineering/decisions/2026-07-15-frame-aligned-preview-render.md`.
	const paintedRef = React.useRef(false);
	// Edits collapsed into the NEXT committed paint — stamped on the host at render time so
	// the perf overlay's COALESCE chip reports what one paint absorbed.
	const coalesceRef = React.useRef(0);

	// The render the scheduler drives: stamp the coalesce count, prefetch the theme in
	// PARALLEL with the engine-bundle load, render the LATEST state (via renderRef), and
	// report whether it was a full WRITE (the scheduler adds its own wall-clock heavy
	// backstop on top). Held in a ref, reassigned each render, so the scheduler always
	// reaches the current palette/mode. whenReady() may reject (bundle load) — the
	// scheduler's own `.catch` swallows it, so no unhandled rejection.
	const runRenderRef = React.useRef<() => Promise<{ heavy: boolean } | undefined>>(async () => undefined);
	runRenderRef.current = async () => {
		const host = stageRef.current as (HTMLElement & { __latticeCoalesce?: number }) | null;
		if (host) host.__latticeCoalesce = coalesceRef.current || 1;
		coalesceRef.current = 0;
		engineRef.current?.prefetchTheme?.(paletteOverride, modeOverride);
		// NOTE (intentional, do NOT "fix" by hoisting whenReady out of the timed span):
		// the scheduler's wall-clock heavy backstop times this whole thunk, so `whenReady()`
		// is inside the measured span here — unlike the old inline loop, which timed only
		// renderInto. It's provably inert: whenReady() resolves in ~0 once the engine bundle
		// is loaded (steady-state typing), and the only renders where it's slow are pre-load
		// full WRITES, already heavy via writePath. So it can't push a real ~2ms patch past
		// the 50ms line.
		await engineRef.current?.whenReady();
		const status = await renderRef.current();
		return { heavy: status?.writePath === 'write' };
	};

	// One scheduler instance per host (created once; drives runRenderRef via a stable thunk
	// so it always calls the latest closure). The heavy/coalesce/watchdog DEFAULTS (50 /
	// 120 / 4000ms) match the values this component used inline before the shared-kernel
	// convergence.
	const schedulerRef = React.useRef<ReturnType<typeof createFrameScheduler> | null>(null);
	if (!schedulerRef.current) {
		schedulerRef.current = createFrameScheduler({ render: () => runRenderRef.current() });
	}

	// On every change the render closure's identity changes. The FIRST paint (and
	// any static `coalesce=false` host) paints immediately; an interactive host
	// marks dirty and schedules the next frame. `render` is the change-TRIGGER: it
	// isn't called in the body (the scheduler reaches it via renderRef), but its
	// identity flips whenever any render input changes, which is exactly when we
	// want to re-run — so it stays in the deps despite not being referenced.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `render` is the intentional change-trigger; the body reads only refs + `coalesce`.
	React.useEffect(() => {
		coalesceRef.current += 1;
		if (!paintedRef.current || !coalesce) {
			paintedRef.current = true;
			// First paint (SSG-shell dismissal depends on it) / eager static host: render
			// NOW via flush() — still backpressured — dropping any queued frame first so a
			// `coalesce` true→false flip can't fire both.
			schedulerRef.current?.cancel();
			schedulerRef.current?.flush();
			return;
		}
		schedulerRef.current?.schedule();
	}, [render, coalesce]);

	// Cancel a pending frame/timer AND dispose the renderer on unmount (mount-once).
	// dispose() disconnects the host ResizeObserver + theme observer and drops the
	// scaleTargets entry — without it every remount (HeroPreview tab flip, Slide
	// Overview, Studio overlays) would leak this host's parsed ~560KB theme iframe.
	// The per-change effect above deliberately does NOT cancel — a mid-burst change
	// keeps the single scheduled frame rather than thrashing cancel/reschedule.
	React.useEffect(
		() => () => {
			schedulerRef.current?.cancel();
			engineRef.current?.dispose();
		},
		[],
	);

	// Re-render on palette / mode change (the shared topbar writes <html> attrs).
	// Routed through the SAME frame scheduler as edits (not a direct render) so it
	// honors the in-flight guard — a palette flip mid-render coalesces onto the next
	// frame instead of overlapping a second renderInto on the host (which would race
	// the resident document's pending-load / frame-sig state). Set up once.
	React.useEffect(() => {
		const obs = new MutationObserver(() => schedulerRef.current?.schedule());
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		return () => obs.disconnect();
	}, []);

	// Render ONLY on the rising edge of `active` (e.g. switching back to a tab).
	// Also routed through the frame scheduler (was a bare requestAnimationFrame →
	// direct render), so a re-show mid-render can't overlap the in-flight one either.
	const wasActiveRef = React.useRef(active);
	React.useEffect(() => {
		const rising = active && !wasActiveRef.current;
		wasActiveRef.current = active;
		if (rising) schedulerRef.current?.schedule();
	}, [active]);

	// `m-0` neutralizes the `<figure>` UA default margin (`0 40px`) — Tailwind
	// preflight doesn't reach inside the studio island, and that 40px inline margin
	// shoves a `w-full` preview off its track and overflows narrow viewports.
	return <figure ref={stageRef} className={cn('m-0', className)} role={role} {...aria} />;
}

export default DeckPreview;
