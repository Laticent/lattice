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

	// FRAME-ALIGNED RENDER LOOP (the video-game model) — replaces the old trailing
	// debounce (2026-06-29). A change marks the preview dirty and schedules ONE
	// render on the next animation frame; a keystroke burst within a frame collapses
	// into a single render of the LATEST state. An in-flight guard applies
	// backpressure so a slow render never overlaps or backs up. The first paint is
	// immediate. See `engineering/decisions/2026-07-15-frame-aligned-preview-render.md`.
	const paintedRef = React.useRef(false);
	// Edits collapsed into the NEXT committed paint (each effect run: a source edit
	// or a prop change like a theme audition). Stamped on the host at commit time so
	// the perf overlay's COALESCE chip reports what one paint absorbed.
	const coalesceRef = React.useRef(0);
	const dirtyRef = React.useRef(false); // a change is waiting for a paint
	const rafRef = React.useRef(0); // pending animation-frame handle (0 = none)
	const timerRef = React.useRef(0); // pending backoff-timer handle (0 = none)
	const inFlightRef = React.useRef(false); // a render is resolving right now
	// Was the LAST render heavy — a full iframe rewrite ('write' regime) or one that
	// blew the frame budget? A cheap patch (~2ms, the typing path) reschedules on the
	// next animation frame (instant); a heavy render coalesces on a short trailing
	// timer instead, so a slider drag / theme audition on a full-write host (Finish,
	// Fabricate, Layout) doesn't reload the srcdoc every frame and strobe / saturate
	// the main thread. The loop self-tunes to the render cost. Starts false so the
	// first edit is frame-scheduled; the initial paint (always a write) flips it, and
	// the first patch flips it back.
	const lastHeavyRef = React.useRef(false);
	// The PRIMARY heavy signal is the render regime (`writePath === 'write'`, a full
	// iframe rewrite) — deterministic, and the common full-write-host case. This is a
	// conservative wall-clock BACKSTOP for a heavy *patch* (a fat table / math slide
	// that renders slowly even on the patch path): well above a normal patch (~2–9ms)
	// plus event-loop noise, so it trips only on a genuinely expensive render, never a
	// fast one. Repeating a >50ms render every frame would jank the editor.
	const HEAVY_RENDER_MS = 50;
	// Trailing coalesce window for heavy renders — matches the retired debounce, so a
	// continuous drag on a full-write host keeps its old smooth one-render-per-pause feel.
	const HEAVY_COALESCE_MS = 120;
	// Backstop: if a render never settles (a hung engine-bundle or theme fetch — not a
	// rejection, which `finally` handles), clear the in-flight guard so a later edit
	// isn't wedged out forever. Long enough to never trip a real (even cold) render.
	const RENDER_WATCHDOG_MS = 4000;

	// commitRef / scheduleFrameRef are mutually recursive, so declare both refs
	// first, then assign — the closures capture the refs, never call during render.
	const commitRef = React.useRef<() => void>(() => {});
	const scheduleFrameRef = React.useRef<() => void>(() => {});

	// Commit one paint: stamp the coalesce count, prefetch the theme in PARALLEL
	// with the engine-bundle load (two independent round-trips, not serialized),
	// then render the LATEST state (via renderRef). Reassigned each render so the
	// scheduler always reaches the current palette/mode without re-subscribing.
	// Backpressure: if a render is still resolving, mark dirty and bail — that
	// render's `finally` reschedules, so the newest state paints once it settles.
	commitRef.current = () => {
		if (inFlightRef.current) {
			dirtyRef.current = true;
			return;
		}
		// Stamp the coalesce count on the host for THIS render; renderInto consumes
		// it synchronously, binding it to this sample (not a shared global an
		// overlapping render could steal). Reset for the next burst.
		const host = stageRef.current as (HTMLElement & { __latticeCoalesce?: number }) | null;
		if (host) host.__latticeCoalesce = coalesceRef.current || 1;
		coalesceRef.current = 0;
		dirtyRef.current = false;
		inFlightRef.current = true;
		engineRef.current?.prefetchTheme?.(paletteOverride, modeOverride);
		// Watchdog: if the render never settles (a hung bundle/theme fetch), clear the
		// in-flight guard so future edits aren't wedged out. Cleared in `finally`.
		const watchdog = window.setTimeout(() => {
			if (!inFlightRef.current) return;
			inFlightRef.current = false;
			if (dirtyRef.current && stageRef.current) scheduleFrameRef.current();
		}, RENDER_WATCHDOG_MS);
		Promise.resolve(engineRef.current?.whenReady())
			.then(() => {
				const t0 = performance.now();
				// render() returns the renderInto promise; await it so we learn the regime
				// (patch vs write) AND time the engine work — either one being heavy makes
				// the NEXT schedule coalesce instead of firing on the next frame.
				return Promise.resolve(renderRef.current()).then((status) => {
					lastHeavyRef.current = status?.writePath === 'write' || performance.now() - t0 > HEAVY_RENDER_MS;
				});
			})
			.finally(() => {
				window.clearTimeout(watchdog);
				inFlightRef.current = false;
				// A change landed mid-render → paint the newest state. Guard on the host:
				// if we unmounted while rendering, drop it (don't schedule a frame + engine
				// load into a dead host).
				if (dirtyRef.current && stageRef.current) scheduleFrameRef.current();
			})
			// whenReady() (engine-bundle load) can reject; renderInto never does. Swallow
			// so a bundle-load failure doesn't surface as an unhandled rejection — the
			// failure already logs through renderInto's own catch on the next attempt.
			.catch(() => {});
	};

	// Schedule the next commit, de-duped so a burst of changes shares ONE render of
	// the latest state. ADAPTIVE: after a cheap patch, fire on the next animation
	// frame (instant live typing); after a heavy render (a full write, or one that
	// blew the frame budget), coalesce on a short trailing timer so a drag / audition
	// on a full-write host renders once per pause instead of reloading every frame.
	scheduleFrameRef.current = () => {
		if (rafRef.current || timerRef.current) return;
		if (lastHeavyRef.current) {
			timerRef.current = window.setTimeout(() => {
				timerRef.current = 0;
				commitRef.current();
			}, HEAVY_COALESCE_MS);
		} else {
			rafRef.current = requestAnimationFrame(() => {
				rafRef.current = 0;
				commitRef.current();
			});
		}
	};

	// Cancel whichever schedule (frame or backoff timer) is pending.
	const cancelPendingRef = React.useRef<() => void>(() => {});
	cancelPendingRef.current = () => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = 0;
		}
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = 0;
		}
	};

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
			// Drop any schedule already queued so a `coalesce` true→false flip can't fire
			// this immediate commit AND a stale scheduled one (belt-and-braces: all
			// current call sites pass a constant `coalesce`).
			cancelPendingRef.current();
			commitRef.current();
			return;
		}
		dirtyRef.current = true;
		scheduleFrameRef.current();
	}, [render, coalesce]);

	// Cancel a pending frame/timer on unmount (mount-once). The per-change effect
	// above deliberately does NOT cancel — a mid-burst change keeps the single
	// scheduled frame rather than thrashing cancel/reschedule every keystroke.
	React.useEffect(() => () => cancelPendingRef.current(), []);

	// Re-render on palette / mode change (the shared topbar writes <html> attrs).
	// Routed through the SAME frame scheduler as edits (not a direct render) so it
	// honors the in-flight guard — a palette flip mid-render coalesces onto the next
	// frame instead of overlapping a second renderInto on the host (which would race
	// the resident document's pending-load / frame-sig state). Set up once.
	React.useEffect(() => {
		const obs = new MutationObserver(() => scheduleFrameRef.current());
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
		if (rising) scheduleFrameRef.current();
	}, [active]);

	// `m-0` neutralizes the `<figure>` UA default margin (`0 40px`) — Tailwind
	// preflight doesn't reach inside the studio island, and that 40px inline margin
	// shoves a `w-full` preview off its track and overflows narrow viewports.
	return <figure ref={stageRef} className={cn('m-0', className)} role={role} {...aria} />;
}

export default DeckPreview;
