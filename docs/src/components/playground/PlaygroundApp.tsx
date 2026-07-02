import * as React from 'react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CatalogItem, Lens } from '@/lib/component-search';
import {
	type Catalog,
	detectComponent,
	SOURCE_KEY,
	sanitizePalette,
	variantOptions,
	variantSource,
} from '@/lib/playground-controller';
import { createEngineBridge, type PreviewState } from '@/lib/playground-engine';
import { applyDebug, deckDebugOn } from '@/playground/debug-overlay.js';
import { debugEffectiveOn, getDebugOverride, onDebugOverrideChange, setDebugOverride } from '@/playground/debug-prefs.js';
import { readFrontMatter } from '@/playground/deck-config.js';
import { createChartInteract } from '@/playground/drawing-board-chart-interact.js';
import { createVideoOverlay } from '@/playground/video-overlay.js';
import { BoundingBoxToggle } from './BoundingBoxToggle';
import { ComponentPicker } from './ComponentPicker';
import { DeckSetupSheet } from './DeckSetupSheet';
import { type EditorAdapter, EditorHost } from './EditorHost';
import { GalleriesSheet, type GalleryGroup } from './GalleriesSheet';

const DEBOUNCE_MS = 220;

export type PlaygroundData = {
	catalog: Catalog;
	components: CatalogItem[];
	lenses: Lens[];
	gallerySources: Record<string, string>;
	galleryGroups: GalleryGroup[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	palettes: string[];
	finishes: string[];
	// Deck-grammar lint vocabulary for the editor's inline validation (optional so
	// the test harness can omit it). Passed straight to EditorHost → createEditor.
	lintVocab?: unknown;
	starter: string;
};

/**
 * The playground controller — the React port of the old inline IIFE
 * (playground.astro:407-714). React owns the chrome (pickers, tabs, sheets,
 * status) and the orchestration (debounced render, fresh-vs-patch, variant
 * population, component detection, source persistence, palette/mode reaction).
 * The irreducible engine pieces are WRAPPED: the CodeMirror editor (EditorHost),
 * the marp render + filmstrip iframe (playground-engine → window globals), and
 * the config panel (DeckSetupSheet). None are reimplemented.
 */
export function PlaygroundApp({ data }: { data: PlaygroundData }) {
	const { catalog, components, lenses, gallerySources, galleryGroups, themeBase, runtimeUrl, engineUrl, palettes, finishes, lintVocab, starter } = data;

	const [currentName, setCurrentName] = React.useState('');
	const [variant, setVariant] = React.useState('default');
	const [status, setStatus] = React.useState('Ready.');
	const [isError, setIsError] = React.useState(false);
	const [pane, setPane] = React.useState<'edit' | 'preview'>('edit');
	const [sourceVersion, setSourceVersion] = React.useState(0); // drives DeckSetup cue

	const frameRef = React.useRef<HTMLIFrameElement>(null);
	// Live in-preview chart interaction: hover/tap a pie wedge in the rendered
	// preview to reveal its authored detail, as you edit — same parent-hosted
	// module + behaviour as the Drawing Board. Created on mount, re-bound after
	// each render (a srcdoc rewrite replaces the iframe doc). Export untouched.
	const chartInteractRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	const videoOverlayRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	const editorRef = React.useRef<EditorAdapter | null>(null);
	const engineRef = React.useRef(createEngineBridge(themeBase, runtimeUrl, engineUrl));
	const previewStateRef = React.useRef<PreviewState>({ frameSig: '', lastSections: null });
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const variants = React.useMemo(() => variantOptions(catalog, currentName), [catalog, currentName]);

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
	const [deckHasDebug, setDeckHasDebug] = React.useState(false);
	const forceRef = React.useRef<'on' | 'off' | null>(null);
	forceRef.current = debugOverride;
	React.useEffect(() => {
		setDebugOverrideState(getDebugOverride());
		return onDebugOverrideChange(setDebugOverrideState);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: sourceVersion is the explicit re-eval trigger.
	// biome-ignore lint/correctness/useExhaustiveDependencies: sourceVersion is the explicit re-eval trigger; getSource reads the live editor.
	React.useEffect(() => {
		setDeckHasDebug(deckDebugOn(getSource()));
	}, [sourceVersion]);
	const debugOn = debugEffectiveOn(deckHasDebug);
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
	}, []);

	// ── The render loop (wraps the engine; never reimplements it) ───────────────
	const render = React.useCallback(
		async (fresh: boolean) => {
			const frame = frameRef.current;
			if (!frame) return;
			const engine = engineRef.current;
			if (!engine.ready()) {
				setStatusLine('Loading engine…');
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
			const r = await engine.renderInto(frame, getSource(), palette, mode, previewStateRef.current, fresh);
			if (r.status === 'pending') {
				timerRef.current = setTimeout(() => render(fresh), 60);
			} else if (r.status === 'error') {
				setStatusLine(r.message, true);
			} else {
				previewStateRef.current = r.state;
				setStatusLine(`Rendered ${r.count} slide(s).`);
				// Drop the loading skeleton once real slides have painted (the iframe
				// is opaque and covers the host; this removes the placeholder behind it).
				frame.parentElement?.classList.add('is-live');
				// Re-bind the hover layer to the (possibly new) iframe document.
				chartInteractRef.current?.rebind();
				// Re-install the parent-hosted video playback bridge on the (possibly new) frame.
				videoOverlayRef.current?.rebind();
				// Re-apply the debug overlay: a section PATCH keeps the doc live but swaps
				// the <section> nodes the chips were bound to, so the agent must redraw.
				// (A full srcdoc write reloads → onFrameLoad handles that; this no-ops
				// until the fresh doc is ready.)
				applyDebug(frame, { force: forceRef.current });
			}
		},
		[getSource, setStatusLine, palettes],
	);

	const scheduleRender = React.useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => render(false), DEBOUNCE_MS);
	}, [render]);

	// freshRender resets the iframe (explicit deck swaps); render(false) patches.
	const freshRender = React.useCallback(() => {
		// A deck swap sets the editor source programmatically, and CodeMirror's
		// setValue dispatches synchronously — firing onChange → onEdit →
		// scheduleRender, which queues a DEBOUNCED patch render. That pending render
		// races THIS authoritative fresh render: on a slow connection (or a large
		// deck) the fresh srcdoc has not finished loading when the debounced render
		// fires ~220ms later, so it re-writes the iframe — a second full srcdoc write
		// that reloads the preview and flashes. Cancel it; the fresh render supersedes
		// any queued patch. (Cheap insurance: with fast loads it would merely patch.)
		if (timerRef.current) clearTimeout(timerRef.current);
		previewStateRef.current = { ...previewStateRef.current, frameSig: '' };
		render(true);
	}, [render]);

	// Mount the parent-hosted chart-interact layer over the preview iframe once,
	// for the component's lifetime (render() calls rebind() after each paint).
	React.useEffect(() => {
		const frame = frameRef.current;
		const stage = frame?.parentElement;
		if (!frame || !stage) return;
		const ci = createChartInteract({ stage, getFrame: () => frameRef.current ?? frame, hoverAny: true });
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

	// ── Picker sync (reflect what the editor holds) ─────────────────────────────
	const syncPickers = React.useCallback(() => {
		const det = detectComponent(catalog, getSource());
		if (!det) return;
		setCurrentName((prev) => (prev !== det.name ? det.name : prev));
		setVariant(det.variant);
	}, [catalog, getSource]);

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
			} catch {
				/* private mode */
			}
			syncPickers();
			setSourceVersion((v) => v + 1);
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
			setCurrentName(name);
			setVariant('default');
			applyDeck(catalog[name].sample, { toPreview: true });
		},
		[catalog, applyDeck],
	);

	const onVariantChange = React.useCallback(
		(key: string) => {
			setVariant(key);
			if (currentName) applyDeck(variantSource(catalog, currentName, key), { toPreview: true });
		},
		[catalog, currentName, applyDeck],
	);

	const onLoadGallery = React.useCallback(
		(id: string) => {
			const src = gallerySources[id];
			if (src == null) {
				setStatusLine('Gallery unavailable.', true);
				return;
			}
			applyDeck(src, { toPreview: true });
		},
		[gallerySources, applyDeck, setStatusLine],
	);

	const onResetExample = React.useCallback(() => {
		if (currentName && catalog[currentName]) applyDeck(catalog[currentName].sample);
		else setStatusLine('Pick a component first.', true);
	}, [currentName, catalog, applyDeck, setStatusLine]);

	const onInsertSkeleton = React.useCallback(() => {
		if (currentName && catalog[currentName]) applyDeck(catalog[currentName].skeleton);
		else setStatusLine('Pick a component first.', true);
	}, [currentName, catalog, applyDeck, setStatusLine]);

	// ── Re-render when <html> data-palette / data-mode change ───────────────────
	React.useEffect(() => {
		const root = document.documentElement;
		const obs = new MutationObserver(() => render(false));
		obs.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		return () => obs.disconnect();
	}, [render]);

	// Trigger the on-demand engine load once the chrome has mounted/painted. The
	// preview is core to the playground, so load it promptly (on idle / next
	// tick) — but NOT eagerly in <head>, so the toolbar + editor host paint
	// first. The render loop already polls window.LatticePlayground, so the first
	// render fires as soon as the bundle resolves.
	React.useEffect(() => {
		const engine = engineRef.current;
		const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
		if (ric) {
			ric(() => engine.ensure());
		} else {
			const t = setTimeout(() => engine.ensure(), 0);
			return () => clearTimeout(t);
		}
	}, []);

	// Cleanup any pending timer on unmount.
	React.useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const onTab = (which: 'edit' | 'preview') => {
		setPane(which);
		if (which === 'preview') {
			// Reveal the pane synchronously before render(false) reads the iframe width,
			// so the FIT measurement runs against a laid-out (non-zero-width) iframe —
			// same reason as applyDeck's toPreview branch. The effect below still sets
			// data-pane from state (single source); this pre-set just wins the ordering
			// so a Safari render into a still-hidden pane can't leave the deck blank.
			document.body.setAttribute('data-pane', 'preview');
			render(false);
		}
	};
	// `pane` is the SINGLE source of truth for which pane is active; the body
	// data-pane attribute (the mobile single-pane layout keys off it —
	// playground.css `body[data-pane='…']`) mirrors it from one effect. Driving it
	// here — not inside onTab — keeps it in sync no matter HOW the pane changed: a
	// tab click (onTab) OR a programmatic switch (applyDeck's `toPreview`, fired by
	// a gallery load). Setting data-pane only in onTab was the bug that left the
	// body stuck on 'edit' — preview hidden — while the React tab read 'preview'
	// after loading a gallery (the "flips to preview but the deck isn't shown,
	// click Edit then Preview to fix it" report).
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

	return (
		<div className="lx-ui contents">
			{/* Toolbar */}
			<div className="pg-bar">
				<div className="pg-bar-pickers">
					<div className="pg-picker pg-template-picker">
						<label className="pg-picker-label" htmlFor="pg-template-trigger">
							Component
						</label>
						<ComponentPicker components={components} lenses={lenses} current={currentName} onPick={onPickComponent} />
					</div>
					<div className="pg-picker pg-variant-picker">
						<label className="pg-picker-label" htmlFor="pg-variant">
							Variant
						</label>
						<Select value={variants.length ? variant : ''} onValueChange={onVariantChange} disabled={!variants.length}>
							<SelectTrigger id="pg-variant" size="sm" aria-label="Component variant" className="w-full">
								<SelectValue placeholder="—" />
							</SelectTrigger>
							<SelectContent>
								{variants.map((v) => (
									<SelectItem key={v.value} value={v.value} title={v.title}>
										{v.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div className="pg-bar-actions">
					{/* activationMode="manual": switch panes ONLY on a real tap/Enter, never on
					    focus. Radix's default "automatic" activates a tab the instant its
					    trigger is FOCUSED — so when opening the video player moved focus and it
					    landed on the Edit trigger, the mobile view silently flipped to Edit
					    behind the just-opened lightbox (the iOS "tap play → jumps to Edit" bug).
					    Manual mode also fits tabs whose switch drives an expensive re-render. */}
					<Tabs value={pane} onValueChange={(v) => onTab(v as 'edit' | 'preview')} activationMode="manual" className="pg-mobile-tabs">
						<TabsList>
							<TabsTrigger value="edit">Edit</TabsTrigger>
							<TabsTrigger value="preview">Preview</TabsTrigger>
						</TabsList>
					</Tabs>
					<span
						className={`pg-status${isError ? ' err' : ''}`}
						role="status"
						aria-live="polite"
					>
						{status}
					</span>
					<BoundingBoxToggle on={debugOn} onToggle={() => setDebugOverride(debugOn ? 'off' : 'on')} />
					<DeckSetupSheet
						getSource={getSource}
						setSource={setSource}
						palettes={palettes}
						finishes={finishes}
						configured={configured}
					/>
					<GalleriesSheet
						groups={galleryGroups}
						hasComponent={Boolean(currentName)}
						onLoadGallery={onLoadGallery}
						onResetExample={onResetExample}
						onInsertSkeleton={onInsertSkeleton}
					/>
				</div>
			</div>

			{/* Split: editor | preview */}
			<main className="pg-split">
				<section className="pg-pane editor">
					<div className="pg-pane-label">Markdown</div>
					<EditorHost initialDoc={starter} vocab={lintVocab} onChange={onEdit} onReady={onEditorReady} />
				</section>
				<section className="pg-pane preview">
					<div className="pg-pane-label">Rendered slides</div>
					<div className="pg-preview-wrap">
						<iframe id="preview" ref={frameRef} title="Rendered slides preview" onLoad={onFrameLoad} />
					</div>
				</section>
			</main>
		</div>
	);
}

export default PlaygroundApp;
