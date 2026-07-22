import * as React from 'react';
import { type ChartDetailHandle, ChartDetailLayer } from '@/components/chart-detail-layer';
import { getFrontMatter } from '@/components/studio/front-matter';
import { createFrameScheduler } from '@/lib/frame-scheduler';
import {
	createSingleSlideRenderer,
	type SingleSlideOptions,
	type SingleSlideRenderer,
} from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { ANIMA_HOST_SEL, type DeckMotion, hasAnimatableChart, parseDeckMotion, resolveMotion } from '@/playground/anima-host-sel';
// The Nacre loader's CSS. Imported here beside the loader markup it styles (below). NOTE: this
// does NOT gate payload by consumer — Vite co-locates it into a shared chunk (resolve-captions,
// in single-slide-render's graph) that every DeckPreview host pulls, so Astro inlines the ~1.5KB
// into every page regardless of which component declares the import. It's screen-only and fully
// scoped to `.nacre-loader*` (no global leak); detaching it from the shared chunk is a separate
// bundling task (tracked in 2026-07-21-studio-preview-reframe-in-place.md), not an import-site move.
import '@/styles/nacre-loader.css';

/** Read the three deck-level motion front-matter keys into a resolved `DeckMotion`. */
function deckMotionOf(src: string): DeckMotion {
	return parseDeckMotion(getFrontMatter(src, 'motion'), getFrontMatter(src, 'motion-style'), getFrontMatter(src, 'motion-speed'));
}

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
	/**
	 * Fired after each render that actually committed (unlike `onFirstRender`, once) — a deferred
	 * inactive-host render that bails fires nothing. Lets a parent that hosts its own parent-side
	 * layer over this preview re-sync it to the freshly rendered slide (Present re-pins the
	 * chart-detail hit-surface here). It can fire per coalesced keystroke on a live-editing host, so
	 * keep the handler cheap and idempotent.
	 */
	onRender?: () => void;
	/**
	 * Show the Nacre "no slide yet" loader behind the live iframe until the first slide
	 * paints (then it fades + freezes). Opt-in — only the Studio's live preview wants it;
	 * landing/showcase hosts render a known static sample with no meaningful load gap.
	 */
	loader?: boolean;
	/**
	 * Mount the parent-hosted chart mark-detail reveal over this preview (hover a chart mark to
	 * reveal its authored detail). Opt-in — ONLY the Studio's primary editing preview wants it; a
	 * thumbnail / specimen host must stay static (a grid of popovers would be noise). Off by default.
	 */
	chartDetail?: boolean;
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
	onRender,
	loader = false,
	chartDetail = false,
	...aria
}: DeckPreviewProps) {
	// Nacre loader = the SKELETON. It owns the screen for the whole load and yields ONLY
	// when the live slide is verified genuinely good — i.e. the renderer has actually
	// REVEALED `iframe.live` by fading its `opacity` 0→1, which single-slide-render.ts does
	// only once the slide has painted AND is scaled to a real width. The reveal-watcher below
	// keys off that same `opacity`. So "revealed" == "good", and a broken/racing render is never exposed:
	// the skeleton simply stays until the real thing is right. The reveal-watcher effect
	// (below, once stageRef exists) flips this on the reveal signal — NOT on a "a render
	// happened" timer, which would drop the skeleton onto a not-yet-good slide.
	const [painted, setPainted] = React.useState(false);
	// #1164 — terminal FAILURE state for a NON-LOADER host. A loader host that never paints keeps
	// its skeleton spinning (honest, by the skeleton contract); a non-loader host (landing /
	// showcase / specimen — a KNOWN static sample with no meaningful load gap) had NO failure
	// surface: a render that errors, or a pathological srcdoc whose `.lattice` never paints, left
	// the iframe parked at opacity:0 forever — an indefinitely blank box with no signal. Two honest
	// triggers set this (below): (1) the render resolves `ok:false` (an engine/theme error) —
	// deterministic; and (2) a generous ceiling elapses with the frame still unrevealed — the
	// "renders ok but never paints" case. A later successful render clears it; Retry re-renders.
	const [failed, setFailed] = React.useState(false);
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
	// Every-paint signal (Present re-pins its chart-detail hit-surface here). Ref-held so it never
	// enters the render closure's dependency list.
	const onRenderRef = React.useRef(onRender);
	onRenderRef.current = onRender;

	// Reveal-watcher — the skeleton hand-off. Fade the Nacre loader AND fire onFirstRender
	// (dismiss the SSG instant-shell) exactly when the live `iframe.live` starts fading in.
	// single-slide-render reveals the frame (opacity 0→1) only once its slide has painted and
	// is scaled to a real width (never a broken/unscaled/0-wide frame) — so a non-'0' opacity
	// is our single source of truth for "the live slide is genuinely good". Watching the
	// frame's own style (MutationObserver) is reliable where the srcdoc `load` event is not
	// (iOS drops it). Until this fires, the skeleton owns the screen. The slide fades in over
	// the loader (both ease out together → a clean cross-fade, no pop). Runs for ANY host with
	// a loader OR an onFirstRender callback; the loader FADE is loader-gated, so onFirstRender
	// still fires on a non-loader host (it isn't silently coupled to the loader).
	React.useEffect(() => {
		if (!loader && !onFirstRender) return;
		const host = stageRef.current;
		if (!host) return;
		const handoff = () => {
			const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
			if (!fr || fr.style.opacity === '0' || !fr.style.opacity) return false;
			if (loader) setPainted(true); // fade + freeze the skeleton (loader hosts only)
			if (!firstRenderFiredRef.current) {
				firstRenderFiredRef.current = true;
				onFirstRenderRef.current?.();
			}
			return true;
		};
		if (handoff()) return;
		const mo = new MutationObserver(() => {
			if (handoff()) mo.disconnect();
		});
		mo.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
		return () => mo.disconnect();
	}, [loader, onFirstRender]);

	// Anti-stuck FLOOR — reveal-VERIFYING. The reveal-watcher above is the primary handoff; this is
	// its safety net for ONE failure: the frame IS good but the MutationObserver missed the opacity
	// flip. Recovery does the SAME full handoff the watcher would — fade the skeleton AND fire the
	// once-guarded onFirstRender (dismiss the SSG instant-shell) — but ONLY if the live frame was
	// genuinely revealed (the engine set a non-'0' opacity once its slide painted + scaled). Firing
	// onFirstRender here too matters: without it a missed flip would strand the pre-hydration shell
	// until its own 8s backstop even though the slide is already up. We must NOT act on a never-painted
	// frame: that would swap "loader forever" for a BLANK, which the skeleton contract explicitly
	// rejects (prefer the honest loader over a blank/broken slide). On a real never-paint failure the
	// loader keeps spinning — honest, and the preview is in-flow/boxed so the app stays fully usable
	// around it. The normal reveal (~1–3s) fires far sooner; 14s only ever reaches a defect.
	React.useEffect(() => {
		if (!loader || painted) return;
		const t = setTimeout(() => {
			const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
			if (!fr?.style.opacity || fr.style.opacity === '0') return; // not genuinely revealed — keep the loader
			setPainted(true);
			if (!firstRenderFiredRef.current) {
				firstRenderFiredRef.current = true;
				onFirstRenderRef.current?.();
			}
		}, 14000);
		return () => clearTimeout(t);
	}, [loader, painted]);

	// #1164 — never-paint CEILING (non-loader hosts only). Deterministic `ok:false` (below) catches
	// a render that errors; this catches the "render resolved ok but the frame's runtime silently
	// never painted `.lattice`" case. Carefully gated to avoid a false "couldn't render" on a merely
	// slow or deferred host: it runs ONLY for an ACTIVE non-loader host, uses a generous budget, and
	// is reveal-verifying — if `iframe.live` DID reveal (opacity !== '0') we never fail. `sample` is
	// an intentional re-arm trigger: a content change starts a fresh render, so the clock restarts.
	// The budget MUST sit past the kernel reveal poll's own give-up point (single-slide-render.ts:
	// `revealTicks > 300` × 100ms = ~30s) so a slow-but-fine paint the poll still reveals in the
	// 25–30s window can't trip the ceiling first — otherwise we'd flash a failure over a good slide.
	// The RECOVERY effect just below is the belt to this suspenders: even if the ceiling fires, a
	// later reveal clears it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `sample` re-arms the ceiling per render; the body reads only refs + props.
	React.useEffect(() => {
		if (loader || failed || !active) return;
		const t = setTimeout(() => {
			const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
			if (fr?.style.opacity && fr.style.opacity !== '0') return; // revealed — genuinely fine
			setFailed(true);
		}, 32000);
		return () => clearTimeout(t);
	}, [loader, failed, active, sample]);

	// #1164 RECOVERY — clear `failed` the moment the frame reveals. The ceiling fires fire-once, but
	// the frame's reveal is IMPERATIVE (single-slide-render's `scaleFrame` flips `iframe.live` opacity
	// 0→1 and touches NO React state), driven by the kernel poll AND the persistent host ResizeObserver
	// — either can reveal a good slide AFTER the ceiling already fired (slow cold load, a late width
	// change, a 0-width host that gains width). Without this, `failed` is a one-way latch and the opaque
	// failure card permanently OCCLUDES a correctly-painted slide — strictly worse than the blank box
	// this feature replaced. So while `failed`, watch the frame's opacity (the SAME signal the loader
	// hand-off uses) and drop the failure as soon as it reveals. Runs only while failed (rare), so it
	// adds no observer on the healthy path.
	React.useEffect(() => {
		if (loader || !failed) return;
		const host = stageRef.current;
		if (!host) return;
		const clearOnReveal = () => {
			const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
			if (fr?.style.opacity && fr.style.opacity !== '0') {
				setFailed(false);
				return true;
			}
			return false;
		};
		if (clearOnReveal()) return;
		const mo = new MutationObserver(() => {
			if (clearOnReveal()) mo.disconnect();
		});
		mo.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
		return () => mo.disconnect();
	}, [loader, failed]);

	// #1164 a11y — while the failure card owns the surface, hide the PARKED opacity:0 `iframe.live`
	// from the accessibility tree. Opacity doesn't remove an element from that tree, so without this a
	// screen reader could still reach the hidden "Live-rendered Lattice slide" frame behind the card;
	// aria-hidden makes the message + Retry the only accessible surface. Cleared when the failure does.
	React.useEffect(() => {
		const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
		if (!fr) return;
		if (!loader && failed) fr.setAttribute('aria-hidden', 'true');
		else fr.removeAttribute('aria-hidden');
	}, [loader, failed]);

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
		// The skeleton hand-off (fade the loader + dismiss the SSG instant-shell) is NOT
		// driven from here on "a render happened" — it's driven by the reveal-watcher effect
		// when the live frame is actually made visible (== genuinely good). Keying it on the
		// render/load event was the bug: iOS fires the srcdoc load unreliably, and even when
		// it fired it fired before the frame was revealed/scaled, dropping the skeleton onto a
		// still-blank or broken slide.
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
	// Latest deck source, held in a ref so the Anima host reads the CURRENT `motion:` front-matter
	// default on every rebind (a live edit re-resolves it) without listing `sample` as a dep.
	const sampleRef = React.useRef(sample);
	sampleRef.current = sample;

	// ── Live Anima scenes (Stage 6b) ────────────────────────────────────────────
	// Bring a `scene` slide's poster to life on THIS preview surface (Studio Present, and
	// every other DeckPreview host), reusing the parent-hosted controller the Playground
	// uses (createAnimaScenes). Lazily imported, and ONLY when the rendered slide actually
	// carries a live scene — a scene-less preview (landing, hero, most specimens) never
	// pulls the Anima backends into its bundle. On a slide swap the srcdoc is rewritten, so
	// the controller disposes the departed scene and hydrates the arriving one: play on
	// enter, stop on exit, restart from the top on re-entry — the present-mode contract
	// (2026-07-17-anima-animation-library.md §15).
	const animaRef = React.useRef<{ rebind(): void; destroy(): void } | null>(null);
	const animaBoundRef = React.useRef(false);
	const animaLoadingRef = React.useRef(false);
	// The parent-hosted chart mark-detail reveal (opt-in via `chartDetail`). Driven by rebind() after
	// each paint, like the Anima host — the shared ChartDetailLayer (rendered below) lazily binds once
	// `iframe.live` exists.
	const chartDetailRef = React.useRef<ChartDetailHandle | null>(null);
	const syncAnima = React.useCallback(() => {
		if (animaRef.current) {
			animaRef.current.rebind();
			return;
		}
		const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
		const doc = fr?.contentDocument ?? null;
		// The deck-level motion defaults (the three `motion*` front-matter keys), resolved from the live
		// source so a class-less chart animates when the deck sets Play on.
		const deck = deckMotionOf(sampleRef.current);
		// Load the host for EITHER a baked scene (`data-scene-spec`) OR an opted-in chart. Two opt-in
		// paths: an explicit per-slide Play token (`ANIMA_HOST_SEL` = scene ∪ `motion-on`/legacy `chart-anima`),
		// OR a deck-wide Play=on with a chart that RESOLVES (a front-matter default leaves no class to
		// select). Running the same `resolveMotion` cascade rebind() uses makes this gate match the mount
		// set EXACTLY — it never loads the host for a deck whose only chart is `motion-off` — and one
		// shared source keeps it from drifting (a chart-only gate is why animation ran in the Playground
		// but not the Studio).
		const deckWideChart = deck.play === 'on' && Array.from(doc?.querySelectorAll('section') ?? []).some((s) => hasAnimatableChart(s) && resolveMotion(s, deck) !== null);
		const hasScene = !!doc?.querySelector(ANIMA_HOST_SEL) || deckWideChart;
		if (!hasScene || animaLoadingRef.current) return;
		animaLoadingRef.current = true;
		import('@/playground/anima-scenes')
			.then(({ createAnimaScenes }) => {
				if (!stageRef.current) return; // unmounted during the async load
				animaRef.current = createAnimaScenes({
					getFrame: () => stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live') ?? null,
					getDeckMotion: () => deckMotionOf(sampleRef.current),
				});
				animaRef.current.rebind();
			})
			.catch(() => {})
			.finally(() => {
				animaLoadingRef.current = false;
			});
	}, []);
	// Bind ONE persistent `load` listener to the live iframe: a srcdoc rewrite re-fires
	// `load` after the new slide has parsed — the reliable "its DOM is ready" signal, since
	// rebinding at render-resolve (srcdoc merely SET) can race the parse. Guarded to bind
	// once per host; if the frame is already parsed when we bind, sync straight away.
	const bindAnima = React.useCallback(() => {
		const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
		if (!fr || animaBoundRef.current) return;
		animaBoundRef.current = true;
		fr.addEventListener('load', syncAnima);
		if (fr.contentDocument?.readyState === 'complete') syncAnima();
	}, [syncAnima]);

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
		// #1164 — surface a definitive render FAILURE on a non-loader host (a loader host owns its
		// own spinning affordance, unchanged here). `ok:false` is the engine/theme error signal; the
		// transient `'renderer disposed'` sentinel (a host detached mid-render — a mobile pane swap,
		// an unmount) is NOT a failure, so it's excluded (the reconnected host re-renders). A
		// successful render clears any prior failure. Guard on a PRESENT status: `render` returns
		// `undefined` when it bails on an inactive host, and an undefined status must NOT touch the
		// failure flag (else a deferred host would drop a real failure card without ever re-rendering).
		if (!loader && status) setFailed(status.ok === false && status.error !== 'renderer disposed');
		// (Re)hydrate any live scene on the freshly rendered slide. `bindAnima` self-guards to
		// attach the load listener once; `syncAnima` covers the in-place patch path (no `load`).
		bindAnima();
		syncAnima();
		// Re-pin the chart-detail layer over THIS render's chart. A no-op unless the `chartDetail` opt-in
		// mounted it; it lazily binds on the first call once the frame exists. Pinned mode (not hoverAny):
		// the Studio preview box is pointer-events:none (a swipe surface), so hover can't reach the iframe
		// — the pinned hit-surface (pointer-events:auto) over the chart receives it. The frame holds one
		// slide, so onSlide(0). A keystroke mints a new section node, so this re-pins each render. Gated on
		// a real `status` (same as onRender below): a deferred inactive-host bail returns undefined and must
		// NOT mount/re-pin the layer over a slide that didn't paint.
		if (status) chartDetailRef.current?.onSlide(0);
		// Committed-render signal for a parent hosting its own layer over this preview (Present re-pins
		// here). Gated on a real `status` so a deferred inactive-host bail (status undefined) doesn't
		// fire it — matches the prop contract and can't drive a phantom re-pin on a host that didn't paint.
		if (status) onRenderRef.current?.();
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
			animaRef.current?.destroy();
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
	// On the FALLING edge, tear down any live scene so a hidden host (a HeroPreview
	// flipped to its Source tab) doesn't keep a parent-hosted rAF loop running unseen;
	// the rising-edge render re-hydrates it (a scene restarts on re-show, which is the
	// present-mode contract anyway). This bounds the eager-mount cost as scene hydration
	// now spans every DeckPreview host, not just the always-on Playground.
	const wasActiveRef = React.useRef(active);
	React.useEffect(() => {
		const rising = active && !wasActiveRef.current;
		const falling = !active && wasActiveRef.current;
		wasActiveRef.current = active;
		if (rising) schedulerRef.current?.schedule();
		else if (falling) animaRef.current?.destroy();
	}, [active]);

	// #1164 — Retry after a failure: clear the failed flag and schedule a fresh render of the
	// current sample (still backpressured through the scheduler). A persistent engine error will
	// simply fail again; the point is to give the user agency instead of a dead blank box.
	const retry = React.useCallback(() => {
		setFailed(false);
		schedulerRef.current?.schedule();
	}, []);

	// `m-0` neutralizes the `<figure>` UA default margin (`0 40px`) — Tailwind
	// preflight doesn't reach inside the studio island, and that 40px inline margin
	// shoves a `w-full` preview off its track and overflows narrow viewports.
	// `relative` so the Nacre loader (absolute inset:0) and the imperatively-appended
	// `iframe.live` both anchor to the figure. The loader is the ONLY React child; the
	// engine appends the iframe AFTER it, so the iframe paints on top and — once opaque —
	// covers the loader, which `is-done` then fades + freezes. A stable single child means
	// React never adds/removes around the foreign iframe node.
	// `relative` when the loader is on OR a failure card is showing (#1164) — so the absolute
	// overlay anchors to the figure. A non-loader host with no failure stays static (byte-for-byte
	// unchanged anchoring).
	return (
		<>
		<figure ref={stageRef} className={cn((loader || failed || chartDetail) && 'relative', 'm-0', className)} role={role} {...aria}>
			{loader && (
				<span className={cn('nacre-loader', painted && 'is-done')} aria-hidden="true">
					<span className="nacre-loader__core" />
					<span className="nacre-loader__layer nacre-loader__layer--0">
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
					</span>
					<span className="nacre-loader__layer nacre-loader__layer--1">
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
					</span>
					<span className="nacre-loader__layer nacre-loader__layer--2">
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
						<i className="nacre-loader__blob" />
					</span>
					<span className="nacre-loader__vig" />
				</span>
			)}
			{/* #1164 — terminal failure affordance for a non-loader host (never shown on a loader host,
			    which keeps its skeleton). Overlays the parked opacity:0 iframe with a minimal message +
			    Retry, so a never-rendering preview reads as a recoverable failure, not a dead blank. */}
			{!loader && failed && (
				// The live-region role sits on the TEXT only — not the container — so a screen reader
				// announces "couldn't render" without sweeping the focusable Retry button into the
				// live-region update (which reads confusingly). Container is a block-level div.
				<div className="nacre-failed">
					<span className="nacre-failed__text" role="status">
						This preview couldn’t render.
					</span>
					<button type="button" className="nacre-failed__retry" onClick={retry}>
						Retry
					</button>
				</div>
			)}
		</figure>
		{/* The chart mark-detail reveal (opt-in), PINNED mode: the preview box is pointer-events:none (a
		    swipe surface), so the reveal rides a parent hit-surface (pointer-events:auto) over the chart —
		    getStage = the figure (its positioning context; kept `relative` above). The React node lives
		    OUTSIDE the figure so it never disturbs the figure's single-React-child / imperatively-appended
		    `iframe.live` invariant; the popover portals to <body>. Re-pinned each paint via onSlide(0). */}
		{chartDetail && (
			<ChartDetailLayer
				ref={chartDetailRef}
				getFrame={() => stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live') ?? null}
				getStage={() => stageRef.current}
			/>
		)}
		</>
	);
}

export default DeckPreview;
