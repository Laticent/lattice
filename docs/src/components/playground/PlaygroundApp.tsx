import { Eye, Maximize2, Minimize2, PanelLeftClose, PanelRightClose, SquarePen } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { SplitHandle, SplitRail, useSplit } from '@/components/ui/split';
import type { CatalogItem, Lens } from '@/lib/component-search';
import { createFrameScheduler } from '@/lib/frame-scheduler';
import {
	adjacentComponent,
	BACKUP_KEY,
	type Catalog,
	COMPONENT_KEY,
	classTokenLine,
	detectComponent,
	FOCUS_KEY,
	fingerprint,
	HANDOFF_KEY,
	INSERTED_HASH_KEY,
	isPristine,
	LENS_KEY,
	type Plan,
	parsePlaygroundUrl,
	playgroundQuery,
	readHandoff,
	readPlan,
	resolveComponent,
	resolvePlanStep,
	resolveStartupView,
	SEARCH_KEY,
	SOURCE_KEY,
	sanitizePalette,
	VIEW_KEY,
	variantSource,
	walkChipLabel,
} from '@/lib/playground-controller';
import { createEngineBridge, type PreviewState } from '@/lib/playground-engine';
import { createChartInteract } from '@/playground/chart-interact.js';
import { applyDebug } from '@/playground/debug-overlay.js';
import { getDebugOverride, onDebugOverrideChange } from '@/playground/debug-prefs.js';
import { readFrontMatter } from '@/playground/deck-config.js';
import { captureFirstSectionFromFrame, savePlaygroundSnapshot } from '@/playground/snapshot-cache.js';
import { createVideoOverlay } from '@/playground/video-overlay.js';
import { ComponentPicker } from './ComponentPicker';
import { DeckSetupSheet } from './DeckSetupSheet';
import { type EditorAdapter, EditorHost } from './EditorHost';
import { GalleriesSheet, type GalleryGroup } from './GalleriesSheet';
import { WalkBar } from './WalkBar';

export type PlaygroundData = {
	catalog: Catalog;
	components: CatalogItem[];
	lenses: Lens[];
	gallerySources: Record<string, string>;
	galleryGroups: GalleryGroup[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	/** Self-hosted Mermaid / KaTeX URLs (staged assets); the filmstrip injects them
	 *  only when a deck has a diagram / math. Optional — the test harness omits them
	 *  and the render falls back to the jsdelivr defaults. */
	mermaidUrl?: string;
	katexUrl?: string;
	palettes: string[];
	finishes: string[];
	// Deck-grammar lint vocabulary for the editor's inline validation (optional so
	// the test harness can omit it). Passed straight to EditorHost → createEditor.
	lintVocab?: unknown;
	starter: string;
	// Base URL of the staged plans/<name>.json walk plans (Explore surface).
	// Optional so the test harness (and any host without staged assets) degrades
	// to the editor-only playground.
	plansBase?: string;
};

// The Explore surface's walk position: a component's gallery plan (stable step
// kinds) or a full gallery deck (slide-index positions — no plan exists).
type Walk =
	| { kind: 'plan'; plan: Plan; index: number }
	| { kind: 'deck'; label: string; index: number; count: number };

/**
 * The playground controller — the React port of the old inline IIFE
 * (playground.astro:407-714). React owns the chrome (pickers, tabs, sheets,
 * status) and the orchestration (frame-scheduled render, fresh-vs-patch, variant
 * population, component detection, source persistence, palette/mode reaction).
 * The irreducible engine pieces are WRAPPED: the CodeMirror editor (EditorHost),
 * the marp render + filmstrip iframe (playground-engine → window globals), and
 * the config panel (DeckSetupSheet). None are reimplemented.
 */
export function PlaygroundApp({ data }: { data: PlaygroundData }) {
	const { catalog, components, lenses, gallerySources, galleryGroups, themeBase, runtimeUrl, engineUrl, mermaidUrl, katexUrl, palettes, finishes, lintVocab, starter, plansBase } = data;

	// Two component states, one rule each (2026-07-05 decision §4): `draftComponent`
	// is DERIVED — what detectComponent reads out of the live editor, possibly '' when
	// the draft holds no recognized component (the honest "detached" state the old
	// `currentName` could never reach). `readerComponent` is the PERSISTED pointer —
	// it changes only on an explicit pick and survives reloads, so a pasted
	// plain-markdown draft can never wipe the remembered component.
	const [draftComponent, setDraftComponent] = React.useState('');
	const [readerComponent, setReaderComponent] = React.useState(() => {
		try {
			return resolveComponent(catalog, localStorage.getItem(COMPONENT_KEY)).name;
		} catch {
			return resolveComponent(catalog, null).name;
		}
	});
	const [status, setStatus] = React.useState('Ready.');
	const [isError, setIsError] = React.useState(false);
	const [pane, setPane] = React.useState<'edit' | 'preview'>('edit');
	const [sourceVersion, setSourceVersion] = React.useState(0); // drives DeckSetup cue
	// Picker search + lens survive reopen AND reload (the "search is never
	// remembered" jank, fixed at its source: state owned here, persisted).
	const [pickerQuery, setPickerQuery] = React.useState(() => {
		try {
			return localStorage.getItem(SEARCH_KEY) ?? '';
		} catch {
			return '';
		}
	});
	const [pickerLens, setPickerLens] = React.useState(() => {
		try {
			return localStorage.getItem(LENS_KEY) ?? '';
		} catch {
			return '';
		}
	});
	// A parked handoff the user has not applied (arrived over a non-pristine
	// draft). `dismissedTs` hides the bar for THIS payload only — the key stays
	// parked, so a "no" never destroys the incoming content either.
	const [pendingHandoff, setPendingHandoff] = React.useState<{ md: string; from: string; ts: number } | null>(null);
	const [dismissedTs, setDismissedTs] = React.useState<number | null>(null);
	// Undo restorer for the draft-backup toast, held in a ref so `showToast`
	// (defined before onUndoRestore) can wire it into Sonner's action.
	const undoRestoreRef = React.useRef<() => void>(() => {});
	// ── The Explore surface (decision §4, PR 6) ────────────────────────────────
	// `view` is the mode ('read' internally; the UI says "Explore" — §0.6);
	// `walk` is the position. Explore NEVER writes the draft: it renders
	// `exploreSourceRef` through the same engine/iframe, leaving the editor's
	// source (and SOURCE_KEY) untouched.
	const [view, setView] = React.useState<'read' | 'edit'>('edit');
	// Focus mode — the user-controllable space reclaim: one toggle hides the whole
	// toolbar so the deck/editor owns the height (the walk bar stays, so Explore's
	// stepping is never lost). Persisted + seeded pre-paint (playground.astro) on
	// <html> so a returning focus visitor never sees the toolbar flash then vanish.
	const [focusMode, setFocusMode] = React.useState(() => {
		try {
			return localStorage.getItem(FOCUS_KEY) === '1';
		} catch {
			return false;
		}
	});
	const [walk, setWalk] = React.useState<Walk | null>(null);
	const [walkNotice, setWalkNotice] = React.useState<string | null>(null);
	const viewRef = React.useRef<'read' | 'edit'>('edit');
	const walkRef = React.useRef<Walk | null>(null);
	walkRef.current = walk;
	const exploreSourceRef = React.useRef<string | null>(null);
	const planCacheRef = React.useRef(new Map<string, Plan>());
	const urlSyncReadyRef = React.useRef(false);
	// Ref-indirected: render() (defined above the walk machinery) lands the walk
	// position after each paint; the real scroller is assigned below. Same for
	// startWalk — the pick/variant handlers are defined above it.
	const scrollWalkRef = React.useRef<(smooth: boolean) => void>(() => {});
	const startWalkRef = React.useRef<(name: string, step: string | null) => Promise<boolean>>(async () => false);
	// Mobile error reveal: ≤560px hides .pg-status, so the badge expands it inline.
	const [errorOpen, setErrorOpen] = React.useState(false);
	// The variant-sync discriminator: the last seen `_class` token line. The
	// Variant select snaps only when this actually changes (the mid-edit
	// "variant resets to default under me" jank, fixed at its source).
	const lastClassLineRef = React.useRef<string | null>(null);
	// Filled below (needs applyDeck); called from onEditorReady above it.
	const consumeHandoffRef = React.useRef<() => void>(() => {});
	// The picker shows the draft's component when one is detected, else the
	// persisted pointer — the two never fight because only picks write the
	// pointer. While EXPLORING, the walked component is the truth (the draft may
	// hold something else entirely — it is not on screen).
	const currentName = view === 'read' ? readerComponent : draftComponent || readerComponent;

	const frameRef = React.useRef<HTMLIFrameElement>(null);
	// Live in-preview chart interaction: hover/tap a pie wedge in the rendered
	// preview to reveal its authored detail, as you edit — same parent-hosted
	// module + behaviour as the Drawing Board. Created on mount, re-bound after
	// each render (a srcdoc rewrite replaces the iframe doc). Export untouched.
	const chartInteractRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	const videoOverlayRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	// Chart detail reveal — the parent-hosted chart-interact layer hands us the hovered
	// mark's detail + the cursor point; we render it as the real shadcn Popover, anchored
	// to a virtual element at that point (so it sits right by the pointer). `body`/`meta`
	// are HTML fragments from the deck's own (already-sanitized, #22) detail templates.
	type ChartDetail = { label: string; value?: string; dot?: string; body?: string; meta?: string; lean?: boolean; x?: number; y?: number };
	const [chartDetail, setChartDetail] = React.useState<ChartDetail | null>(null);
	const chartDetailRef = React.useRef<ChartDetail | null>(null);
	chartDetailRef.current = chartDetail;
	const chartAnchorRef = React.useRef({
		getBoundingClientRect: () => {
			const d = chartDetailRef.current;
			const x = d?.x ?? -9999;
			const y = d?.y ?? -9999;
			return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
		},
	});
	const editorRef = React.useRef<EditorAdapter | null>(null);
	const engineRef = React.useRef(createEngineBridge(themeBase, runtimeUrl, engineUrl, palettes, { mermaidUrl, katexUrl }));
	const previewStateRef = React.useRef<PreviewState>({ frameSig: '', lastSections: null });
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	// ── Instant-shell (anti cold-load flash) ────────────────────────────────────
	// A returning visitor's real first slide, painted BEFORE hydration by the
	// pre-paint replay in playground.astro (which stashes the chosen HTML on the
	// global below). React ADOPTS that node via dangerouslySetInnerHTML so neither
	// hydration nor a later render wipes the pre-painted slide; it's cleared on the
	// first live render. `null` = nothing to show (newcomer / no match → the dark
	// skeleton covers the window). See engineering/decisions/2026-07-11-preview-performance-diagnosis.md.
	const [shellHtml, setShellHtml] = React.useState<string | null>(() => {
		try {
			return (window as unknown as { __pgShellHtml?: string }).__pgShellHtml ?? null;
		} catch {
			return null;
		}
	});
	// Last resolved `@size` geometry, so a capture stamps the shell with THIS deck's
	// aspect (a `size: 4K` / portrait deck shouldn't replay at 16:9). Updated each render.
	const lastGeomRef = React.useRef<{ w: number; h: number }>({ w: 1280, h: 720 });
	// Capture dedupe + one-shot-after-first-render bookkeeping (mirrors the Studio).
	const lastPgCaptureRef = React.useRef(0);
	const firstCaptureDoneRef = React.useRef(false);
	// The Edit-view source that produced the CURRENT frame (last COMPLETED render). The
	// snapshot's identity hash must describe the same bytes as the captured html — NOT the
	// synchronously-persisted SOURCE_KEY, which races ahead on every keystroke. Hashing the
	// live SOURCE_KEY would stamp `{ html: render(old), srcHash: fp(new) }`; the next load
	// re-reads SOURCE_KEY(new), the hashes match, and the STALE (or pasted-then-left: WRONG)
	// slide flashes. Stamping from the rendered source instead makes a mid-edit exit fail the
	// replay's srcHash gate → the dark skeleton shows, never a wrong paint. (inversion finding)
	const lastRenderedEditSrcRef = React.useRef<string | null>(null);
	// Ref-indirected so `render` (defined above the capture callback) can fire the
	// post-first-render capture without a use-before-declaration cycle.
	const captureFirstSlideRef = React.useRef<() => void>(() => {});

	// Defer the "live" transition until the in-frame slides are actually VISIBLE. The
	// engine writes the srcdoc, then the in-iframe FIT agent scales the sections and only
	// THEN flips `.lattice` visible — for a ~900ms window on a cold load the iframe has
	// painted its own opaque body (a black box in dark mode) with the slides still hidden.
	// Going live at srcdoc-set (the old behavior) tore down the covering skeleton during
	// exactly that window → the black flash the returning-editor shell never masked. Poll
	// the same-origin frame for the FIT reveal and only then go live: add `is-live` (CSS
	// reveals #preview + drops the skeleton) and dismiss the instant-shell, so the dark
	// placeholder covers the whole gap and the hand-off is a single skeleton→slides step.
	// A fallback timeout guarantees a stuck/again-0-width FIT can't hide the preview forever.
	const markLiveWhenSlidesVisible = React.useCallback((frame: HTMLIFrameElement) => {
		const wrap = frame.parentElement;
		if (!wrap || wrap.classList.contains('is-live')) return; // already live (patch renders)
		const start = Date.now();
		const goLive = () => {
			wrap.classList.add('is-live');
			setShellHtml(null);
			document.documentElement.removeAttribute('data-pg-shell');
		};
		const check = () => {
			let ready = false;
			try {
				const win = frame.contentWindow;
				const lat = frame.contentDocument?.querySelector('.lattice') as HTMLElement | null;
				ready = !!(lat && win && win.getComputedStyle(lat).visibility === 'visible');
			} catch {
				ready = true; // a same-origin srcdoc shouldn't throw; if it does, don't get stuck
			}
			if (ready || Date.now() - start > 4000) goLive();
			else requestAnimationFrame(check);
		};
		check();
	}, []);

	// ── Source accessors (prefer the live editor; safe before it mounts) ────────
	const getSource = React.useCallback(() => editorRef.current?.getValue() ?? starter, [starter]);
	const setSource = React.useCallback((text: string) => editorRef.current?.setValue(text), []);
	const saveSource = React.useCallback(() => {
		try {
			localStorage.setItem(SOURCE_KEY, getSource());
		} catch {
			/* private mode */
		}
	}, [getSource]);

	const setStatusLine = React.useCallback((msg: string, err = false) => {
		setStatus(msg);
		setIsError(err);
	}, []);

	// Whether the deck carries non-theme managed front matter — the Deck-setup
	// trigger cue. Recomputed each time the source changes (sourceVersion bumps).
	const [configured, setConfigured] = React.useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: sourceVersion is the explicit re-eval trigger; getSource reads the live editor.
	React.useEffect(() => {
		try {
			setConfigured(readFrontMatter(getSource()).configured);
		} catch {
			setConfigured(false);
		}
	}, [sourceVersion]);

	// Layout debug overlay. The deck's `debug:` front matter is the default (the
	// engine stamps `data-debug` per section); a viewer's toolbar toggle is a
	// per-session OVERRIDE (debug-prefs → localStorage: 'on'|'off'|follow). `force`
	// is what we pass the agent; a ref mirrors it so the iframe onLoad + the render
	// loop re-apply after a srcdoc rewrite / section patch without a stale closure.
	const [debugOverride, setDebugOverrideState] = React.useState<'on' | 'off' | null>(null);
	const forceRef = React.useRef<'on' | 'off' | null>(null);
	forceRef.current = debugOverride;
	React.useEffect(() => {
		setDebugOverrideState(getDebugOverride());
		return onDebugOverrideChange(setDebugOverrideState);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-apply on override flip or a deck edit; the agent reads the live force via forceRef.
	React.useEffect(() => {
		applyDebug(frameRef.current, { force: forceRef.current });
	}, [debugOverride, sourceVersion]);
	// Re-apply after every full srcdoc rewrite (deck swap / theme / mode / size);
	// the render loop re-applies after a section patch (the doc stays live there).
	// The render-success path also rebinds these, but on a FRESH srcdoc write that
	// runs before the new document has loaded (setting the hook on the old window),
	// so re-install the parent-hosted bridges here against the now-live document.
	const onFrameLoad = React.useCallback(() => {
		applyDebug(frameRef.current, { force: forceRef.current });
		videoOverlayRef.current?.rebind();
		// Close the expand-during-srcdoc-load race: an expand that fired before the
		// fresh document defined __latticeFit would silently no-op; the loaded doc
		// re-fits itself here against the now-final pane width.
		frameRef.current?.contentWindow?.__latticeFit?.();
	}, []);

	// While the preview pane is collapsed, rendering into its 0-width iframe is
	// both wasted work and the iOS FIT-blank precondition — defer instead, and
	// let the expand path run one authoritative render.
	const previewCollapsedRef = React.useRef(false);
	const pendingWhileCollapsedRef = React.useRef(false);

	// ── The render loop (wraps the engine; never reimplements it) ───────────────
	const render = React.useCallback(
		async (fresh: boolean) => {
			const frame = frameRef.current;
			if (!frame) return;
			if (previewCollapsedRef.current) {
				pendingWhileCollapsedRef.current = true;
				setStatusLine('Preview collapsed — render deferred.');
				return;
			}
			const engine = engineRef.current;
			if (!engine.ready()) {
				setStatusLine('Loading engine…');
				// SINGLE pending retry: clear any prior one first. The frame scheduler is a
				// separate concurrency domain from timerRef now, so without this a keystroke
				// during engine load would orphan the previous retry and let N timers fire
				// concurrent renders the moment the engine readies (flash/thrash + a possible
				// previewState mismatch). One timer, always.
				if (timerRef.current) clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => render(fresh), 60);
				return;
			}
			const root = document.documentElement;
			const rawPalette = root.getAttribute('data-palette') || 'indaco';
			// Self-heal a stale persisted palette: `lattice-docs-palette` (seeded onto
			// data-palette pre-hydration) can hold a theme that no longer exists — a
			// renamed/retired palette from an earlier session. Its theme CSS 404s and
			// the render fails, blanking the preview (the "blank in my browser, fine in
			// private browsing" report; the error status is hidden on the mobile layout).
			// Fall back to a registered palette and rewrite the stored value so it heals
			// instead of failing every render.
			const palette = sanitizePalette(rawPalette, palettes);
			if (palette !== rawPalette) {
				root.setAttribute('data-palette', palette);
				try {
					localStorage.setItem('lattice-docs-palette', palette);
				} catch {
					/* private mode */
				}
			}
			const mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
			setStatusLine('Rendering…');
			// Explore renders the walk deck; Edit renders the draft. Ref-read so the
			// render loop sees a mode/walk change the moment it commits.
			const src = viewRef.current === 'read' && exploreSourceRef.current != null ? exploreSourceRef.current : getSource();
			const r = await engine.renderInto(frame, src, palette, mode, previewStateRef.current, fresh);
			if (r.status === 'pending') {
				// Single pending retry (see the !engine.ready() note above).
				if (timerRef.current) clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => render(fresh), 60);
			} else if (r.status === 'error') {
				setStatusLine(r.message, true);
			} else {
				previewStateRef.current = r.state;
				lastGeomRef.current = r.geom;
				// Record the source THIS frame renders, so a capture stamps the snapshot's
				// identity from the bytes actually on screen (see lastRenderedEditSrcRef).
				if (viewRef.current === 'edit') lastRenderedEditSrcRef.current = src;
				setStatusLine(`Rendered ${r.count} slide(s).`);
				// A full-deck walk learns its slide count from the render itself
				// (no plan exists for authored gallery decks — slide-index positions).
				const w = walkRef.current;
				if (viewRef.current === 'read' && w?.kind === 'deck' && w.count !== r.count) {
					setWalk({ ...w, index: Math.min(w.index, Math.max(0, r.count - 1)), count: r.count });
				}
				// Land the walk position after a fresh paint (instant; stepping smooths).
				if (viewRef.current === 'read') scrollWalkRef.current(false);
				// Go live only once the slides are actually revealed — NOT at srcdoc-set —
				// so the skeleton / instant-shell covers the FIT window instead of the iframe
				// flashing its opaque black body. This adds `is-live` (CSS reveals #preview +
				// drops the skeleton) and dismisses the shell when the frame is ready.
				markLiveWhenSlidesVisible(frame);
				// One capture ~after the first render (async chart/mermaid draws settle),
				// so the NEXT cold load has this slide to replay. Mirrors the Studio's
				// onPreviewFirstRender; ref-indirected past the capture callback's TDZ.
				if (!firstCaptureDoneRef.current) {
					firstCaptureDoneRef.current = true;
					setTimeout(() => captureFirstSlideRef.current(), 1500);
				}
				// Re-bind the hover layer to the (possibly new) iframe document.
				chartInteractRef.current?.rebind();
				// Re-install the parent-hosted video playback bridge on the (possibly new) frame.
				videoOverlayRef.current?.rebind();
				// Re-apply the debug overlay: a section PATCH keeps the doc live but swaps
				// the <section> nodes the chips were bound to, so the agent must redraw.
				// (A full srcdoc write reloads → onFrameLoad handles that; this no-ops
				// until the fresh doc is ready.)
				applyDebug(frame, { force: forceRef.current });
				// Report the regime to the frame scheduler: a full srcdoc write (!patched)
				// is HEAVY → the next edit coalesces; a section patch is cheap → next-frame.
				return { heavy: !r.patched };
			}
		},
		[getSource, setStatusLine, palettes, markLiveWhenSlidesVisible],
	);

	// Latest render closure — the frame scheduler reaches it via this ref so it always
	// renders CURRENT state without re-creating the scheduler on every edit.
	const renderRef = React.useRef(render);
	renderRef.current = render;

	// ── Instant-shell capture (mirrors StudioShell.captureLastSlide) ─────────────
	// Snapshot the FIRST section of the live filmstrip so the NEXT cold load paints it
	// pre-hydration (killing the white→black→slides flash). Captured on leave (pagehide /
	// tab-hide) and once shortly after the first render — never per-keystroke.
	//
	// EDIT-VIEW ONLY. The preview shows the draft in Edit, but a gallery/plan deck in
	// Explore — which has no stable draft-source identity, so replaying it could flash
	// the WRONG deck. So capture (and, in playground.astro, replay) only when the draft
	// is on screen, keyed by a hash of the RENDERED source. Explore/newcomer cold loads
	// fall back to the (now dark) loading skeleton.
	const captureFirstSlide = React.useCallback(() => {
		try {
			if (viewRef.current !== 'edit') return;
			const fr = frameRef.current;
			if (!fr) return;
			// Dedupe back-to-back captures: pagehide + visibilitychange both fire on a
			// mobile nav, and the post-first-render timer can overlap.
			const now = Date.now();
			if (now - lastPgCaptureRef.current < 500) return;
			// Stamp the identity from the source that produced THIS frame, not the live
			// SOURCE_KEY (which races ahead of the async render on every keystroke). Null →
			// no Edit render has landed yet → nothing trustworthy to snapshot; skip.
			const renderedSrc = lastRenderedEditSrcRef.current;
			if (renderedSrc == null) return;
			lastPgCaptureRef.current = now;
			const root = document.documentElement;
			// captureFirstSectionFromFrame sanitizes at the chokepoint (#22) before the HTML
			// can be stored + replayed into the top document — nothing to do here.
			const snap = captureFirstSectionFromFrame(fr, {
				w: lastGeomRef.current.w,
				h: lastGeomRef.current.h,
				palette: root.getAttribute('data-palette') || 'indaco',
				mode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
				// Hash the RENDERED source (matches the captured html). The replay recomputes
				// fp(SOURCE_KEY) next load; if the user edited after this render, the hashes
				// differ → it refuses and shows the skeleton, never a stale/wrong-deck flash.
				srcHash: fingerprint(renderedSrc),
				themeUrlBase: themeBase,
				ts: now,
			});
			if (snap) savePlaygroundSnapshot(snap);
		} catch {
			/* best-effort — a failed capture just means the next visit uses the skeleton */
		}
	}, [themeBase]);
	captureFirstSlideRef.current = captureFirstSlide;
	React.useEffect(() => {
		const onHide = () => {
			if (document.visibilityState === 'hidden') captureFirstSlide();
		};
		window.addEventListener('pagehide', captureFirstSlide);
		document.addEventListener('visibilitychange', onHide);
		return () => {
			window.removeEventListener('pagehide', captureFirstSlide);
			document.removeEventListener('visibilitychange', onHide);
		};
	}, [captureFirstSlide]);

	// Adaptive frame-aligned scheduler (Playground-owned) — replaces the fixed 220ms
	// trailing debounce with a render loop that fires a cheap patch on the next frame
	// (instant live typing) and coalesces a heavy full write on a short timer. Created
	// once; drives render(false), the edit/patch path.
	const schedulerRef = React.useRef<ReturnType<typeof createFrameScheduler> | null>(null);
	if (!schedulerRef.current) {
		schedulerRef.current = createFrameScheduler({ render: () => renderRef.current(false) });
	}
	React.useEffect(() => () => schedulerRef.current?.cancel(), []);

	const scheduleRender = React.useCallback(() => {
		schedulerRef.current?.schedule();
	}, []);

	// freshRender resets the iframe (explicit deck swaps); render(false) patches.
	const freshRender = React.useCallback(() => {
		// A deck swap sets the editor source programmatically, and CodeMirror's
		// setValue dispatches synchronously — firing onChange → onEdit →
		// scheduleRender, which queues a frame-scheduled patch render. That pending
		// render races THIS authoritative fresh render: on a slow connection (or a large
		// deck) the fresh srcdoc has not finished loading when the scheduled render
		// fires, so it re-writes the iframe — a second full srcdoc write that reloads
		// the preview and flashes. Cancel it; the fresh render supersedes any queued
		// patch. (Also clear a pending engine-not-ready retry on timerRef.)
		schedulerRef.current?.cancel();
		if (timerRef.current) clearTimeout(timerRef.current);
		previewStateRef.current = { ...previewStateRef.current, frameSig: '' };
		render(true);
	}, [render]);

	// ── Resizable/collapsible split (2026-07-02 decision) ──────────────────────
	// Active only above the tab breakpoint — the SAME media string as
	// playground.css's single-pane block, so CSS and JS can't disagree about who
	// owns layout. Below it, the Edit/Preview tabs are the sole authority and the
	// split renders inert 0px tracks.
	const [splitActive, setSplitActive] = React.useState(true);
	React.useEffect(() => {
		const mql = window.matchMedia('(max-width: 820px)');
		const sync = () => setSplitActive(!mql.matches);
		sync();
		mql.addEventListener('change', sync);
		return () => mql.removeEventListener('change', sync);
	}, []);
	const split = useSplit({
		storageKey: 'lattice-docs-split-playground',
		defaultRatio: 0.45, // mirrors the historical 0.9fr/1.1fr grid
		min: [280, 320],
		railWidth: 28,
		active: splitActive,
		paneIds: ['pg-pane-editor', 'pg-pane-preview'],
		onCollapse: (side) => setStatusLine(side === 'b' ? 'Preview collapsed — rendering paused.' : 'Editor collapsed.'),
		onExpand: (side) => {
			if (side !== 'b') return;
			// Fires after the expand has laid out (double rAF), so the iframe is
			// measurable again. A deck change deferred while collapsed needs the
			// full fresh render; otherwise one re-fit + patch render heals the view.
			if (pendingWhileCollapsedRef.current) {
				pendingWhileCollapsedRef.current = false;
				freshRender();
			} else {
				frameRef.current?.contentWindow?.__latticeFit?.();
				render(false);
			}
		},
		// One authoritative re-fit per resize commit (drag release or keyboard step).
		onSettle: () => frameRef.current?.contentWindow?.__latticeFit?.(),
	});
	// Mirror synchronously each render (the forceRef pattern above): the render
	// loop must see the collapse the moment React commits it, not an effect
	// later. Below the tab breakpoint the retained collapse is inert — the tabs
	// own visibility and renders must proceed normally.
	previewCollapsedRef.current = splitActive && split.collapsed === 'b';
	// Stable handle for callbacks defined above/below without dep churn.
	const splitApiRef = React.useRef(split);
	splitApiRef.current = split;
	// Suspend the in-iframe FIT agent's per-frame observers during a divider drag;
	// resume (which runs one fit) at end-of-drag. Without this every drag frame
	// runs an O(sections) rescale + filmstrip reflow inside the preview.
	React.useEffect(() => {
		const w = frameRef.current?.contentWindow;
		if (!w) return;
		if (split.dragging) w.__latticeFitSuspend?.();
		else w.__latticeFitResume?.();
	}, [split.dragging]);
	// Re-entering the split regime (iPad rotate back above 820px) re-applies the
	// retained ratio/collapse; re-fit the preview against its new width (no-op
	// before the engine loads or when the frame is empty).
	React.useEffect(() => {
		if (splitActive) frameRef.current?.contentWindow?.__latticeFit?.();
	}, [splitActive]);
	// Collapse via a header glyph: if focus was inside the now-inert pane it
	// would drop to <body>; hand it to the always-visible rail instead.
	const collapseFromHeader = React.useCallback((side: 'a' | 'b') => {
		splitApiRef.current.collapse(side);
		requestAnimationFrame(() => {
			document.querySelector<HTMLButtonElement>(`.pg-split [data-slot='split-rail'][data-side='${side}']`)?.focus();
		});
	}, []);

	// Mount the parent-hosted chart-interact layer over the preview iframe once,
	// for the component's lifetime (render() calls rebind() after each paint).
	React.useEffect(() => {
		const frame = frameRef.current;
		const stage = frame?.parentElement;
		if (!frame || !stage) return;
		const ci = createChartInteract({
			stage,
			getFrame: () => frameRef.current ?? frame,
			hoverAny: true,
			// chart-interact types the hook as `(detail: object|null) => void`; the
			// payload it emits IS the ChartDetail shape, so coerce at the boundary.
			onDetail: (detail) => setChartDetail(detail as ChartDetail | null),
		});
		chartInteractRef.current = ci;
		// Parent-hosted video playback: plays an embedded clip OVER the preview poster
		// (never an iframe inside the slide — #22 + the iOS scaled-iframe traps).
		const vo = createVideoOverlay({ getFrame: () => frameRef.current ?? frame });
		videoOverlayRef.current = vo;
		return () => {
			ci.destroy();
			chartInteractRef.current = null;
			vo.destroy();
			videoOverlayRef.current = null;
		};
	}, []);

	// ── Picker sync (reflect what the editor holds — honestly) ──────────────────
	// The clear case is real: detect→null empties draftComponent so the picker
	// shows the truth instead of the last component it happened to see. It NEVER
	// writes the persisted pointer. The Variant select snaps only when the
	// `_class` token line actually changed — a keystroke in a body paragraph can
	// no longer reset a user-chosen variant to 'default'.
	const syncPickers = React.useCallback(() => {
		const src = getSource();
		const det = detectComponent(catalog, src);
		setDraftComponent(det ? det.name : '');
		const line = classTokenLine(src);
		if (lastClassLineRef.current !== line) {
			lastClassLineRef.current = line;
		}
	}, [catalog, getSource]);

	// ── Draft protection: backup + undo toast (decision §4, invariant I2) ───────
	const showToast = React.useCallback((msg: string, undo: boolean) => {
		toast(msg, { duration: 6000, action: undo ? { label: 'Undo', onClick: () => undoRestoreRef.current() } : undefined });
	}, []);
	const recordInsert = React.useCallback((md: string) => {
		try {
			localStorage.setItem(INSERTED_HASH_KEY, fingerprint(md));
		} catch {
			/* private mode */
		}
	}, []);
	const draftIsPristine = React.useCallback(() => {
		try {
			return isPristine(getSource(), localStorage.getItem(INSERTED_HASH_KEY));
		} catch {
			return false;
		}
	}, [getSource]);
	/** Park the current draft before a programmatic overwrite; offer undo. */
	const backupDraft = React.useCallback(
		(why: string) => {
			if (draftIsPristine()) return;
			try {
				localStorage.setItem(BACKUP_KEY, getSource());
				showToast(`${why} — your previous draft is backed up.`, true);
			} catch {
				/* private mode: nothing to park into */
			}
		},
		[draftIsPristine, getSource, showToast],
	);

	// ── Edit handler: persist, sync pickers, debounced patch render ─────────────
	const onEdit = React.useCallback(() => {
		saveSource();
		setSourceVersion((v) => v + 1);
		syncPickers();
		scheduleRender();
	}, [saveSource, syncPickers, scheduleRender]);

	// ── Editor ready: restore persisted source, then first render ───────────────
	const onEditorReady = React.useCallback(
		(adapter: EditorAdapter) => {
			editorRef.current = adapter;
			try {
				const saved = localStorage.getItem(SOURCE_KEY);
				if (saved != null) adapter.setValue(saved);
				else {
					// First visit: the starter is a programmatic insert too — record its
					// fingerprint so it reads as pristine and a handoff can auto-apply.
					localStorage.setItem(INSERTED_HASH_KEY, fingerprint(adapter.getValue()));
				}
			} catch {
				/* private mode */
			}
			syncPickers();
			setSourceVersion((v) => v + 1);
			// An arriving handoff supersedes the restored draft when pristine; when
			// not, it parks and the restored draft renders untouched. (Ref-indirected:
			// the consumer is defined below with applyDeck, after this callback.)
			consumeHandoffRef.current();
			render(false);
		},
		[syncPickers, render],
	);

	// ── Deck swaps (pick / variant / gallery / scaffold) ────────────────────────
	const applyDeck = React.useCallback(
		(md: string, opts?: { toPreview?: boolean }) => {
			setSource(md);
			saveSource();
			setSourceVersion((v) => v + 1);
			syncPickers();
			if (opts?.toPreview) {
				setPane('preview');
				// Reveal the preview pane SYNCHRONOUSLY (not only via the React effect,
				// which runs after commit) so `freshRender` below writes the srcdoc into a
				// laid-out, non-zero-width iframe. On the mobile single-pane layout the
				// inactive pane is display:none: if the deck is rendered while the pane is
				// still hidden, the in-iframe FIT agent measures a 0-width box and iOS
				// Safari never reveals it (unlike Chrome, which recovers via ResizeObserver).
				// This mirrors the Drawing Board's setPane, which sets data-pane THEN renders.
				document.body.setAttribute('data-pane', 'preview');
				// `toPreview` is INTENT — "ensure the preview is visible" — and above
				// the tab breakpoint the collapsed-pane analog is the split. Expanding
				// is a no-op when the preview is already open; when it was collapsed,
				// the freshRender below defers (render-skip) and the expand's onExpand
				// runs the one authoritative render into a laid-out pane. Without this,
				// a component/gallery pick with the preview collapsed would report
				// "Rendered N slide(s)" over a blank screen.
				splitApiRef.current.expand('b');
			}
			freshRender();
		},
		[setSource, saveSource, syncPickers, freshRender],
	);

	// Picking a component / variant swaps the deck AND switches to Preview, the same
	// as a gallery load (applyDeck's `toPreview`). Without it, on the mobile single-
	// pane layout the pick renders into the still-hidden (display:none, zero-width)
	// Edit pane, so the deck scales against a 0-width iframe and the FIT gate leaves
	// it blank until you manually toggle to Preview — and even then the reveal races
	// a browser-dependent ResizeObserver (blank on iOS Safari). Auto-switching routes
	// the pick through the same proven reveal path galleries already use.
	const onPickComponent = React.useCallback(
		(name: string) => {
			if (!catalog[name]) return;
			// Exploring: a pick walks that component's gallery — no draft writes.
			if (viewRef.current === 'read') {
				void startWalkRef.current(name, null);
				return;
			}
			backupDraft(`Loaded ${name}`);
			setReaderComponent(name);
			try {
				localStorage.setItem(COMPONENT_KEY, name);
			} catch {
				/* private mode */
			}
			setDraftComponent(name);
			recordInsert(catalog[name].sample);
			applyDeck(catalog[name].sample, { toPreview: true });
		},
		[catalog, applyDeck, backupDraft, recordInsert],
	);

	const onLoadGallery = React.useCallback(
		(id: string) => {
			const src = gallerySources[id];
			if (src == null) {
				setStatusLine('Gallery unavailable.', true);
				return;
			}
			// A gallery is a deck to explore — walk it in place (slide-index
			// positions; no plan exists for authored decks). Always land in Explore,
			// so loading one from Edit flips to the rendered view and the mode/pane
			// stay in sync. Switch the surface inline (NOT setViewMode, whose Edit→read
			// save-back would overwrite this gallery with the editor's content).
			const w: Walk = { kind: 'deck', label: id, index: 0, count: 0 };
			setWalk(w);
			walkRef.current = w;
			setWalkNotice(null);
			exploreSourceRef.current = src;
			viewRef.current = 'read';
			setView('read');
			try {
				localStorage.setItem(VIEW_KEY, 'read');
			} catch {
				/* private mode */
			}
			document.body.setAttribute('data-view', 'read');
			setPane('preview');
			document.body.setAttribute('data-pane', 'preview');
			freshRender();
			requestAnimationFrame(() => frameRef.current?.contentWindow?.__latticeFit?.());
		},
		[gallerySources, setStatusLine, freshRender],
	);

	// Reset reads the DRAFT's component at click time; when the draft holds none
	// (exactly the state the honest clear case creates) it falls back to the
	// persisted pointer — named in the confirm, never a dead button (decision §4).
	const resetTarget = draftComponent || readerComponent;
	const onResetExample = React.useCallback(() => {
		const name = detectComponent(catalog, getSource())?.name || readerComponent;
		if (!(name && catalog[name])) {
			setStatusLine('Pick a component first.', true);
			return;
		}
		backupDraft(`Reset to the ${name} example`);
		recordInsert(catalog[name].sample);
		applyDeck(catalog[name].sample);
	}, [catalog, getSource, readerComponent, applyDeck, setStatusLine, backupDraft, recordInsert]);

	// Undo restores the parked draft (the toast's one-tap escape hatch).
	const onUndoRestore = React.useCallback(() => {
		try {
			const parked = localStorage.getItem(BACKUP_KEY);
			if (parked == null) return;
			setSource(parked);
			saveSource();
			setSourceVersion((v) => v + 1);
			syncPickers();
			freshRender();
			setStatusLine('Draft restored.');
		} catch {
			/* private mode */
		}
	}, [setSource, saveSource, syncPickers, freshRender, setStatusLine]);
	undoRestoreRef.current = onUndoRestore;

	// ── The Explore walk machinery (decision §4, PR 6) ──────────────────────────
	// Picker order IS the walk order (bucket, then A–Z — the same list the user
	// sees), so "next component" is never a surprise.
	const walkOrder = React.useMemo(() => components.map((c) => c.name), [components]);
	const fetchPlan = React.useCallback(
		async (name: string): Promise<Plan | null> => {
			const cached = planCacheRef.current.get(name);
			if (cached) return cached;
			if (!plansBase) return null;
			try {
				const res = await fetch(`${plansBase}${encodeURIComponent(name)}.json`);
				if (!res.ok) return null;
				const p = readPlan(await res.text());
				if (p) planCacheRef.current.set(name, p);
				return p;
			} catch {
				return null;
			}
		},
		[plansBase],
	);
	// Scroll the preview filmstrip to the walk position — instant by default,
	// smooth as an enhancement on stepping (prefers-reduced-motion honored).
	// Same-origin srcdoc + the FIT agent's own `.lattice > section` geometry.
	const scrollWalk = React.useCallback((smooth: boolean) => {
		const frame = frameRef.current;
		const w = walkRef.current;
		if (!frame || !w || viewRef.current !== 'read') return;
		const win = frame.contentWindow;
		const secs = frame.contentDocument?.querySelectorAll('.lattice > section');
		const target = secs?.[w.index] as HTMLElement | undefined;
		if (!win || !target) return;
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		win.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: smooth && !reduce ? 'smooth' : 'auto' });
	}, []);
	scrollWalkRef.current = scrollWalk;
	/** Enter (or move) the component walk. `step` is a stable plan kind (or null →
	 * title; 'LAST' → the closing slide, for walking backwards across components). */
	const startWalk = React.useCallback(
		async (name: string, step: string | null): Promise<boolean> => {
			const plan = await fetchPlan(name);
			if (!plan) {
				// The designed 404 path: the staged tree was rewritten by a deploy while
				// this tab sat open — never a dead Next button. (Silent when the walk is
				// only warming up behind the editor.)
				if (viewRef.current === 'read') {
					toast('This page is out of date — the site was updated while it sat open.', { duration: Infinity, action: { label: 'Reload', onClick: () => window.location.reload() } });
				}
				return false;
			}
			const at = step === 'LAST' ? { index: plan.slides.length - 1, notice: null } : resolvePlanStep(plan, step);
			setWalkNotice(at.notice);
			setWalk({ kind: 'plan', plan, index: at.index });
			walkRef.current = { kind: 'plan', plan, index: at.index };
			setReaderComponent(name);
			try {
				localStorage.setItem(COMPONENT_KEY, name);
			} catch {
				/* private mode */
			}
			exploreSourceRef.current = plan.slides.map((s) => s.md).join('\n\n---\n\n');
			// Warming up behind the editor (tour targets need #pg-walk mounted):
			// no render — Edit still shows the draft; entering Explore renders.
			if (viewRef.current === 'read') freshRender();
			// Prefetch the continuation so "Next component" never stalls.
			const next = adjacentComponent(walkOrder, name, 1);
			if (next) void fetchPlan(next);
			return true;
		},
		[fetchPlan, freshRender, walkOrder],
	);
	startWalkRef.current = startWalk;
	const stepWalk = React.useCallback(
		(dir: 1 | -1) => {
			const w = walkRef.current;
			if (!w) return;
			const count = w.kind === 'plan' ? w.plan.slides.length : w.count;
			const ni = w.index + dir;
			if (ni >= 0 && ni < count) {
				setWalk({ ...w, index: ni });
				walkRef.current = { ...w, index: ni };
				scrollWalk(true);
				return;
			}
			// Off either end of a component plan: the continuous read crosses into
			// the adjacent component (forward → its title; backward → its close).
			if (w.kind === 'plan') {
				const adj = adjacentComponent(walkOrder, w.plan.name, dir);
				if (adj) void startWalk(adj, dir === 1 ? null : 'LAST');
			}
		},
		[scrollWalk, startWalk, walkOrder],
	);
	const jumpComponent = React.useCallback(
		(dir: 1 | -1) => {
			const w = walkRef.current;
			const current = w?.kind === 'plan' ? w.plan.name : readerComponent;
			const adj = adjacentComponent(walkOrder, current, dir);
			if (adj) void startWalk(adj, null);
		},
		[readerComponent, startWalk, walkOrder],
	);
	/** Flip the surface. Entering Explore walks the remembered component; leaving
	 * re-renders the untouched draft. Read mode never wrote it (invariant). */
	const setViewMode = React.useCallback(
		(v: 'read' | 'edit') => {
			viewRef.current = v;
			setView(v);
			try {
				localStorage.setItem(VIEW_KEY, v);
			} catch {
				/* private mode */
			}
			document.body.setAttribute('data-view', v);
			if (v === 'read') {
				// Leaving Edit: save the edited deck back so Explore renders the edits
				// (the unified view/source model — 2026-07-06 simplification).
				if (exploreSourceRef.current != null) exploreSourceRef.current = getSource();
				// Reveal the preview pane SYNCHRONOUSLY before the render measures the
				// iframe (the mobile 0-width FIT trap — same ordering as applyDeck).
				setPane('preview');
				document.body.setAttribute('data-pane', 'preview');
				if (walkRef.current) freshRender();
				else void startWalk(readerComponent, null);
			} else {
				// Entering Edit: open the current deck's markdown in the editor. Flipping
				// back to Explore renders whatever you changed. (Whole-deck edit; Explore
				// is the preview, so there is no separate preview pane on mobile.)
				if (exploreSourceRef.current != null) {
					backupDraft('Opened the deck in the editor');
					setSource(exploreSourceRef.current);
				}
				setPane('edit');
				document.body.setAttribute('data-pane', 'edit');
				freshRender();
			}
			// The pane the frame lives in changed width (Explore is single-pane) —
			// re-fit after layout so the filmstrip scales to the new box.
			requestAnimationFrame(() => frameRef.current?.contentWindow?.__latticeFit?.());
		},
		[freshRender, readerComponent, startWalk, backupDraft, getSource, setSource],
	);

	// ── The one-shot handoff (all three external writers land here) ─────────────
	// Applied automatically when the draft is pristine (identical UX on the
	// common path); otherwise parked with a persistent affordance. The key is
	// consumed on APPLY, never on load — a "no" destroys nothing (invariant I4).
	const applyHandoff = React.useCallback(
		(h: { md: string; from: string; ts: number }) => {
			backupDraft(`Loaded the deck from ${h.from}`);
			recordInsert(h.md);
			try {
				localStorage.removeItem(HANDOFF_KEY);
			} catch {
				/* private mode */
			}
			setPendingHandoff(null);
			// An incoming handoff carries content to EDIT — it forces the editor
			// surface (the startup precedence rule, live for an already-open tab too).
			if (viewRef.current !== 'edit') setViewMode('edit');
			applyDeck(h.md, { toPreview: true });
			setStatusLine(`Loaded the deck handed off from ${h.from}.`);
		},
		[applyDeck, backupDraft, recordInsert, setStatusLine, setViewMode],
	);
	const consumeHandoffIfAny = React.useCallback(() => {
		let h: ReturnType<typeof readHandoff> = null;
		try {
			h = readHandoff(localStorage.getItem(HANDOFF_KEY));
		} catch {
			return;
		}
		if (!h) return;
		if (draftIsPristine()) applyHandoff(h);
		else setPendingHandoff(h);
	}, [applyHandoff, draftIsPristine]);
	consumeHandoffRef.current = consumeHandoffIfAny;
	// An already-open tab consumes on visibility/focus, so "Open in Playground"
	// from another tab reaches it without a reload.
	React.useEffect(() => {
		const onVis = () => {
			if (!document.hidden) consumeHandoffIfAny();
		};
		window.addEventListener('focus', onVis);
		document.addEventListener('visibilitychange', onVis);
		return () => {
			window.removeEventListener('focus', onVis);
			document.removeEventListener('visibilitychange', onVis);
		};
	}, [consumeHandoffIfAny]);

	// Persist picker search + lens as they change (reopen AND reload restore them).
	const onPickerQuery = React.useCallback((q: string) => {
		setPickerQuery(q);
		try {
			localStorage.setItem(SEARCH_KEY, q);
		} catch {
			/* private mode */
		}
	}, []);
	const onPickerLens = React.useCallback((l: string) => {
		setPickerLens(l);
		try {
			localStorage.setItem(LENS_KEY, l);
		} catch {
			/* private mode */
		}
	}, []);

	// ── Startup: URL scheme + the mode precedence rule (decision §4/§6) ─────────
	// view = handoff → Edit; explicit ?view= → that; persisted view → that; else
	// pristine draft → Explore, dirty draft → Edit. Target = URL > localStorage,
	// resolved through the tested fallbacks (never a blank frame). A host with
	// no staged plans (the test harness) degrades to the editor-only playground.
	const exploreAvailable = !!plansBase;
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design — startup reads persisted state exactly once.
	React.useEffect(() => {
		const url = parsePlaygroundUrl(window.location.search);
		let savedView: string | null = null;
		let src = '';
		let ih: string | null = null;
		let hasHandoff = false;
		try {
			savedView = localStorage.getItem(VIEW_KEY);
			src = localStorage.getItem(SOURCE_KEY) ?? '';
			ih = localStorage.getItem(INSERTED_HASH_KEY);
			hasHandoff = !!readHandoff(localStorage.getItem(HANDOFF_KEY));
		} catch {
			/* private mode */
		}
		let target = readerComponent;
		if (url.c) {
			const r = resolveComponent(catalog, url.c);
			target = r.name;
			setReaderComponent(r.name);
			if (r.fallback) setWalkNotice(`“${url.c}” is not a component any more — showing ${r.name}.`);
		}
		const v = exploreAvailable ? resolveStartupView({ hasHandoff, savedView, urlView: url.view, source: src, insertedHash: ih }) : 'edit';
		document.body.setAttribute('data-view', v);
		// An explicit ?view= is an explicit choice — persist it, so a reload (the
		// walk URL-sync strips edit params) and a new tab stay on the chosen surface.
		if (url.view) {
			try {
				localStorage.setItem(VIEW_KEY, url.view);
			} catch {
				/* private mode */
			}
		}
		if (v === 'read') {
			viewRef.current = 'read';
			setView('read');
			// Same synchronous pane reveal as setViewMode — the first walk render
			// must measure a visible iframe on the phone single-pane layout.
			setPane('preview');
			document.body.setAttribute('data-pane', 'preview');
			void startWalkRef.current(target, url.s);
		} else if (exploreAvailable) {
			// Warm the walk behind the editor so the Explore chrome (and the tour's
			// read-mode targets) exist before the first mode flip.
			void startWalkRef.current(target, url.s);
		}
		if (v === 'edit' && url.c && url.v && !hasHandoff) {
			// ?c&view=edit&v=<variant> — a guarded SEED link: route it through the
			// one-shot handoff pipeline (applies over a pristine draft, parks
			// otherwise), never a direct source write.
			const md = variantSource(catalog, target, url.v);
			if (md) {
				try {
					localStorage.setItem(HANDOFF_KEY, JSON.stringify({ md, from: 'a shared link', ts: Date.now() }));
				} catch {
					/* private mode */
				}
				consumeHandoffRef.current();
			}
		}
		urlSyncReadyRef.current = true;
	}, []);
	React.useEffect(() => () => document.body.removeAttribute('data-view'), []);

	// Focus mode → <html data-pg-focus> (CSS hides the toolbar) + persistence. On
	// <html>, not <body>, so the pre-paint seed can set it before <body> exists.
	React.useEffect(() => {
		document.documentElement.toggleAttribute('data-pg-focus', focusMode);
		try {
			localStorage.setItem(FOCUS_KEY, focusMode ? '1' : '0');
		} catch {}
	}, [focusMode]);
	React.useEffect(() => () => document.documentElement.removeAttribute('data-pg-focus'), []);
	const toggleFocus = React.useCallback(() => setFocusMode((v) => !v), []);

	// Walking writes the address bar (replaceState — shareable position, no
	// history spam); leaving Explore strips our params.
	React.useEffect(() => {
		if (!urlSyncReadyRef.current) return;
		const { pathname, hash, search } = window.location;
		if (view === 'read' && walk?.kind === 'plan') {
			const s = walk.plan.slides[walk.index]?.kind ?? null;
			window.history.replaceState(null, '', pathname + playgroundQuery({ c: walk.plan.name, view: 'read', s }) + hash);
		} else if (search) {
			window.history.replaceState(null, '', pathname + hash);
		}
	}, [view, walk]);

	// The tour's mode hook: guided-tour steps declare the mode their target
	// needs and revealStep dispatches `pg-set-view` (playground-tour.js).
	React.useEffect(() => {
		const onSetView = (e: Event) => {
			const v = (e as CustomEvent).detail;
			if ((v === 'read' || v === 'edit') && v !== viewRef.current) setViewMode(v);
		};
		document.addEventListener('pg-set-view', onSetView);
		return () => document.removeEventListener('pg-set-view', onSetView);
	}, [setViewMode]);

	// Keyboard walk: ← / → step, Shift+← / → jump components. Explore only, and
	// never while typing in a field.
	React.useEffect(() => {
		if (view !== 'read') return;
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target as HTMLElement | null;
			if (t?.closest('input, textarea, select, [contenteditable], .cm-content')) return;
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				if (e.shiftKey) jumpComponent(1);
				else stepWalk(1);
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				if (e.shiftKey) jumpComponent(-1);
				else stepWalk(-1);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [view, stepWalk, jumpComponent]);

	// Deck setup operates on whatever deck the reader is walking (§0 amendment):
	// in Explore it reads/writes the walk deck (ephemeral — regenerated on the
	// next walk); in Edit it stays wired to the editor.
	const exploreGetSource = React.useCallback(() => exploreSourceRef.current ?? getSource(), [getSource]);
	const exploreSetSource = React.useCallback(
		(text: string) => {
			exploreSourceRef.current = text;
			freshRender();
		},
		[freshRender],
	);

	// ── Re-render when <html> data-palette / data-mode change ───────────────────
	// Routed through the SAME scheduler as edits (not a direct render(false)) so it
	// honors the in-flight guard: a palette/mode flip landing mid-edit-render would
	// otherwise run a second renderInto concurrently on the one iframe, mutating the
	// shared previewState (frameSig/lastSections) out from under the in-flight patch.
	// The scheduler serializes them; a palette change is a sig change → a full write.
	React.useEffect(() => {
		const root = document.documentElement;
		const obs = new MutationObserver(() => scheduleRender());
		obs.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		return () => obs.disconnect();
	}, [scheduleRender]);

	// Trigger the on-demand engine load once the chrome has mounted/painted. The
	// preview is core to the playground, so load it promptly (on idle / next
	// tick) — but NOT eagerly in <head>, so the toolbar + editor host paint
	// first. The render loop already polls window.LatticePlayground, so the first
	// render fires as soon as the bundle resolves.
	React.useEffect(() => {
		const engine = engineRef.current;
		// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
		// (not behind it) — the render loop's ready() poll otherwise means
		// renderInto's theme fetch never starts until the engine already has.
		const start = () => {
			engine.prefetchTheme?.();
			engine.ensure();
		};
		const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
		if (ric) {
			ric(start);
		} else {
			const t = setTimeout(start, 0);
			return () => clearTimeout(t);
		}
	}, []);

	// Cleanup any pending timer on unmount.
	React.useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	// `pane` is the SINGLE source of truth for which pane is active; the body
	// data-pane attribute (the mobile single-pane layout keys off it —
	// playground.css `body[data-pane='…']`) mirrors it from one effect. The mode
	// toggle (setViewMode) drives `pane`: Explore → preview (deck), Edit → edit
	// (editor). Setting data-pane in one place keeps it in sync no matter how the
	// pane changed (mode flip OR a gallery load's `toPreview`).
	React.useEffect(() => {
		document.body.setAttribute('data-pane', pane);
		// Reveal a deck that was rendered while this pane was display:none (0-width):
		// on mobile the inactive pane is hidden, so a component/variant pick renders
		// the deck into a zero-width iframe and the FIT gate keeps `.lattice` hidden
		// (it can't scale a 0-width box). This effect runs AFTER the attribute above
		// makes the pane visible, so re-running the in-iframe FIT agent now measures
		// the real width and flips the deck visible. Direct (not a re-render) so it
		// can't race the fresh srcdoc write on a gallery/pick load. Mirrors the
		// Drawing Board, whose setPane sets data-pane THEN renders (drawing-board-pane.js).
		if (pane === 'preview') frameRef.current?.contentWindow?.__latticeFit?.();
	}, [pane]);
	React.useEffect(() => () => document.body.removeAttribute('data-pane'), []);

	// ── Walk bar derivations (cheap; recomputed per render) ─────────────────────
	const walkVariantLabels = React.useMemo(() => {
		if (walk?.kind !== 'plan') return {};
		const out: Record<string, string> = {};
		for (const v of catalog[walk.plan.name]?.variants || []) out[v.key] = v.label;
		return out;
	}, [walk, catalog]);
	// The step jump list (consolidates the old variant Select + chip strip): one
	// entry per slide in the plan, labeled by its kind.
	const walkChips = walk?.kind === 'plan' ? walk.plan.slides.map((s) => ({ key: s.kind, label: walkChipLabel(s.kind, walkVariantLabels) })) : [];
	const walkCount = walk ? (walk.kind === 'plan' ? walk.plan.slides.length : walk.count) : 0;
	const walkSlide = walk?.kind === 'plan' ? walk.plan.slides[walk.index] : null;
	const stepValue = walkSlide?.kind ?? '';
	const walkAtEnd = walk != null && walk.index >= walkCount - 1;
	const walkNextComp = walk?.kind === 'plan' && walkAtEnd ? adjacentComponent(walkOrder, walk.plan.name, 1) : null;
	const walkPrevComp = walk?.kind === 'plan' && walk.index === 0 ? adjacentComponent(walkOrder, walk.plan.name, -1) : null;
	const onWalkChip = React.useCallback((key: string) => {
		const w = walkRef.current;
		if (w?.kind !== 'plan') return;
		const at = resolvePlanStep(w.plan, key);
		const moved: Walk = { ...w, index: at.index };
		setWalk(moved);
		walkRef.current = moved;
		scrollWalkRef.current(true);
	}, []);

	return (
		<div className="lx-ui contents">
			{/* Chart detail reveal — the real shadcn Popover, anchored to a virtual element
			    at the cursor point the chart-interact layer reports. Non-modal + focus-inert
			    + pointer-transparent so it reads as a hover tooltip, not a click dialog. */}
			<Popover open={!!chartDetail}>
				<PopoverAnchor virtualRef={chartAnchorRef} />
				<PopoverContent
					side="bottom"
					align="start"
					sideOffset={14}
					collisionPadding={8}
					updatePositionStrategy="always"
					onOpenAutoFocus={(e) => e.preventDefault()}
					onCloseAutoFocus={(e) => e.preventDefault()}
					className="pointer-events-none w-auto max-w-[20rem] p-3"
				>
					{chartDetail && (
						<>
							<div className="flex items-center gap-2 font-medium text-foreground">
								{chartDetail.dot ? (
									<span className="size-2 shrink-0 rounded-full" style={{ background: chartDetail.dot }} />
								) : null}
								<span>{chartDetail.label}</span>
								{chartDetail.value ? (
									<span className="ml-auto tabular-nums text-muted-foreground">{chartDetail.value}</span>
								) : null}
							</div>
							{chartDetail.body ? (
								// biome-ignore lint/security/noDangerouslySetInnerHtml: deck-authored detail, sanitized upstream (#22)
								<p className="mt-1.5 text-sm text-foreground/90" dangerouslySetInnerHTML={{ __html: chartDetail.body }} />
							) : null}
							{chartDetail.meta ? (
								// biome-ignore lint/security/noDangerouslySetInnerHtml: deck-authored detail, sanitized upstream (#22)
								<div className="mt-1.5 text-xs uppercase tracking-wide text-muted-foreground" dangerouslySetInnerHTML={{ __html: chartDetail.meta }} />
							) : null}
						</>
					)}
				</PopoverContent>
			</Popover>
			{/* Toolbar — one row: mode toggle · component · step · setup · galleries. */}
			<div className="pg-bar">
				{/* Explore / Edit — a compact two-icon toggle (◱ view the deck · ✎ edit
				    its markdown). Explore renders the deck; Edit opens the current slide's
				    source in the editor (2026-07-06 simplification). */}
				{exploreAvailable && (
					<div className="pg-mode" role="tablist" aria-label="Playground mode">
						<button
							type="button"
							role="tab"
							aria-selected={view === 'read'}
							aria-label="Explore"
							title="Explore — view the deck"
							className={`pg-mode-btn${view === 'read' ? ' is-active' : ''}`}
							onClick={() => setViewMode('read')}
						>
							<Eye aria-hidden="true" />
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={view === 'edit'}
							aria-label="Edit"
							title="Edit — the current slide's markdown"
							className={`pg-mode-btn${view === 'edit' ? ' is-active' : ''}`}
							onClick={() => setViewMode('edit')}
						>
							<SquarePen aria-hidden="true" />
						</button>
					</div>
				)}
				<div className="pg-bar-pickers">
					<div className="pg-picker pg-template-picker">
						<label className="pg-picker-label" htmlFor="pg-template-trigger">
							Component
						</label>
						<ComponentPicker
							components={components}
							lenses={lenses}
							current={currentName}
							detached={!draftComponent}
							query={pickerQuery}
							onQueryChange={onPickerQuery}
							lensId={pickerLens}
							onLensChange={onPickerLens}
							onPick={onPickComponent}
						/>
					</div>
					<div className="pg-picker pg-step-picker">
						<label className="pg-picker-label" htmlFor="pg-step">
							Step
						</label>
						{/* Step jump list — consolidates the old variant Select AND the walk
						    chip strip: every slide in the deck (title, default, each variant,
						    stress, compositions, anti-patterns, see-also). Prev/Next step; this
						    jumps. Disabled in Edit or without a walk. */}
						<Select value={stepValue} onValueChange={onWalkChip} disabled={view !== 'read' || walkChips.length === 0}>
							<SelectTrigger id="pg-step" size="sm" aria-label="Jump to slide" className="w-full">
								<SelectValue placeholder="—" />
							</SelectTrigger>
							<SelectContent>
								{walkChips.map((c) => (
									<SelectItem key={c.key} value={c.key}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div className="pg-bar-actions">
					<span className={`pg-status${isError ? ' err' : ''}`} role="status" aria-live="polite">
						{status}
					</span>
					{/* ≤560px hides .pg-status — render errors must still reach the phone.
					    The badge appears only when there IS an error (CSS gates it to the
					    narrow layout); tapping it expands the full message inline. */}
					{isError && (
						<button
							type="button"
							className="pg-status-badge"
							aria-expanded={errorOpen}
							aria-label="Show render error"
							onClick={() => setErrorOpen((v) => !v)}
						>
							!
						</button>
					)}
					{/* Focus — hide the toolbar so the deck (Explore) or editor (Edit) owns
					    the full height. The walk bar stays, so stepping is never lost; a
					    floating pill (below) brings the toolbar back. */}
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Focus"
						aria-pressed={focusMode}
						title="Focus — hide the toolbar to reclaim space"
						onClick={toggleFocus}
					>
						<Maximize2 aria-hidden="true" />
						<span className="hidden sm:inline">Focus</span>
					</Button>
					{/* Debug lives inside Deck setup (Preview · debug) — no separate icon. */}
					<DeckSetupSheet
						getSource={view === 'read' ? exploreGetSource : getSource}
						setSource={view === 'read' ? exploreSetSource : setSource}
						palettes={palettes}
						finishes={finishes}
						configured={configured}
					/>
					<GalleriesSheet
						groups={galleryGroups}
						resetTarget={resetTarget && catalog[resetTarget] ? resetTarget : ''}
						resetArm={!draftIsPristine()}
						onLoadGallery={onLoadGallery}
						onResetExample={onResetExample}
					/>
				</div>
			</div>

			{/* Focus restore — a slim floating pill shown only in focus mode; the one
			    way back to the toolbar the CSS has hidden. */}
			{focusMode && (
				<button
					type="button"
					className="pg-focus-restore"
					aria-label="Exit focus"
					title="Exit focus — show the toolbar"
					onClick={toggleFocus}
				>
					<Minimize2 aria-hidden="true" />
				</button>
			)}

			{/* The Walk bar — Explore's stepping (Prev · N / M · Next + caption).
			    Mounted whenever a walk exists (CSS hides it in Edit) so the tour's
			    reveal hook can find it. Stepping jumps; the step dropdown above jumps
			    directly. Edit-this-slide and the transcript are gone — flip to Edit. */}
			{walk && (
				<WalkBar
					index={walk.index}
					count={walkCount}
					caption={walkSlide?.caption || ''}
					onPrev={() => stepWalk(-1)}
					onNext={() => stepWalk(1)}
					nextLabel={walkNextComp ? `Next component: ${walkNextComp} →` : null}
					prevDisabled={walk.index === 0 && !walkPrevComp}
					nextDisabled={walkAtEnd && !walkNextComp}
					notice={walkNotice}
				/>
			)}

			{/* Parked handoff: an external "Open in Playground" arrived over a dirty
			    draft. Apply consumes the key; Not now keeps it parked (nothing lost). */}
			{pendingHandoff && pendingHandoff.ts !== dismissedTs && (
				<section className="pg-handoff-bar" aria-label="Incoming deck">
					<span className="pg-handoff-msg">
						A deck from <strong>{pendingHandoff.from}</strong> is waiting — your current draft is unsaved work.
					</span>
					<button type="button" className="pg-handoff-apply" onClick={() => applyHandoff(pendingHandoff)}>
						Replace draft
					</button>
					<button type="button" className="pg-handoff-later" onClick={() => setDismissedTs(pendingHandoff.ts)}>
						Not now
					</button>
				</section>
			)}

			{/* Mobile error detail: the ≤560px layout hides the status line, so the
			    badge expands the full message here (visible at every width). */}
			{isError && errorOpen && (
				<div className="pg-error-detail" role="alert">
					{status}
					<button type="button" onClick={() => setErrorOpen(false)} aria-label="Dismiss error detail">
						✕
					</button>
				</div>
			)}

			<Toaster />

			{/* Split: rail | editor | handle | preview | rail — five children whose
			    grid tracks ALWAYS match (a display:none child would desync tracks
			    from items, the Studio grid lesson); rails/handle live at 0px tracks
			    until needed. Ratio/collapse state: useSplit above. */}
			<main
				className="pg-split"
				style={split.gridVars}
				data-split-collapsed={splitActive && split.collapsed ? split.collapsed : undefined}
				{...split.containerProps}
			>
				<SplitRail direction="right" label="Markdown" labelExpand="Expand editor" {...split.railProps('a')} />
				<section id="pg-pane-editor" className="pg-pane editor" inert={splitActive && split.collapsed === 'a' ? true : undefined}>
					<div className="pg-pane-label">
						Markdown
						<span className="pg-pane-label-spacer" />
						{splitActive && (
							<button
								type="button"
								className="pg-pane-collapse"
								aria-label="Collapse editor"
								title="Collapse editor — or drag the divider past its minimum"
								onClick={() => collapseFromHeader('a')}
							>
								<PanelLeftClose aria-hidden="true" />
							</button>
						)}
					</div>
					<EditorHost initialDoc={starter} vocab={lintVocab} onChange={onEdit} onReady={onEditorReady} />
				</section>
				<SplitHandle {...split.handleProps} />
				<section id="pg-pane-preview" className="pg-pane preview" inert={splitActive && split.collapsed === 'b' ? true : undefined}>
					<div className="pg-pane-label">
						Rendered slides
						<span className="pg-pane-label-spacer" />
						{splitActive && (
							<button
								type="button"
								className="pg-pane-collapse"
								aria-label="Collapse preview"
								title="Collapse preview — or drag the divider past its minimum"
								onClick={() => collapseFromHeader('b')}
							>
								<PanelRightClose aria-hidden="true" />
							</button>
						)}
					</div>
					<div className="pg-preview-wrap">
						{/* Instant-shell box — SSR'd empty; the pre-paint replay (playground.astro)
						    injects a returning visitor's cached first slide into it before hydration,
						    and React adopts that HTML here (dangerouslySetInnerHTML) so nothing wipes
						    it. Sits behind the transparent #preview iframe (like the skeleton) and is
						    dismissed on first live render. Empty + display:none when there's no snapshot. */}
						<div
							id="pg-ssr-slidebox"
							className="pg-ssr-shell"
							aria-hidden="true"
							suppressHydrationWarning
							{...(shellHtml != null ? { dangerouslySetInnerHTML: { __html: shellHtml } } : {})}
						/>
						<iframe id="preview" ref={frameRef} title="Rendered slides preview" onLoad={onFrameLoad} />
					</div>
				</section>
				<SplitRail direction="left" label="Rendered slides" labelExpand="Expand preview" {...split.railProps('b')}>
					{/* Never edit blind: a render failure while collapsed lights the rail. */}
					{isError && <span aria-hidden="true" className="pg-rail-error-dot" />}
				</SplitRail>
			</main>
		</div>
	);
}

export default PlaygroundApp;
