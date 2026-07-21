import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createFrameScheduler } from '@/lib/frame-scheduler';
import {
	createSingleSlideRenderer,
	type SingleSlideOptions,
	type SingleSlideRenderer,
} from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import '@/styles/nacre-loader.css';

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
	 * Show the Nacre "no slide yet" loader behind the live iframe until the first slide
	 * paints (then it fades + freezes). Opt-in — only the Studio's live preview wants it;
	 * landing/showcase hosts render a known static sample with no meaningful load gap.
	 */
	loader?: boolean;
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
	loader = false,
	...aria
}: DeckPreviewProps) {
	// Nacre loader = the SKELETON. It owns the screen for the whole load and yields ONLY
	// when the live slide is verified genuinely good — i.e. the renderer has actually
	// REVEALED `iframe.live` (visibility:visible), which single-slide-render.ts does only
	// once the slide has painted AND is scaled to a real width, and the shared-host clamp
	// keeps on-screen. So "revealed" == "good", and a broken/racing render is never exposed:
	// the skeleton simply stays until the real thing is right. The reveal-watcher effect
	// (below, once stageRef exists) flips this on the reveal signal — NOT on a "a render
	// happened" timer, which would drop the skeleton onto a not-yet-good slide.
	const [painted, setPainted] = React.useState(false);
	// Anti-stuck FLOOR (not the primary fade): if the reveal-watcher somehow never fires
	// (a defect, a pathological doc), don't strand the user behind the skeleton forever —
	// fade it after a long ceiling so the app is at least reachable. The normal reveal
	// (~1–3s) fires far sooner, making this a no-op; 14s is generous enough that it only
	// ever triggers on a genuine failure, never on a merely-slow good render.
	React.useEffect(() => {
		if (!loader || painted) return;
		const t = setTimeout(() => setPainted(true), 14000);
		return () => clearTimeout(t);
	}, [loader, painted]);
	// On-device diagnostic (Studio preview only, opt-in via `?previewdiag`): a live
	// green readout of the exact state behind a "blank preview" — host size, the live
	// frame's visibility/transform, whether the in-iframe `.lattice` is present + visible,
	// and the loader state. Read-only. Lets a real phone screenshot pin whether the slide
	// is 0-scaled, hidden inside the frame, or genuinely not rendered — something no
	// headless check here can confirm (#23).
	const diag = loader && typeof window !== 'undefined' && /[?&]previewdiag\b/.test(window.location.search);
	const diagRef = React.useRef<HTMLPreElement>(null);
	// Last resolved render status (set in `render`), surfaced by the diag readout.
	const lastStatusRef = React.useRef<string>('pending');
	React.useEffect(() => {
		if (!diag) return;
		// One-screenshot timeline: track the story, not just the instant — so a single
		// on-device capture answers WHICH blank-mode fired (engine/render failure vs.
		// host stranded 0-wide/oversized vs. rendered-but-not-revealed) without a
		// back-and-forth. Refs persist across ticks.
		const t0 = performance.now();
		let wMin = Infinity;
		let wMax = 0;
		let everHidden = false;
		let revealedAt = 0;
		let hostWMin = Infinity;
		let hostWMax = 0;
		const tick = () => {
			const host = stageRef.current;
			const el = diagRef.current;
			if (!host || !el) return;
			const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
			// Walk up to the position:fixed shared host and read its geometry — the node
			// the iOS "huge card" stranding actually mis-sizes.
			let fixed: HTMLElement | null = null;
			for (let p = host.parentElement; p && p !== document.body; p = p.parentElement) {
				if (getComputedStyle(p).position === 'fixed') {
					fixed = p;
					break;
				}
			}
			const fhr = fixed?.getBoundingClientRect();
			const fcw = fixed ? Math.round(fixed.clientWidth) : 0;
			if (fixed) {
				hostWMin = Math.min(hostWMin, fcw);
				hostWMax = Math.max(hostWMax, fcw);
			}
			// Crux-A: any transformed/filtered/contained ancestor breaking position:fixed?
			let crux = 'none';
			for (let p = fixed?.parentElement ?? null; p && p !== document.documentElement; p = p.parentElement) {
				const s = getComputedStyle(p);
				if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || /transform|filter|perspective/.test(s.willChange) || (s.contain !== 'none' && /paint|layout|strict|content/.test(s.contain)) || s.backdropFilter !== 'none') {
					crux = (typeof p.className === 'string' ? p.className : p.tagName).slice(0, 22);
					break;
				}
			}
			let inner = 'none';
			try {
				const d = fr?.contentDocument;
				const lat = d?.querySelector('.lattice');
				const sec = d?.querySelector('.lattice section');
				if (fr) inner = `lat:${lat ? 'y' : 'n'} vis:${lat ? getComputedStyle(lat).visibility : '-'} sec:${sec ? 'y' : 'n'}`;
			} catch {
				inner = 'x-origin';
			}
			if (fr) {
				const cw = Math.round(fr.clientWidth || 0);
				wMin = Math.min(wMin, cw);
				wMax = Math.max(wMax, cw);
				const vis = fr.style.visibility || 'default';
				if (vis === 'hidden') everHidden = true;
				else if (!revealedAt && vis !== 'hidden') revealedAt = Math.round(performance.now() - t0);
			}
			const vv = window.visualViewport;
			const frr = fr?.getBoundingClientRect();
			el.textContent = [
				`eng:${window.LatticePlayground ? 'y' : 'n'} stat:${lastStatusRef.current}`,
				`figure ${Math.round(host.clientWidth)}×${Math.round(host.clientHeight)}`,
				fixed ? `host ${fixed.style.position} ${Math.round(fhr?.left ?? 0)},${Math.round(fhr?.top ?? 0)} ${Math.round(fhr?.width ?? 0)}×${Math.round(fhr?.height ?? 0)} cw:${fcw}` : 'host: NO fixed ancestor',
				fixed ? `host op:${getComputedStyle(fixed).opacity} vis:${getComputedStyle(fixed).visibility}` : '',
				fr ? `fr vis:${fr.style.visibility || 'default'} tf:${fr.style.transform || 'none'}` : 'fr: none',
				frr ? `fr@ ${Math.round(frr.left)},${Math.round(frr.top)} ${Math.round(frr.width)}×${Math.round(frr.height)}` : '',
				inner,
				`vv ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}@${Math.round(vv.offsetTop)}` : '-'} win ${window.innerWidth}×${window.innerHeight}`,
				`seen fr-w:${wMin === Infinity ? '-' : wMin}→${wMax} host-w:${hostWMin === Infinity ? '-' : hostWMin}→${hostWMax} hid:${everHidden ? 'Y' : 'n'} rev:${revealedAt ? `${revealedAt}ms` : 'NO'}`,
				`cruxA:${crux} nacre:${painted ? 'done' : 'run'}`,
			]
				.filter(Boolean)
				.join('\n');
		};
		tick();
		const id = window.setInterval(tick, 250);
		return () => window.clearInterval(id);
	}, [diag, painted]);
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

	// Reveal-watcher — the skeleton hand-off. Fade the Nacre loader AND fire onFirstRender
	// (dismiss the SSG instant-shell) exactly when the live `iframe.live` is made VISIBLE.
	// single-slide-render reveals the frame only once its slide has painted and is scaled to
	// a real width (never a broken/unscaled/0-wide frame), and the shared-host clamp keeps it
	// on-screen — so "visibility:visible" is our single source of truth for "the live slide is
	// genuinely good". Watching the frame's own style (MutationObserver) is reliable where the
	// srcdoc `load` event is not (iOS drops it). Until this fires, the skeleton owns the screen.
	// Only relevant to loader hosts (the shared Studio preview); others never mount the Nacre.
	React.useEffect(() => {
		if (!loader) return;
		const host = stageRef.current;
		if (!host) return;
		const handoff = () => {
			const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
			if (!fr || fr.style.visibility === 'hidden' || !fr.style.visibility) return false;
			setPainted(true); // fade + freeze the skeleton — the good slide now covers it
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
	}, [loader]);

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
		// On-device diagnostic: stash the resolved render status so ?previewdiag can show
		// whether the render SUCCEEDED, ERRORED, or never ran — the discriminator between a
		// blank that's "engine/render failed" vs "rendered but not painted" on real iOS (#23).
		lastStatusRef.current = 'rendering…';
		done?.then((st) => {
			lastStatusRef.current = st ? (st.ok ? `ok ${st.writePath ?? ''} slides:${st.slides}` : `ERR:${st.error ?? '?'}`) : 'no-status';
		}).catch((e) => {
			lastStatusRef.current = `THROW:${String((e as Error)?.message || e).slice(0, 40)}`;
		});
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
	const syncAnima = React.useCallback(() => {
		if (animaRef.current) {
			animaRef.current.rebind();
			return;
		}
		const fr = stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
		const hasScene = !!fr?.contentDocument?.querySelector('section.scene[data-scene-spec]');
		if (!hasScene || animaLoadingRef.current) return;
		animaLoadingRef.current = true;
		import('@/playground/anima-scenes')
			.then(({ createAnimaScenes }) => {
				if (!stageRef.current) return; // unmounted during the async load
				animaRef.current = createAnimaScenes({
					getFrame: () => stageRef.current?.querySelector<HTMLIFrameElement>('iframe.live') ?? null,
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
		// (Re)hydrate any live scene on the freshly rendered slide. `bindAnima` self-guards to
		// attach the load listener once; `syncAnima` covers the in-place patch path (no `load`).
		bindAnima();
		syncAnima();
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

	// `m-0` neutralizes the `<figure>` UA default margin (`0 40px`) — Tailwind
	// preflight doesn't reach inside the studio island, and that 40px inline margin
	// shoves a `w-full` preview off its track and overflows narrow viewports.
	// `relative` so the Nacre loader (absolute inset:0) and the imperatively-appended
	// `iframe.live` both anchor to the figure. The loader is the ONLY React child; the
	// engine appends the iframe AFTER it, so the iframe paints on top and — once opaque —
	// covers the loader, which `is-done` then fades + freezes. A stable single child means
	// React never adds/removes around the foreign iframe node.
	// `relative` ONLY when the loader is on — so the iframe anchors to the figure that
	// holds the loader. Non-loader hosts stay static (byte-for-byte unchanged anchoring).
	return (
		<figure ref={stageRef} className={cn(loader && 'relative', 'm-0', className)} role={role} {...aria}>
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
			{/* The diag readout is PORTALED to <body> as position:fixed — so it stays
			    visible even when the failure mode is a hidden/off-screen/stranded host
			    (rendering it inside the figure would hide the diagnostic exactly when
			    it's needed). Opt-in via ?previewdiag; only the loader host mounts it. */}
			{diag && typeof document !== 'undefined' && ReactDOM.createPortal(<pre ref={diagRef} className="preview-diag" aria-hidden="true" />, document.body)}
		</figure>
	);
}

export default DeckPreview;
