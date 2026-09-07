import { ChevronLeft, ChevronRight, Eye, Maximize2, Minimize2, PanelLeftClose, PanelRightClose, SquarePen } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { type ChartDetailHandle, ChartDetailLayer } from '@/components/chart-detail-layer';
import { PG_SPLIT_KEY, PG_SPLIT_MIN, PG_SPLIT_PANEL_IDS, PG_SPLIT_RAIL } from '@/components/playground/pg-split';
import { getFrontMatter } from '@/components/studio/front-matter';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { useResizableSplit } from '@/components/ui/use-resizable-split';
import type { CatalogItem, Lens } from '@/lib/component-search';
import { isTypingTarget, shellKeyAction } from '@/lib/deck-nav';
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
	readingSlideIndex,
	readPlan,
	resolveComponent,
	resolvePlanStep,
	resolveStartupView,
	SEARCH_KEY,
	type SlideBand,
	SOURCE_KEY,
	sanitizePalette,
	VIEW_KEY,
	variantSource,
	walkChipLabel,
} from '@/lib/playground-controller';
import { createEngineBridge, type PreviewState } from '@/lib/playground-engine';
import { parseDeckMotion } from '@/playground/anima-host-sel';
import { createAnimaScenes } from '@/playground/anima-scenes.ts';
import { applyDebug } from '@/playground/debug-overlay.js';
import { getDebugOverride, onDebugOverrideChange } from '@/playground/debug-prefs.js';
import { readFrontMatter } from '@/playground/deck-config.js';
import { captureFirstSectionFromFrame, savePlaygroundSnapshot } from '@/playground/snapshot-cache.js';
import { createVideoOverlay } from '@/playground/video-overlay.js';
import { swipeAction } from '../../../../lib/core/present-transport.mjs';
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
	 *  only when a deck has a diagram / math AND the URL is present. Optional so the
	 *  test harness may omit them — but there is NO CDN fallback behind them any more:
	 *  omitted means the tag is not injected and the diagram or math simply does not
	 *  render. See engineering/decisions/2026-09-03-self-hosted-runtime-deps.md. */
	mermaidUrl?: string;
	dagreUrl?: string;
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
/**
 * The split is NOT seeded through `useResizableSplit`'s `clientOnlyPanelIds`, deliberately.
 *
 * That option hands the saved layout to the library as `defaultLayout`, which reaches the
 * panel's inline style during RENDER — and this island is `client:load` (playground.astro), so
 * it server-renders and hydrates. React 19 does not patch inline-style hydration mismatches, so
 * seeding here froze the pane's flex-basis for the life of the page: a divider dragged to 412px
 * came back at 653px and then mis-tracked every drag after (#1553).
 *
 * This surface gets its pre-paint correctness the other way — the CSS-var seed in
 * `playground.astro` + `playground.css`, which touches nothing React renders — and the hook's
 * post-mount backstop lands the authoritative layout after hydration.
 */

type Walk =
	| { kind: 'plan'; plan: Plan; index: number }
	| { kind: 'deck'; label: string; index: number; count: number };

/** How long #preview takes to fade in (`playground.css`'s `#preview` transition), and
 *  therefore how long the instant-shell must stay behind it before being torn down. One
 *  declaration would be better than two, but a CSS transition duration is not readable
 *  from here without a computed-style round-trip on an element that may not exist yet;
 *  `playground-first-paint.spec.ts` measures the hand-off itself, so a drift shows up as
 *  the defect rather than as a mismatched constant. */
const SHELL_FADE_MS = 200;
/** How long `landWalk` waits for the in-iframe FIT agent to settle the deck's geometry
 *  before scrolling anyway. Generous: the measured settle on a cold load is ~200ms, and a
 *  bounded fallback that lands on roughly the right slide beats one that never lands. */
const LAND_SETTLE_MS = 2500;
/** rAF-coalescing window for the scroll→index observer. One read per frame is plenty for
 *  a counter the eye is watching, and it keeps a momentum scroll off the layout path. */
const SCROLL_IDLE_MS = 120;
/** How many times `landWalk` starts over when the scroll it performed did not put the
 *  target slide on screen. Each attempt re-waits for the geometry, so this is a budget in
 *  settle windows, not in frames; two is enough for the late-FIT case that forced it. */
const LAND_ATTEMPTS = 2;
/** The reveal's own backstop, and it MUST outlast the land's worst case
 *  (`LAND_SETTLE_MS x (1 + LAND_ATTEMPTS)`) or the frame fades in and then jumps — the
 *  #1588 shape the reveal gate exists to prevent. Derived rather than written as a
 *  constant so raising either of those cannot silently reopen it. Found by an
 *  independent checker. */
const REVEAL_CAP_MS = LAND_SETTLE_MS * (1 + LAND_ATTEMPTS) + 500;

/** The filmstrip's slide bands in the frame document's own coordinates. One reader, used
 *  by BOTH directions of the walk↔scroll loop, so the index the observer reports and the
 *  scroll the stepper writes can never be computed from different geometry.
 *
 *  The height comes from `getBoundingClientRect()`, NOT `offsetHeight`: the in-iframe FIT
 *  agent sizes every section to a fixed 720px layout box and then `transform: scale()`s it
 *  to the pane, so `offsetHeight` reports 720 on a phone where the slide is really 179px
 *  tall.
 *
 *  `offsetTop`, by contrast, IS right — but not for the reason it looks like. A transform
 *  never affects `offsetTop`; what makes the positions carry the scale is a second thing
 *  the same agent does, `s.style.marginBottom = (SH*sc - SH + GAP)` in
 *  `docs/src/playground/deck-preview.js`, a negative margin that pulls each following
 *  section's LAYOUT box up by exactly the scale difference. So this reads position from
 *  `offsetTop` and size from the rect, and **that pairing is only valid while that margin
 *  line exists** — change it and the band maths here goes with it. (An earlier draft of
 *  this comment credited the transform's origin, which would have read as reassurance that
 *  the margin was safe to touch. Found by an independent checker.) */
/** Line endings folded, for COMPARING two spellings of the same document — never for
 *  making one canonical. `\r\n?` and not `\r\n`: the second cannot match a classic-Mac
 *  lone CR at all, and the two cost the same (2026-08-04-line-endings-lf-boundaries.md). */
const lf = (t: string) => t.replace(/\r\n?/g, '\n');

/** A cheap fingerprint of the filmstrip's geometry — enough to tell "the fit agent has
 *  rescaled the deck" from "the reader scrolled it". */
function bandSig(bands: SlideBand[]): string {
	if (!bands.length) return '';
	return `${bands.length}:${Math.round(bands[0].height)}:${Math.round(bands[bands.length - 1].top)}`;
}

function frameBands(frame: HTMLIFrameElement): SlideBand[] {
	let secs: NodeListOf<HTMLElement> | undefined;
	try {
		secs = frame.contentDocument?.querySelectorAll<HTMLElement>('.lattice > section');
	} catch {
		return []; // a frame mid-navigation; the next poll gets it
	}
	if (!secs) return [];
	return Array.from(secs, (el) => ({ top: el.offsetTop, height: el.getBoundingClientRect().height }));
}

/**
 * The boot view the pre-paint script resolved and published on `<html data-pg-view>`
 * (playground.astro). It is the same answer `resolveStartupView` is about to give — read
 * before paint so the Explore layout is drawn once rather than assembled after hydration
 * (#1563). Null on the server, and on a page whose seed did not run.
 */
function bootView(): 'read' | 'edit' | null {
	try {
		const v = document.documentElement.getAttribute('data-pg-view');
		return v === 'read' || v === 'edit' ? v : null;
	} catch {
		return null;
	}
}

/** The pane the same seed implies: Explore shows the deck, Edit the editor. */
function bootPane(): 'edit' | 'preview' {
	return bootView() === 'read' ? 'preview' : 'edit';
}

/**
 * Whether an incoming handoff was present BEFORE FIRST PAINT, per the seed. Null when
 * the seed did not run (no window, no storage), which is the caller's cue to fall back
 * to reading the key itself.
 *
 * This exists because the key is a one-shot that a child effect consumes: by the time
 * the startup effect reads storage the handoff can already be deleted, and the highest-
 * precedence rule in `resolveStartupView` then silently never fires. The seed's read is
 * the only one that happens before anything can consume it.
 */
function readBootHandoff(): boolean | null {
	try {
		const boot = (window as unknown as { __pgBoot?: { hasHandoff?: boolean } }).__pgBoot;
		return boot ? !!boot.hasHandoff : null;
	} catch {
		return null;
	}
}

/**
 * Hand layout ownership from the pre-paint seed to the app, in one step.
 *
 * The seeded `<html>` attributes and the app's `<body>` ones drive the SAME rules (the
 * `:is(:root[data-pg-…], body[data-…])` aliases in playground.css). Leaving a stale seed in
 * place while the app writes a different answer is not merely redundant — on the phone the
 * two would hide opposite panes and leave the surface blank. So the body attribute goes on
 * and the seed comes off together, in one task, so the pair is never observable.
 */
function adoptBootSeed(view: 'read' | 'edit', pane: 'edit' | 'preview') {
	const body = document.body;
	body.setAttribute('data-view', view);
	body.setAttribute('data-pane', pane);
	const root = document.documentElement;
	root.removeAttribute('data-pg-view');
	root.removeAttribute('data-pg-pane');
	// The split seed's PIXEL CLAMP goes with them (#1589). The grow vars can stay — the library
	// writes the `flex` SHORTHAND inline, which outranks any stylesheet — but the `min-width` the clamp
	// rules apply has no inline counterpart to lose to, so left up it would pin a pane the
	// visitor collapses at its 320px minimum instead of letting it reach the 28px rail.
	root.removeAttribute('data-pg-split-seed');
}

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
	const { catalog, components, lenses, gallerySources, galleryGroups, themeBase, runtimeUrl, engineUrl, mermaidUrl, dagreUrl, katexUrl, palettes, finishes, lintVocab, starter, plansBase } = data;

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
	// The status line's FIRST value has to be true at first paint, not merely true later
	// (#1563). It said "Ready." — which nothing was: the island had not hydrated, the engine
	// bundle had not been requested, and nothing had rendered. A person watched it read
	// "Ready." → "Loading engine…" → "Rendered N slide(s)." on every reload, the first of
	// those three a claim the page could not support (and 57px narrower than the second, so
	// it moved as well). Starting at the state the app is actually in leaves two values,
	// both true, and the first one stable.
	const [status, setStatus] = React.useState('Loading engine…');
	const [isError, setIsError] = React.useState(false);
	// False through SSR and the first client render, true from the first effect — the
	// standard "has this hydrated yet" flag, and the honest answer for a toolbar value the
	// SERVER cannot know (#1563). The component picker used to server-render the first
	// entry in the catalog, so a returning visitor read "actors (draft differs)" for a
	// second and then watched it become "verdict-grid". A value that is about to be
	// replaced is worse than no value: render nothing until there is something true to say.
	const [hydrated, setHydrated] = React.useState(false);
	React.useEffect(() => setHydrated(true), []);
	// Which pane the phone layout shows. Seeded from the pre-paint boot resolution
	// (playground.astro publishes it on <html data-pg-pane>) rather than defaulting to
	// 'edit': the mount effect below mirrors this into body[data-pane], and starting at
	// the wrong value made an Explore boot write 'preview' (startup), then 'edit' (this
	// state), then 'preview' again — the phone's single-pane layout flipping to the editor
	// and back. `pane` drives no markup, only that attribute, so reading a browser global
	// in the initializer cannot desync hydration.
	const [pane, setPane] = React.useState<'edit' | 'preview'>(() => bootPane());
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
	const landWalkRef = React.useRef<(attempt?: number) => void>(() => {});
	/** The in-flight programmatic scroll: the index it is traveling to, and when the
	 *  observer stops deferring to it. Cleared the moment the frame actually arrives. */
	const walkScrollRef = React.useRef<{ index: number; until: number; armedAt: number } | null>(null);
	/** Fires when the guard above expires. The guard cannot be released by "the next scroll
	 *  event" alone: a single jumping scroll inside the window is never followed by one, so
	 *  the index stays where the step aimed while a different slide fills the pane. */
	const guardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Recompute the walk index from what is actually on screen. The one operation that
	 *  restores the invariant from any state, so every path that might have lost it —
	 *  the guard expiring, a land finishing, a rescale — ends here. */
	const reconcileRef = React.useRef<() => void>(() => {});
	/** The observer stays silent until the first walk position has been landed. Without
	 *  this a fresh frame — which starts at scrollY 0 — would report slide 1 and overwrite
	 *  the deep-linked index before `landWalk` ever got to honor it. */
	const observeReadyRef = React.useRef(false);
	/** True while `landWalk` is still placing the deck on the walk's slide. The REVEAL waits
	 *  on it: a frame that fades in and then scrolls is a slide moving under the reader's
	 *  eye, which is the #1588 defect in a different costume — caught by
	 *  `playground-first-paint.spec.ts` measuring the Explore reload at two geometries,
	 *  20px apart, after this change first landed the scroll a beat too late. */
	const landPendingRef = React.useRef(false);
	/** When the reader last acted AT ALL — a wheel, a drag, a step, a nav key, a Step-list row.
	 *  It answers "has the reader expressed an intent since X", which is what the two SCROLL
	 *  GUARD sites need: `done()`'s `oursInFlight` and `onDeckScroll`'s guard release both ask
	 *  whether a programmatic scroll still in flight is newer than the reader's last intent,
	 *  and a step counts there (it stamps, then arms, so its own guard survives). It is NOT
	 *  what the lander asks — see `driveAtRef` — and that split is the whole of the fix below.
	 *  The case this clock exists for: a resize followed straight away by a wheel, where the
	 *  observer is gated shut for the settle and would otherwise swallow the scroll the reader
	 *  just made — the bar held "1 / 22" at a scroll of 3033px (#2124). */
	const userInputAtRef = React.useRef(0);
	/**
	 * When the reader last MOVED THE DECK, as opposed to naming a slide.
	 *
	 * `userInputAtRef` above conflates two opposite intents, and a land has to tell them
	 * apart. A wheel or a drag says "I am here now" — the index must follow the deck, and a
	 * land that finishes would scroll the reader off the position they chose. A step (Prev /
	 * Next, an arrow key, Home / End, the Step list, a swipe) says the opposite: "put me on
	 * slide N" — the deck must follow the index, and the land is the thing that will do it.
	 *
	 * Preempting on BOTH threw the second one away, and did it on the plainest interaction
	 * this surface has: press Next on a cold load. Measured, 3 runs in 8 at 1440x900 — the
	 * click landed at ~789ms, when the frame still had 0 sections, so `scrollWalk` found no
	 * target and returned without scrolling or arming its guard; the in-flight land then saw
	 * "the reader took over", stood down, and `done()` reconciled the index back to the slide
	 * the deck was still sitting on. The bar went 1 -> 2 -> 1 in 11ms and Next did nothing.
	 * A step during a land needs no guard at all — the land already scrolls to whatever
	 * `walkRef.current.index` says by the time it runs, which is the stepped one.
	 */
	const driveAtRef = React.useRef(0);
	const landStartedAtRef = React.useRef(0);
	/** Which land is current. `landWalk` can only cancel its own polling rAF; once a land
	 *  reaches `verify` its rAF pair is untracked and will fire regardless — and `done()`
	 *  would then open both gates in the middle of a NEWER land's settle, which is exactly
	 *  the window those gates exist to hold shut. Every stage checks its epoch before
	 *  acting. Found by an independent checker. */
	const landEpochRef = React.useRef(0);
	/** A re-land is already scheduled (the pane changed size). `onDeckGeometry` stands down
	 *  while it is set: both observers see the same rescale, and if the in-frame one
	 *  reconciled first it would rename the reader's slide from the post-resize scroll a beat
	 *  before the re-land put them back on it — the two would fight over one event. */
	const landScheduledRef = React.useRef(false);
	/**
	 * The geometry the current index was PLACED against.
	 *
	 * A scroll event only says where the frame is; it does not say whether the frame moved or
	 * the deck did. When the fit agent rescales, every band moves while `scrollY` stays put —
	 * so the very next scroll event reports the NEW geometry at the OLD offset, and reading an
	 * index out of that renames the reader's slide from a position they never chose. Measured:
	 * resizing ~0.6s after a step logged `onDeckScroll 3->4 sy=2024`, one slide past where they
	 * had asked to be, deterministically.
	 *
	 * So the index is only ever re-read from a scroll measured in the SAME geometry it was
	 * placed in. A mismatch means a rescale is in flight, and the re-land owns the position.
	 */
	const bandSigRef = React.useRef('');
	/** The frame DOCUMENT the deck listeners are currently bound to. Keyed on the document
	 *  and NOT on `contentWindow`, which is a WindowProxy whose identity survives a
	 *  navigation: a srcdoc write drops every listener registered on the old global while
	 *  `frame.contentWindow === bound` still reads true, so a window-keyed guard binds once
	 *  to about:blank and then silently declines to rebind for the rest of the session. */
	const boundFrameDocRef = React.useRef<Document | null>(null);
	const bindDeckInputRef = React.useRef<() => void>(() => {});
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
	// Live in-preview chart detail: hover/tap a chart mark in the rendered preview to reveal its
	// authored detail as you edit. The parent-hosted layer + its popover live in the shared
	// `ChartDetailLayer` (below in the tree); this ref drives its rebind() after each paint.
	const chartDetailRef = React.useRef<ChartDetailHandle | null>(null);
	const videoOverlayRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	// Parent-hosted Anima scene hydration — brings a `scene` slide's poster to life on the
	// live preview (Stage 6). Created on mount, re-bound after each render (a srcdoc rewrite
	// replaces the iframe doc). Export untouched (poster still).
	const animaScenesRef = React.useRef<{ rebind: () => void; destroy: () => void } | null>(null);
	const editorRef = React.useRef<EditorAdapter | null>(null);
	const engineRef = React.useRef(createEngineBridge(themeBase, runtimeUrl, engineUrl, palettes, { mermaidUrl, dagreUrl, katexUrl }));
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
	// Pending teardown of the instant-shell, held so unmount can cancel it (a setState
	// after unmount is a React warning, and on the Studio→Playground back-and-forth it is
	// reachable). See goLive below.
	const shellDropRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	React.useEffect(
		() => () => {
			if (shellDropRef.current) clearTimeout(shellDropRef.current);
		},
		[],
	);

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
			// `is-live` starts BOTH halves of the hand-off at once: #preview fades in over
			// 0.2s and the instant-shell fades out from directly behind it. Since the replay
			// now paints the cached slide at the rect the filmstrip is about to use (#1563),
			// the two pictures coincide and the swap is invisible rather than a jump.
			wrap.classList.add('is-live');
			// Tear the shell DOWN only once that fade has finished. Doing it here — as this
			// did — pulled the cached slide the instant the iframe *started* fading in, so a
			// half-transparent slide sat over the bare pane for the whole 200ms.
			if (shellDropRef.current) clearTimeout(shellDropRef.current);
			shellDropRef.current = setTimeout(() => {
				shellDropRef.current = null;
				setShellHtml(null);
				document.documentElement.removeAttribute('data-pg-shell');
			}, SHELL_FADE_MS + 60);
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
			// …and the deck is on the slide the chrome names. Both halves are capped (this
			// timeout, and `landWalk`'s own settle + retry budget), so neither can wedge the
			// reveal shut on a frame whose FIT never settles.
			if ((ready && !landPendingRef.current) || Date.now() - start > REVEAL_CAP_MS) goLive();
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

	/** The last thing the RENDER said, so a transient chrome message ("Editor collapsed.")
	 *  can hand the line back rather than sitting there being wrong. */
	const lastRenderStatusRef = React.useRef('');
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
		// A full srcdoc write replaced the frame's document: rebind the deck's keyboard,
		// touch and scroll listeners to the new one.
		bindDeckInputRef.current();
		applyDebug(frameRef.current, { force: forceRef.current });
		videoOverlayRef.current?.rebind();
		animaScenesRef.current?.rebind();
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
			const rawPalette = root.getAttribute('data-palette') || 'cuoio';
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
				lastRenderStatusRef.current = `Rendered ${r.count} slide(s).`;
				setStatusLine(lastRenderStatusRef.current);
				// A full-deck walk learns its slide count from the render itself
				// (no plan exists for authored gallery decks — slide-index positions).
				const w = walkRef.current;
				if (viewRef.current === 'read' && w?.kind === 'deck' && w.count !== r.count) {
					setWalk({ ...w, index: Math.min(w.index, Math.max(0, r.count - 1)), count: r.count });
				}
				// Land the walk position ONCE THE FRAME'S GEOMETRY HAS SETTLED, not here: at
				// this point the in-iframe FIT agent has not rescaled the deck, and a scroll
				// written against pre-FIT offsets is thrown away when it does (#2124).
				bindDeckInputRef.current();
				if (viewRef.current === 'read') landWalkRef.current();
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
				chartDetailRef.current?.rebind();
				// Re-install the parent-hosted video playback bridge on the (possibly new) frame.
				videoOverlayRef.current?.rebind();
				// Re-hydrate Anima scenes on the (possibly new) frame document.
				animaScenesRef.current?.rebind();
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
				// The box the replay paints into — `.pg-preview-wrap`, the instant-shell's offset
				// parent. Given it, the capture records WHERE the live slide sits inside it, so the
				// next load's cached slide lands on the pixels the filmstrip is about to use rather
				// than on a second guess at the filmstrip's own geometry (#1563).
				box: fr.parentElement,
				palette: root.getAttribute('data-palette') || 'cuoio',
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

	// ── Resizable/collapsible split (2026-07-19 shadcn/react-resizable-panels) ──
	// Active only above the tab breakpoint — the SAME media string as
	// playground.css's single-pane block, so CSS and JS can't disagree about who
	// owns layout. Below it, the Edit/Preview tabs are the sole authority and the
	// group is `disabled` (the CSS flattens its flex row to one stacked column).
	const [splitActive, setSplitActive] = React.useState(true);
	React.useEffect(() => {
		const mql = window.matchMedia('(max-width: 820px)');
		const sync = () => setSplitActive(!mql.matches);
		sync();
		mql.addEventListener('change', sync);
		return () => mql.removeEventListener('change', sync);
	}, []);
	// px collapsed-pane rail width (the always-visible restore edge). Declared in pg-split.ts
	// because the pre-paint seed needs it too: the library snaps a restored pane to THIS rather
	// than to `minSize` below the midpoint of the two, and a seed that models only the clamp
	// paints 320px where the app is about to show 28.
	const RAIL_W = PG_SPLIT_RAIL;
	// Preview reveal choreography (was useSplit.onExpand): a deck change deferred
	// while collapsed needs a full fresh render; otherwise one re-fit + patch heals
	// the view. Double-rAF so the iframe is laid out + measurable first.
	const onPreviewExpand = React.useCallback(() => {
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				if (pendingWhileCollapsedRef.current) {
					pendingWhileCollapsedRef.current = false;
					freshRender();
				} else {
					frameRef.current?.contentWindow?.__latticeFit?.();
					render(false);
				}
			}),
		);
	}, [freshRender, render]);
	// react-resizable-panels split state (shared hook, 2026-07-19). The library
	// owns pointer capture, keyboard/ARIA, double-click reset, and persistence; we
	// own the srcdoc iframe pointer shield + __latticeFit re-fit via the callbacks:
	// onDragStart suspends the in-iframe FIT agent, onDragEnd/onSettle re-fit once.
	const split = useResizableSplit({
		storageKey: PG_SPLIT_KEY,
		active: splitActive,
		defaultRatio: 45,
		configKey: 'ep', // the Playground group is always just editor|preview
		// …and those two ids are the storage bucket, so the hook can hand the remembered
		// widths to the library as its starting layout instead of laying out at 45/55 and
		// correcting after. Declared HERE (not derived in the hook) because the only runtime
		// source of the real ids is the mounted group, which is one mount too late.

		onCollapse: (side) => setStatusLine(side === 'b' ? 'Preview collapsed — rendering paused.' : 'Editor collapsed.'),
		onExpand: (side) => {
			if (side === 'b') {
				onPreviewExpand(); // its render writes a fresh status on the way through
			} else if (lastRenderStatusRef.current) {
				// The editor side renders nothing on expand, so without this the line goes on
				// reading "Editor collapsed." over an open editor — a small lie, but this whole
				// change is about the chrome not making them.
				setStatusLine(lastRenderStatusRef.current);
			}
		},
		onSettle: () => frameRef.current?.contentWindow?.__latticeFit?.(),
		onDragStart: () => frameRef.current?.contentWindow?.__latticeFitSuspend?.(),
		onDragEnd: () => frameRef.current?.contentWindow?.__latticeFitResume?.(),
	});
	// Mirror synchronously each render (the forceRef pattern above): the render
	// loop must see the collapse the moment React commits it. Below the tab
	// breakpoint the retained collapse is inert — the tabs own visibility.
	previewCollapsedRef.current = splitActive && split.collapsed === 'b';
	// Re-entering the split regime (iPad rotate back above 820px) re-fits the
	// preview against its new width (no-op before the engine loads / empty frame).
	React.useEffect(() => {
		if (splitActive) frameRef.current?.contentWindow?.__latticeFit?.();
	}, [splitActive]);

	// Collapse via a header glyph: if focus was inside the now-inert pane it would
	// drop to <body>; hand it to the always-visible rail instead.
	const collapseFromHeader = React.useCallback(
		(side: 'a' | 'b') => {
			split.collapse(side);
			// Double rAF: the rail is display:none until React commits the collapse
			// (onResize→isCollapsed()→setState), so one frame can beat the reveal and
			// focus a hidden element (dropping focus to <body>). Two frames clear the commit.
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					document.querySelector<HTMLButtonElement>(`.pg-split [data-slot='split-rail'][data-side='${side}']`)?.focus();
				}),
			);
		},
		[split.collapse],
	);

	// Mount the parent-hosted chart-interact layer over the preview iframe once,
	// for the component's lifetime (render() calls rebind() after each paint).
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-once; getSource is a stable ref-reader called live inside getDeckMotion (adding it as a dep would not change behavior and re-running would tear down the parent-hosted layers).
	React.useEffect(() => {
		const frame = frameRef.current;
		const stage = frame?.parentElement;
		if (!frame || !stage) return;
		// The chart-detail layer self-mounts as a component (ChartDetailLayer, in the tree below) —
		// no manual createChartInteract here anymore. The video + Anima bridges stay parent-mounted.
		// Parent-hosted video playback: plays an embedded clip OVER the preview poster
		// (never an iframe inside the slide — #22 + the iOS scaled-iframe traps).
		const vo = createVideoOverlay({ getFrame: () => frameRef.current ?? frame });
		videoOverlayRef.current = vo;
		// Parent-hosted Anima scene hydration (Stage 6): mount the backend + run the loop
		// over the scene poster in the live preview.
		// Pass the deck-level `motion:` default (read live from the editor) so a class-less chart
		// animates under a deck-wide setting on THIS surface too — without it the Playground's own
		// Deck Settings → Motion control would write front-matter this host never reads (every
		// deck-level value, Off included, would be a silent no-op). Mirrors DeckPreview.
		const as = createAnimaScenes({
			getFrame: () => frameRef.current ?? frame,
			getDeckMotion: () => parseDeckMotion(getFrontMatter(getSource(), 'motion'), getFrontMatter(getSource(), 'motion-style'), getFrontMatter(getSource(), 'motion-speed')),
		});
		animaScenesRef.current = as;
		return () => {
			vo.destroy();
			videoOverlayRef.current = null;
			as.destroy();
			animaScenesRef.current = null;
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
				split.expand('b');
			}
			freshRender();
		},
		[setSource, saveSource, syncPickers, freshRender, split.expand],
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
	//
	// It also ARMS the scroll observer's guard, because the two are the same loop run
	// in opposite directions: this writes a scroll from an index, `onDeckScroll` reads
	// an index back from a scroll. A smooth scroll emits a scroll event per frame all
	// the way there, so without the guard a step from slide 2 to 9 would report — and
	// address-bar — every slide in between.
	const scrollWalk = React.useCallback((smooth: boolean) => {
		const frame = frameRef.current;
		const w = walkRef.current;
		if (!frame || !w || viewRef.current !== 'read') return;
		const win = frame.contentWindow;
		const secs = frame.contentDocument?.querySelectorAll('.lattice > section');
		const target = secs?.[w.index] as HTMLElement | undefined;
		if (!win || !target) return;
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const animated = smooth && !reduce;
		const now = Date.now();
		// This scroll PLACES the index, so it also defines the geometry the observer may read
		// it back from.
		bandSigRef.current = bandSig(frameBands(frame));
		const window_ms = animated ? 1200 : 400;
		walkScrollRef.current = { index: w.index, until: now + window_ms, armedAt: now };
		// ARM A TIMER TOO, not just a deadline other code checks when it happens to run. The
		// deadline alone is only ever read from `onDeckScroll`, so it needs a LATER scroll to
		// take effect — and the case it exists for is precisely a scroll with no successor
		// (an in-frame `scrollIntoView`, a fragment jump, a scrollbar drag past the target).
		// Measured: a step to slide 2 then one jump to slide 10 left the bar on "2 / 13"
		// forever. Found by an independent checker.
		if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
		guardTimerRef.current = setTimeout(() => {
			guardTimerRef.current = null;
			if (!walkScrollRef.current) return; // released normally
			walkScrollRef.current = null;
			// NOT WHILE A LAND OWNS THE POSITION. This timer exists to un-strand a scroll that
			// no later event will correct; a land in flight IS that later correction, and it is
			// about to place the reader deliberately. Reconciling underneath it reads a frame
			// caught mid-refit and renames the slide from wherever it happens to be — measured
			// on a resize landing 400ms into a step's smooth scroll, which ended one slide past
			// what the reader asked for.
			if (landPendingRef.current) return;
			reconcileRef.current();
		}, window_ms + 40);
		win.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: animated ? 'smooth' : 'auto' });
	}, []);
	scrollWalkRef.current = scrollWalk;

	/**
	 * LAND the walk position once the frame's geometry is the geometry the reader will
	 * see — not the moment `renderInto` resolves.
	 *
	 * The render loop used to call `scrollWalk` directly there, and the scroll was simply
	 * lost: traced on a cold `?c=kpi&s=variant:trajectory`, at t=908ms the frame was still
	 * `visibility:hidden` with `scrollHeight` 9432 and slide 5 at 3636, and by t=1114ms the
	 * in-iframe FIT agent had rescaled the deck to 8739 / 3376 and put the scroll back at 0.
	 * So EVERY shared `?s=` link, and every reload, opened on the title slide while the walk
	 * bar, the caption and the Step dropdown all named a slide six further in — and so did
	 * Explore→Edit→Explore, which runs the same path (#2124).
	 *
	 * IT VERIFIES THE OUTCOME rather than predicting when FIT is done, and that distinction
	 * is the whole reliability of this function. Waiting for "the geometry stopped changing"
	 * is a guess: on a phone, FIT can run late enough that two consecutive frames of the
	 * PRE-scale layout look settled, the scroll goes to a stale offset, and the surface ends
	 * up naming a slide with 0% of it on screen — measured, intermittently, at 390x844 on a
	 * cross-component step. So after scrolling it checks whether the target slide is
	 * actually visible and, if not, starts over. The bounded retry and the settle timeout
	 * together mean a frame whose FIT never settles still lands somewhere honest rather than
	 * silently on the first slide.
	 *
	 * Always INSTANT: this lands a freshly rendered deck, where there is no previous
	 * position to animate away from. Stepping inside a live deck smooths, via `scrollWalk`.
	 */
	const landRafRef = React.useRef<number | null>(null);
	const landWalk = React.useCallback(
		(attempt = 0) => {
			if (landRafRef.current != null) cancelAnimationFrame(landRafRef.current);
			// The observer stays shut for the whole settle: a fresh frame starts at scrollY
			// 0, and reporting that would overwrite the index we are about to honor. Owned
			// here rather than in `onFrameLoad` so the two callbacks' order cannot matter.
			observeReadyRef.current = false;
			landPendingRef.current = true;
			const start = Date.now();
			// The retry re-enters this function, so the "has the reader taken over?" clock is
			// the FIRST attempt's start, not this one's — otherwise a retry would forget the
			// scroll that made it necessary.
			if (attempt === 0) landStartedAtRef.current = start;
			const startedAt = landStartedAtRef.current;
			const epoch = ++landEpochRef.current;
			/** True once a newer land has taken over; every stage below stands down on it. */
			const superseded = () => landEpochRef.current !== epoch;
			let lastKey = '';
			let stable = 0;
			const targetShare = () => {
				const frame = frameRef.current;
				const w = walkRef.current;
				const win = frame?.contentWindow;
				if (!frame || !w || !win) return 0;
				const b = frameBands(frame)[w.index];
				if (!b || b.height <= 0) return 0;
				const seen = Math.min(win.scrollY + win.innerHeight, b.top + b.height) - Math.max(win.scrollY, b.top);
				return Math.max(0, seen) / b.height;
			};
			/**
			 * Open both gates and stop — but RECONCILE the index against the frame first.
			 * The observer has been shut for the whole settle, so anything that moved the
			 * deck in that window (the reader taking over, a fallback scroll that clamped)
			 * left the walk index describing a position the frame is not at, and no further
			 * scroll event is coming to correct it. This is the one place that can restore
			 * the invariant, so it does.
			 */
			const done = () => {
				if (superseded()) return; // a newer land owns the gates now
				const frame = frameRef.current;
				// …EXCEPT while a scroll of OURS is still traveling to a position the reader
				// asked for after this land began. Reconciling then reads a scroll that has not
				// arrived and quietly throws their step away: a PageDown during a fresh
				// gallery's fit window set the index to 2, and the reconcile — running one
				// frame later at the old scroll — put it straight back to 1 and re-aimed the
				// scroll at the slide they had just left. `armedAt >= userInputAtRef` is what
				// tells "our scroll, still in flight" from "our scroll, already overtaken".
				const pending = walkScrollRef.current;
				// NOT also gated on "did we land on target". That was tried, to make the
				// invariant outrank the guard — and it re-broke the case the guard exists for:
				// a step taken while a fresh deck is still being fit has not arrived YET, so
				// "not on target" is its normal mid-flight state and reconciling there throws
				// the step away. The safety net lives on the guard's expiry timer instead,
				// which reconciles unconditionally once the scroll has had its window.
				const oursInFlight = !!pending && pending.armedAt >= userInputAtRef.current;
				// Through the SHARED reconcile, so the geometry check above applies here too — a
				// land that ends while another rescale is already in flight must not read the
				// index out of the geometry it is about to lose.
				if (!oursInFlight) reconcileRef.current();
				if (frame) bandSigRef.current = bandSig(frameBands(frame));
				observeReadyRef.current = true;
				landPendingRef.current = false;
			};
			/** THE READER OUTRANKS THE LANDER — when they moved the DECK. A wheel or a drag
			 *  since this land began means they have chosen a position; finishing would scroll
			 *  them off it. A STEP is not that (see `driveAtRef`): it names a slide, and this
			 *  land is what will put them on it. */
			const preempted = () => driveAtRef.current > startedAt;
			const verify = () => {
				// Two frames after the scroll, so the frame has laid out and composited.
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (superseded()) return;
						if (viewRef.current !== 'read' || preempted()) return done();
						if (targetShare() > 0.5) return done();
						if (attempt < LAND_ATTEMPTS) return landWalkRef.current(attempt + 1); // re-sets landPending
						done();
					}),
				);
			};
			// ABORT ANY SMOOTH SCROLL STILL TRAVELING before this land does anything. A step's
			// `scrollTo({behavior:'smooth'})` animates for ~400ms toward a target computed in
			// the geometry it was issued in; a resize landing inside that window re-fits the
			// deck under it, and the animation goes on finishing to a position that no longer
			// means anything. Measured: tapping Next three times and resizing immediately left
			// the bar on slide 4 with 13% of slide 4 on screen and slide 3 filling the pane.
			// An instant `scrollTo` to the CURRENT offset is the spec's way to cancel one.
			{
				const win = frameRef.current?.contentWindow;
				if (win) win.scrollTo({ top: win.scrollY, behavior: 'auto' });
			}
			const tick = () => {
				landRafRef.current = null;
				if (superseded()) return;
				const frame = frameRef.current;
				if (!frame || !walkRef.current || viewRef.current !== 'read' || preempted()) return done();
				const bands = frameBands(frame);
				const win = frame.contentWindow;
				const lat = frame.contentDocument?.querySelector('.lattice') as HTMLElement | null;
				const revealed = !!(lat && win && win.getComputedStyle(lat).visibility === 'visible');
				const key = bands.length ? `${bands.length}:${bands[0].height}:${bands[bands.length - 1].top}` : '';
				stable = key !== '' && key === lastKey ? stable + 1 : 0;
				lastKey = key;
				if (revealed && stable >= 2) {
					scrollWalk(false);
					verify();
					return;
				}
				if (Date.now() - start > LAND_SETTLE_MS) {
					if (bands.length) scrollWalk(false);
					return done();
				}
				landRafRef.current = requestAnimationFrame(tick);
			};
			landRafRef.current = requestAnimationFrame(tick);
		},
		[scrollWalk],
	);
	landWalkRef.current = landWalk;
	React.useEffect(
		() => () => {
			if (landRafRef.current != null) cancelAnimationFrame(landRafRef.current);
		},
		[],
	);

	/** Move the walk to an absolute index (Home / End / the step list) and land it. */
	const gotoIndex = React.useCallback(
		(i: number) => {
			const w = walkRef.current;
			if (!w) return;
			userInputAtRef.current = Date.now(); // Home/End and the Step list are the reader too
			const count = w.kind === 'plan' ? w.plan.slides.length : w.count;
			const ni = Math.max(0, Math.min(count - 1, i));
			if (ni === w.index) return;
			const moved: Walk = { ...w, index: ni };
			setWalk(moved);
			walkRef.current = moved;
			scrollWalk(true);
		},
		[scrollWalk],
	);
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
			// A PRESS OF PREV/NEXT IS THE READER, and this is where every route into a step
			// converges — the walk bar, the keyboard, a swipe. Stamping only in `onDeckKey`
			// left the two most obvious controls on the surface invisible to the SCROLL GUARDS,
			// which is what this clock feeds. Found by an independent checker.
			//
			// IT NO LONGER MAKES A LAND STAND DOWN, and that reversal is deliberate: the land
			// scrolls to `walkRef.current.index`, which by the time it runs is the stepped one,
			// so standing down for a step threw the step away instead of honoring it. The
			// lander reads `driveAtRef`. Do not "restore" this stamp's old reach by pointing
			// `preempted()` back at this clock — that is the cold-load lost step.
			userInputAtRef.current = Date.now();
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
			// RE-ENTERING THE MODE YOU ARE ALREADY IN IS A NO-OP, and it has to be said here
			// rather than at each call site: both branches below COPY ONE SOURCE OVER THE
			// OTHER, so re-entering destroys work. Clicking the already-active Explore tab
			// overwrote the walk deck with the editor's untouched draft — measured, 13 slides
			// became 1 while the bar still read "3 / 13" and the picker still said `kpi` — and
			// clicking the active Edit tab is the mirror image, replacing the author's draft
			// with the explore deck and pushing a backup nobody asked for. A `role="tab"` that
			// destroys the deck when you click the tab you are on is not a defensible control,
			// and `onLoadGallery` already had to route AROUND this function for the same
			// reason. Both tabs call this unconditionally, so the guard lives here (#2124).
			//
			// IT GUARDS THE SOURCE COPY, NOT THE WHOLE FUNCTION, and the difference is a
			// surface. An early return here also skipped the PANE sync — and `pane` routinely
			// disagrees with `view` already, because `applyDeck(..., {toPreview:true})` sets
			// it to `preview` while the view stays `edit`. Below the 820px breakpoint the
			// inactive pane is `display:none`, so picking a component in Edit on a phone left
			// the editor hidden and the Edit tab a no-op: **the only route back to the editor
			// was gone**, and `applyHandoff` produced it on an incoming deck whose whole point
			// is to be edited. Found by an independent checker on the first cut of this guard.
			const changing = v !== viewRef.current;
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
				//
				// …AND RE-POINT THE WALK WHEN THAT DECK IS NO LONGER THE PLAN'S. A plan walk
				// counts a COMPONENT GALLERY's slides and names them by kind; the deck Explore
				// actually renders is whatever the editor holds, and the two diverge the moment
				// the author touches it — picking a component in Edit loads that component's
				// one-slide sample, so the bar went on reading "1 / 13" over a single slide,
				// Next stepped to a slide that did not exist, and `?c=kpi` still named a deck
				// nobody was looking at: three readouts, three different answers (#2124). A
				// `deck` walk is the shape for this — it learns its count from the render, the
				// Step list correctly has nothing to offer, and the URL sync drops params that
				// no longer describe the screen.
				if (changing && exploreSourceRef.current != null) {
					// COMPARED AFTER NORMALIZING LINE ENDINGS. CodeMirror stores a document
					// with its own line separator, so a source that arrived with CRLF comes
					// back as LF and raw equality reports an edit nobody made — silently
					// dropping a plan walk and stripping `?c=`/`?s=`. Everything reaching this
					// ref is LF today, so this is a latent trap rather than a live defect;
					// it is closed here because the next ingest that is not (a paste, a
					// fetched deck) would open it with no message and nothing to grep for.
					// Found by an independent checker.
					const edited = getSource();
					if (lf(edited) !== lf(exploreSourceRef.current)) {
						exploreSourceRef.current = edited;
						const w: Walk = { kind: 'deck', label: 'draft', index: 0, count: 0 };
						setWalk(w);
						walkRef.current = w;
						setWalkNotice(null);
					}
				}
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
				if (changing && exploreSourceRef.current != null) {
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
		// …but the handoff key may ALREADY BE GONE by the time this runs, and then the
		// read above is a lie. `EditorHost` is a CHILD, React flushes child passive
		// effects before the parent's, and its `onReady` runs `consumeHandoff`, which
		// deletes the key — measured at t=338ms, six milliseconds before this effect's
		// own read. `resolveStartupView` then falls through to `isPristine`, and since
		// `applyHandoff` has just recorded the insert hash, the draft IS pristine, so a
		// visitor handed a deck from the Studio was dropped into the Explore gallery
		// instead of the editor holding their deck — after watching the editor pane sit
		// there for ~900ms and vanish. The pre-paint seed read the key BEFORE any of
		// that could run, so prefer its answer; the local read is the fallback for a
		// page whose seed did not run at all.
		const boot = readBootHandoff();
		if (boot !== null) hasHandoff = boot;
		let target = readerComponent;
		if (url.c) {
			const r = resolveComponent(catalog, url.c);
			target = r.name;
			setReaderComponent(r.name);
			if (r.fallback) setWalkNotice(`“${url.c}” is not a component any more — showing ${r.name}.`);
		}
		const v = exploreAvailable ? resolveStartupView({ hasHandoff, savedView, urlView: url.view, source: src, insertedHash: ih }) : 'edit';
		// Take the layout over from the pre-paint seed. `v` is what the seed predicted (the
		// e2e boot-view parity cases hold the two to that), so in the normal case this
		// changes which attribute carries the answer, not the answer — and therefore not a
		// single pixel. It is also the recovery path if they ever DO disagree: the app's
		// answer is the real one and it lands here, on the first commit, rather than
		// leaving the seed's wrong guess on screen.
		adoptBootSeed(v, v === 'read' ? 'preview' : 'edit');
		// An explicit ?view= is an explicit choice — persist it, so a reload (the
		// walk URL-sync strips edit params) and a new tab stay on the chosen surface.
		if (url.view) {
			try {
				localStorage.setItem(VIEW_KEY, url.view);
			} catch {
				/* private mode */
			}
		}
		// The pane STATE has to be corrected too, not just the attribute. It is seeded
		// from `bootPane()` now, and the effect that mirrors it into body[data-pane]
		// is declared below this one — so leaving it alone lets the SEED's value be
		// written back over the app's answer on the very next commit, and the phone
		// settles in Edit with its editor pane hidden. Set it on both branches.
		setPane(v === 'read' ? 'preview' : 'edit');
		if (v === 'read') {
			viewRef.current = 'read';
			setView('read');
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
	// TRAILING-EDGE, and that is load-bearing now that the walk index follows the reader's
	// own scroll: a flick through six slides used to be six `replaceState` calls in a
	// couple of frames, which Safari rate-limits outright (100 per 30s) and which writes
	// an address bar nobody can read mid-gesture. One call once the scroll rests.
	React.useEffect(() => {
		if (!urlSyncReadyRef.current) return;
		const write = () => {
			const { pathname, hash, search } = window.location;
			if (view === 'read' && walk?.kind === 'plan') {
				const s = walk.plan.slides[walk.index]?.kind ?? null;
				window.history.replaceState(null, '', pathname + playgroundQuery({ c: walk.plan.name, view: 'read', s }) + hash);
			} else if (search) {
				window.history.replaceState(null, '', pathname + hash);
			}
		};
		const t = setTimeout(write, SCROLL_IDLE_MS);
		return () => clearTimeout(t);
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

	// ── The deck's three input verbs, and the scroll that reads them back ───────
	//
	// THE RULE (engineering/decisions/2026-08-10-input-verb-parity.md): every surface
	// that shows a slide accepts keyboard, wheel and touch, at every breakpoint, with no
	// gating on device class. That note reconciled the STUDIO's surfaces; the Playground
	// — the one surface a non-technical visitor actually lands on — was never brought
	// with it, and measured on the real page it was short on all three (#2124):
	//
	//   keyboard  a hand-written two-key map (←/→) on `window` only. Clicking the deck
	//             moves focus to the <iframe>, after which every keystroke is delivered
	//             INSIDE the frame and the parent listener never sees it — so the arrows
	//             died the first time the reader touched the thing they were reading, with
	//             nothing on screen to say why. PageUp/PageDown (what a presentation
	//             clicker emits) and Home/End were never wired at all.
	//   touch     a horizontal swipe did nothing. On a phone that IS the gesture.
	//   wheel     scrolled the filmstrip, which is right — but nothing read the position
	//             back, so the chrome went on naming the slide you had scrolled away from.
	//
	// The keymap now comes from the kernel (`shellKeyAction` → `SHELL_KEYMAP`) rather than
	// a third hand-written list, and the swipe rule from `swipeAction`, so the Playground
	// turns a deck by the same rules as Present and the Studio shell. Every listener is
	// installed on BOTH the page and the frame document, which is what makes a click on
	// the slide harmless.
	//
	// WHEEL IS DELIBERATELY NOT GATED into discrete steps here, and that is the one place
	// this surface parts company with Present. The Playground preview is a FILMSTRIP the
	// reader skims, sharing its iframe with the editor's live preview; `createWheelGate`
	// would take the vertical wheel away from free scrolling to turn slides with it. The
	// verb is served by making the scroll HONEST instead — `onDeckScroll` below reports
	// what the wheel actually reached — which is the parity the rule is about: no reader
	// finds an input that the surface ignores.
	const onDeckKey = React.useCallback(
		(e: KeyboardEvent) => {
			if (viewRef.current !== 'read' || e.defaultPrevented) return;
			// THE TYPING GUARD RUNS FIRST, ahead of every branch. `shellKeyAction` carries
			// its own `isTypingTarget`, so putting the shifted chord in front of it took the
			// chord out from under that check: Shift+ArrowLeft to extend a selection in the
			// picker's search box swapped the walked component and rewrote the URL, and the
			// selection the keystroke asked for never happened. One text-editing keystroke
			// replaced the reader's deck. Found by an independent checker.
			if (isTypingTarget(e.target as Element | null)) return;
			// Shift+Arrow jumps a whole component. Checked ahead of the kernel because the
			// shell rule refuses every modified chord — correctly, since it cannot know
			// which chords this surface has claimed.
			if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
				if (!dir) return;
				e.preventDefault();
				userInputAtRef.current = Date.now();
				jumpComponent(dir as 1 | -1);
				return;
			}
			const action = shellKeyAction(e, e.target as Element | null);
			if (!action) return;
			e.preventDefault();
			userInputAtRef.current = Date.now();
			if (action === 'next') stepWalk(1);
			else if (action === 'prev') stepWalk(-1);
			else if (action === 'first') gotoIndex(0);
			else if (action === 'last') gotoIndex(Number.MAX_SAFE_INTEGER);
		},
		[stepWalk, jumpComponent, gotoIndex],
	);

	/** One-finger horizontal flick → a step, via the kernel's rule. A gesture that ever
	 *  held two fingers is a PINCH and never a swipe (the trap `swipeAction`'s own note
	 *  records), so it is dropped for as long as it lives. */
	const touchRef = React.useRef<{ x: number; y: number; multi: boolean; driveWas: number } | null>(null);
	const onDeckTouchStart = React.useCallback((e: TouchEvent) => {
		if (viewRef.current !== 'read') return;
		if (e.touches.length > 1) {
			if (touchRef.current) touchRef.current.multi = true;
			return;
		}
		const t = e.touches[0];
		// `driveWas` is the drive clock BEFORE this gesture, kept so `touchend` can put it back
		// if the gesture turns out to have been a step. See `onDeckTouchEnd`.
		if (t) touchRef.current = { x: t.clientX, y: t.clientY, multi: false, driveWas: driveAtRef.current };
	}, []);
	/** A wheel or a finger actually moving the deck. Separate from the swipe rule above: a
	 *  drag that never clears the swipe threshold is still the reader scrolling. */
	const onDeckDrive = React.useCallback(() => {
		const now = Date.now();
		userInputAtRef.current = now;
		// The ONE site that is a drive rather than a step, which is why the split costs one
		// line here and nothing anywhere else.
		driveAtRef.current = now;
	}, []);
	const onDeckTouchEnd = React.useCallback(
		(e: TouchEvent) => {
			const from = touchRef.current;
			if (e.touches.length === 0) touchRef.current = null;
			if (!from || from.multi || viewRef.current !== 'read') return;
			const t = e.changedTouches[0];
			if (!t) return;
			const action = swipeAction({ dx: t.clientX - from.x, dy: t.clientY - from.y });
			// A SWIPE IS A STEP, BUT IT ARRIVES AS A DRIVE. The finger emits `touchmove` all the
			// way across — eight of them for a 160px flick, measured — and each one stamps the
			// drive clock; only `touchend` can know the gesture was horizontal enough to be a
			// step. So by the time we get here the land has already been told the reader moved
			// the deck, and the step/drive split this file documents was false for one of the
			// five inputs it lists — on touch, which is the surface it was written for.
			// Rewinding the clock to what it was before the gesture is the honest correction:
			// the moves belonged to a gesture that turned out to name a slide, so they were
			// never a drive. A gesture that does NOT resolve to a step keeps its stamps, which
			// is right — an unresolved drag is the reader scrolling. Found by an independent
			// checker.
			//
			// NO SYMPTOM WAS DEMONSTRATED FOR THIS ONE, and that is worth saying rather than
			// implying: a touch has to reach the frame, and the frame existing is what closes
			// the cold window where a lost step is observable — 8 cold-window swipes at 6x
			// throttle all landed correctly, with and without this line. What was wrong was the
			// MODEL: three places in the tree, this file included, listed a swipe among the
			// inputs that do not preempt, and it was the one that did. The line is here because
			// a documented rule the code does not follow is the thing that gets reasoned from
			// next time, not because it fixed a bug anyone hit.
			if (action === 'next' || action === 'prev') driveAtRef.current = from.driveWas;
			if (action === 'next') stepWalk(1);
			else if (action === 'prev') stepWalk(-1);
		},
		[stepWalk],
	);

	/**
	 * THE SCROLL, READ BACK. The walk index was write-only: the bar, the caption, the Step
	 * dropdown and `?s=` were set by a step and never corrected, so a reader who scrolled
	 * — the wheel, a trackpad, a finger, the scrollbar — was told they were still on the
	 * slide they had left. Measured at 1440x900 on `?c=kpi`: a wheel to slide 7 left the
	 * bar reading "1 / 13", and the next press of Next then scrolled them BACKWARDS to
	 * slide 2 (#2124). Every one of those readouts now derives from `readingSlideIndex`.
	 */
	/**
	 * THE DECK'S OWN GEOMETRY CHANGED under a settled scroll — and there is no scroll event
	 * to notice it, which is why this needs its own observer rather than another branch of
	 * `onDeckScroll`. The in-iframe fit agent rescales a freshly written deck a few hundred
	 * milliseconds after it is parsed: measured on a 58-slide gallery, sections went from
	 * 2160px tall to 652 with the scroll left at 2180, so a step taken in the meantime had
	 * aimed at slide 2 and landed on slide 4 with the bar still reading "1 / 58" — and
	 * nothing was ever going to correct it, because the document's height did not clamp the
	 * scroll and no event fired (#2124).
	 *
	 * Two cases, and the split is the same one the rest of this loop makes: a programmatic
	 * scroll still in flight was AIMED at the old geometry, so re-aim it; otherwise the
	 * reader chose this position, so keep it and rename it.
	 */
	const onDeckGeometry = React.useCallback(() => {
		const frame = frameRef.current;
		const w = walkRef.current;
		if (!frame || !w || viewRef.current !== 'read' || previewCollapsedRef.current) return;
		if (landScheduledRef.current) return; // the pane resized; that re-land owns the position
		// RE-LAND, never rename, and never scroll straight away. A rescale is not something
		// the reader did — it is the fit agent moving the deck underneath them — so the right
		// response is to put them back on the slide the index already names. Two weaker
		// versions were measured and both moved the reader a slide: RENAMING reads a frame
		// caught mid-refit and reports whatever happens to sit under the old offset, and
		// scrolling IMMEDIATELY aims at geometry the fit agent has not finished settling and
		// records that transient as the geometry the observer may read back from.
		// `landWalk` already waits for two stable frames and verifies the result, which is
		// exactly what this needs; it is idempotent and epoch-guarded, so a burst of resize
		// ticks collapses into one landing.
		landWalkRef.current();
	}, []);

	/**
	 * THE reconcile. Sets the walk index to whatever the frame is actually showing — and it
	 * is the ONE place that re-reads the index from the frame, which is why the geometry
	 * check lives here rather than at each caller.
	 *
	 * Every caller can fire at a moment the deck has been rescaled but not yet re-landed: the
	 * guard's expiry timer most of all, since it is armed on a delay and knows nothing about
	 * what happened in between. Measured on two resizes 500ms apart, the timer from the first
	 * fired during the second and logged `reconcile 3->2` — reading the first resize's correct
	 * scroll offset against the second's already-rescaled bands.
	 */
	const reconcile = React.useCallback(() => {
		const frame = frameRef.current;
		const w = walkRef.current;
		const win = frame?.contentWindow;
		if (!frame || !w || !win || viewRef.current !== 'read') return;
		const bands = frameBands(frame);
		// A FRAME WITH NO SLIDES CARRIES NO POSITION, and reading one out of it is fabricating
		// one. `readingSlideIndex` returns 0 for an empty deck by contract, so a caller that
		// does not check writes the title slide over whatever the reader asked for — and the
		// `bandSig` guard below does NOT catch it, because `bandSig([])` is `''` and that is
		// also `bandSigRef`'s initial value, so an empty frame matches on a cold load.
		//
		// This is the hole the cold-load lost step actually came through, and splitting the
		// preemption clock only closed one route into it. The other route is still open
		// without this line: press Next before the deck exists (nothing to scroll to, so
		// `scrollWalk` arms no guard), then nudge the wheel — the drive preempts the land, the
		// land reconciles, and the step is gone. Measured on the shipped build at 6x CPU
		// throttle, 7 runs in 8: the bar back at `1 / 13` with the deck re-landed on slide 1
		// at scrollY 20. An empty frame is the one state where the honest answer is to leave
		// the index alone and let the next land place it.
		if (!bands.length) return;
		// Not the geometry this index was placed against — a re-land is what this needs, and
		// `onDeckGeometry` has already asked for one.
		if (bandSig(bands) !== bandSigRef.current) return;
		const idx = readingSlideIndex(bands, win.scrollY, win.innerHeight, w.index);
		if (idx === w.index) return;
		const moved: Walk = { ...w, index: idx };
		setWalk(moved);
		walkRef.current = moved;
	}, []);
	reconcileRef.current = reconcile;
	React.useEffect(
		() => () => {
			if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
		},
		[],
	);

	const scrollRafRef = React.useRef<number | null>(null);
	const onDeckScroll = React.useCallback(() => {
		if (scrollRafRef.current != null) return; // one read per frame
		scrollRafRef.current = requestAnimationFrame(() => {
			scrollRafRef.current = null;
			const frame = frameRef.current;
			const w = walkRef.current;
			if (!frame || !w || viewRef.current !== 'read' || !observeReadyRef.current) return;
			if (previewCollapsedRef.current) return;
			const win = frame.contentWindow;
			if (!win) return;
			// `w.index` is passed so the rule can KEEP it while its slide is still on screen —
			// see the hysteresis clause. Without it the counter fights the stepper wherever the
			// pane shows more than one slide, which on a phone is everywhere.
			const bands = frameBands(frame);
			// An empty frame carries no position — the same refusal `reconcile` makes, for the
			// same reason: `bandSig([])` is `''`, which matches the initial `bandSigRef`.
			if (!bands.length) return;
			// THE DECK RESCALED UNDER THIS SCROLL — see `bandSigRef`. Not the reader's doing,
			// so not the reader's position; `onDeckGeometry` re-aims and re-records.
			if (bandSig(bands) !== bandSigRef.current) return;
			const idx = readingSlideIndex(bands, win.scrollY, win.innerHeight, w.index);
			// Defer to a programmatic scroll still in flight — a smooth `scrollTo` crosses
			// every slide between here and there — but let it end the moment it ARRIVES,
			// so a reader who scrolls straight out of a step is not ignored for a second.
			const pending = walkScrollRef.current;
			if (pending) {
				// EXPIRY IS CHECKED FIRST, and on the clock rather than on the next event.
				// Releasing it only when a LATER scroll arrives strands a single jumping
				// scroll that lands inside the window and is never followed by another — an
				// in-frame `scrollIntoView`, a fragment jump, a scrollbar drag past the
				// target. Measured: a step to slide 2 followed 80ms later by one jump to
				// slide 10 left the bar reading "2 / 13" with slide 10 filling the pane.
				// Found by an independent checker.
				if (Date.now() >= pending.until) walkScrollRef.current = null;
			}
			if (walkScrollRef.current) {
				const p2 = walkScrollRef.current;
				// THE READER OUTRANKS THE GUARD — on ANY input, which is broader than the rule
				// for the lander (a drive only, see `driveAtRef`). The two differ because they
				// ask different questions: the lander asks "should I still place you", where a
				// step is an instruction to place rather than a reason to stop; the guard asks
				// "is this scroll event mine or yours", where a step means the guard's own
				// scroll is the stale one. A wheel or
				// a drag after this guard was armed means the scroll being reported is theirs,
				// not the tail of ours — and dropping it strands the index for good, because no
				// further scroll event is coming to correct it. Measured under parallel load:
				// a wheel landing inside the 400ms window held the bar at "1 / 13" with the
				// deck five slides away, deterministically on a slow box and never in
				// isolation, which is the shape of race a fuzz walk finds and a demo does not.
				if (userInputAtRef.current > p2.armedAt) walkScrollRef.current = null;
				else if (idx === p2.index) walkScrollRef.current = null;
				else return; // still traveling; the expiry above is the only other way out
			}
			if (idx === w.index) return;
			const moved: Walk = { ...w, index: idx };
			setWalk(moved);
			walkRef.current = moved;
		});
	}, []);
	React.useEffect(
		() => () => {
			if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
		},
		[],
	);

	/**
	 * Bind all of the above to the CURRENT frame document, and rebind when a full srcdoc
	 * write replaces it. Called from `onFrameLoad` and after every render, and keyed on the
	 * DOCUMENT's identity rather than a flag — a patch render keeps the same document and
	 * must not re-add a second copy of every listener.
	 */
	const bindDeckInput = React.useCallback(() => {
		const frame = frameRef.current;
		let doc: Document | null = null;
		try {
			doc = frame?.contentDocument ?? null;
		} catch {
			return; // mid-navigation
		}
		const win = doc?.defaultView;
		if (!doc || !win || boundFrameDocRef.current === doc) return;
		boundFrameDocRef.current = doc;
		win.addEventListener('scroll', onDeckScroll, { passive: true });
		win.addEventListener('wheel', onDeckDrive, { passive: true });
		// The frame's OWN ResizeObserver, on the filmstrip the fit agent rescales. Created
		// from the frame's window so it belongs to that document and dies with it — there is
		// nothing to disconnect on rebind, which is the same reason none of the listeners
		// above are torn down here.
		const lattice = doc.querySelector('.lattice');
		const RO = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
		if (lattice && RO) new RO(() => onDeckGeometry()).observe(lattice);
		doc.addEventListener('keydown', onDeckKey as EventListener);
		doc.addEventListener('touchstart', onDeckTouchStart as EventListener, { passive: true });
		doc.addEventListener('touchmove', onDeckDrive, { passive: true });
		doc.addEventListener('touchend', onDeckTouchEnd as EventListener, { passive: true });
		// No teardown: the listeners die with the document they are on. The parent-side
		// copies below are the ones with a lifetime worth managing.
	}, [onDeckScroll, onDeckKey, onDeckTouchStart, onDeckTouchEnd, onDeckDrive, onDeckGeometry]);
	bindDeckInputRef.current = bindDeckInput;

	// The parent-side half of the same three verbs: a reader who has not touched the deck
	// still has focus on <body>, and a swipe that starts on the letterbox around the slide
	// never reaches the frame at all.
	React.useEffect(() => {
		const wrap = frameRef.current?.parentElement;
		window.addEventListener('keydown', onDeckKey);
		wrap?.addEventListener('wheel', onDeckDrive, { passive: true });
		wrap?.addEventListener('touchstart', onDeckTouchStart, { passive: true });
		wrap?.addEventListener('touchmove', onDeckDrive, { passive: true });
		wrap?.addEventListener('touchend', onDeckTouchEnd, { passive: true });
		return () => {
			window.removeEventListener('keydown', onDeckKey);
			wrap?.removeEventListener('wheel', onDeckDrive);
			wrap?.removeEventListener('touchstart', onDeckTouchStart);
			wrap?.removeEventListener('touchmove', onDeckDrive);
			wrap?.removeEventListener('touchend', onDeckTouchEnd);
		};
	}, [onDeckKey, onDeckTouchStart, onDeckTouchEnd, onDeckDrive]);

	// A pane that changed SIZE has re-scaled the deck under a scroll position measured
	// against the old geometry, so the reader silently drifts off their slide — measured
	// at 1440→900px mid-walk: the bar still said 3/8 with slide 4 on screen (#2124). One
	// observer covers the window, the split drag, a collapse and an orientation change.
	React.useEffect(() => {
		const wrap = frameRef.current?.parentElement;
		if (!wrap || typeof ResizeObserver === 'undefined') return;
		let t: ReturnType<typeof setTimeout> | null = null;
		const ro = new ResizeObserver(() => {
			// Claimed SYNCHRONOUSLY, before the debounce: the frame's own rescale lands inside
			// that window, and `onDeckGeometry` must already know a re-land is coming.
			landScheduledRef.current = true;
			if (t) clearTimeout(t);
			t = setTimeout(() => {
				t = null;
				landScheduledRef.current = false;
				if (viewRef.current !== 'read' || previewCollapsedRef.current) return;
				frameRef.current?.contentWindow?.__latticeFit?.();
				landWalkRef.current();
			}, SCROLL_IDLE_MS);
		});
		ro.observe(wrap);
		return () => {
			if (t) clearTimeout(t);
			landScheduledRef.current = false;
			ro.disconnect();
		};
	}, []);

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
		// can't race the fresh srcdoc write on a gallery/pick load. (The Drawing Board's
		// pane machine did the same — set data-pane THEN render — before it was removed.)
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
		userInputAtRef.current = Date.now();
		const at = resolvePlanStep(w.plan, key);
		const moved: Walk = { ...w, index: at.index };
		setWalk(moved);
		walkRef.current = moved;
		scrollWalkRef.current(true);
	}, []);

	// <main>, not <div>: this island IS the page body under the site header, so without
	// it the Playground shipped with no main landmark at all and the toolbar rows sat in
	// no landmark either (axe: landmark-one-main + region x2). `contents` stays — the
	// element must not introduce a box; a landmark role IS exposed on a display:contents
	// element, and the site axe gate is what holds that true rather than this comment.
	return (
		<main className="lx-ui contents">
			{/* The page's one H1, visually hidden — the visible label is the branded site
			    header, which is chrome, not a heading. */}
			<h1 className="sr-only">Lattice playground</h1>
			{/* Chart detail reveal — the shared parent-hosted layer + its popover (PREVIEW mode:
			    reveal whichever chart is under the pointer as the author edits). */}
			<ChartDetailLayer ref={chartDetailRef} getFrame={() => frameRef.current} getStage={() => frameRef.current?.parentElement ?? null} hoverAny />
			{/* Toolbar — one row: mode toggle · component · step · setup · galleries. */}
			<div className="pg-bar">
				{/* Explore / Edit — a compact two-icon toggle (◱ view the deck · ✎ edit
				    its markdown). Explore renders the deck; Edit opens the current slide's
				    source in the editor (2026-07-06 simplification). */}
				{exploreAvailable && (
					<div className="pg-mode" role="tablist" aria-label="Playground mode">
						{/* data-pg-mode is the stable hook the PRE-PAINT seed styles through
						    (playground.css): until the island hydrates, `view` is this component's
						    default and not the boot resolution, so the SSR markup marks Edit active
						    even on an Explore boot. The seed knows better and the stylesheet paints
						    from it; the class below takes over the moment the seed is dropped. */}
						<button
							type="button"
							role="tab"
							data-pg-mode="read"
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
							data-pg-mode="edit"
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
							pending={!hydrated}
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
						{/* The value is shown only where it MEANS something. In Edit this control is
						    disabled — there is nothing to jump — yet it used to fill in with the
						    warmed walk's first step a second and a half after load, so a dead
						    dropdown quietly changed from "—" to "Title" while the visitor watched
						    (#1563). Empty means "no step selected", which is the truth here. */}
						<Select value={view === 'read' ? stepValue : ''} onValueChange={onWalkChip} disabled={view !== 'read' || walkChips.length === 0}>
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

			{/* The Walk bar — Explore's stepping (Prev · N / M · Next + caption). ALWAYS
			    mounted, including on the server and before any plan has been fetched (#1588):
			    in Explore it is chrome, not walk state, and mounting it with the walk meant a
			    ~100px band arriving a second after the deck and shoving it up mid-read. Its
			    height cannot vary (see WalkBar + playground.css), so the pane it shares the
			    column with has one geometry for the whole load. CSS hides it in Edit — where the
			    tour's reveal hook still needs it findable. Stepping jumps; the step dropdown
			    above jumps directly. Edit-this-slide and the transcript are gone — flip to Edit. */}
			<WalkBar
				index={walk?.index ?? 0}
				count={walkCount}
				caption={walkSlide?.caption || ''}
				onPrev={() => stepWalk(-1)}
				onNext={() => stepWalk(1)}
				nextLabel={walkNextComp ? `Next component: ${walkNextComp} →` : null}
				prevDisabled={!walk || (walk.index === 0 && !walkPrevComp)}
				nextDisabled={!walk || (walkAtEnd && !walkNextComp)}
				notice={walkNotice}
			/>

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

			{/* Editor | preview split — react-resizable-panels Group (2026-07-19). Two
			    collapsible Panels + one Separator; each pane collapses to a labeled
			    rail (collapsedSize = RAIL_W) rendered INSIDE the collapsed pane, the
			    pane's real content kept mounted + inert so CodeMirror history and the
			    preview iframe survive the 0-width interlude. Disabled below the tab
			    breakpoint (the same 820px string as the mobile CSS) — there the
			    body[data-pane] tabs own layout. */}
			<ResizablePanelGroup
				id="pg-split"
				className="pg-split"
				orientation="horizontal"
				disabled={!splitActive}
				{...split.groupProps}
				data-split-collapsed={splitActive && split.collapsed ? split.collapsed : undefined}
				data-split-dragging={split.dragging ? '' : undefined}
			>
				<ResizablePanel
					id={PG_SPLIT_PANEL_IDS[0]}
					className="pg-pane editor"
					panelRef={split.editorRef}
					minSize={PG_SPLIT_MIN.editor}
					defaultSize="45"
					collapsible={split.ready}
					collapsedSize={RAIL_W}
					onResize={split.onEditorResize}
				>
					<section id="pg-pane-editor" className="pg-pane-inner" inert={splitActive && split.collapsed === 'a' ? true : undefined}>
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
					<button
						type="button"
						data-slot="split-rail"
						data-side="a"
						className="pg-rail"
						aria-label="Expand editor"
						aria-expanded={splitActive && split.collapsed === 'a' ? false : undefined}
						title="Expand editor"
						onClick={() => split.expand('a')}
					>
						<ChevronRight aria-hidden="true" className="pg-rail-chevron" />
						<span className="pg-rail-label">Markdown</span>
					</button>
				</ResizablePanel>
				<ResizableHandle aria-label="Resize editor and preview" />
				<ResizablePanel
					id={PG_SPLIT_PANEL_IDS[1]}
					className="pg-pane preview"
					panelRef={split.previewRef}
					minSize={PG_SPLIT_MIN.preview}
					defaultSize="55"
					collapsible={split.ready}
					collapsedSize={RAIL_W}
					onResize={split.onPreviewResize}
				>
					<section id="pg-pane-preview" className="pg-pane-inner" inert={splitActive && split.collapsed === 'b' ? true : undefined}>
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
					<button
						type="button"
						data-slot="split-rail"
						data-side="b"
						className="pg-rail"
						aria-label="Expand preview"
						aria-expanded={splitActive && split.collapsed === 'b' ? false : undefined}
						title="Expand preview"
						onClick={() => split.expand('b')}
					>
						<ChevronLeft aria-hidden="true" className="pg-rail-chevron" />
						<span className="pg-rail-label">Rendered slides</span>
						{/* Never edit blind: a render failure while collapsed lights the rail. */}
						{isError && <span aria-hidden="true" className="pg-rail-error-dot" />}
					</button>
				</ResizablePanel>
			</ResizablePanelGroup>
		</main>
	);
}

export default PlaygroundApp;
