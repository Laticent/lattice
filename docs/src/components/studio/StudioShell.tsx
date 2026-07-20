import {
	AlertTriangle, ArrowLeftToLine, ArrowRightToLine, BookMarked, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FileBox, FileSliders, FileText, Gauge, History, Layers, ListChecks, MessageSquareHeart, Monitor, MonitorPlay, Moon, MoreHorizontal, Palette, PanelLeftClose, PanelRightClose, PencilLine, PencilRuler, Play, Plus, Printer, Save, Search, Settings2, Share2, SlidersHorizontal, Sparkles, Sun, SunMoon, Trash2, Upload, Volume2, Wand2, X,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import DeckPreview from '@/components/DeckPreview';
import { FeedbackSheet } from '@/components/site/FeedbackSheet';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
	DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { PillTabs } from '@/components/ui/pill-tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { Tip, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type SplitSide, useResizableSplit } from '@/components/ui/use-resizable-split';
import { pinnedMode, resolveDeckTheme } from '@/lib/deck-theme';
import { applyTag, catalogFromComponents, type LensDef, type LensRegistry, lensIndices, parseLensRegistry, taggedLensIds, upsertLensRegistry } from '@/lib/lente';
import { acronymEntries, lexiconMap } from '@/lib/resolve-captions';
import { type SingleSlideOptions, suspendScaleObservers } from '@/lib/single-slide-render';
import { toggleMode as toggleDocMode } from '@/lib/site-chrome';
import { cn } from '@/lib/utils';
import { sliceSlide } from '@/playground/architect-edits.js';
import { captureFromFrame, saveSnapshot } from '@/playground/snapshot-cache.js';
import { AcronymEditor } from './AcronymEditor';
import { ArchitectChat } from './ArchitectChat';
import { applyDeckEdit, estimateUsd, type Finding, REFINE_ACTIONS, type RefineActionId, refineSelection, requestFindingFix, resumePendingAuth, useArchitectStatus } from './architect';
import { AUTO_LABEL, AutoIcon } from './auto-mark';
import { CatalogSelect, catalogOptions } from './CatalogSelect';
import { CommandPalette } from './CommandPalette';
import { ComposeView } from './ComposeView';
import { assessDeck, type CoachAssessment, type CoachCard, type DeckScorecard, pacing, rankFindings, structureCheck, theAsk, topFixes, weakestSlide } from './coach/coach-core';
import { FindingCard, type FindingFixState } from './coach/FindingCard';
import { listStudioComponents, type StudioComponent } from './component-library';
import { addSlideAfter, deleteSlide, duplicateSlide, moveSlide, replaceSlide } from './deck-ops';
import { DECKS, deckSource, type StudioDeck } from './decks';
import type { EditorHandle } from './Editor';
import { activeEyebrow, EYEBROWS } from './eyebrow-catalog';
import { finishSelectGroups, finishSwatchFor, type SavedFinishMenuEntry } from './FinishPicker';
import { activeFinish } from './finish-catalog';
import { generateSwatch as finishSwatch, generateFinishCss, mergeFinishOverride } from './finish-generate';
import { deleteStudioFinish, listStudioFinishes, type StudioFinish } from './finish-library';
import { type AcronymEntry, frontMatterBlock, getFrontMatter, innerFrontMatter, mergeClassTokens, parseFinishOverride, removeClassTokens, setFrontMatter, setFrontMatterAcronyms, setFrontMatterBlock, stripFrontMatter } from './front-matter';
import { IntentTag } from './IntentTag';
import { LANG_AUTO, LanguageSelect } from './LanguageSelect';
import { LatticeMark } from './LatticeMark';
import { LensesPanel, type TagChange } from './LensesPanel';
import { LexiconEditor } from './LexiconEditor';
import { Library } from './Library';
import { LENSES, LensPicker, lensEntriesFrom } from './lens-picker';
import { type PresentLens, presentationSet, slideClass, slideTitle, splitSlides, unknownComponents, usedComponents } from './lint';
import { activeMode, MODES } from './mode-catalog';
import { PresentOverlay } from './PresentOverlay';
import { ReshapePicker } from './ReshapePicker';
import { activeRule, RULES } from './rule-catalog';
import { ShareSheet } from './ShareSheet';
import { SlideContextBody } from './SlideContext';
import { type ComponentEntry, SlidePicker } from './SlidePicker';
import { importComments } from './slide-comments';
import { getClassTokens } from './slide-directives';
import { hasMermaid } from './slide-thumb';
import { applyVariant } from './slide-variants';
import { activeSpectrumCard, SPECTRUM_CARDS } from './spectrum-card-catalog';
import { activeSpectrumCardEdge, SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';
import { activeSpectrum, SPECTRA } from './spectrum-catalog';
import { activeSpectrumEdge, SPECTRUM_EDGES } from './spectrum-edge-catalog';
import { activeSpectrumTrim, SPECTRUM_TRIMS } from './spectrum-trim-catalog';
import { deckOutputLang, languageLabel, resolveSupported } from './studio-language';
import { type Checkpoint, createDeck, DECKS_CLEARED_EVENT, deleteDeck as deleteDeckStore, FLUSH_EVENT, hasStoredPosture, loadBootDeck, loadBootSlide, loadCheckpoints, loadDeckList, loadSettings, loadSource, markBackupNudged, metaFor, type Posture, renameDeck as renameDeckStore, SETTINGS_EVENT, saveActiveDeck, saveCheckpoint, saveSettings, saveSource, shouldNudgeBackup, titleFromSource } from './studio-store';
import { BUILTIN_PALETTES, ThemeMenuItems, themeSelectGroups } from './ThemePicker';
import { deleteStudioTheme, listStudioThemes, type StudioTheme } from './theme-library';
import { TOURS } from './tours';
import { useBreakpoint, useLandscapePhone } from './use-breakpoint';
import { useSharedPreviewSlot } from './use-shared-preview-slot';
import { useStudioDemo } from './use-studio-demo';
import { WorkspaceSheet } from './WorkspaceSheet';
import { isEvictionProneBrowser } from './workspace-backup';
import { workspaceLensConfig } from './workspace-lenses';

// The Fabricate studio (theme / component / finish fabrication) is a large,
// self-contained subtree — FinishStudio, LayoutStudio, CodeField, the manifest
// completion, and its own big lucide-icon set — reached only via the
// `view === 'fabricate'` tab. Code-split it so its ~chunk stays out of the
// initial Studio island payload (the heaviest thing a mobile user waits on) and
// loads on first open. It's already mount-on-view, so this is a drop-in.
const Fabricate = React.lazy(() => import('./Fabricate').then((m) => ({ default: m.Fabricate })));

// Editor (CodeMirror) is the single largest passenger on the cold hydration path —
// ~196KB gz that, statically imported, bundled into the client:only StudioShell island
// and blocked hydration. Lazy-load it: the island now hydrates that much lighter and the
// preview paints (dismissing the SSG instant-shell, which keys on the PREVIEW's first
// render, not the editor) WITHOUT waiting on CodeMirror parse. The editor is the DEFAULT
// pane ('markdown' source mode), so its chunk is fetched right after load — but off the
// critical path, streaming in behind the Suspense fallback (measured: requested ~230ms
// after the load event, vs blocking it before). A React.lazy over a forwardRef component
// still forwards `ref` (React 19), so `editorRef` reaches its useImperativeHandle; the
// module is cached after first load, so toggling markdown⟷compose never re-suspends.
// Mirrors the Fabricate lazy split above. See
// engineering/decisions/2026-07-19-defer-editor-hydration.md.
const Editor = React.lazy(() => import('./Editor').then((m) => ({ default: m.Editor })));

// Editor-shaped placeholder shown while the lazy CodeMirror chunk streams in. The SSG
// instant-shell dismisses on the PREVIEW's first render (decoupled from the editor), so
// on cold load the shell can lift while this pane is still resolving — a bare "Loading…"
// box would reveal a half-built app. A gutter + faint code lines read as "an editor,
// arriving" instead, so the handoff stays seamless. Fixed widths (no Math.random) keep it
// deterministic; the real text is sr-only for assistive tech.
const EDITOR_SKELETON_LINES = [82, 63, 71, 44, 78, 57, 88, 38, 67, 74, 51, 80, 60, 46];
function EditorSkeleton() {
	return (
		<div className="flex flex-1 gap-3 overflow-hidden p-3 font-mono text-[13px] leading-[1.5]" aria-hidden="true">
			<div className="flex select-none flex-col items-end gap-[7px] pr-3 text-muted-foreground/25">
				{EDITOR_SKELETON_LINES.map((w, i) => (
					<span key={w}>{i + 1}</span>
				))}
			</div>
			<div className="flex flex-1 flex-col gap-[7px] pt-[3px]">
				{EDITOR_SKELETON_LINES.map((w) => (
					<div key={w} className="h-[9px] rounded-sm bg-muted-foreground/10" style={{ width: `${w}%` }} />
				))}
			</div>
			<span className="sr-only">Loading the editor…</span>
		</div>
	);
}

// Deck Inspector pill-tab sections, ordered by likely reach (Look first). The two
// read-aloud groups collapse into "Speech"; the spectrum/accent family is "Accent"
// (renamed from "Brand" — a broader, clearer name for everything the accent touches,
// incl. the heading marks). Preview-only dev aids are NOT a tab — they live in a
// Developer footer disclosure (A.1) so the strip is four narrow, one-row pills.
type DeckTab = 'look' | 'brand' | 'marks' | 'speech';
const DECK_TABS: { value: DeckTab; label: string }[] = [
	{ value: 'look', label: 'Look' },
	{ value: 'brand', label: 'Accent' },
	{ value: 'marks', label: 'Marks' },
	{ value: 'speech', label: 'Speech' },
];

// Offline FALLBACK known-components — used only when the real catalog (the
// `components` prop, the full 53-component manifest) fails to load. The live known
// set is derived from that catalog (see `catalogNames` below); a hardcoded subset
// here would false-flag every component it omits on a perfectly valid deck.
// Module-level so the reference is stable — the Editor re-inits CodeMirror when
// its `knownComponents` identity changes, so this must never be an inline literal.
const KNOWN = ['title', 'kpi', 'quote', 'cards-grid', 'agenda', 'big-number', 'stats', 'statement', 'closing', 'q-and-a', 'pricing'];
// Stable empty reference — passed to the editor when inline validation is OFF so
// its linter stands down (an empty known-set flags nothing) without re-creating
// the array each render (which would needlessly rebuild CodeMirror).
const NO_KNOWN: string[] = [];

// The demo's starter deck title — a real, persisted deck deduped on each run and left
// behind for the newcomer (see createDemoFirstDeck).
const DEMO_FIRST_DECK_TITLE = 'My First Deck';
// Slide sizes the engine themes define (@size tokens). `size:` front-matter picks one.
const SIZES = [
	{ value: '16:9', label: 'Widescreen 16 : 9' },
	{ value: '4k', label: '4K (16 : 9)' },
	{ value: 'standard', label: 'Standard 4 : 3' },
	{ value: 'square', label: 'Square 1 : 1' },
	{ value: 'portrait', label: 'Portrait 4 : 5' },
	{ value: 'story', label: 'Story 9 : 16' },
];
const SIZE_LABELS: Record<string, string> = Object.fromEntries(SIZES.map((s) => [s.value, s.label.replace(/ \(.*\)/, '')]));
// Aspect ratio (w:h) per engine `@size` token, so the preview CARD matches the
// deck's real shape — not a hardcoded 16:9. Covers the @size table in lib/_theme.css
// (incl. aliases); an unknown size falls back to 16:9.
const SIZE_RATIO: Record<string, [number, number]> = {
	'16:9': [16, 9], hd: [16, 9], '4k': [16, 9], '4K': [16, 9],
	standard: [4, 3], '4:3': [4, 3],
	square: [1, 1], '1:1': [1, 1],
	portrait: [4, 5], '4:5': [4, 5],
	story: [9, 16], '9:16': [9, 16], reel: [9, 16],
	mobile: [1080, 2340],
};
function sizeRatio(size: string): [number, number] {
	return SIZE_RATIO[size] ?? SIZE_RATIO[(size || '').toLowerCase()] ?? [16, 9];
}
const ratioText = ([w, h]: [number, number]): string => (w === 1080 ? '9 : 19.5' : `${w} : ${h}`);
// Relative time for the version-history list (just now / Nm / Nh / Nd).
function timeAgo(ts: number): string {
	const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}
// ── Docked-panel size constants (activity-bar model, 2026-07-06 + the 2026-07-19
// react-resizable-panels migration) ─────────────────────────────────────────
// The desktop chrome is: [ bar ][ Settings ][ Assistant ][ editor ][ preview ].
// The bar is a fixed flex rail OUTSIDE the resizable group; Settings + Assistant
// are ResizablePanels that dock left, editor + preview are the collapsible pair.
// The library enforces each panel's px min itself, so the old narrow-fold budget
// math (BAR_W/HANDLE_W/PAIR_MIN/FOLD_SAFETY/panelBudget → the #721 zero-void
// invariant) is retired — v4's pixel min/max express the same constraint directly.
const ARCH_MIN = 200; // Assistant (Coach/Chat/Lenses) min width — cards stay legible
const ARCH_DEFAULT = 232; // Assistant default (matches the old fixed column)
const SET_MIN = 260; // Settings min width (the inspector fields stay usable)
const SET_DEFAULT = 296; // Settings default (matches the old inspector column)
const PANEL_MAX = 420; // drag ceiling for a docked panel
const LIB_MIN = 200; // Library min when it holds the assistant slot
const LIB_DEFAULT = 380; // Library docked default — wider than the coach; asset cards need room

// Theme constants + the grouped picker live in ThemePicker.tsx (every shipped
// theme, incl. the AA color-blind-safe set). BUILTIN_PALETTES = anything we can
// drive through `data-palette`.

// biome-ignore lint/suspicious/noExplicitAny: serialized lint vocabulary from the page.
type Props = { options: SingleSlideOptions; components?: ComponentEntry[]; lintVocab?: any; slideHeadings?: Record<string, ('h1' | 'h2')[]> };

export default function StudioShell({ options, components = [], lintVocab, slideHeadings }: Props) {
	// Persisted deck list (seeded from the built-ins), the active deck, and its
	// source — restored from localStorage so edits survive a switch AND a reload.
	const [decks, setDecks] = React.useState<StudioDeck[]>(() => loadDeckList());
	// Boot the deck (and slide) you LAST left off on — not always deck #1. loadBootDeck
	// mirrors studio.astro's inline bootId (last-active id → index[0] → DECKS[0]) so the
	// pre-paint instant-shell and this hydrated app agree on which deck leads; otherwise
	// a returning user who left from a non-first deck falls through to a blank cold boot
	// (the snapshot's deckId never matches). engineering/decisions/2026-07-11-preview-
	// performance-diagnosis.md § A (returning-visitor shell).
	const [deck, setDeck] = React.useState<StudioDeck>(() => loadBootDeck());
	const [source, setSource] = React.useState(() => {
		const first = loadBootDeck();
		return loadSource(first.id) ?? deckSource(first);
	});
	// Always-current mirror of `source`, so a settings write can snapshot the exact
	// pre-change text for one-click Undo without threading it through every setter.
	const sourceRef = React.useRef(source);
	sourceRef.current = source;
	const [activeSlide, setActiveSlide] = React.useState(() => loadBootSlide()); // 0-based index into the VIEWED set; boot at the slide you left on (clamped below)
	// Live mirrors of the active deck id + slide index, so the leave-capture (a stable
	// callback that must NOT re-subscribe its pagehide listener per deck/slide change)
	// can stamp WHICH deck/slide it snapshotted without taking them as deps.
	const captureDeckRef = React.useRef('');
	captureDeckRef.current = deck.id;
	const activeSlideRef = React.useRef(0);
	activeSlideRef.current = activeSlide;
	const [composeLens, setComposeLens] = React.useState<PresentLens>('full'); // reader lens for the preview
	// Persona posture — the always-visible, reversible density stop that replaced the
	// one-way `onboarded` ratchet + welcome banner (2026-07-17-studio-persona-dial.md).
	// Persisted, and written ONLY by an explicit dial move (never by engagement), so a
	// user boots where they left off and the surface never drifts. `'write'` is the
	// calm editor|preview surface (the old Focus body, promoted to a home); `'build'`
	// is the full desktop. `'read'` is the full-bleed newcomer home (a beautiful deck
	// + one "Edit this slide" button); it renders inside the SAME spine with the editor
	// track at 0px but MOUNTED, so a newcomer's first edit (Read→Write) never remounts.
	const [posture, setPostureState] = React.useState<Posture>(() => loadSettings().posture);
	const postureRef = React.useRef(posture);
	postureRef.current = posture;
	const setPosture = React.useCallback((p: Posture) => { setPostureState(p); saveSettings({ posture: p }); }, []);
	// Persist a fresh visitor's DERIVED boot stop exactly once (R1). Without this, a
	// first-session action that trips hasPriorStudioUse() (creating a deck) would
	// silently re-derive Read→Write next boot — the ratchet, relocated. Posture then
	// only ever moves by an explicit dial interaction, as promised.
	React.useEffect(() => {
		if (!hasStoredPosture()) saveSettings({ posture: postureRef.current });
	}, []);
	// The one-time Read orientation hint ("this deck is yours → Edit this slide"),
	// shown until the newcomer edits or dismisses it. Content on the button, not a banner.
	const [readHintSeen, setReadHintSeenState] = React.useState(() => loadSettings().readHintSeen);
	const dismissReadHint = React.useCallback(() => { setReadHintSeenState(true); saveSettings({ readHintSeen: true }); }, []);
	// `quietened` — the transient "quiet the noise" overlay (heir to the old Focus
	// toggle, 2026-06-30-studio-focus-mode.md). Shows the calm Write surface for the
	// session WITHOUT touching the saved `posture`; ⌘. toggles it, Esc clears it, and
	// moving the dial clears it. The actually-rendered stop is `effectiveStop`.
	const [quietened, setQuietened] = React.useState(false);
	const quietenedRef = React.useRef(quietened);
	quietenedRef.current = quietened;
	// `revealBuild` — the transient step-UP, symmetric to `quietened`'s step-down. A
	// Build-only faculty summoned from Read/Write (Reshape today; the Inspector when
	// it's wired) docks its panel by transiently raising the rendered stop to 'build'
	// WITHOUT writing the saved `posture` — so reaching a Build tool never persists
	// Build (the decision doc's "reachability ≠ arrangement" rule). It recedes when the
	// summoned panels all close, on Esc, on a dial move, and suspend/restores across
	// Fabricate — exactly like `quietened`. The two are opposite directions, so arming
	// one clears the other; hence revealBuild wins the `effectiveStop` precedence.
	const [revealBuild, setRevealBuild] = React.useState(false);
	const revealBuildRef = React.useRef(revealBuild);
	revealBuildRef.current = revealBuild;
	const effectiveStop: Posture = revealBuild ? 'build' : quietened ? 'write' : posture;
	// Move the dial: clear any transient quiet and persist the stop. Panel open/close is
	// ORTHOGONAL to posture (T2 §4.5) — the dial changes the chrome CEILING (Build shows
	// the activity-bar launcher; Write hides the docked columns), never forcing a panel
	// open or shut. Your open/closed panels are preserved across moves — they simply
	// aren't rendered on the calmer Write surface — so a Build↔Write dip never thrashes
	// the coach. (The mount + breakpoint-flip defaults still seed the arrangement.)
	const changePosture = React.useCallback((p: Posture) => {
		setQuietened(false);
		setRevealBuild(false);
		setPosture(p);
	}, [setPosture]);
	// Summon a Build-only faculty (Reshape, Inspector) from a calmer stop: transiently
	// reveal Build so the panel can dock, WITHOUT persisting the saved posture. Clears
	// any quiet (opposite direction). At Build already, it's just the quiet-clear — the
	// reveal is what steps up from Read/Write, and receding it returns you there.
	// CALLER CONTRACT: pair this with a panel-open in the SAME handler (e.g. reshape
	// opens the coach). A bare call self-recedes next commit (harmless, never stuck-on),
	// because the reveal only holds while a summoned panel is docked.
	const revealBuildDock = React.useCallback(() => {
		setQuietened(false);
		if (postureRef.current !== 'build') setRevealBuild(true);
	}, []);
	// Panel state — TWO independent, nullable, per-group slots (the activity-bar
	// model, engineering/decisions/2026-07-06-studio-activity-bar.md). NOT one
	// global `activePanel`: the Architect (Assistants group) and the settings scope
	// (Settings group) are independent, so the coach stays up while you tune.
	// Merging the old inspectorOpen + inspectorScope into ONE nullable enum makes
	// the illegal "open with no scope" state unrepresentable.
	// The left "tool" slot — a MUTUALLY-EXCLUSIVE assistant/tool panel: the Architect
	// (Coach/Chat), the reader-views Lenses, or the Library. One at a time (a toggle
	// group), sharing one grid track — the layout can't fit three docked columns
	// beside editor+preview (#721). Settings/Inspector is a SEPARATE independent slot,
	// so a tool panel + settings can be open together (the coach↔tune loop).
	const [activeAssistant, setActiveAssistant] = React.useState<'coach' | 'chat' | 'lenses' | 'library' | null>(null); // panels start closed at every stop; Build shows the activity-bar launcher, panels open on demand (T2 §4.5 orthogonality — posture never force-opens a panel)
	const [activeSettings, setActiveSettings] = React.useState<'slide' | 'deck' | null>(null); // PM-4: preview is sacred
	// Derived reads — the many aria-pressed / active-color / grid-track sites keep
	// their old names as pure reads off the two enums (no behavior change).
	// Coach and Chat are SEPARATE panels (own toolbar icon, own drawer) — they have
	// nothing to do with each other, so no shared tab. They share the ONE assistant
	// slot (mutually exclusive), so `architectOpen` = "an AI panel holds the slot"
	// still drives every layout/width/effect read unchanged.
	const coachOpen = activeAssistant === 'coach';
	const chatOpen = activeAssistant === 'chat';
	const architectOpen = coachOpen || chatOpen;
	const lensesOpen = activeAssistant === 'lenses';
	const libraryOpen = activeAssistant === 'library';
	const inspectorOpen = activeSettings !== null;
	const inspectorScope: 'slide' | 'deck' = activeSettings ?? 'slide';
	// Whether any Build-only panel is docked — read by the `[view]`-only Fabricate
	// restore (which can't list panel state as a dep) to avoid re-revealing Build with
	// nothing open.
	const panelsOpenRef = React.useRef(false);
	panelsOpenRef.current = architectOpen || lensesOpen || libraryOpen || inspectorOpen;
	// A transient Build reveal recedes once the faculties it was summoned for all
	// close — mirroring `quietened`'s auto-clear. The summon batches revealBuild + the
	// panel-open in one commit, so on the opening render a panel is already open and
	// this never fires prematurely; it clears only after the last docked panel closes.
	// useLayoutEffect (not useEffect): the recede must run BEFORE paint, or closing the
	// coach paints one frame of empty Build chrome (activity bar, no panel) + a 52px
	// layout jump before the passive effect clears it (red-team/checker finding).
	React.useLayoutEffect(() => {
		if (revealBuild && !architectOpen && !lensesOpen && !libraryOpen && !inspectorOpen) setRevealBuild(false);
	}, [revealBuild, architectOpen, lensesOpen, libraryOpen, inspectorOpen]);
	// Compatibility setters — the demo hook's prop interface and a handful of simple
	// call sites still speak the old open/scope API; these adapt it onto the enums.
	// The COMPOUND toggles (the bar's scope icons, the mobile/tablet settings toggle)
	// call setActiveSettings directly to avoid a two-call batch ordering trap.
	// setInspectorScope(s) SELECTS scope s and ensures the panel is open — the only
	// bare-scope caller (the in-panel segment) renders only while open, so this never
	// spuriously opens it.
	// Coach + Chat each own the assistant slot (mutually exclusive with each other +
	// Lenses/Library). Toggling one closes it; it never stomps a sibling it didn't own.
	const setCoachOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveAssistant((prev) => ((typeof v === 'function' ? v(prev === 'coach') : v) ? 'coach' : prev === 'coach' ? null : prev));
	}, []);
	const setChatOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveAssistant((prev) => ((typeof v === 'function' ? v(prev === 'chat') : v) ? 'chat' : prev === 'chat' ? null : prev));
	}, []);
	// Back-compat shims for the demo/walkthrough hook, which speaks the old open/tab
	// API: open defaults to the Coach panel, and the "tab" setter now SELECTS which of
	// the two separate panels is shown. CLOSE clears the assistant slot UNCONDITIONALLY
	// (whatever holds it — Coach/Chat/Lenses/Library): the demo's "clean compose canvas"
	// reset (use-studio-demo.ts) is the only path that clears the slot, so a docked
	// Lenses/Library must be evicted too (matches the pre-split unconditional-null close).
	const setArchitectOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveAssistant((prev) => {
			const was = prev === 'coach' || prev === 'chat';
			return (typeof v === 'function' ? v(was) : v) ? (was ? prev : 'coach') : null;
		});
	}, []);
	const setArchitectTab = React.useCallback((t: 'coach' | 'chat') => setActiveAssistant(t), []);
	// Lenses + Library share the assistant slot (mutually exclusive with the Architect).
	const setLensesOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveAssistant((prev) => ((typeof v === 'function' ? v(prev === 'lenses') : v) ? 'lenses' : null));
	}, []);
	const setLibraryOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveAssistant((prev) => ((typeof v === 'function' ? v(prev === 'library') : v) ? 'library' : null));
	}, []);
	const setInspectorOpen = React.useCallback((v: boolean | ((was: boolean) => boolean)) => {
		setActiveSettings((prev) => ((typeof v === 'function' ? v(prev !== null) : v) ? prev ?? 'slide' : null));
	}, []);
	const setInspectorScope = React.useCallback((s: 'slide' | 'deck') => setActiveSettings(s), []);
	const [historyOpen, setHistoryOpen] = React.useState(false); // Version-history sheet (an action, not a deck setting — lives outside the inspector)
	const [deckMenuOpen, setDeckMenuOpen] = React.useState(false); // deck switcher — controlled so the demo can open it
	const [view, setView] = React.useState<'compose' | 'fabricate'>('compose');
	// The editor pane's editing MODE: the markdown source (CodeMirror) or the rich
	// Compose surface (Option B continuous note). Both read/write the same `source`,
	// so flipping never loses work and the preview tracks either. (2026-07-17 Compose.)
	const [editMode, setEditMode] = React.useState<'markdown' | 'compose'>('markdown');
	const viewRef = React.useRef(view);
	viewRef.current = view;
	const [shareOpen, setShareOpen] = React.useState(false);
	const [feedbackOpen, setFeedbackOpen] = React.useState(false);
	const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
	// When the reference-doc picker's "Manage in Library" link opens the Library, jump
	// it straight to the Docs tab (#651). Undefined for the normal Library button.
	const [libInitialFilter, setLibInitialFilter] = React.useState<'refdoc' | undefined>(undefined);
	// The Docs deep-link is one-shot: clear it whenever the Library leaves the assistant
	// slot. Desktop closes the docked Library via the activity-bar launcher (a plain
	// `setActiveAssistant(null)` — the docked `LibraryFrame` is a div and never fires
	// `onOpenChange`), so this effect, not the sheet handler, is the reset of record; the
	// NEXT open lands on the default filter, not Docs.
	React.useEffect(() => { if (!libraryOpen) setLibInitialFilter(undefined); }, [libraryOpen]);
	const [presentOpen, setPresentOpen] = React.useState(false);
	// The slide Present wants shown, PUBLISHED up from PresentOverlay so the ONE shared
	// preview (hoisted below) renders it — Present holds no iframe of its own. `null` while
	// a lens is withheld (fail-closed) → the shared preview hides and Present shows its own
	// "unavailable" card. Stable setter so the child can publish from a layout effect.
	const [presentPreview, setPresentPreview] = React.useState<{ sample: string; mermaid: boolean } | null>(null);
	const onPresentSlide = React.useCallback((sample: string | null, mermaid: boolean) => setPresentPreview(sample == null ? null : { sample, mermaid }), []);
	// Present OVERLAYS the current view (its z-100 backdrop fully covers Fabricate), so it
	// does NOT leave Fabricate — Escape returns you there with your in-progress theme/component
	// work intact. The reshape's real invariant is ONE warm *deck* preview (the shared host,
	// parked warm through Fabricate), which holds regardless of Fabricate's separate specimen
	// iframes; an earlier version unmounted Fabricate to force a global iframe count of 1, which
	// silently destroyed unsaved fabrication state (Fabricate keeps it in un-persisted useState) —
	// the adversarial trio flagged that as data loss, so Present now leaves Fabricate mounted.
	const openPresent = React.useCallback(() => { setPresentOpen(true); }, []);
	// Clear the published present slide on CLOSE so the NEXT open provably starts from
	// `editorSample` (guaranteed same render signature as the warm frame) until Present
	// republishes the equal present sample — the warm-patch-on-open invariant then holds by
	// construction, not by a coalescing timing side-effect (a stale slide's differing
	// `mermaid` flag could otherwise flip the signature and force a cold write).
	React.useEffect(() => { if (!presentOpen) setPresentPreview(null); }, [presentOpen]);
	// Read in captureLastSlide (a stable useCallback) without re-binding its listeners: while
	// Present is open the shared iframe shows the PRESENT slide (a lens projection that maps to
	// no editor slide), so capturing it would stamp present HTML under the editor's slideIndex
	// and the next boot's instant-shell would replay that artifact. Skip capture while presenting.
	const presentOpenRef = React.useRef(presentOpen);
	presentOpenRef.current = presentOpen;
	const [cmdOpen, setCmdOpen] = React.useState(false);
	const [moreOpen, setMoreOpen] = React.useState(false); // the compact "⋯ More" overflow menu
	const [insertOpen, setInsertOpen] = React.useState(false);
	// Deck Inspector sections as pill-tabs (ordered by reach): Look leads; the two
	// read-aloud groups (Lexicon + Acronyms) fold into one Speech tab so the panel
	// isn't a wall of five stacked groups. (Supersedes 2026-07-03-slide-settings-pill-tabs
	// §"Deck inspector: NOT tabbed" — see 2026-07-17-panel-drawer-cohesion.)
	const [deckTab, setDeckTab] = React.useState<DeckTab>('look');
	const [checkpoints, setCheckpoints] = React.useState<Checkpoint[]>(() => loadCheckpoints(loadBootDeck().id));
	// One-click Undo for the LAST panel settings change — a light complement to ⌘Z /
	// Version history. Each change captures the pre-change source; Undo restores it.
	// `prev` = source before the change (what Undo restores); `next` = source right
	// after it, so Undo can tell whether anything was typed since (and stay out of the
	// way if so — it must never silently swallow edits the user made afterward).
	// Tracks the pending Undo toast (Sonner owns its display) so the reactive effect
	// below can dismiss it the instant the source moves on its own. `next` is the
	// source right after the write; `id` is Sonner's handle for dismiss().
	const [undo, setUndo] = React.useState<{ next: string; id: string | number } | null>(null);
	const [palette, setPalette] = React.useState(() => {
		try {
			return localStorage.getItem('lattice-studio-palette') || 'indaco';
		} catch {
			return 'indaco';
		}
	});
	const [mobilePane, setMobilePane] = React.useState<'edit' | 'preview'>('preview');
	// Bumped on a tap over the iPhone-landscape cinema slide to re-reveal the whisper layer.
	const [whisperReveal, setWhisperReveal] = React.useState(0);
	// TYPING MODE: the Compose surface reports when the software keyboard is up (and the user
	// hasn't scrolled the chrome back into view) so the mobile top bands collapse for a clean
	// writing surface. Reset whenever we leave the edit pane so preview never starts collapsed.
	const [chromeCollapsed, setChromeCollapsed] = React.useState(false);
	// Saved themes from the SHARED Workbench library (asset-store, IndexedDB) — a
	// theme derived + saved in Fabricate lands here and becomes selectable. Loaded
	// async (the store is IndexedDB); refreshed after a save/delete.
	const [savedThemes, setSavedThemes] = React.useState<StudioTheme[]>([]);
	// Current palette read through a ref so refreshThemes (a stable callback) can
	// self-heal without re-subscribing on every palette flip.
	const paletteRef = React.useRef(palette);
	paletteRef.current = palette;
	// biome-ignore lint/correctness/useExhaustiveDependencies: applyPalette closes only over stable setters/consts, and palette is read via paletteRef — a stable callback is intended (no re-subscribe per palette flip).
	const refreshThemes = React.useCallback(() => {
		listStudioThemes()
			.then((list) => {
				setSavedThemes(list);
				// Self-heal a dead active palette: if the persisted choice is neither a
				// built-in nor a (still-)present saved theme — e.g. it was deleted in
				// another session — fall back to the default, so the preview isn't stuck
				// rendering an unresolvable name. Checked AFTER the list resolves, so a
				// valid saved slug is never reset mid-load.
				const p = paletteRef.current;
				if (!BUILTIN_PALETTES.includes(p) && !list.some((t) => t.name === p)) applyPalette('indaco');
			})
			.catch(() => setSavedThemes([]));
	}, []);
	React.useEffect(() => { refreshThemes(); }, [refreshThemes]);
	// Dismiss the SSG instant-shell (studio.astro) once the live preview is ready.
	// Fade over a beat so any sub-frame gap between removing the static slide and
	// the live iframe revealing is imperceptible. Idempotent (the node is gone
	// after the first call); a mount backstop below still clears it if the engine
	// never signals a first render, so a broken engine can't trap the user behind it.
	const dismissSsrShell = React.useCallback(() => {
		const el = document.getElementById('studio-ssr-shell');
		if (!el) return;
		el.style.transition = 'opacity 220ms ease';
		el.style.opacity = '0';
		el.style.pointerEvents = 'none';
		setTimeout(() => {
			el.remove();
			// Remove the shell's SLIDE CSS too, or its bare element selectors (the engine
			// theme styles `section`/`li`/`h1` etc.) would bleed onto the hydrated app's
			// own chrome once the shell is gone. The snapshot CSS is a tagged <style>;
			// the newcomer critical CSS goes back inert (it was flipped to media="all").
			document.getElementById('ssr-snap-css')?.remove();
			const nc = document.getElementById('ssr-newcomer-css') as HTMLStyleElement | null;
			if (nc) nc.media = 'not all';
		}, 260);
	}, []);
	React.useEffect(() => {
		// Backstop: never trap the user behind the static shell if the engine never
		// signals a first render. 8s — the primary dismissal is onPreviewFirstRender
		// (fires on the live iframe's load event, reliable even on slow mobile once the
		// island hydrates), so this only fires on a genuinely broken engine, where a
		// shorter fade-out is better than a long stare. 8s is a deliberate compromise:
		// shortened from 12s (which left a broken-engine user waiting far too long) but
		// NOT down to 5s — on a slow-3G phone a working engine's 505KB fetch + hydrate +
		// first render can plausibly exceed 5s, and dismissing then would prematurely
		// reveal the app's own un-rendered preview (checker finding; the exact ceiling
		// wants real-device confirmation, #23).
		const t = setTimeout(dismissSsrShell, 8000);
		return () => clearTimeout(t);
	}, [dismissSsrShell]);
	// Snapshot the live preview's CURRENT slide (rendered HTML + just the CSS it
	// uses, from the iframe's CSSOM) into localStorage, so a RETURNING visit paints
	// the real last slide in the instant-shell instead of a blank screen (front A
	// only bakes the newcomer slide at build time). Captured on leave (pagehide /
	// tab-hide) and once shortly after the first render — never per-keystroke.
	const previewBoxRef = React.useRef<HTMLDivElement>(null);
	// The ONE shared preview: a `position:fixed` host (parked below the studio root,
	// never moved in the DOM) holding the single DeckPreview, positioned by the controller
	// to overlay whichever SLOT is active — the editor pane's `editorSlotRef` or Present's
	// `presentSlotRef`. Moving the iframe would reload it, so we portal by positioning.
	const sharedHostRef = React.useRef<HTMLDivElement>(null);
	const editorSlotRef = React.useRef<HTMLDivElement>(null);
	const presentSlotRef = React.useRef<HTMLDivElement>(null);
	const lastCaptureRef = React.useRef(0);
	const captureLastSlide = React.useCallback(() => {
		try {
			if (presentOpenRef.current) return; // never snapshot the present-lens slide as an editor slide
			const fr = sharedHostRef.current?.querySelector<HTMLIFrameElement>('iframe.live');
			if (!fr) return;
			// Dedupe back-to-back captures: pagehide + visibilitychange both fire on a
			// mobile nav, and the post-first-render timer can overlap — the CSSOM walk +
			// ~140KB write isn't worth running twice within a beat.
			const now = Date.now();
			if (now - lastCaptureRef.current < 500) return;
			lastCaptureRef.current = now;
			const root = document.documentElement;
			const geom = (fr.parentElement as { __latticeGeom?: { width: number; height: number } } | null)?.__latticeGeom;
			// captureFromFrame sanitizes the slide HTML at the chokepoint (#22) before it
			// can ever be stored + replayed into the top document — nothing to do here.
			const snap = captureFromFrame(fr, {
				w: geom?.width || 1280,
				h: geom?.height || 720,
				palette: root.getAttribute('data-palette') || 'indaco',
				mode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
				// Stamp WHICH deck/slide this is, so the pre-paint replay paints it only when
				// the app is about to boot this same deck — never deck B's slide over deck A.
				deckId: captureDeckRef.current,
				slideIndex: activeSlideRef.current,
				themeUrlBase: options.themeBase,
				ts: now,
			});
			if (snap) saveSnapshot(snap);
		} catch {
			/* best-effort — a failed capture just means the next visit uses the newcomer/none path */
		}
	}, [options.themeBase]);
	React.useEffect(() => {
		const onHide = () => {
			if (document.visibilityState === 'hidden') captureLastSlide();
		};
		window.addEventListener('pagehide', captureLastSlide);
		document.addEventListener('visibilitychange', onHide);
		return () => {
			window.removeEventListener('pagehide', captureLastSlide);
			document.removeEventListener('visibilitychange', onHide);
		};
	}, [captureLastSlide]);
	// First-render handler for the preview: dismiss the instant-shell, then capture
	// the freshly-rendered slide (delayed so async chart/mermaid draws are included).
	const onPreviewFirstRender = React.useCallback(() => {
		dismissSsrShell();
		setTimeout(captureLastSlide, 1500);
	}, [dismissSsrShell, captureLastSlide]);
	// Saved LOCAL components from the same shared library (kind:'component') —
	// authored + saved in the Fabricate Component Studio. They become insertable AND
	// render styled (their CSS is injected where the deck uses them).
	const [localComponents, setLocalComponents] = React.useState<StudioComponent[]>([]);
	const refreshComponents = React.useCallback(() => {
		// Keep a STABLE reference when nothing actually changed. The store resolves
		// async to a fresh array each call (often an empty one when IndexedDB is
		// absent); blindly setting it would flip `localComponents` identity, churn
		// `knownWithLocal`, and needlessly re-init the editor (wiping its doc state).
		const same = (a: StudioComponent[], b: StudioComponent[]) => a.length === b.length && a.every((c, i) => c.id === b[i].id && c.css === b[i].css && c.skeleton === b[i].skeleton && c.name === b[i].name);
		listStudioComponents()
			.then((list) => setLocalComponents((prev) => (same(prev, list) ? prev : list)))
			.catch(() => setLocalComponents((prev) => (prev.length ? [] : prev)));
	}, []);
	React.useEffect(() => { refreshComponents(); }, [refreshComponents]);
	// Saved (Fabricated) FINISHES from the same shared library (kind:'finish') — a
	// finish designed + saved in the Finish faculty lands here, becomes pickable in
	// the Inspector Finish menu, and renders in the deck preview (its CSS injected +
	// its class applied — the consumption loop). Loaded async; refreshed on save/delete.
	const [savedFinishes, setSavedFinishes] = React.useState<StudioFinish[]>([]);
	const refreshFinishes = React.useCallback(() => {
		listStudioFinishes().then(setSavedFinishes).catch(() => setSavedFinishes([]));
	}, []);
	React.useEffect(() => { refreshFinishes(); }, [refreshFinishes]);
	// The add-slide gallery = your saved local components (first) + the built-in catalog.
	// Locals carry their own `css` so the gallery previews them STYLED (per-tile extraCss —
	// the engine theme doesn't know a local `.name` rule).
	const insertComponents = React.useMemo<ComponentEntry[]>(
		() => [
			...localComponents.map((c) => ({ name: c.name, bucket: 'local', description: 'Your saved component', skeleton: c.skeleton, css: c.css })),
			// Catalog items carry their DECLARED variants (`variants`) — the component's own
			// alternate forms (kpi › ops/spotlight, list › numbered/roman) — NOT `effectiveVariants`,
			// which also folds in universal config (dark, no-header, insight-*, tone-*) that belongs
			// in slide settings, not "variants of the component".
			...components,
		],
		[localComponents, components],
	);
	// CSS of the local components the deck actually USES, injected so an inserted
	// local component renders STYLED (the engine theme doesn't know it). The engine
	// applies its `.<name>` class; this supplies the matching rules.
	const usedLocalCss = React.useMemo(() => {
		if (!localComponents.length) return undefined;
		const used = new Set(usedComponents(source));
		const css = localComponents
			.filter((c) => used.has(c.name))
			.map((c) => c.css)
			.join('\n\n');
		return css || undefined;
	}, [localComponents, source]);
	// `validation` is an editor preference (persisted in settings). The deck-level
	// Look controls (size / page numbers / header+footer) are NOT separate state —
	// they READ from and WRITE to the deck's front-matter, so the toggle always
	// reflects the source and every export carries the directive.
	const [validation, setValidation] = React.useState(() => loadSettings().validation);
	// Whether decks inherit the workspace default reader views (Workspace → General toggle). Held as
	// live state — not read once — so flipping it in the Workspace sheet re-projects every deck's Lenses
	// panel immediately (the sheet writes via saveSettings, which fires SETTINGS_EVENT; we re-read here).
	const [lensDefaults, setLensDefaults] = React.useState(() => loadSettings().lensDefaults);
	React.useEffect(() => {
		const sync = () => setLensDefaults(loadSettings().lensDefaults);
		window.addEventListener(SETTINGS_EVENT, sync);
		return () => window.removeEventListener(SETTINGS_EVENT, sync);
	}, []);
	const editorRef = React.useRef<EditorHandle>(null);
	// Warm the lazy Editor chunk right after hydration (off the critical path, but
	// eagerly once the island is live) so the CodeMirror module is cached and the
	// component mounts within ~a frame of the default markdown view — keeping
	// `editorRef.current` ready before any realistic first interaction. Notably this
	// closes the narrow cold-load window where the self-driving demo's synchronous
	// `resetDoc('')` / first `typeTail` (which race a duplicate slide-1, see
	// createDemoFirstDeck) could no-op against a not-yet-mounted editor. Fire-and-forget:
	// a warm failure is harmless — React.lazy re-imports on real render. This is the
	// "load the rest in the background" half of the deferral (decision doc 2026-07-19).
	React.useEffect(() => {
		import('./Editor').catch(() => {});
	}, []);
	// The Studio root — the demo stage mounts over it and scopes its selectors here.
	const rootRef = React.useRef<HTMLDivElement>(null);
	// Indirection so the demo can drive the slide scope's commit funnel —
	// `mutateActiveSlide` is defined lower down (it needs `activeFullIndex`), so the
	// hook reads it through this ref, assigned once it exists.
	const mutateSlideRef = React.useRef<(fn: (chunk: string) => string) => void>(() => {});

	// ── Settings-write funnel with one-click Undo ────────────────────────────
	// Every panel settings write routes through this: it snapshots the pre-change
	// source, applies the (pure) update to the FRESHEST source, and raises a brief
	// Undo toast. Palette / light-dark are runtime toggles that reverse instantly on
	// their own, so they don't route here. `undoTimer` auto-dismisses the toast.
	const showUndo = React.useCallback((label: string, prev: string, next: string) => {
		// Sonner owns display + the 5s auto-dismiss. The action closes over THIS
		// write's prev/next and reverts only if nothing has changed since — so Undo
		// never clobbers edits made after it. Track {next,id} for the reactive dismiss.
		const id = toast(label, {
			duration: 5000,
			action: { label: 'Undo', onClick: () => { if (sourceRef.current === next) setSource(prev); } },
		});
		setUndo({ next, id });
	}, []);
	const settingsWrite = React.useCallback((label: string, updater: (s: string) => string) => {
		const prev = sourceRef.current;
		const next = updater(prev); // updaters are pure string→string; compute once
		if (next === prev) return; // no-op (e.g. re-picking the current value) → no toast
		// Apply the precomputed result; fall back to re-running on the freshest source
		// only if an editor flush landed between snapshot and commit.
		setSource((s) => (s === prev ? next : updater(s)));
		showUndo(label, prev, next);
	}, [showUndo]);
	// Auto-dismiss the Undo toast the instant the source moves on its own — the user
	// typed, switched decks, restored a checkpoint — so Undo only ever reverts the
	// single last settings change, never edits made after it.
	React.useEffect(() => {
		if (undo && source !== undo.next) { toast.dismiss(undo.id); setUndo(null); }
	}, [source, undo]);

	const bp = useBreakpoint();
	// A phone in landscape is wide enough to fall into the two-pane 'tablet' layout but
	// far too SHORT to edit in (the keyboard buries the caret). Fold it into the mobile
	// single-pane shell, then lock that pane to PREVIEW below — a full-bleed, read-only
	// deck with no editor and therefore no keyboard (2026-07-20 landscape-phone salvage).
	const landscapePhone = useLandscapePhone();
	// Opt-in on-device viewport diagnostic for the cinema morph (`?vvdebug`). The overflow
	// fix itself is the forced fit-by-height on the previewBox (see its className) — a
	// landscape phone is always wider than a 16:9 slide, so height binds; the container was
	// never the problem (`100dvh` already equals the visible height). See
	// 2026-07-20-landscape-phone-preview-lock.md §Real-device fix.
	const vvDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('vvdebug');
	const compact = bp !== 'desktop'; // tablet + mobile: panels become sheets
	const mobile = bp === 'mobile' || landscapePhone; // single swappable pane
	// The mobile pane the shell actually shows. Normally the user's Edit/Preview choice;
	// on a landscape phone it is FORCED to preview (no editing surface → no keyboard).
	const effPane: 'edit' | 'preview' = landscapePhone ? 'preview' : mobilePane;
	// At the narrow end of desktop the rail can't share the row with BOTH open panels
	// without breaking the split's zero-void invariant (#721: pair-space ≥ 560). There
	// it collapses to 48px icons (when shown), and — when both panels are open — folds
	// away entirely, the scope switch falling back to the panel-top segment (the tablet
	// pattern). A display adaptation, not a preference change.
	// ── Left-docked panel widths (activity-bar model) ────────────────────────
	// On desktop the Settings panel docks next to the bar and the Architect next to
	// the editor; both resize by a drag handle and persist. The MINs double as the
	// narrow-fold floor: below the both-open threshold the panels auto-narrow to
	// these so the editor+preview pair never clips below its zero-void minimum
	// (#721: pair-space ≥ 2×minB = 560). Widths only apply on desktop — tablet/mobile
	// panels are sheets. (`compact` gates the in-panel scope segment; there is no
	// desktop scope rail any more — the bar's Slide/Deck icons are the switch.)
	const desktop = bp === 'desktop';
	// Docked panel sizes for the resizable workspace (react-resizable-panels).
	// Settings + Assistant are Panels with px min/max/default — the library enforces
	// the min constraints itself, so the old narrow-fold budget math (#721: the
	// panelBudget / archEff / setEff clamps) is retired. The Assistant slot holds ONE
	// of Architect / Lenses / Library (mutually exclusive); Library docks wider
	// (asset cards) so it carries its own default + min.
	const assistantOpen = architectOpen || lensesOpen || libraryOpen;
	const assistantMin = libraryOpen ? LIB_MIN : ARCH_MIN;
	const assistantDefault = libraryOpen ? LIB_DEFAULT : ARCH_DEFAULT;

	// Deck-level front-matter (size / paginate / header / footer) is split off the
	// body so it never reads as a phantom slide, but is prepended back to whatever
	// single slide the preview renders so its directives (e.g. `size`) take effect.
	const fm = React.useMemo(() => frontMatterBlock(source), [source]);
	const body = React.useMemo(() => stripFrontMatter(source), [source]);
	const slides = React.useMemo(() => splitSlides(body), [body]);
	// The deck's reader-lens registry (front-matter `lenses:` block). Empty (just the implicit
	// `full`) for a deck with no block → the picker shows just "Full deck" (a static label + an
	// "＋ Reader view" entry to the Lenses panel).
	// The workspace lens config in force (the curated defaults, or undefined when the setting is off).
	// Threaded into EVERY parse + upsert below so read and write agree on what's inherited vs materialized.
	const wsLenses = React.useMemo(() => workspaceLensConfig({ lensDefaults }), [lensDefaults]);
	const lensReg = React.useMemo(() => parseLensRegistry(fm, wsLenses), [fm, wsLenses]);
	// The picker's catalog. A deck with ANY reader views — authored in its `lenses:` block OR inherited
	// from the workspace default (wsLenses) — is in registry mode: show ITS lenses (the reader's real
	// menu). Author-side, so it lists lenses regardless of APPROVAL (the author previews an unapproved
	// lens to decide whether to approve) — but NOT regardless of EMPTINESS: a lens that currently projects
	// to zero slides (an inherited `Bottom line` starter before any slide is tagged into it) is left OUT,
	// because selecting it would preview a blank rail — a dead end, and the exact astonishment inheritance
	// is meant to avoid. It still appears in the Lenses panel (where it's built up); it rejoins this picker
	// the moment it has a slide. `full` is always kept; a base:all view (e.g. `The evidence`) is non-empty
	// until every slide is excluded from it, in which case it drops out here too (and the reconcile snaps back).
	const composeLensEntries = React.useMemo(() => {
		const visible = lensReg.lenses.filter((l) => l.id === 'full' || (!l.hidden && lensIndices(slides, lensReg, l.id).length > 0));
		return visible.length > 1 ? lensEntriesFrom(visible) : LENSES;
	}, [lensReg, slides]);
	// Reconcile the selected compose lens when the registry changes underneath it: if the author renames,
	// removes, or hides the lens being previewed, the selection would dangle — projecting to an empty or
	// full-deck fallback while the picker still shows the stale label. Snap back to `full` so the preview
	// never lies about which lens it's showing.
	React.useEffect(() => {
		if (composeLens !== 'full' && !composeLensEntries.some((e) => e.key === composeLens)) setComposeLens('full');
	}, [composeLens, composeLensEntries]);
	// The component classification catalog the deterministic (no-AI) lens suggester reads — built once
	// from the real manifest passed to the shell. `function`/`form` ride on each entry (M2 prep).
	const lensCatalog = React.useMemo(() => catalogFromComponents(components.map((c) => ({ name: c.name, bucket: c.bucket, function: c.function ?? '', form: c.form ?? '' }))), [components]);
	// Re-serialize `reg` into `src`'s front matter — Lente is the SOLE registry serializer (HARD RULE #1).
	// With inheritance on, force-materialize any inherited view the deck has TAGGED (taggedLensIds): tagging
	// counts as "touching," so that in-progress membership is written to the deck and survives the workspace
	// default-views setting being turned off (#993). Shared by every registry write below.
	const rewrapRegistry = React.useCallback((src: string, reg: LensRegistry) => {
		const materialize = wsLenses ? taggedLensIds(splitSlides(stripFrontMatter(src))) : undefined;
		const nextInner = upsertLensRegistry(innerFrontMatter(src), reg, wsLenses, materialize);
		const rest = stripFrontMatter(src).replace(/^(?:[ \t]*\r?\n)+/, '');
		return nextInner.trim() ? `---\n${nextInner}\n---\n\n${rest}` : rest;
	}, [wsLenses]);
	const writeRegistry = React.useCallback((label: string, next: LensRegistry) => {
		settingsWrite(label, (s) => rewrapRegistry(s, next));
	}, [settingsWrite, rewrapRegistry]);
	// Tag writes — put slides in/out of a lens by rewriting each affected slide with the library's
	// applyTag (the only per-slide membership carrier). Applied sequentially so several accepts land as
	// ONE undo step; applyTag never changes slide COUNT, so author indices stay stable across the batch.
	// After tagging, re-emit the registry so a freshly-tagged inherited view materializes in the SAME
	// undo step (only when inheritance is on — off, the panel only exposes already-materialized views).
	const writeTags = React.useCallback((label: string, changes: TagChange[]) => {
		if (!changes.length) return;
		settingsWrite(label, (s) => {
			let src = s;
			for (const c of changes) {
				const chunk = splitSlides(stripFrontMatter(src))[c.index];
				if (chunk == null) continue;
				src = replaceSlide(src, c.index, applyTag(chunk, c.lensId, c.member, c.base)).source;
			}
			return wsLenses ? rewrapRegistry(src, parseLensRegistry(innerFrontMatter(src), wsLenses)) : src;
		});
	}, [settingsWrite, wsLenses, rewrapRegistry]);
	// Remove a reader view CLEANLY, in ONE undo step: strip the lens's `_lens` tag from every slide
	// (so a later same-id re-add can't silently resurrect the old membership), then drop it from the
	// registry. Reparses the registry from the live source so the write is never stale. `member = base
	// === 'all'` clears the tag either way (delete the `-id` exclude, or the `+id` include).
	const removeLensWrite = React.useCallback((lens: LensDef) => {
		settingsWrite(`Remove reader view → ${lens.label}`, (s) => {
			let src = s;
			const count = splitSlides(stripFrontMatter(src)).length;
			for (let i = 0; i < count; i++) {
				const chunk = splitSlides(stripFrontMatter(src))[i];
				if (chunk == null) continue;
				src = replaceSlide(src, i, applyTag(chunk, lens.id, lens.base === 'all', lens.base)).source;
			}
			const cur = parseLensRegistry(frontMatterBlock(src), wsLenses);
			const next: LensRegistry = { lenses: cur.lenses.filter((l) => l.id !== lens.id), default: cur.default === lens.id ? 'full' : cur.default };
			return rewrapRegistry(src, next);
		});
	}, [settingsWrite, wsLenses, rewrapRegistry]);
	// The canonical deck is `slides`; the preview/rail render the VIEWED set — the
	// full deck, or a reader-lens reshape of it (the editor always holds the source).
	const viewSlides = React.useMemo(() => (composeLens === 'full' ? slides : presentationSet(slides, composeLens, lensReg)), [slides, composeLens, lensReg]);
	const slide = viewSlides[Math.min(activeSlide, viewSlides.length - 1)] ?? viewSlides[0] ?? '';
	// When inline validation is off, nothing is "unknown" — the editor, the issue
	// count, and the Architect's component check all stand down together.
	// Your saved local components are first-class names too — fold them into the
	// known set so validation never flags a `.<name>` you authored in Component Studio.
	// One memo, used both for deck scoring and the editor's inline lint (its stable
	// identity also gates the CodeMirror re-init — it only changes when KNOWN or your
	// saved components do).
	const localNames = React.useMemo(() => localComponents.map((c) => c.name), [localComponents]);
	// The live known-component set is the REAL catalog (all 53 built-ins, via the
	// `components` prop) plus your saved local components — never the stale hardcoded
	// subset, which would false-flag valid components on the welcome deck and beyond.
	// Falls back to KNOWN only if the catalog failed to load.
	const catalogNames = React.useMemo(() => (components.length ? components.map((c) => c.name) : KNOWN), [components]);
	const knownWithLocal = React.useMemo(() => [...catalogNames, ...localNames], [catalogNames, localNames]);
	const lintKnown = React.useMemo(() => (validation ? knownWithLocal : usedComponents(source)), [validation, source, knownWithLocal]);
	const issues = React.useMemo(() => unknownComponents(source, lintKnown).length, [source, lintKnown]);

	// Panels are persistent columns on desktop, on-demand sheets below it. Reset
	// their open state to the right default whenever the breakpoint flips so a
	// compact load never auto-pops a sheet and a return to desktop re-docks them.
	// Panels close on a breakpoint flip and open on demand — posture never
	// force-opens the coach (T2 §4.5 orthogonality); Build's signal is the visible
	// activity-bar launcher, not an auto-docked panel.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the breakpoint flip itself — the body reads no reactive value, but the RESET must fire whenever `compact` changes (a stranded sheet on resize is the bug this closes).
	React.useEffect(() => {
		setActiveAssistant(null); setActiveSettings(null);
		// The "⋯ More" overflow only exists on compact; close it across any tier flip
		// so a menu opened on a phone doesn't strand open after a resize to desktop
		// (where its trigger unmounts) — red-team H4.
		setMoreOpen(false);
	}, [compact]);

	// Privacy & Data's "Decks" / "Delete everything" clear reloads the Studio
	// shortly after — but the editor stays visible and interactive right up
	// until that reload actually fires. Without this guard, so much as one more
	// keystroke (or switching/creating/importing a deck) in that window would
	// re-trigger a saveSource for the deck id that was JUST cleared, silently
	// orphaning fresh content the reload can't undo. clearAllDecks dispatches
	// this the instant it finishes; every saveSource call below checks it first.
	const decksClearedRef = React.useRef(false);
	React.useEffect(() => {
		const onCleared = () => { decksClearedRef.current = true; };
		window.addEventListener(DECKS_CLEARED_EVENT, onCleared);
		return () => window.removeEventListener(DECKS_CLEARED_EVENT, onCleared);
	}, []);
	const saveSourceGuarded = React.useCallback((id: string, src: string) => {
		if (decksClearedRef.current) return;
		saveSource(id, src);
	}, []);

	// Persist the active deck's source (debounced) so edits survive a switch AND a
	// reload. Skipped on the very first render (nothing changed yet).
	const firstSave = React.useRef(true);
	React.useEffect(() => {
		if (firstSave.current) {
			firstSave.current = false;
			return;
		}
		const id = setTimeout(() => saveSourceGuarded(deck.id, source), 400);
		return () => clearTimeout(id);
	}, [source, deck.id, saveSourceGuarded]);
	// The backup path (workspace-backup.packWorkspace → requestSourceFlush) asks
	// for an immediate write-through, so a download can't race the 400ms timer
	// above — without this, a JUST-edited built-in deck could drop out of the
	// backup entirely (no stored source yet at pack time).
	React.useEffect(() => {
		const flush = () => saveSourceGuarded(deck.id, source);
		window.addEventListener(FLUSH_EVENT, flush);
		return () => window.removeEventListener(FLUSH_EVENT, flush);
	}, [source, deck.id, saveSourceGuarded]);

	// Record the deck + slide currently in view, so a reload (or an iOS memory-reclaim
	// tab discard) boots back here instead of on deck #1 — and so studio.astro's pre-paint
	// replay, which reads the SAME key for its bootId, matches the leave-snapshot's deckId
	// and paints your real slide instead of a blank cold boot. Guarded by decksClearedRef
	// for the same reason saveSource is: a keystroke in the still-live editor during the
	// Privacy&Data clear→reload window must not re-persist a just-cleared pointer.
	React.useEffect(() => {
		if (decksClearedRef.current) return;
		saveActiveDeck(deck.id, activeSlide);
	}, [deck.id, activeSlide]);

	// Persist the editor preference as it changes.
	React.useEffect(() => {
		saveSettings({ validation });
	}, [validation]);

	// The deck's language — its own `lang:` front matter OVERRIDES the workspace
	// default (General tab). Empty here = no override → the deck inherits. Drives the
	// document `<html lang>` in every export + read-aloud, and the language the AI
	// writes this deck's content in. `LANG_AUTO` is the picker's "inherit" sentinel.
	const deckLang = getFrontMatter(source, 'lang') || '';
	const workspaceLang = loadSettings().language;
	// Honest display name — the catalog label for a supported code, else the raw code
	// (never `languageLabel`'s silent fall-through to the default's label, which would
	// mislabel a legacy `fr-FR` as "English (United States)" in the toast + auto row).
	const langDisplay = (code: string) => (resolveSupported(code) ? languageLabel(code) : code);

	// Deck-level Look directives, READ from the deck's front-matter.
	const deckSize = getFrontMatter(source, 'size') || '16:9';
	const pageNumbers = getFrontMatter(source, 'paginate') === 'true';
	// Card lift — the opt-in "Struck" elevation (`lift: on`). Off is the default;
	// the toggle writes / clears the canonical `on`. Per-slide `_class: lifted`/`flat`
	// override it in the source. (resolve-lift.js.)
	const lift = getFrontMatter(source, 'lift') === 'on';
	// Header & footer are DECLARATIONS, not toggles: the author types the running
	// text that rides along the top / bottom of every slide. The band is on exactly
	// when it carries text — an empty field clears the directive (the band is off).
	const headerText = getFrontMatter(source, 'header') ?? '';
	const footerText = getFrontMatter(source, 'footer') ?? '';
	// The section-progress rail has no native Marp directive (unlike header/footer/
	// paginate), so it is governed deck-wide by the `no-progress` class token
	// propagated to every slide (deckClassPropagate). ON is the default; the toggle
	// stamps / clears `no-progress`.
	const deckRail = !(getFrontMatter(source, 'class') || '').split(/\s+/).includes('no-progress');
	// The DECK's own color mode — a deck-wide `class: dark` / `class: light` pin (the
	// same `dark`/`light` canvas tokens the per-slide `_class:` uses). 'auto' = no pin,
	// so the deck follows the website light/dark (the topbar Sun/Moon). Light/Dark are
	// authoritative: the deck stays that way regardless of the site mode. This is the
	// deck-scoped sibling of the website mode toggle — it writes front matter, saved
	// with the deck. Resolution precedence lives in @/lib/deck-theme.
	const deckClassList = (getFrontMatter(source, 'class') || '').split(/\s+/).filter(Boolean);
	// The deck's raw `theme:` (may be a `-dark` variant on an imported deck) and its
	// base palette (darkness lives on the `class:` axis, not the theme name, in the UI).
	const deckThemeRaw = (getFrontMatter(source, 'theme') || '').trim();
	const deckThemeBase = deckThemeRaw.replace(/-dark$/, '');
	// The deck's first-class `color-mode:` value — light/dark PIN a side, `system` follows
	// the viewer's OS, `inherited` adopts the host (site/player) mode. It is the authored
	// default the whole engine + every surface honors (2026-07-11-color-mode-frontmatter.md).
	// A legacy `class: dark/light` or a `-dark` theme name is read as its equivalent so an
	// imported deck still shows a value; a deck with none reads 'default' (the theme's own mode).
	const rawColorMode = (getFrontMatter(source, 'color-mode') || '').trim().toLowerCase();
	const deckColorMode: 'default' | 'light' | 'dark' | 'system' | 'inherited' | 'print' =
		rawColorMode === 'light' || rawColorMode === 'dark' || rawColorMode === 'system' || rawColorMode === 'inherited' || rawColorMode === 'print'
			? rawColorMode
			: deckClassList.includes('print')
				? 'print'
				: deckClassList.includes('dark') || /-dark$/.test(deckThemeRaw)
					? 'dark'
					: deckClassList.includes('light')
						? 'light'
						: 'default';
	const setDeckColorMode = (value: 'default' | 'light' | 'dark' | 'system' | 'inherited' | 'print') =>
		settingsWrite(`Color mode → ${value === 'default' ? 'Theme default' : value}`, (s) => {
			// `color-mode:` is the single home for deck color mode now. Normalize a `-dark`
			// theme name to its base and clear the legacy `class: dark/light` alias, so the
			// theme name and the deprecated axis can never disagree with the key.
			const t = (getFrontMatter(s, 'theme') || '').trim();
			const normalized = /-dark$/.test(t) ? setFrontMatter(s, 'theme', t.replace(/-dark$/, '')) : s;
			// Also clear a legacy `class: print` so the key is the single source of truth.
			const cleared = removeClassTokens(normalized, 'dark light print');
			return setFrontMatter(cleared, 'color-mode', value === 'default' ? null : value);
		});
	// Icon + label for the current color-mode value (shared by the trigger + the menu).
	const COLOR_MODE_META: Record<'default' | 'light' | 'dark' | 'system' | 'inherited' | 'print', { label: string; icon: React.ReactNode }> = {
		default: { label: 'Theme default', icon: <SunMoon className="size-3.5" /> },
		light: { label: 'Light', icon: <Sun className="size-3.5" /> },
		dark: { label: 'Dark', icon: <Moon className="size-3.5" /> },
		system: { label: 'System', icon: <Monitor className="size-3.5" /> },
		inherited: { label: 'Match site', icon: <Layers className="size-3.5" /> },
		print: { label: 'Print (B&W)', icon: <Printer className="size-3.5" /> },
	};
	// The DECK's own THEME (front matter), independent of the website palette. The
	// prominent/topbar picker is the WEBSITE theme; this Inspector control is the
	// deck's — 'automatic' (no `theme:`) means the deck adopts the website theme.
	const setDeckTheme = (name: string | null) =>
		settingsWrite(name ? `Deck theme → ${name}` : 'Deck theme → Automatic', (s) => {
			let out = s;
			// Preserve dark encoded in an OUTGOING `-dark` theme name (import edge) as a
			// `class: dark` pin before we replace the theme, unless the deck already pins a
			// canvas via `class:` — so swapping the palette never silently drops the deck's
			// darkness. The menu only offers base names, so `name` itself is never `-dark`.
			const cur = (getFrontMatter(s, 'theme') || '').trim();
			const hasClassMode = deckClassList.includes('dark') || deckClassList.includes('light');
			if (/-dark$/.test(cur) && !hasClassMode) out = mergeClassTokens(out, 'dark');
			return setFrontMatter(out, 'theme', name);
		});
	// …and WRITE to it (the editor + every export update in lock-step).
	const finish = getFrontMatter(source, 'finish') || 'none';
	// A finish's backdrop is BAKED into its CSS (a 5th finish layer, generateFinishCss →
	// `--fin-backdrop-*`), so applying a finish just sets `finish:` — nothing is stamped.
	// The deck author OVERRIDES any baked layer — backdrop strength/clearance included —
	// through the single `finish-override:` front-matter map, which deep-merges into the
	// finish's recipe and regenerates its CSS (see `finishExtraCss`).
	const setFinish = (value: string) => settingsWrite(`Finish → ${value}`, (s) => setFrontMatter(s, 'finish', value === 'none' ? null : value));
	// The `mode:` axis (rendering mode — boardroom / sketch), a sibling of finish.
	// (The key can't be `style:` — that's Marp's built-in inline-CSS directive.)
	// Named `renderMode` locally to avoid clashing with the light/dark `mode` below.
	const renderMode = getFrontMatter(source, 'mode') || 'boardroom';
	const setRenderMode = (value: string) => settingsWrite(`Mode → ${value}`, (s) => setFrontMatter(s, 'mode', value === 'boardroom' ? null : value));
	// The white-label brand bar (`spectrum:` register). `on` is the rainbow default, so it
	// writes no key; off / solid write the register.
	const spectrum = getFrontMatter(source, 'spectrum') || 'on';
	const setSpectrum = (value: string) => settingsWrite(`Brand bar → ${value}`, (s) => setFrontMatter(s, 'spectrum', value === 'on' ? null : value));
	// The accent sub-family — siblings of the brand bar (spectrum STYLE). Each defaults to a
	// no-token value (bar on top / no card rail / auto rule / plain eyebrow), so a default deck
	// writes no key. See lib/core/resolve-spectrum.js / resolve-rule.js / resolve-eyebrow.js.
	const spectrumEdge = getFrontMatter(source, 'spectrum-edge') || 'top';
	const setSpectrumEdge = (value: string) => settingsWrite(`Bar placement → ${value}`, (s) => setFrontMatter(s, 'spectrum-edge', value === 'top' ? null : value));
	const spectrumCard = getFrontMatter(source, 'spectrum-card') || 'off';
	const setSpectrumCard = (value: string) => settingsWrite(`Card rail → ${value}`, (s) => {
		const out = setFrontMatter(s, 'spectrum-card', value === 'off' ? null : value);
		// Turning the rail off drops the placement too — a `spectrum-card-edge:` with no rail is
		// dead front matter the (now-hidden) placement picker could no longer clear.
		return value === 'off' ? setFrontMatter(out, 'spectrum-card-edge', null) : out;
	});
	// Card rail PLACEMENT (`spectrum-card-edge:`) — left is the default (no key); only meaningful
	// when the card rail is on, so the picker is shown only then.
	const spectrumCardEdge = getFrontMatter(source, 'spectrum-card-edge') || 'left';
	const setSpectrumCardEdge = (value: string) => settingsWrite(`Card rail placement → ${value}`, (s) => setFrontMatter(s, 'spectrum-card-edge', value === 'left' ? null : value));
	const headingRule = getFrontMatter(source, 'rule') || 'auto';
	const setHeadingRule = (value: string) => settingsWrite(`Heading rule → ${value}`, (s) => setFrontMatter(s, 'rule', value === 'auto' ? null : value));
	const eyebrow = getFrontMatter(source, 'eyebrow') || 'plain';
	const setEyebrow = (value: string) => settingsWrite(`Eyebrow → ${value}`, (s) => setFrontMatter(s, 'eyebrow', value === 'plain' ? null : value));
	// Structural trim (`spectrum-trim:`) — off by default (quiet); `on` flows the spectrum onto
	// the in-content accents. On writes the key; off clears it.
	const spectrumTrim = getFrontMatter(source, 'spectrum-trim') || 'off';
	const setSpectrumTrim = (value: string) => settingsWrite(`Structural trim → ${value}`, (s) => setFrontMatter(s, 'spectrum-trim', value === 'off' ? null : value));
	// The layout DEBUG overlay — a real deck setting (`debug:` front matter), so it
	// rides in previewFm to the render and is stripped from every export. Off is the
	// default; the reveal modes are on-hover / on-always, each with an optional
	// `verbose` (adds the class + box levers). The menu offers every value; a
	// hand-typed value we don't recognize shows verbatim. No aliases.
	const debugValue = getFrontMatter(source, 'debug');
	const setDebug = (value: string | null) => setSource((s) => setFrontMatter(s, 'debug', value));
	const DEBUG_OPTIONS: Array<{ value: string | null; label: string }> = [
		{ value: null, label: 'Off' },
		{ value: 'on-hover', label: 'On hover' },
		{ value: 'on-hover verbose', label: 'On hover · verbose' },
		{ value: 'on-always', label: 'Always on' },
		{ value: 'on-always verbose', label: 'Always on · verbose' },
	];
	const debugLabel = ((v) => {
		if (v == null || /^off$/i.test(v)) return 'Off';
		const verbose = /\bverbose\b/i.test(v);
		const mode = /^on-always\b/i.test(v) ? 'Always on' : /^on-hover\b/i.test(v) ? 'On hover' : null;
		if (!mode) return v; // an unrecognized hand-typed value shows verbatim
		return verbose ? `${mode} · verbose` : mode;
	})(debugValue);
	// The saved finishes, shaped for the picker (slug + label + a chip swatch).
	const savedFinishMenu = React.useMemo<SavedFinishMenuEntry[]>(
		() => savedFinishes.map((f) => ({ id: f.id, name: f.name, label: f.label, swatch: finishSwatch(f.recipe) })),
		[savedFinishes],
	);
	// A saved finish's canonical deck token is its PREFIXED class name `finish-<slug>`
	// (the `finish-` prefix is what isolates user finishes from the built-in register).
	// That's the form the deck carries, autocomplete offers, and Apply writes — the
	// SAME token in `finish:` front matter and per-slide `_class:` lines.
	const builtinFinishNames = React.useMemo(() => ((lintVocab as { finishNames?: string[] } | null)?.finishNames) || [], [lintVocab]);
	const savedFinishTokens = React.useMemo(() => savedFinishes.map((f) => `finish-${f.name}`), [savedFinishes]);
	// The `finish:` VALUE vocabulary the editor completes: built-in presets bare (the
	// engine adds the prefix) + saved finishes prefixed.
	const editorFinishValues = React.useMemo(() => [...builtinFinishNames, ...savedFinishTokens], [builtinFinishNames, savedFinishTokens]);
	// The `_class:` CLASS vocabulary — every finish as its `finish-<x>` class (built-ins
	// gain the prefix here; saved finishes already carry it).
	const editorFinishClasses = React.useMemo(() => [...builtinFinishNames.map((b) => `finish-${b}`), ...savedFinishTokens], [builtinFinishNames, savedFinishTokens]);
	// The `theme:` front-matter VALUE vocabulary — the built-in palettes + the user's
	// saved (Fabricated) themes, so the editor completes a deck's own theme name.
	const editorPalettes = React.useMemo(() => [...BUILTIN_PALETTES, ...savedThemes.map((t) => t.name)], [savedThemes]);
	// Lint accepts BOTH the prefixed token and the bare slug of a saved finish (a deck
	// authored before the prefix convention shouldn't false-warn).
	const savedFinishLintNames = React.useMemo(() => savedFinishes.flatMap((f) => [`finish-${f.name}`, f.name]), [savedFinishes]);
	// When the active `finish:` value names a SAVED finish (not a built-in register
	// entry), it renders via injected CSS + an applied class — the engine doesn't
	// know its name. `activeSavedFinish` is that record (or undefined).
	const activeSavedFinish = React.useMemo(() => savedFinishes.find((f) => finish === `finish-${f.name}` || finish === f.name), [savedFinishes, finish]);
	function removeFinish(f: StudioFinish) {
		deleteStudioFinish(f.id).then(() => {
			refreshFinishes();
			if (finish === `finish-${f.name}` || finish === f.name) setFinish('none');
			notify(`Removed “${f.label}” from your finish library.`);
		});
	}
	// CONSUMPTION LOOP — a saved finish renders by injecting its generated CSS
	// (section.finish.finish-<slug> { … }) into the preview's extraCss. Inject the CSS
	// for EVERY saved finish the deck references — the deck-wide `finish:` value OR a
	// per-slide `_class: … finish-<slug>` — so a finish applied to a single slide
	// renders on its own (the engine now implies the `finish` compositor class from the
	// per-slide `finish-<slug>`; deck-wide still also stamps the class via previewFm).
	// Built-ins flow through the engine's `finish:` register, untouched.
	// The deck's `finish-override:` map (a partial recipe the author tunes over the applied
	// finish's baked layers — backdrop strength/clearance and any other layer). Empty when
	// absent. Only the DECK-WIDE active finish honors it; per-slide finishes render baked.
	const finishOverride = React.useMemo(() => parseFinishOverride(source), [source]);
	const finishExtraCss = React.useMemo(() => {
		if (!savedFinishes.length) return undefined;
		const hasOverride = Object.keys(finishOverride).length > 0;
		const used = savedFinishes.filter((f) => {
			const token = `finish-${f.name}`;
			// the `finish-<slug>` class token as a whole word (front-matter value or a
			// per-slide _class line), or the bare deck-wide slug (back-compat).
			const esc = token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
			return new RegExp(`\\b${esc}\\b`).test(source) || finish === f.name;
		});
		return used
			.map((f) => {
				// The active deck-wide finish REGENERATES with the override deep-merged into its
				// recipe (backdrop + any layer); every other used finish renders its baked CSS.
				const isActive = finish === `finish-${f.name}` || finish === f.name;
				return isActive && hasOverride ? generateFinishCss(f.name, mergeFinishOverride(f.recipe, finishOverride)) : f.css;
			})
			.filter(Boolean)
			.join('\n\n') || undefined;
	}, [savedFinishes, source, finish, finishOverride]);
	// The preview's extraCss = local-component CSS + (when active) the saved finish's
	// rule. Combined so a deck can use both at once.
	const previewExtraCss = React.useMemo(
		() => [usedLocalCss, finishExtraCss].filter(Boolean).join('\n\n') || undefined,
		[usedLocalCss, finishExtraCss],
	);
	// The class tokens a saved finish stamps onto every section (the engine never
	// learned the custom name, so we add the class ourselves). Applied ONLY to the
	// RENDER/ARTIFACT paths (preview, Present, PDF/PPTX/Print) — never the editable
	// source or the Markdown/Marp source handoff, which stay clean.
	const finishClass = activeSavedFinish ? `finish finish-${activeSavedFinish.name}` : '';
	// The deck front-matter the PREVIEW renders with — the editable `fm` plus, when a
	// saved finish is active, the `finish finish-<slug>` class MERGED into any existing
	// `class:` (deduped union — a deck's own `class: dark wide` is preserved). Stamped
	// onto the rendered FM only, never the editable source.
	const previewFm = React.useMemo(() => {
		if (!finishClass) return fm;
		// A saved finish renders via the stamped `finish finish-<slug>` class + injected
		// CSS — the engine's `finish:` register knows only built-ins and resolves any
		// other value (bare slug OR prefixed token) to no class, so the `finish:` line is
		// inert to the engine and we just merge the class that does the work.
		return frontMatterBlock(mergeClassTokens(source, finishClass));
	}, [fm, source, finishClass]);
	// LANG_AUTO clears the deck's `lang:` so it inherits the workspace default; any
	// concrete code writes the override. languageLabel resolves the human name for the toast.
	const setDeckLang = (value: string) => settingsWrite(value === LANG_AUTO ? 'Language → workspace default' : `Language → ${langDisplay(value)}`, (s) => setFrontMatter(s, 'lang', value === LANG_AUTO ? null : value));
	const setDeckSize = (value: string) => settingsWrite(`Size → ${value}`, (s) => setFrontMatter(s, 'size', value));
	const togglePageNumbers = () => settingsWrite(pageNumbers ? 'Page numbers off' : 'Page numbers on', (s) => setFrontMatter(s, 'paginate', pageNumbers ? null : 'true'));
	const toggleLift = () => settingsWrite(lift ? 'Card lift off' : 'Card lift on', (s) => setFrontMatter(s, 'lift', lift ? null : 'on'));
	// Write the declared text (trimmed); a blank field clears the directive so the
	// band turns off — no separate toggle, the presence of text IS the switch.
	const setHeaderText = (v: string) => settingsWrite('Header', (s) => setFrontMatter(s, 'header', v.trim() || null));
	const setFooterText = (v: string) => settingsWrite('Footer', (s) => setFrontMatter(s, 'footer', v.trim() || null));
	// The deck's `lexicon:` (word-or-symbol → spoken). Read from the front-matter block;
	// committing writes the whole block back through the settings funnel (Undo toast + reactivity).
	const lexicon = React.useMemo(() => lexiconMap(fm), [fm]);
	const setLexicon = (entries: [string, string][]) => settingsWrite('Lexicon', (s) => setFrontMatterBlock(s, 'lexicon', entries));
	// The deck's `acronyms:` registry (term → { expansion, definition? }). Same reactive funnel as the
	// lexicon; the block-object serializer preserves definitions.
	const acronyms = React.useMemo(() => acronymEntries(fm), [fm]);
	const setAcronyms = (entries: [string, AcronymEntry][]) => settingsWrite('Acronyms', (s) => setFrontMatterAcronyms(s, entries));
	// Rail ON → clear `no-progress`; rail OFF → stamp it (deck-wide, non-destructive
	// to any other author classes).
	const toggleDeckRail = () => settingsWrite(deckRail ? 'Section rail off' : 'Section rail on', (s) => (deckRail ? mergeClassTokens(s, 'no-progress') : removeClassTokens(s, 'no-progress')));

	function loadDeck(d: StudioDeck) {
		// Flush the current deck's edits before leaving it (the debounce may not
		// have fired), then restore the target deck's saved source.
		saveSourceGuarded(deck.id, source);
		setDeck(d);
		setSource(loadSource(d.id) ?? deckSource(d));
		setActiveSlide(0);
		setView('compose');
	}
	// New / rename / delete — all persisted via the store, then reflected in the
	// live deck list and switcher.
	function newDeck() {
		saveSourceGuarded(deck.id, source);
		const d = createDeck();
		setDecks(loadDeckList());
		setDeck(d);
		setSource(deckSource(d));
		setActiveSlide(0);
		setView('compose');
		notify('New deck created.');
	}
	// The demo's "New deck": a REAL, persisted "My First Deck", deduped like a test
	// fixture — any existing one is deleted FIRST (a beforeSetup clean-up), so
	// re-running the walkthrough never accumulates duplicates. The deck is left
	// behind after the demo (the newcomer walks away with it). A plain function (like
	// `newDeck` above), so it can close over `notify` without a dep-array TDZ.
	function createDemoFirstDeck() {
		// Flush the deck we're switching away from first (as newDeck/switchDeck do) — a
		// viewer who clicks "Watch demo" within the 400ms autosave debounce of an edit
		// would otherwise lose that edit when we switch decks.
		saveSourceGuarded(deck.id, source);
		for (const d of loadDeckList()) {
			if (d.title === DEMO_FIRST_DECK_TITLE) deleteDeckStore(d.id);
		}
		const d = createDeck(DEMO_FIRST_DECK_TITLE);
		setDecks(loadDeckList());
		setDeck(d);
		setSource(''); // a blank canvas — the demo types the board deck into it
		// Clear the editor doc SYNCHRONOUSLY too. `setSource('')` only reaches the editor
		// through the async value-prop sync; on a slow surface (real iPad Safari) that can
		// lag the demo's first typeTail, which would then append the board deck AFTER the
		// new deck's seeded template — duplicating slide 1's `_class` and collapsing its
		// settings panel to just Notes/Comments. A direct doc reset closes that race.
		editorRef.current?.resetDoc('');
		setActiveSlide(0);
		setView('compose');
		notify('Created “My First Deck.”');
	}
	// The installed app's icon shortcut ("New deck" → /studio/?new=1): honor the
	// query ONCE on boot, then scrub it from the URL so a reload (or a bookmark
	// of the launched page) doesn't mint another deck. Ref-carried so the effect
	// needs no dependency on the unmemoized newDeck.
	const newDeckRef = React.useRef(newDeck);
	newDeckRef.current = newDeck;
	const shortcutHandled = React.useRef(false);
	React.useEffect(() => {
		if (shortcutHandled.current) return;
		shortcutHandled.current = true;
		const params = new URLSearchParams(window.location.search);
		if (!params.has('new')) return;
		params.delete('new');
		const qs = params.toString();
		window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
		newDeckRef.current();
	}, []);
	// Import a deck from an external `.md` file — seed a new persisted deck with its
	// content (title from the first heading) and load it.
	const importInputRef = React.useRef<HTMLInputElement>(null);
	// Open a deck source into a fresh deck. `comments` (from a .lattice import) are
	// restored onto the NEW deck id so they travel with the file. Returns nothing;
	// notifies on success.
	function openImportedDeck(text: string, title: string, comments?: unknown) {
		if (!text.trim()) { notify('That file was empty — nothing to import.'); return; }
		saveSourceGuarded(deck.id, source);
		const d = createDeck(title || titleFromSource(text), text);
		// Restore comments SYNCHRONOUSLY (static import) before the deck goes active —
		// a floating async restore could be overwritten by a comment added in the gap,
		// or fail silently after a success toast.
		if (comments) importComments(d.id, comments);
		setDecks(loadDeckList());
		setDeck(d);
		setSource(text);
		setActiveSlide(0);
		setView('compose');
		notify(`Imported “${d.title}”.`);
	}
	function importDeckFromText(text: string) {
		openImportedDeck(text, titleFromSource(text));
	}
	function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = ''; // allow re-importing the same file
		if (!file) return;
		// A .lattice file is a zip carrying the deck + its comments; a .md is plain text.
		if (/\.lattice$/i.test(file.name)) {
			import('./lattice-file')
				.then(({ readLatticeFile }) => readLatticeFile(file))
				.then(({ source: src, title, comments }) => openImportedDeck(src, title, comments))
				.catch((err) => notify(err?.message || 'Could not read that .lattice file.'));
			return;
		}
		file.text().then(importDeckFromText).catch(() => notify('Could not read that file.'));
	}
	function renameActiveDeck(title: string) {
		const t = title.trim();
		if (!t || t === deck.title) return;
		renameDeckStore(deck.id, t);
		setDeck((cur) => ({ ...cur, title: t }));
		setDecks(loadDeckList());
		notify(`Renamed to “${t}”.`);
	}
	function removeDeck(id: string) {
		deleteDeckStore(id);
		const list = loadDeckList();
		setDecks(list);
		if (id === deck.id) {
			const next = list[0] ?? DECKS[0];
			setDeck(next);
			setSource(loadSource(next.id) ?? deckSource(next));
			setActiveSlide(0);
		}
		notify('Deck deleted.');
	}
	function applyPalette(name: string) {
		setPalette(name);
		// Persist to a Studio-scoped key (not the shared docs key) so the choice
		// survives a reload without bleeding into the rest of the docs site.
		try {
			localStorage.setItem('lattice-studio-palette', name);
		} catch {}
		// A built-in palette drives the page through `data-palette` (other previews
		// fetch it by name). A saved library theme has no on-disk CSS, so it renders
		// through `extraTheme` instead — we leave `data-palette` on a real palette to
		// avoid a 404 theme fetch, and pass the saved CSS where it's consumed.
		if (BUILTIN_PALETTES.includes(name)) document.documentElement.setAttribute('data-palette', name);
	}
	// The active theme as a saved library entry (when the active palette names one),
	// else undefined → a built-in palette. Drives the `extraTheme` everywhere a deck
	// is rendered/exported so a saved theme is honored, not just previewed.
	const activeTheme = React.useMemo(() => savedThemes.find((t) => t.name === palette), [savedThemes, palette]);
	const extraTheme = activeTheme ? { name: activeTheme.name, css: activeTheme.css } : undefined;
	// Saved (Fabricated) themes shaped for the grouped picker.
	const savedMenu = React.useMemo(() => savedThemes.map((t) => ({ id: t.id, name: t.name, label: t.label, accent: t.essentials?.accent })), [savedThemes]);
	// Label + dot for the deck-theme trigger — null when the deck names no theme (Automatic).
	// Light/dark toggle — flips the shared `data-mode` (engine `light-dark()` resolves
	// off it); the data-mode observer below pulls the new value into `mode` and the
	// preview re-renders. Persisted via site-chrome so it survives a reload.
	const toggleMode = React.useCallback(() => { toggleDocMode(); }, []);
	function removeTheme(t: StudioTheme) {
		deleteStudioTheme(t.id).then(() => {
			refreshThemes();
			if (palette === t.name) applyPalette('indaco');
			notify(`Removed “${t.label}” from your library.`);
		});
	}
	// Navigate to a slide from the preview side (rail / arrows): move the preview
	// AND scroll the editor to that slide (mapping the viewed index back to its
	// position in the full source), so the two panes stay in lock-step.
	function goToSlide(i: number) {
		// Moving the preview is INTENT to see it (the Playground's toPreview
		// lesson): a collapsed preview expands first — a no-op when it's open —
		// so a navigation never lands in a hidden pane.
		splitApiRef.current.expand('b');
		const idx = Math.max(0, Math.min(i, viewSlides.length - 1));
		setActiveSlide(idx);
		const fullIdx = composeLens === 'full' ? idx : slides.indexOf(viewSlides[idx]);
		if (fullIdx >= 0) editorRef.current?.revealSlide(fullIdx);
	}
	// Switch the reader lens for the preview; restart at the top of the reshaped set.
	function setLens(next: PresentLens) {
		setComposeLens(next);
		setActiveSlide(0);
	}
	// The editor reports a FULL-deck slide index; translate it to the viewed set
	// (no-op in full view; in a lens, ignore a cursor in a filtered-out slide).
	function onEditorCursorSlide(fullIdx: number) {
		if (composeLens === 'full') { setActiveSlide(fullIdx); return; }
		const vi = viewSlides.indexOf(slides[fullIdx]);
		if (vi >= 0) setActiveSlide(vi);
	}
	// The Compose divider's ⚙ opens slide settings for the caret's slide (its FULL-deck index).
	// Bind the inspector to that slide, THEN open — targeting the caret's slide, not the filmstrip's
	// (activeFullIndex tracks the preview selection). In a reader lens the slide may be filtered out
	// of the viewed set; rather than silently edit the previously-active slide, drop back to the full
	// deck so the ⚙ always targets the slide you tapped.
	// Make a FULL-deck index the active slide, switching to the full lens if that slide
	// isn't in the current reader view. Shared by "open slide settings" and "insert after
	// this slide" so both land on the same slide regardless of lens.
	function focusFullSlide(fullIdx: number) {
		if (composeLens === 'full') setActiveSlide(fullIdx);
		else {
			const vi = viewSlides.indexOf(slides[fullIdx]);
			if (vi >= 0) setActiveSlide(vi);
			else {
				setComposeLens('full');
				setActiveSlide(fullIdx);
			}
		}
	}
	function openSlideSettings(fullIdx: number) {
		focusFullSlide(fullIdx);
		setInspectorScope('slide');
		setInspectorOpen(true);
	}
	// The Compose divider's "Insert slide below" — focus that slide, then open the unified
	// add-slide gallery so the new slide lands after it (its Blank tile keeps a quick blank
	// insert one tap away). This is the #1058 "one insert door" for the divider control.
	function openInsertAfter(fullIdx: number) {
		focusFullSlide(fullIdx);
		setInsertOpen(true);
	}
	// Transient bottom-center confirmation, so no action in the prototype is a
	// dead click (real ones confirm; not-yet-wired ones say so honestly).
	const notify = React.useCallback((msg: string) => {
		toast(msg, { duration: 2600 });
	}, []);

	// ── Self-driving demo walkthrough ───────────────────────────────────────
	// A guided "watch it drive itself" tour: a fake cursor + captions play a
	// storyboard against the LIVE Studio, driving real setters (not synthetic
	// events), and hand the wheel back the instant the viewer clicks or types.
	const { demoActive, startDemo } = useStudioDemo(rootRef, {
		palette,
		createFirstDeck: createDemoFirstDeck,
		setSource,
		typeTail: (t: string) => editorRef.current?.typeTail(t),
		// True once the lazy CodeMirror editor has mounted (its imperative handle is set).
		// The demo uses this to pick its typing channel: native `typeTail` when ready, else
		// the controlled `setSource` path (the same one the phone uses) so a "Take a tour"
		// click landing in the brief cold-load window before the editor mounts still types
		// the deck instead of dropping characters into a not-yet-mounted editor.
		editorReady: () => editorRef.current != null,
		goToSlide,
		setView,
		setArchitectOpen,
		setArchitectTab,
		setInspectorOpen,
		applyPalette,
		toggleMode,
		// Present overlays the current view (see openPresent) — it does not force compose, so a
		// tour opening Present never discards Fabricate state; close returns to the prior view.
		setPresentOpen: (o: boolean) => setPresentOpen(o),
		setShareOpen,
		setInspectorScope,
		setDeckMenuOpen,
		mutateSlide: (fn: (chunk: string) => string) => mutateSlideRef.current(fn),
		fixAll: () => editorRef.current?.fixAll(),
		setActiveSlide,
		setFocus: setQuietened,
		setPosture: changePosture,
		setCmdOpen,
		notify,
		setMobilePane,
		mobile,
	});

	// ── Resizable/collapsible editor|preview split (2026-07-02 decision) ─────
	// Active on every non-mobile Compose branch (desktop, tablet, focus) — on
	// mobile the Edit/Preview pane swap owns visibility, and in Fabricate the
	// Compose grid isn't rendered; state is retained across both.
	const splitUsable = !mobile && view === 'compose';
	// react-resizable-panels split state via the shared hook (2026-07-19 migration).
	// Same surface the hand-rolled useSplit had ({ collapsed, dragging, expand,
	// collapse, reset }) so the ~20 downstream call sites are unchanged. The FIT
	// choreography differs from the Playground's: the Studio suspends its per-host
	// scaleFrame ResizeObservers during a drag (onDragStart) and resumes — running
	// one authoritative re-fit — at release (onDragEnd).
	// The persistence bucket — which panels the group currently renders, so each
	// configuration (Coach open, Library open wider, Settings docked, bare Write,
	// tablet Inspector) keeps its own remembered widths. Library is 'L' vs the
	// coach/lenses 'A' because it docks wider and gets its own saved width.
	const splitConfigKey =
		(desktop && effectiveStop === 'build' && inspectorOpen ? 'S' : '') +
		(desktop && effectiveStop === 'build' && assistantOpen ? (libraryOpen ? 'L' : 'A') : '') +
		'EP' +
		(bp === 'tablet' && effectiveStop === 'build' && inspectorOpen ? 'T' : '');
	const split = useResizableSplit({
		storageKey: 'lattice-docs-split-studio',
		active: splitUsable,
		defaultRatio: 46,
		configKey: splitConfigKey,
		onCollapse: (side) => notify(side === 'b' ? 'Preview collapsed — rendering paused.' : 'Editor collapsed.'),
		onDragStart: () => suspendScaleObservers(true),
		onDragEnd: () => suspendScaleObservers(false),
	});
	// Stable handle for callbacks defined above/below without dep churn (the
	// Playground's splitApiRef pattern).
	const splitApiRef = React.useRef(split);
	splitApiRef.current = split;
	// Collapse via a header glyph (or a ⌘K command): if focus was inside the
	// now-inert pane it would drop to <body>; hand it to the always-visible rail.
	const collapseFromHeader = React.useCallback((side: SplitSide) => {
		splitApiRef.current.collapse(side);
		// Double rAF: the rail is display:none until React commits the collapse, so
		// one frame can beat the reveal and focus a hidden element (dropping focus to
		// <body>). Two frames clear the commit.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				document.querySelector<HTMLButtonElement>(`[data-studio-split] [data-slot='split-rail'][data-side='${side}']`)?.focus();
			}),
		);
	}, []);

	// ── Architect (AI) ───────────────────────────────────────────────────────
	const ai = useArchitectStatus();
	const [hasSelection, setHasSelection] = React.useState(false);
	const [refineBusy, setRefineBusy] = React.useState(false);
	// Deck-wide deterministic findings (the real lint-core list the editor underlines)
	// — surfaced in the Coach panel so each can be fixed with AI. A proposed fix is a
	// reviewable diff keyed by finding; nothing applies until the author clicks Apply.
	const [findings, setFindings] = React.useState<Finding[]>([]);
	// The REAL engine deck assessment (scorecard + lint/review findings), replacing the
	// toy lint.ts scoreDeck. `hasContent` false → a blank deck shows a placeholder, never
	// a fabricated grade (K1). Populated by the debounced effect below.
	const [scorecard, setScorecard] = React.useState<DeckScorecard | null>(null);
	const [deckHasContent, setDeckHasContent] = React.useState(false);
	const [assessing, setAssessing] = React.useState(true);
	// The active deterministic Coach chip result card (one open at a time). No model.
	const [coachCard, setCoachCard] = React.useState<{ id: string; card: CoachCard } | null>(null);
	const [talkMinutes, setTalkMinutes] = React.useState<number | null>(null);
	// Per-finding fix lifecycle, keyed by finding IDENTITY (findingKeys) — not list index.
	// Keying by identity is what lets an open/in-flight fix SURVIVE a re-lint: editing
	// another slide re-runs the assessment, but a finding that persists keeps its fix
	// state ("if I'm on Fix, I stay on Fix"). A pruning effect drops entries whose finding
	// no longer exists. `fixAll` is the batch draft (never a blind apply-all).
	const [fixStates, setFixStates] = React.useState<Record<string, FindingFixState>>({});
	const [fixingAll, setFixingAll] = React.useState(false);
	// Live cycling-step timers for in-flight fixes (one per finding key), cleared on
	// resolve / discard / unmount so a settled pill never keeps ticking.
	const fixTimersRef = React.useRef<Record<string, ReturnType<typeof setInterval>>>({});
	// The last card order captured while NO fix was active — the frozen order to hold to
	// while a fix IS active, so the reviewed card never jumps under a re-rank (trio Munger #5).
	const frozenOrderRef = React.useRef<string[]>([]);
	const stopFixTimer = React.useCallback((key: string) => {
		const t = fixTimersRef.current[key];
		if (t) {
			clearInterval(t);
			delete fixTimersRef.current[key];
		}
	}, []);
	React.useEffect(() => () => { for (const t of Object.values(fixTimersRef.current)) clearInterval(t); }, []);
	// On return from the OpenRouter OAuth redirect (?code=), finish the exchange.
	React.useEffect(() => {
		resumePendingAuth().then((ok) => {
			if (ok) notify('OpenRouter connected — the Architect can now edit your deck.');
		});
	}, [notify]);
	// Storage durability — two quiet moves on boot. (1) Ask the browser to mark
	// this origin's storage persistent (best-effort; silently denied where
	// unsupported). (2) The EARNED backup nudge: only when real unbacked-up work
	// exists, at most once per 14 days (shouldNudgeBackup) — ownership framing,
	// a plain toast, never a modal. Tiers + copy:
	// engineering/decisions/2026-07-02-workspace-backup.md.
	React.useEffect(() => {
		try {
			navigator.storage?.persist?.().catch(() => {});
		} catch {
			/* no Storage API here */
		}
		const now = Date.now();
		if (shouldNudgeBackup(now)) {
			markBackupNudged(now);
			const edited = loadDeckList().filter((d) => loadSource(d.id) != null).length;
			notify(`${edited} decks live only in this browser — a backup takes 10 s: Workspace → General.${isEvictionProneBrowser() ? ' (Safari clears unused site data after a week.)' : ''}`);
		}
	}, [notify]);
	// NOTE: the standalone "Rewrite lead" AI action (runArchitectAction) was removed with
	// the Coach reframe — the deterministic chips + per-finding AI fix + the chat now cover
	// deck edits, so a single static rewrite chip is redundant (succession doc §2, P2a).

	// Refine the editor SELECTION with the model (Polish/Formalize/Elaborate/
	// Shorten). Checkpoints the pre-edit deck, applies the rewrite as one undoable
	// editor transaction, and degrades honestly with no model / at the budget cap.
	const refine = React.useCallback(
		async (action: RefineActionId, label: string) => {
			if (refineBusy) return;
			const sel = editorRef.current?.getSelection();
			if (!sel || sel.empty || !sel.text.trim()) {
				notify('Select some text in the editor to refine first.');
				return;
			}
			setRefineBusy(true);
			notify(`${label}…`);
			try {
				const out = await refineSelection(action, sel.text, deckOutputLang(source));
				if (out.status === 'offline') {
					notify('Connect a model in Workspace → AI to refine a selection.');
					setWorkspaceOpen(true);
				} else if (out.status === 'blocked') {
					notify(out.note);
					setWorkspaceOpen(true);
				} else if (out.status === 'nochange') {
					notify('No change — the selection already reads well.');
				} else {
					setCheckpoints(saveCheckpoint(deck.id, source, `Before ${label}`, Date.now()));
					editorRef.current?.replaceSelection(out.text);
					notify(`${label} applied — ⌘Z or restore from History to undo.`);
				}
			} catch {
				notify(`${label} failed — try again.`);
			} finally {
				setRefineBusy(false);
			}
		},
		[refineBusy, source, notify, deck.id],
	);

	// Recompute the deck-wide findings list whenever the source (or the known-name
	// set) changes — only when inline validation is on, mirroring the editor. The
	// lazy lint bundle loads once; a stale async result is dropped on unmount/change.
	// Debounced 400ms (matching the autosave effect above) — the full lint-core
	// pass runs the SAME deterministic scan CodeMirror's own linter already does
	// (Editor.tsx, debounced 750ms by @codemirror/lint's default), so an
	// undebounced copy here duplicated that work on every keystroke.
	React.useEffect(() => {
		let live = true;
		setAssessing(true);
		const id = setTimeout(() => {
			assessDeck(source, lintVocab, components, localNames, savedFinishLintNames).then((a: CoachAssessment) => {
				if (!live) return;
				setScorecard(a.scorecard);
				setDeckHasContent(a.hasContent);
				setFindings(a.findings);
				setAssessing(false);
			});
		}, 400);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, [source, lintVocab, components, localNames, savedFinishLintNames]);
	// Disambiguated, STABLE per-finding keys (finding object → key). Content-based so a
	// fix survives a re-lint; an occurrence ordinal keeps two IDENTICAL findings (e.g. a
	// repeated `_class` token → two same unknown-class findings) from colliding onto one
	// card / one fix state — the old index-free key silently merged them (trio red-team #2).
	const findingKeys = React.useMemo(() => {
		const seen = new Map<string, number>();
		const map = new Map<Finding, string>();
		for (const f of findings) {
			const base = `${f.slide ?? 0}:${f.rule}:${f.message}`;
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			map.set(f, n === 0 ? base : `${base}#${n}`);
		}
		return map;
	}, [findings]);
	const keyFor = React.useCallback((f: Finding): string => findingKeys.get(f) ?? `${f.slide ?? 0}:${f.rule}:${f.message}`, [findingKeys]);
	// Re-lint housekeeping. A fix keyed by finding identity SURVIVES a re-lint — the
	// "stay on Fix" contract — so we don't nuke the map; we only PRUNE entries whose
	// finding no longer exists (resolved / edited away) so a stale diff can't linger. Timer
	// clears are hoisted OUT of the reducer, which stays pure (trio red-team smell). The
	// deterministic quick-read card is transient, so it still clears.
	React.useEffect(() => {
		const live = new Set(findingKeys.values());
		for (const k of Object.keys(fixTimersRef.current)) if (!live.has(k)) stopFixTimer(k);
		setFixStates((m) => {
			const drop = Object.keys(m).filter((k) => !live.has(k));
			if (!drop.length) return m;
			const next = { ...m };
			for (const k of drop) delete next[k];
			return next;
		});
		setCoachCard(null);
	}, [findingKeys, stopFixTimer]);

	// Draft an AI fix for ONE finding, showing progress IN the pill (no toast) and leaving
	// a reviewable diff — nothing applies until Apply. The pill cycles through the fix
	// pipeline's stages (read → draft → diff) while the request is in flight; on resolve it
	// splits into Apply / Discard. `srcAt` pins the batch draft (fixAll) to ONE source
	// snapshot; `key` is the caller's disambiguated finding key.
	const draftFix = React.useCallback(
		async (finding: Finding, key: string, srcAt?: string): Promise<boolean> => {
			const src = srcAt ?? source;
			if (fixStates[key]?.phase === 'working') return false;
			// (The old K3 guard that disabled the fix when a `---` sat inside a code fence is
			// gone — the slide splitter is fence-aware now, so the fix targets correctly, and
			// applyEdit refuses a model body that smuggles a top-level `---`.)
			const steps = [finding.slide ? `Reading slide ${finding.slide}…` : 'Reading the deck…', 'Drafting a tighter pass…', 'Preparing the diff…'];
			let si = 0;
			setFixStates((m) => ({ ...m, [key]: { phase: 'working', step: steps[0] } }));
			stopFixTimer(key);
			fixTimersRef.current[key] = setInterval(() => {
				si = Math.min(si + 1, steps.length - 1);
				setFixStates((m) => (m[key]?.phase === 'working' ? { ...m, [key]: { phase: 'working', step: steps[si] } } : m));
			}, 650);
			const clear = () =>
				setFixStates((m) => {
					if (!(key in m)) return m;
					const { [key]: _drop, ...rest } = m;
					return rest;
				});
			try {
				const out = await requestFindingFix(src, finding, components);
				stopFixTimer(key);
				if (out.status === 'offline') {
					notify('Connect a model in Workspace → AI to fix a finding.');
					setWorkspaceOpen(true);
					clear();
				} else if (out.status === 'blocked') {
					notify(out.note);
					setWorkspaceOpen(true);
					clear();
				} else if (out.status === 'nochange') {
					notify('The model had no rewrite to propose for this one.');
					clear();
				} else {
					// Land the proposal ONLY if this fix is still tracked. A re-lint during the
					// request may have pruned the finding; writing here unconditionally would
					// resurrect a PHANTOM proposal (inflates Apply-all, risks a wrong-slide
					// apply). Guard the write like clear() does (trio red-team #1).
					// Capture the slide content AT PROPOSAL TIME so Apply can detect a change
					// under it (K4), independent of what the model reports as `before`.
					setFixStates((m) => (key in m ? { ...m, [key]: { phase: 'proposed', slide: finding.slide, proposedSlice: finding.slide ? sliceSlide(src, finding.slide) : undefined, before: out.before, after: out.after, edit: out.edit } } : m));
					return true;
				}
			} catch {
				stopFixTimer(key);
				notify('Fix failed — try again.');
				clear();
			}
			return false;
		},
		[fixStates, source, components, notify, stopFixTimer],
	);
	const fixFinding = React.useCallback((finding: Finding, key: string) => void draftFix(finding, key), [draftFix]);
	const discardFix = React.useCallback(
		(key: string) => {
			stopFixTimer(key);
			setFixStates((m) => {
				if (!(key in m)) return m;
				const { [key]: _drop, ...rest } = m;
				return rest;
			});
		},
		[stopFixTimer],
	);
	// Apply ONE reviewed fix by key — checkpoint first (reversible from History), splice
	// the edited slide back. K4 stale-body guard: if the target slide changed since the fix
	// was proposed, DON'T clobber — flip the card to a visible `stale` state so the panel
	// still shows it owing a re-draft, rather than silently dropping it (trio Munger #3).
	const applyFixKey = React.useCallback(
		(key: string): boolean => {
			const st = fixStates[key];
			if (!st || st.phase !== 'proposed') return false;
			if (st.slide && st.proposedSlice != null && sliceSlide(source, st.slide).trim() !== st.proposedSlice.trim()) {
				notify(`Slide ${st.slide} changed since this fix was drafted — re-draft it from your current slide.`);
				setFixStates((m) => (key in m ? { ...m, [key]: { phase: 'stale', slide: st.slide } } : m));
				return false;
			}
			// applyDeckEdit REFUSES a malformed rewrite (a body that would split the slide —
			// a top-level `---` or an unclosed fence) by returning the source unchanged. Detect
			// that no-op and tell the truth instead of banking a phantom checkpoint and claiming
			// "Fix applied" over a deck that didn't change (trio red team / Munger). Leave the
			// proposal up so the author can Discard and re-draft.
			const next = applyDeckEdit(source, st.edit);
			if (next === source) {
				notify(`Couldn’t apply this rewrite — it would split slide ${st.slide ?? ''}. Discard and re-draft, or edit by hand.`);
				return false;
			}
			setCheckpoints(saveCheckpoint(deck.id, source, 'Before AI fix', Date.now()));
			setSource(next);
			discardFix(key);
			notify('Fix applied — ⌘Z or restore from History to undo.');
			return true;
		},
		[fixStates, source, deck.id, notify, discardFix],
	);
	// Draft fixes for EVERY draftable finding (idle OR previously-stale), serialized against
	// one source snapshot so slide numbers stay coherent — each lands as its own reviewable
	// proposal. Nothing applies (no blind apply-all): the author reviews, then Apply / Apply
	// all. The target set matches `batchFixable` (both skip proposed + working) — trio #4.
	const fixAll = React.useCallback(async () => {
		if (fixingAll) return;
		const snap = source;
		const targets = rankFindings(findings)
			.slice(0, 6)
			.filter((f) => {
				if (!f.slide) return false;
				const ph = fixStates[keyFor(f)]?.phase;
				return ph !== 'proposed' && ph !== 'working';
			});
		if (!targets.length) return;
		setFixingAll(true);
		try {
			for (const f of targets) await draftFix(f, keyFor(f), snap);
		} finally {
			setFixingAll(false);
		}
	}, [fixingAll, source, findings, fixStates, draftFix, keyFor]);
	// Apply every reviewed proposal, one checkpoint for the batch. Applied slide-descending
	// (highest slide first) so earlier slide numbers stay valid as the deck shifts. A
	// proposal is SKIPPED when its slide changed under it — either the user edited it, or an
	// EARLIER fix in this same batch already rewrote that slide (two whole-slide rewrites for
	// one slide can't compose). Skipped ones don't vanish: they flip to a visible `stale`
	// card so the panel still shows what it couldn't apply (trio Munger #3 / red-team #3).
	const applyAll = React.useCallback(() => {
		const proposed = Object.entries(fixStates)
			.filter(([, v]) => v.phase === 'proposed')
			.map(([k, v]) => ({ key: k, st: v as Extract<FindingFixState, { phase: 'proposed' }> }))
			.sort((a, b) => (b.st.slide ?? 0) - (a.st.slide ?? 0));
		if (!proposed.length) return;
		setCheckpoints(saveCheckpoint(deck.id, source, 'Before AI fixes', Date.now()));
		let next = source;
		const appliedSlides = new Set<number>();
		const stale: { key: string; slide?: number }[] = [];
		let applied = 0;
		for (const { key, st } of proposed) {
			const supersededInBatch = st.slide != null && appliedSlides.has(st.slide);
			const changedByUser = st.slide != null && st.proposedSlice != null && sliceSlide(next, st.slide).trim() !== st.proposedSlice.trim();
			if (supersededInBatch || changedByUser) {
				stale.push({ key, slide: st.slide });
				continue;
			}
			// applyDeckEdit REFUSES a malformed rewrite (would split the slide) by returning the
			// deck unchanged — count that as a skip that needs a re-draft, not a silent "applied".
			const after = applyDeckEdit(next, st.edit);
			if (after === next) {
				stale.push({ key, slide: st.slide });
				continue;
			}
			next = after;
			if (st.slide != null) appliedSlides.add(st.slide);
			applied++;
			discardFix(key);
		}
		if (applied) setSource(next);
		if (stale.length) setFixStates((m) => { const n = { ...m }; for (const { key, slide } of stale) if (n[key]) n[key] = { phase: 'stale', slide }; return n; });
		notify(applied ? `${applied} fix${applied > 1 ? 'es' : ''} applied${stale.length ? ` · ${stale.length} need a re-draft (slide changed)` : ''} — undo from History.` : 'None applied — those slides changed since they were drafted. Re-draft them.');
	}, [fixStates, source, deck.id, notify, discardFix]);

	// ⌘K (command palette), ⌘. (toggle the quiet overlay), Esc (clear it). Radix
	// popovers/sheets/dialogs handle Escape first and stop its propagation, so `Esc`
	// only reaches here — and only clears `quietened` — when nothing is open. Neither
	// key ever writes the persisted `posture`: quieting the noise for a moment must
	// not mutate a user's saved home (2026-07-17-studio-persona-dial.md, rule R2/R3).
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setCmdOpen((v) => !v);
			} else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
				e.preventDefault();
				// Not while Fabricate is up — a full-screen surface with no compose body
				// behind it. Toggling quiet there would silently arm a state you never see
				// and desync the suspend/restore (M4 red-team finding 2).
				// ⌘. quiets to Write — the opposite of a Build reveal, so drop any reveal first.
				// If we're dismissing a TRANSIENT reveal, close its summoned panel(s) too (see Esc).
				if (viewRef.current !== 'fabricate') { if (revealBuildRef.current) { setActiveAssistant(null); setActiveSettings(null); } setRevealBuild(false); setQuietened((v) => !v); }
			} else if (e.key === 'Escape') {
				// Esc clears either transient overlay (whichever is armed) back to the saved stop.
				// Dismissing a transient Build REVEAL also closes the panel(s) it was summoned for:
				// a summon + Esc is one "never mind" episode, so the panel must not linger open-but-
				// hidden and pop back on the next Build visit (adversarial-trio R4). A panel opened at
				// a PERSISTENT Build stop (revealBuild already false) is untouched — its orthogonal
				// preservation across a Build↔Write dip is the documented, intended behavior.
				if (viewRef.current !== 'fabricate') { if (revealBuildRef.current) { setActiveAssistant(null); setActiveSettings(null); } setRevealBuild((v) => (v ? false : v)); setQuietened((v) => (v ? false : v)); }
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	// Fabricate is its own full-screen surface; never sit quietened OR build-revealed
	// behind it, but SUSPEND-and-RESTORE either transient so exiting Fabricate returns
	// you to the exact surface you left — not a posture you didn't choose (R5). Present
	// is an overlay (it doesn't swap the compose body), so it needs no such dance. A
	// summoned panel's open state persists across Fabricate, so restoring the reveal
	// stays consistent with the panel the recede effect keys on.
	const suspendedQuietRef = React.useRef(false);
	const suspendedRevealRef = React.useRef(false);
	React.useEffect(() => {
		if (view === 'fabricate') {
			suspendedQuietRef.current = quietenedRef.current;
			suspendedRevealRef.current = revealBuildRef.current;
			if (quietenedRef.current) setQuietened(false);
			if (revealBuildRef.current) setRevealBuild(false);
		} else {
			if (suspendedQuietRef.current) { suspendedQuietRef.current = false; setQuietened(true); }
			// Only re-reveal Build if the summoned panel actually survived Fabricate — a
			// breakpoint flip mid-Fabricate can reset the panels, and restoring a reveal
			// with nothing open would flash Build for one frame before the recede clears it.
			if (suspendedRevealRef.current) { suspendedRevealRef.current = false; if (panelsOpenRef.current) setRevealBuild(true); }
		}
	}, [view]);
	// Assistive-tech stop announcement. Held in state that starts EMPTY and updates
	// only on a real change (a React island mounts after load, so a pre-filled live
	// region can announce on some SR/browser pairs — M4 red-team finding 3), and never
	// while Fabricate is up (its full-screen surface isn't a compose stop — finding 1).
	const [stopAnnounce, setStopAnnounce] = React.useState('');
	const announceMountRef = React.useRef(false);
	React.useEffect(() => {
		if (!announceMountRef.current) { announceMountRef.current = true; return; }
		if (view !== 'fabricate') setStopAnnounce(POSTURE_ANNOUNCE[effectiveStop]);
	}, [effectiveStop, view]);

	// Track the document's light/dark mode reactively so exports + the preview
	// follow a mode flip while Studio is open (the topbar writes <html data-mode>).
	const [mode, setMode] = React.useState<string>(() => (typeof document !== 'undefined' ? (document.documentElement.getAttribute('data-mode') ?? 'light') : 'light'));
	React.useEffect(() => {
		const root = document.documentElement;
		const sync = () => setMode(root.getAttribute('data-mode') ?? 'light');
		sync();
		const obs = new MutationObserver(sync);
		obs.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
		return () => obs.disconnect();
	}, []);

	// ── Deck theme independence ──────────────────────────────────────────────
	// The top-bar/Inspector palette picker is the WEBSITE theme — it tints the
	// Studio chrome and any deck that declares no `theme:` of its own. A deck that
	// DOES carry `theme:` front matter owns its palette: it renders in that theme
	// regardless of the website picker, and flipping the picker never restyles it.
	// Mode (light/dark) stays a shared axis, except an explicit deck-dark pin
	// (`class: dark`, a `-dark` theme) wins over the site mode. resolveDeckTheme
	// (deck-theme.ts) is the one place that precedence lives; here we map its result
	// onto DeckPreview/Present's paletteOverride / extraTheme / modeOverride props.
	const preview = React.useMemo(() => {
		const isKnownTheme = (n: string) => BUILTIN_PALETTES.includes(n) || savedThemes.some((t) => t.name === n);
		const r = resolveDeckTheme(source, { sitePalette: palette, siteMode: mode === 'dark' ? 'dark' : 'light', isKnownTheme });
		const modeOverride = pinnedMode(r);
		if (r.fromDeck) {
			// The deck names its own theme — pin the preview to it. A deck theme that
			// names a saved (Fabricated) library theme needs its CSS registered, so
			// pass it as extraTheme; a built-in is fetched by name (extraTheme none).
			const saved = savedThemes.find((t) => t.name === r.palette);
			return { paletteOverride: r.palette, extraTheme: saved ? { name: saved.name, css: saved.css } : undefined, modeOverride };
		}
		// Un-themed deck → adopt the website palette (the saved-theme CSS path is the
		// existing activeTheme/extraTheme behavior). A `class: dark` on an un-themed
		// deck still pins dark via modeOverride.
		return { paletteOverride: activeTheme?.name, extraTheme, modeOverride };
	}, [source, palette, mode, savedThemes, activeTheme, extraTheme]);

	const slideNo = Math.min(activeSlide, viewSlides.length - 1) + 1;
	// The full-deck index of the slide currently in view (for handing off to Present).
	const activeFullIndex = composeLens === 'full' ? slideNo - 1 : Math.max(0, slides.indexOf(viewSlides[slideNo - 1]));

	// The preview card's aspect follows the deck's selected Size (not a fixed 16:9);
	// portrait shapes bind to height so they fit the pane, landscape to width.
	const previewRatio = sizeRatio(deckSize);
	const previewPortrait = previewRatio[1] > previewRatio[0];
	// When the preview FILLS the pane (Read full-bleed, or editor collapsed) the card
	// must CONTAIN the slide — the whole slide visible, never cropped — not cover the
	// width and clip the slide's header / footer / page number off the top and bottom
	// (the Read bug: a 16:9 slide in a pane wider than 16:9 derived a height taller
	// than the pane). A slide is a fixed-aspect artifact; cropping it hides content.
	// So bind the AXIS that fits: pane wider than the slide → bind height (letterbox
	// the sides); pane taller → bind width (letterbox top/bottom). Measured, because
	// no single static class contains both pane orientations without distorting.
	const previewHolderRef = React.useRef<HTMLDivElement>(null);
	const [previewFitByHeight, setPreviewFitByHeight] = React.useState(true);
	const slideRatio = previewRatio[0] / previewRatio[1];
	React.useEffect(() => {
		const holder = previewHolderRef.current;
		if (!holder) return;
		const measure = () => {
			const cs = getComputedStyle(holder);
			const cw = holder.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
			const ch = holder.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
			if (cw <= 0 || ch <= 0) return;
			setPreviewFitByHeight(cw / ch >= slideRatio);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(holder);
		return () => ro.disconnect();
	}, [slideRatio]);
	// Touch swipe (mobile) + horizontal wheel (trackpad) change the viewed slide.
	// goToSlide(slideNo) is next, goToSlide(slideNo - 2) is prev (both clamp).
	const swipeRef = React.useRef<{ x: number; y: number } | null>(null);
	const wheelAtRef = React.useRef(0);
	const onPreviewTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY }; };
	const onPreviewTouchEnd = (e: React.TouchEvent) => {
		const s = swipeRef.current;
		swipeRef.current = null;
		if (!s) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - s.x;
		// Horizontal intent only — ignore vertical scrolls and small jitters.
		if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(t.clientY - s.y)) return;
		goToSlide(dx < 0 ? slideNo : slideNo - 2);
	};
	const onPreviewWheel = (e: React.WheelEvent) => {
		if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // horizontal only
		const now = Date.now();
		if (now - wheelAtRef.current < 400) return; // debounce a continuous trackpad swipe
		wheelAtRef.current = now;
		goToSlide(e.deltaX > 0 ? slideNo : slideNo - 2);
	};

	// ── The ONE shared preview: inputs + positioning controller ───────────────────
	// The single hoisted DeckPreview renders EITHER the editor's cursor slide OR (when
	// Present is open and showable) Present's current slide — one warm iframe, never a
	// second cold write on Present open. `mermaid` is unified to the SHOWN slide on both
	// surfaces so the frame signature matches across the editor↔Present hand-off.
	const editorSample = previewFm ? previewFm + slide : slide;
	const editorMermaid = hasMermaid(slide);
	const presentShowing = presentOpen && presentPreview !== null;
	const sharedSample = presentShowing ? (presentPreview as { sample: string }).sample : editorSample;
	const sharedMermaid = presentShowing ? (presentPreview as { mermaid: boolean }).mermaid : editorMermaid;
	// Render (keep warm) whenever a surface may need it — Present, mobile (both panes stay
	// mounted), Read full-bleed, or the desktop/tablet preview pane while it isn't
	// collapsed. Parked warm (active=false, iframe kept) only in Fabricate when not
	// presenting, so ⌘K→Present from Fabricate resumes as a PATCH, not a cold write.
	const sharedActive = view === 'fabricate' && !presentOpen ? false : presentOpen || mobile || effectiveStop === 'read' || split.collapsed !== 'b';
	// Whether the editor SLOT is on-screen (explicit-visibility model — not DOM occlusion):
	// hidden in Fabricate and on the mobile edit pane (preview stays warm but parked).
	const editorSlotVisible = view !== 'fabricate' && !presentOpen && (mobile ? effPane === 'preview' : effectiveStop === 'read' || split.collapsed !== 'b');
	useSharedPreviewSlot({
		hostRef: sharedHostRef,
		editorSlotRef,
		presentSlotRef,
		rootRef,
		presentActive: presentShowing,
		editorVisible: editorSlotVisible,
		suspended: split.dragging,
	});

	// Structural slide ops (full lens only). Each rewrites the source, moves the
	// active slide to follow the edit, and reveals it in the editor next frame
	// (after the value-sync effect has pushed the new doc into CodeMirror).
	const curIndex = slideNo - 1;
	function applyDeckOp(r: { source: string; active: number }) {
		setSource(r.source);
		setActiveSlide(r.active);
		requestAnimationFrame(() => editorRef.current?.revealSlide(r.active));
	}
	// "Add slide" opens the unified add-slide gallery (its Blank tile keeps a quick blank
	// insert one tap away) — the #1058 "one insert door" — inserting after the current
	// slide, rather than dropping a bare blank with no component choice.
	const opAddSlide = () => setInsertOpen(true);
	const opDuplicate = () => { applyDeckOp(duplicateSlide(source, curIndex)); notify('Slide duplicated.'); };
	const opDelete = () => { if (slides.length <= 1) { notify('A deck needs at least one slide.'); return; } applyDeckOp(deleteSlide(source, curIndex)); notify('Slide deleted.'); };
	const opMove = (dir: -1 | 1) => applyDeckOp(moveSlide(source, curIndex, curIndex + dir));
	// Delete is destructive → confirm in place: first tap ARMS the button (it turns
	// into a confirm), a second tap within 3s deletes; it disarms itself otherwise.
	const [deleteArmed, setDeleteArmed] = React.useState(false);
	React.useEffect(() => {
		if (!deleteArmed) return;
		const t = setTimeout(() => setDeleteArmed(false), 3000);
		return () => clearTimeout(t);
	}, [deleteArmed]);
	// Re-arm fresh for whatever slide is current — never carry an arm across a nav.
	// biome-ignore lint/correctness/useExhaustiveDependencies: disarm on slide change only.
	React.useEffect(() => setDeleteArmed(false), [curIndex]);
	const onDeleteClick = () => {
		if (slides.length <= 1) { notify('A deck needs at least one slide.'); return; }
		if (deleteArmed) { setDeleteArmed(false); opDelete(); }
		else setDeleteArmed(true);
	};
	// Recently-inserted component names (newest first) — pins a Recent band in the
	// gallery for the "I keep reaching for this layout" flow.
	const [recentComponents, setRecentComponents] = React.useState<string[]>([]);
	// Insert a gallery slide as a new slide after the current one (its authored
	// skeleton), via the same deck-op the toolbar uses. Uses the FULL-deck index
	// (`activeFullIndex`), NOT the viewed `curIndex`: `addSlideAfter` splices the full
	// deck array, so under a filtering reader lens the viewed index would land the new
	// slide after the wrong slide. The empty-deck case is handled by addSlideAfter's
	// clamp; a Blank tile carries the NEW_SLIDE body.
	const onInsertComponent = (c: ComponentEntry) => {
		applyDeckOp(addSlideAfter(source, activeFullIndex, c.skeleton));
		notify(`Inserted “${c.name}”.`);
		if (c.bucket) setRecentComponents((r) => [c.name, ...r.filter((n) => n !== c.name)].slice(0, 6));
	};

	// ── Version history (checkpoints) ────────────────────────────────────────
	// Load the active deck's checkpoints when it changes.
	React.useEffect(() => setCheckpoints(loadCheckpoints(deck.id)), [deck.id]);
	const checkpoint = React.useCallback((label: string) => setCheckpoints(saveCheckpoint(deck.id, source, label, Date.now())), [deck.id, source]);
	const saveVersion = () => { checkpoint('Saved version'); notify('Version saved to history.'); };
	function restoreCheckpoint(cp: Checkpoint) {
		// Snapshot the current state first so a restore is itself reversible.
		saveCheckpoint(deck.id, source, 'Before restore', Date.now());
		setSource(cp.source);
		setActiveSlide(0);
		setCheckpoints(loadCheckpoints(deck.id));
		requestAnimationFrame(() => editorRef.current?.revealSlide(0));
		notify('Version restored.');
	}

	// ── Architect body (cards) — shared by the desktop column and the sheet ──
	// Per-slide edits (note + class tokens) commit through ONE funnel: a pure
	// transform applied to the FRESHEST slide chunk via a functional setSource, so a
	// pending editor flush or an AI edit can't land a stale write on the wrong slide.
	// The Inspector's slide scope owns the note + class controls (SlideContextBody).
	const mutateActiveSlide = React.useCallback((fn: (chunk: string) => string) => {
		setSource((s) => {
			const chunk = splitSlides(stripFrontMatter(s))[activeFullIndex];
			return chunk == null ? s : replaceSlide(s, activeFullIndex, fn(chunk)).source;
		});
	}, [activeFullIndex]);
	mutateSlideRef.current = mutateActiveSlide;
	// The panel's slide-scope writes route through the Undo funnel (a user tuning a
	// slide); the demo keeps the plain `mutateActiveSlide` so it never spawns toasts.
	const mutateSlideFromPanel = React.useCallback((fn: (chunk: string) => string) => {
		settingsWrite('This slide', (s) => {
			const chunk = splitSlides(stripFrontMatter(s))[activeFullIndex];
			return chunk == null ? s : replaceSlide(s, activeFullIndex, fn(chunk)).source;
		});
	}, [settingsWrite, activeFullIndex]);

	// Reshape — the current slide's component + the variant LOOKS it offers, for the
	// edit-mode Reshape control (a variant is a class token; recast = swap the token).
	const reshapeAxes = React.useMemo(() => (lintVocab as { exclusiveAxes?: Record<string, string[]> } | null)?.exclusiveAxes ?? {}, [lintVocab]);
	const activeChunk = slides[activeFullIndex] ?? '';
	const reshapeComponent = React.useMemo(() => getClassTokens(activeChunk)[0] ?? '', [activeChunk]);
	const reshapeVariants = React.useMemo(() => components.find((c) => c.name === reshapeComponent)?.variants ?? [], [components, reshapeComponent]);
	const onReshape = (token: string) => mutateSlideFromPanel((c) => applyVariant(c, token, reshapeAxes));

	// Apply an AI chat edit — checkpoint the pre-edit deck first (reversible from
	// History), then swap in the proposed source.
	const applyChatEdit = (next: string) => {
		setCheckpoints(saveCheckpoint(deck.id, source, 'Before AI chat edit', Date.now()));
		setSource(next);
		setActiveSlide(0);
		// The AI edit jumps the preview to the top — reveal a collapsed preview so
		// the applied change is never rendered into a hidden pane (no-op when open).
		splitApiRef.current.expand('b');
		requestAnimationFrame(() => editorRef.current?.revealSlide(0));
	};

	const rankedFindings = rankFindings(findings);
	const shownFindings = rankedFindings.slice(0, 6);
	// A finding is DRAFTABLE when it has no active fix (idle) or a previously-stale one to
	// re-draft — the same set fixAll targets, so the count and the action agree (trio #4).
	const isDraftable = (f: Finding): boolean => {
		const ph = fixStates[keyFor(f)]?.phase;
		return ph === undefined || ph === 'stale';
	};
	// Batch counts (the shown slice): draftable slide-level findings, and reviewed proposals
	// waiting to apply.
	const batchFixable = shownFindings.filter((f) => f.slide && isDraftable(f)).length;
	const proposedCount = Object.values(fixStates).filter((v) => v.phase === 'proposed').length;
	// Honest cost cue — the true per-fix cost scales with the connected model's price AND
	// the deck size (each fix re-sends the whole deck), so derive it from `estimateUsd`
	// like the Chat strip does; never a hard-coded guess (trio Munger #1). No price yet
	// (pre-catalog) → a qualitative cue, never a fake number.
	const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
	const fixEstimate = ai.price ? estimateUsd(source, ai.price, 1024) : null;
	const fixCostLabel = fixEstimate != null ? `Fix ≈ ${usd(fixEstimate)}` : 'Fix · on your key';
	const draftAllLabel = fixEstimate != null ? `Draft all ≈ ${usd(fixEstimate * batchFixable)}` : `Draft all (${batchFixable})`;
	// Freeze the card order while any fix is ACTIVE so an unrelated re-rank (a new
	// higher-severity finding elsewhere) can't move the card you're reviewing out from
	// under you (trio Munger #5). With nothing active, the fresh severity ranking wins.
	const hasActiveFix = Object.values(fixStates).some((v) => v.phase === 'working' || v.phase === 'proposed' || v.phase === 'stale');
	const displayFindings = (() => {
		const keyed = shownFindings.map((f) => ({ f, key: keyFor(f) }));
		if (!hasActiveFix) {
			frozenOrderRef.current = keyed.map((x) => x.key);
			return keyed;
		}
		const order = frozenOrderRef.current;
		const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? order.length : i; };
		return [...keyed].sort((a, b) => rank(a.key) - rank(b.key));
	})();
	const scoreIntent = (band?: string): 'pass' | 'review' | 'fix' | 'info' => (!band ? 'info' : /^A/.test(band) ? 'pass' : /^[BC]/.test(band) ? 'review' : 'fix');
	const runChip = async (id: string) => {
		if (coachCard?.id === id && id !== 'pacing') {
			setCoachCard(null);
			return;
		}
		let card: CoachCard;
		if (id === 'top') card = topFixes(findings);
		else if (id === 'weak') card = weakestSlide(findings);
		else if (id === 'ask') card = await theAsk(source);
		else if (id === 'structure') card = await structureCheck(source);
		else card = await pacing(source, talkMinutes ?? undefined);
		setCoachCard({ id, card });
	};
	const CHIPS: [string, string][] = [
		['top', 'Top fixes'],
		['weak', 'Weakest slide'],
		['structure', 'Structure'],
		['ask', 'The ask'],
		['pacing', 'Pacing'],
	];

	const architectCards = (
		<>
			{issues > 0 && (
				<div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_28%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_7%,transparent)] px-3 py-2">
					<AlertTriangle className="size-4 text-[var(--chart-2,#9c3f00)]" />
					<span className="text-xs font-semibold text-[var(--text-heading)]">{issues} inline issue{issues > 1 ? 's' : ''}</span>
					<button type="button" onClick={() => editorRef.current?.fixAll()} className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">Fix all</button>
				</div>
			)}
			{/* Deck-level assessment — the REAL engine scorecard (grade + per-dimension read),
			    replacing the toy heuristic. Never a fabricated grade for an empty deck (K1). */}
			<ArchCard tag={<IntentTag intent={scoreIntent(scorecard?.band)} />} title="Board readiness">
				{!deckHasContent ? (
					<p className="text-xs leading-relaxed text-muted-foreground">Add a slide or two and I’ll assess the deck — a grade, a per-dimension read, and the fixes that matter most. No grade is shown for an empty deck.</p>
				) : assessing && !scorecard ? (
					<div className="space-y-2" role="status" aria-label="Assessing">
						<div className="h-7 w-16 animate-pulse rounded bg-[var(--bg-alt)]" />
						<div className="h-2 w-full animate-pulse rounded bg-[var(--bg-alt)]" />
						<div className="h-2 w-2/3 animate-pulse rounded bg-[var(--bg-alt)]" />
					</div>
				) : scorecard ? (
					<>
						<div className="flex items-baseline gap-2">
							<span className="font-sans text-[30px] font-extrabold leading-none" style={{ color: scoreIntent(scorecard.band) === 'fix' ? 'var(--fail,#b3261e)' : 'var(--text-heading)' }}>{scorecard.band}</span>
							<span className="text-[15px] font-semibold text-[var(--text-heading)]">{Math.round(scorecard.overall)}<span className="text-[13px] font-normal text-muted-foreground"> / 100</span></span>
						</div>
						<div className="mt-2.5 space-y-2">
							{scorecard.categories.map((c) => (
								<div key={c.key} className="text-xs">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[var(--text-body)]">{c.label}</span>
										<span className="tabular-nums text-muted-foreground">{c.na ? 'n/a' : Math.round(c.score ?? 0)}</span>
									</div>
									{!c.na && (
										<div className="mt-0.5 h-[4px] overflow-hidden rounded-full bg-border">
											<span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, c.score ?? 0))}%` }} />
										</div>
									)}
									{(c.na || (c.score ?? 100) < 85) && c.notes[0] && <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{c.notes[0]}</p>}
								</div>
							))}
						</div>
						<p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground">Live · deterministic — checks authoring hygiene (structure, clarity, contract). It can’t judge whether your argument or numbers will persuade. Free.</p>
					</>
				) : (
					<p className="text-xs text-muted-foreground">Assessment unavailable right now.</p>
				)}
			</ArchCard>
			{/* Deterministic quick reads — chips → one result card. Instant, free, no model. */}
			<ArchCard tag={<IntentTag intent="info" label="QUICK READS" />} title="Ask the deck">
				<div className="flex flex-wrap gap-1.5">
					{CHIPS.map(([id, label]) => (
						<button key={id} type="button" onClick={() => runChip(id)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors', coachCard?.id === id ? 'border-transparent bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]')}>
							{label}
						</button>
					))}
				</div>
				<p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-widest text-[var(--chart-3,#2e6f00)]">Free · no model</p>
				{coachCard && (
					<div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[12px] font-semibold text-foreground">{coachCard.card.title}</span>
							<button type="button" onClick={() => setCoachCard(null)} aria-label="Close"><X className="size-3 text-muted-foreground" /></button>
						</div>
						<ul className="mt-1 space-y-1 text-[11.5px] leading-snug text-muted-foreground">
							{coachCard.card.body.map((b, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static result-card lines.
								<li key={i}>{b}</li>
							))}
						</ul>
						{coachCard.card.needMinutes && (
							<div className="mt-1.5 flex items-center gap-1.5">
								<input
									type="number"
									min={1}
									placeholder="minutes"
									aria-label="Talk length in minutes"
									className="w-20 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-[var(--accent)]"
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											const v = Number((e.target as HTMLInputElement).value);
											if (v > 0) {
												setTalkMinutes(v);
												pacing(source, v).then((card) => setCoachCard({ id: 'pacing', card }));
											}
										}
									}}
								/>
								<span className="text-[10.5px] text-muted-foreground">↵ your talk length</span>
							</div>
						)}
						{coachCard.card.jump ? (
							<button type="button" onClick={() => editorRef.current?.revealSlide((coachCard.card.jump as number) - 1)} className="mt-1.5 text-[11px] font-semibold text-[var(--accent)]">
								Jump to slide {coachCard.card.jump} →
							</button>
						) : null}
					</div>
				)}
			</ArchCard>
			{/* Slide-level findings — severity-ranked full-width cards; per-finding AI fix
			    cycles IN the pill then splits into Apply / Discard, the diff below. */}
			{rankedFindings.length > 0 && (
				<ArchCard tag={<IntentTag intent={rankedFindings.some((f) => f.severity === 'error') ? 'fix' : 'review'} label="FINDINGS" />} title={`${rankedFindings.length} to address`}>
					<p className="text-xs leading-relaxed text-muted-foreground">Ranked by severity. {ai.ready ? 'Fix one with AI — review the diff before it lands (spends on your key; billed to generate, not to apply).' : 'Connect a model in Workspace to fix these with AI.'}</p>
					{/* Batch actions — DRAFT every fixable finding, or apply the reviewed proposals
					    at once. Never a blind apply-all: "Draft all" only drafts (each still gets a
					    reviewable diff); it's named for what it does so draft→review→apply reads off
					    the labels. Each shows only when it beats the single-card pills (2+ to act on). */}
					{ai.ready && (batchFixable > 1 || proposedCount > 1) && (
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							{batchFixable > 1 && (
								<button type="button" onClick={fixAll} disabled={fixingAll} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] disabled:opacity-60">
									{fixingAll ? <Sparkles className="size-3 animate-pulse" /> : null}
									{fixingAll ? 'Drafting…' : draftAllLabel}
								</button>
							)}
							{proposedCount > 1 && (
								<button type="button" onClick={applyAll} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--on-accent)]">
									<Check className="size-3" />
									Apply all ({proposedCount})
								</button>
							)}
						</div>
					)}
					<ul className="mt-2 list-none space-y-2 pl-0">
						{displayFindings.map(({ f, key }) => (
							<FindingCard
								key={key}
								finding={f}
								state={fixStates[key]}
								canFix={ai.ready && !!f.slide}
								costLabel={fixCostLabel}
								onFix={() => fixFinding(f, key)}
								onApply={() => applyFixKey(key)}
								onDiscard={() => discardFix(key)}
							/>
						))}
					</ul>
					{rankedFindings.length > 6 && <p className="mt-2 text-[11px] text-muted-foreground">+{rankedFindings.length - 6} more — the editor underlines them all.</p>}
				</ArchCard>
			)}
		</>
	);

	// Lenses (reader views) is its OWN first-class panel now — a launcher peer of the
	// Architect, not a tab inside the AI coach. It's a deterministic membership +
	// approval workflow, so it doesn't belong under a Sparkles/AI-branded panel.
	const lensesBody = (
		<div className="min-h-0 flex-1 overflow-y-auto p-2.5 min-w-0 overscroll-contain [touch-action:pan-y]">
			<LensesPanel
				slides={slides}
				registry={lensReg}
				catalog={lensCatalog}
				activeLens={composeLens}
				workspace={wsLenses}
				onPreview={(id) => { setLens(id); notify(`Preview → ${lensReg.lenses.find((l) => l.id === id)?.label ?? id}`); }}
				onWriteRegistry={writeRegistry}
				onTag={writeTags}
				onRemoveLens={removeLensWrite}
			/>
		</div>
	);

	// Coach and Chat are two SEPARATE panels — the deterministic assessment and the
	// AI conversation have nothing to do with each other, so each gets its own toolbar
	// icon + drawer (no tab-switching cognitive load). Reader-views (Lenses) + Library
	// are their own panels too; all share the one mutually-exclusive assistant slot.
	const coachBody = <div className="flex min-h-0 flex-1 flex-col overflow-y-auto min-w-0 overscroll-contain [touch-action:pan-y]">{architectCards}</div>;
	const chatBody = <ArchitectChat deckId={deck.id} source={source} aiReady={ai.ready} onApply={applyChatEdit} onConnect={() => setWorkspaceOpen(true)} onManageDocs={() => { setLibInitialFilter('refdoc'); setLibraryOpen(true); }} notify={notify} />;

	// ── Inspector body (groups) — shared by the desktop column and the sheet ──
	const inspectorBody = (
		<div className="space-y-3 pt-1">
			<PillTabs tabs={DECK_TABS} value={deckTab} onValueChange={(v) => setDeckTab(v as DeckTab)} ariaLabel="Deck settings sections" />
			{deckTab === 'look' && (
			<div>
				<p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">The deck's identity — language, palette, light or dark, size, and surface.</p>
				<Field label="Language" desc="This deck's language — its document language (carried into every export and read-aloud) and the language the AI writes its content in. “Auto” (the link icon) inherits the workspace default; pick one to pin it to the deck. English only for now.">
					<LanguageSelect
						value={deckLang || LANG_AUTO}
						ariaLabel="Choose deck language"
						includeAuto
						autoLabel={`Automatic — ${langDisplay(workspaceLang)}`}
						onValueChange={setDeckLang}
					/>
				</Field>
				<Field label="Theme" desc="This deck's color palette. “Auto” (the link icon) follows the website theme; pick one to pin it to the deck (saved with the deck, kept when the site theme changes).">
					<CatalogSelect
						ariaLabel="Choose deck theme"
						swatchShape="round"
						className="min-w-[116px]"
						value={deckThemeBase || '__auto__'}
						onValueChange={(v) => setDeckTheme(v === '__auto__' ? null : v)}
						groups={[{ options: [{ value: '__auto__', label: AUTO_LABEL, icon: <AutoIcon />, title: 'Automatic — follow the website theme (no theme pinned to the deck).' }] }, ...themeSelectGroups(savedMenu)]}
					/>
					{savedThemes.length > 0 && (
						<div className="mt-2 space-y-0.5">
							<div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Manage saved</div>
							{savedThemes.map((t) => (
								<div key={t.id} className="group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-[var(--accent-soft)]">
									<span className="size-3 shrink-0 rounded-full border border-border" style={{ background: t.essentials?.accent ?? 'var(--accent)' }} />
									<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-heading)]">{t.label}</span>
									<button type="button" onClick={() => removeTheme(t)} aria-label={`Delete ${t.label}`} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-[var(--fail,#b3261e)] group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
								</div>
							))}
						</div>
					)}
				</Field>
				<Field label="Color mode" desc="The mode the deck opens in, everywhere it's rendered. Light or Dark pin it; System follows the viewer's OS; “Match site” adopts the host (the website toggle here, the OS in a shared file). Theme default uses the theme's own mode.">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Control aria-label="Choose deck color mode"><span className="flex min-w-0 items-center gap-2">{COLOR_MODE_META[deckColorMode].icon}<span className="truncate">{COLOR_MODE_META[deckColorMode].label}</span></span> <ChevronDown className="size-3.5" /></Control>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							{(['default', 'light', 'dark', 'system', 'inherited', 'print'] as const).map((v) => (
								<DropdownMenuItem key={v} onSelect={() => setDeckColorMode(v)} className="gap-2">{COLOR_MODE_META[v].icon}{COLOR_MODE_META[v].label}{deckColorMode === v && <Check className="ml-auto size-3.5 text-[var(--accent)]" />}</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</Field>
				<Field label="Size" desc="The slide shape and dimensions (16:9, A4, …).">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Control>{SIZE_LABELS[deckSize] ?? deckSize} <ChevronDown className="size-3.5" /></Control>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							{SIZES.map((s) => (
								<DropdownMenuItem key={s.value} onSelect={() => setDeckSize(s.value)}>{s.label}{deckSize === s.value && <span className="ml-auto text-[var(--accent)]">✓</span>}</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</Field>
				<Field label="Mode" desc="The rendering style — boardroom (crisp) or sketch (hand-drawn). Separate from Finish; the two combine.">
						{/* The rendering MODE (boardroom / sketch) — a separate axis from Finish
						    (the backdrop). The two compose. Front-matter key `mode:` (Marp already
						    owns `style:` for inline CSS, so the axis is named "mode"). */}
						<CatalogSelect ariaLabel="Choose mode" value={activeMode(renderMode).name} onValueChange={setRenderMode} className="min-w-[116px]" groups={[{ options: catalogOptions(MODES) }]} />
					</Field>
				<Field label="Finish" desc="A backdrop texture applied to every slide — a soft gradient, wash, or grain behind the content.">
						<CatalogSelect
							ariaLabel="Choose finish"
							value={activeSavedFinish ? `finish-${activeSavedFinish.name}` : activeFinish(finish).name}
							onValueChange={setFinish}
							className="min-w-[116px]"
							groups={finishSelectGroups({
								heads: [{ value: 'none', label: 'None', swatch: finishSwatchFor('none') }],
								saved: savedFinishMenu,
								savedValue: (n) => `finish-${n}`,
							})}
						/>
					</Field>
					{savedFinishes.length > 0 && (
						<div className="mt-2 space-y-0.5">
							<div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Manage saved finishes</div>
							{savedFinishes.map((f) => (
								<div key={f.id} className="group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-[var(--accent-soft)]">
									<span className="size-3 shrink-0 rounded-[3px] border border-border" style={{ ...finishSwatch(f.recipe) }} />
									<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-heading)]">{f.label}</span>
									<button type="button" onClick={() => removeFinish(f)} aria-label={`Delete ${f.label}`} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-[var(--fail,#b3261e)] group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
								</div>
							))}
						</div>
					)}
					{/* Card lift — the opt-in "Struck" elevation. A deck-wide surface toggle
					    alongside Finish; per-slide `_class: lifted`/`flat` override. */}
					<Field label="Card lift" desc="Lift card surfaces off the slide with a subtle shadow — reads in light & dark, safe in the PDF export."><Toggle label="Card lift" on={lift} onClick={toggleLift} /></Field>
			</div>
			)}
			{deckTab === 'brand' && (
			<div>
				<p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">Where your accent shows — the brand bar, card rails, structural trim, and heading marks. Set the theme accent to a client's brand and everything here follows, white-labeling the deck.</p>
					<Field label="Brand bar" desc="The colored strip along each slide's top edge. Set Solid to a client's brand color to white-label the deck.">
							{/* The white-label spectrum — the rainbow bar on the top border / divider
							    rail. `spectrum:` register: Rainbow (default) / None / Solid accent. Set
							    the theme accent to a client's brand and Solid follows. */}
							<CatalogSelect ariaLabel="Choose brand bar" value={activeSpectrum(spectrum).name} onValueChange={setSpectrum} className="min-w-[116px]" groups={[{ options: catalogOptions(SPECTRA) }]} />
						</Field>
						{/* The accent sub-family (spectrum siblings + heading rule + eyebrow). Each reads
						    the shared --spectrum token where relevant, so it follows the Brand bar style. */}
						<Field label="Bar placement" desc="Which edge the brand bar sits on — top (default), left, right, bottom, or off. Off drops only the bar; table rails and rules keep their color.">
							<CatalogSelect ariaLabel="Choose bar placement" value={activeSpectrumEdge(spectrumEdge).name} onValueChange={setSpectrumEdge} className="min-w-[116px]" groups={[{ options: catalogOptions(SPECTRUM_EDGES) }]} />
						</Field>
						<Field label="Card rail" desc="A spectrum rail on card surfaces, tunable independently of the Brand bar. Off by default; Auto follows the bar, or pin Solid / Duo / Mono / Rainbow.">
							<CatalogSelect ariaLabel="Choose card rail" value={activeSpectrumCard(spectrumCard).name} onValueChange={setSpectrumCard} className="min-w-[116px]" groups={[{ options: catalogOptions(SPECTRUM_CARDS) }]} />
						</Field>
						{spectrumCard !== 'off' && (
							<Field label="Card rail placement" desc="Which edge of each card the rail sits on — left (default), top, right, or bottom.">
								<CatalogSelect ariaLabel="Choose card rail placement" value={activeSpectrumCardEdge(spectrumCardEdge).name} onValueChange={setSpectrumCardEdge} className="min-w-[116px]" groups={[{ options: catalogOptions(SPECTRUM_CARD_EDGES) }]} />
							</Field>
						)}
						<Field label="Structural trim" desc="Whether the spectrum flows onto the in-content accents — table rails, the timeline spine, code strips, hr. Quiet by default (a neutral hairline); the spectrum stays on the brand bar.">
							<CatalogSelect ariaLabel="Choose structural trim" value={activeSpectrumTrim(spectrumTrim).name} onValueChange={setSpectrumTrim} className="min-w-[116px]" groups={[{ options: catalogOptions(SPECTRUM_TRIMS) }]} />
						</Field>
						<Field label="Heading rule" desc="The underline beneath a slide's heading — a full hairline, a short rule, an accent segment, or none.">
							<CatalogSelect ariaLabel="Choose heading rule" value={activeRule(headingRule).name} onValueChange={setHeadingRule} className="min-w-[116px]" groups={[{ options: catalogOptions(RULES) }]} />
						</Field>
						<Field label="Eyebrow" desc="The mark on the mono-caps kicker above a heading — a dot, a bar, an arrow, an underline, or plain.">
							<CatalogSelect ariaLabel="Choose eyebrow" value={activeEyebrow(eyebrow).name} onValueChange={setEyebrow} className="min-w-[116px]" groups={[{ options: catalogOptions(EYEBROWS) }]} />
						</Field>
			</div>
			)}
			{deckTab === 'marks' && (
			<div>
				<p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">The header, footer, page number, and section rail — the marks that repeat across slides.</p>
					<TextRow label="Header" desc="The line along the top — a deck title or client name. Blank hides it." value={headerText} placeholder={`e.g. ${deck.title}`} onCommit={setHeaderText} />
					<TextRow label="Footer" desc="The line along the bottom — a confidentiality or source line. Blank hides it." value={footerText} placeholder="e.g. Confidential" onCommit={setFooterText} />
					<Field label="Page numbers"><Toggle label="Page numbers" on={pageNumbers} onClick={togglePageNumbers} /></Field>
					<Field label="Section rail" desc="Show the progress dots that track position through the deck."><Toggle label="Section rail" on={deckRail} onClick={toggleDeckRail} /></Field>
			</div>
			)}
			{deckTab === 'speech' && (
			<div>
				<p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">Teach read-aloud how to say tricky words, symbols, and acronyms — carried into the deck and its captions.</p>
			<InspGroup icon={<Volume2 className="size-3.5" />} label="Lexicon" desc="A tricky word or symbol to say a certain way, or to silence. Overrides the built-in symbol commons.">
				<LexiconEditor lexicon={lexicon} onChange={setLexicon} />
			</InspGroup>
			<InspGroup icon={<BookMarked className="size-3.5" />} label="Acronyms" desc="A term's spoken expansion (and an optional glossary definition) — e.g. EBITDA → “ee bit dah”." last>
				<AcronymEditor acronyms={acronyms} onChange={setAcronyms} />
			</InspGroup>
			</div>
			)}
			{/* Developer — the two preview-only authoring aids. NOT a pill tab (A.1): they're
			    the lowest-reach controls and don't belong in a strip you scan for deck styling.
			    A collapsed footer disclosure keeps them reachable without a fifth pill. */}
			<details className="mt-1 border-t border-border pt-2">
				<summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-[var(--text-heading)]">Developer</summary>
				<p className="mb-2.5 mt-2 text-[11px] leading-snug text-muted-foreground">Aids while you write. Preview-only — none of this appears in the export.</p>
				<Field label="Inline validation" desc="Flags unknown components in the editor as you type."><Toggle label="Inline validation" on={validation} onClick={() => { setValidation((v) => { notify(v ? 'Inline validation off — the editor stops flagging components.' : 'Inline validation on — unknown components are flagged again.'); return !v; }); }} /></Field>
				{/* Debug overlay — outlines every box by layout mode and labels the
				    structural ones on hover; `always` pins them. A deck setting (`debug:`
				    front matter), preview-only, stripped from every export.
				    engineering/decisions/2026-07-01-debug-bounding-boxes.md */}
				<Field label="Debug overlay" desc="Outlines every layout box for debugging. Preview-only — stripped from every export.">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Control aria-label="Debug overlay">{debugLabel} <ChevronDown className="size-3.5" /></Control>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							{DEBUG_OPTIONS.map((o) => (
								<DropdownMenuItem key={o.label} onSelect={() => setDebug(o.value)}>
									{o.label}
									{debugLabel === o.label && <span className="ml-auto text-[var(--accent)]">✓</span>}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</Field>
			</details>
		</div>
	);

	// The Inspector's scope-switch + active body — shared by the desktop/tablet
	// column AND the mobile Sheet (one source of truth; HARD RULE #15). The wrapper
	// (an <aside> on desktop, a <Sheet> on mobile) differs; the innards do not.
	const inspectorScopeContent = (
		<>
			{/* Scope switch on tablet + mobile: a Slide-first segment. On desktop the
			    activity bar's Slide/Deck icons ARE the switch, so no in-panel segment. */}
			{compact && (
				<div className="flex gap-1 border-b border-border p-2">
					{([{ k: 'slide', label: 'Slide' }, { k: 'deck', label: 'Deck' }] as const).map(({ k, label }) => (
						<button key={k} type="button" aria-pressed={inspectorScope === k} aria-label={k === 'slide' ? 'Slide scope' : 'Deck scope'} onClick={() => setInspectorScope(k)} className={cn('flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors', inspectorScope === k ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-[var(--text-heading)]')}>{label}</button>
					))}
				</div>
			)}
			{/* Scope echo — ONE persistent live region: the node stays mounted across a
			    deck↔slide switch and only its inner content/color swaps, so a screen reader
			    reliably announces every scope change AND slide-nav change. (Two separate
			    aria-live nodes — one per branch — would each be freshly INSERTED on a switch,
			    which most screen readers don't announce.) */}
			<div role="status" aria-live="polite" className="border-b border-border px-3.5 py-2.5" style={{ background: inspectorScope === 'deck' ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--warn, #9a6a00) 12%, transparent)' }}>
				{inspectorScope === 'deck' ? (
					<>
						<div className="flex items-center gap-2">
							<SlidersHorizontal className="size-4 text-[var(--accent)]" />
							<span className="text-[13px] font-bold text-[var(--accent)]">Editing the whole deck</span>
							<span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">Deck-wide</span>
							{!mobile && <Tip label="Close settings"><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Collapse settings" className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"><X className="size-4" /></button></Tip>}
						</div>
						<p className="mt-1 text-[11px] leading-snug text-muted-foreground">Every change here applies to all {slides.length} slides — each inherits it.</p>
					</>
				) : (
					<>
						<div className="flex items-center gap-2">
							<FileSliders className="size-4" style={{ color: 'var(--warn, #9a6a00)' }} />
							<span className="text-[13px] font-bold" style={{ color: 'var(--warn, #9a6a00)' }}>Editing Slide {activeFullIndex + 1} only</span>
							<span className="ml-auto rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ background: 'color-mix(in srgb, var(--warn, #9a6a00) 16%, transparent)', color: 'var(--warn, #9a6a00)' }}>Override</span>
							{!mobile && <Tip label="Close settings"><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Collapse settings" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-[var(--text-heading)]"><X className="size-4" /></button></Tip>}
						</div>
						<p className="mt-1 text-[11px] leading-snug text-muted-foreground">Overrides the deck for this slide — blank inherits.</p>
					</>
				)}
			</div>
			{inspectorScope === 'deck' ? (
				<div className="flex-1 space-y-0 overflow-y-auto px-3.5 pb-4 min-w-0 overscroll-contain [touch-action:pan-y]">{inspectorBody}</div>
			) : (
				<SlideContextBody open deckId={deck.id} chunk={slides[activeFullIndex] ?? ''} source={source} slideNumber={activeFullIndex + 1} lintVocab={lintVocab} catalog={components} savedFinish={savedFinishMenu} onMutate={mutateSlideFromPanel} />
			)}
		</>
	);

	// ── Editor pane — shared by all breakpoints ──────────────────────────────
	// The old `md:border-r` divider is gone: the SplitHandle's border-l IS the
	// single line between the panes now (decision §2 — never a doubled line).
	// The section is a size container so its header labels collapse with the
	// PANE's width (a user-narrowed editor at a wide viewport), not the viewport;
	// collapsed → inert (width 0, content unfocusable) while staying mounted so
	// CodeMirror history survives.
	const editorPane = (
		<section
			id="studio-pane-editor"
			// Non-interactive whenever the editor is collapsed to 0px — the split's
			// preview-only state, OR the Read stop (editor mounted at 0px for no-remount).
			// Without this, a keyboard / screen-reader user could Tab into an invisible
			// editable region in the newcomer's first view (M3 Munger a11y finding).
			inert={!mobile && (effectiveStop === 'read' || split.collapsed === 'a') ? true : undefined}
			className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity [container-type:inline-size] group-data-[split-collapsed=a]/split:hidden group-data-[split-dragging]/split:select-none"
		>
			{/* The EDIT toolbar band — HIDDEN on mobile (its actions move to the ⋯ menu below), so
			    the phone rests at two bands, not three. Desktop/tablet keep it. */}
			{!mobile && (
			<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				Edit
				<span className="flex-1" />
				{issues > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 font-sans text-[11px] font-semibold normal-case tracking-normal text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues} issue{issues > 1 ? 's' : ''}</span>}
				{hasSelection && (
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button type="button" disabled={refineBusy} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40" aria-label="Refine selection"><Wand2 className="size-3" /><span className="hidden @[36rem]:inline">Refine</span></button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent>Refine selection</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" className="w-60">
							{ai.ready ? (
								<>
									<DropdownMenuLabel>Refine selection with AI</DropdownMenuLabel>
									{(REFINE_ACTIONS as { id: RefineActionId; label: string; hint: string }[]).map((a) => (
										<DropdownMenuItem key={a.id} onSelect={() => refine(a.id, a.label)} className="flex items-baseline gap-2">
											<span className="font-semibold text-foreground">{a.label}</span>
											<span className="ml-auto truncate font-sans text-[11px] normal-case tracking-normal text-muted-foreground">{a.hint}</span>
										</DropdownMenuItem>
									))}
								</>
							) : (
								<DropdownMenuItem onSelect={() => setWorkspaceOpen(true)} className="gap-2"><Sparkles className="size-3.5 text-[var(--accent)]" />Connect a model to refine →</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{insertComponents.length > 0 && <Tip label="Insert component"><button type="button" onClick={() => setInsertOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)]" aria-label="Insert component"><Plus className="size-3" /><span className="hidden @[36rem]:inline">Insert</span></button></Tip>}
				{reshapeVariants.length > 0 && <ReshapePicker chunk={activeChunk} variants={reshapeVariants} axes={reshapeAxes} options={options} frontMatter={previewFm} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} onReshape={onReshape} />}
				<Tip label="Fix all issues"><button type="button" onClick={() => editorRef.current?.fixAll()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] disabled:opacity-40" disabled={!issues} aria-label="Fix all issues"><ListChecks className="size-3" /><span className="hidden @[36rem]:inline">Fix all</span></button></Tip>
				{/* Version history — deck-level recovery, docked in the editor header at every
				    width (an action, not a panel; not in the top nav). */}
				<Tip label="Version history — save & restore snapshots"><Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(true)} aria-label="Version history"><History className="size-[18px]" /></Button></Tip>
				{/* Slide-settings launcher — on DESKTOP the activity bar's Slide icon owns this
				    (a duplicate here would break the e2e strict 'Slide settings' locator); on
				    tablet/mobile the editor header is the opener. */}
				{compact && <Tip label="Slide settings — look, status, chrome, notes"><Button variant="ghost" size="icon-sm" onClick={() => { setInspectorScope('slide'); setInspectorOpen(true); }} aria-label="Slide settings"><FileSliders className="size-[18px]" /></Button></Tip>}
				{/* Editing-mode toggle: markdown source ⟷ rich Compose. Both bind to `source`. */}
				<div className="ml-0.5 inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
					<button type="button" aria-label="Markdown source" onClick={() => setEditMode('markdown')} aria-pressed={editMode === 'markdown'} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal transition-colors', editMode === 'markdown' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')}><FileText className="size-3" /><span className="hidden @[34rem]:inline">Markdown</span></button>
					<button type="button" aria-label="Compose — rich editor" onClick={() => setEditMode('compose')} aria-pressed={editMode === 'compose'} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal transition-colors', editMode === 'compose' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')}><Sparkles className="size-3" /><span className="hidden @[34rem]:inline">Compose</span></button>
				</div>
				{splitUsable && (
					<Tip label="Collapse editor — or drag the divider past its minimum"><Button variant="ghost" size="icon-sm" aria-label="Collapse editor" onClick={() => collapseFromHeader('a')}><PanelLeftClose className="size-4" /></Button></Tip>
				)}
			</div>
			)}
			{editMode === 'compose' ? (
				<ComposeView source={source} onChange={setSource} resetKey={deck.id} className="flex-1" visible={mobile ? effPane === 'edit' : !(effectiveStop === 'read' || split.collapsed === 'a')} onTypingCollapse={mobile ? setChromeCollapsed : undefined} onOpenSlideSettings={openSlideSettings} slideHeadings={slideHeadings} onInsertBelow={openInsertAfter} />
			) : (
				<React.Suspense fallback={<EditorSkeleton />}>
					<Editor ref={editorRef} value={source} onChange={setSource} knownComponents={validation ? knownWithLocal : NO_KNOWN} completionComponents={insertComponents} completionFinishValues={editorFinishValues} completionFinishClasses={editorFinishClasses} completionPalettes={editorPalettes} lintVocab={lintVocab} extraComponentNames={localNames} onCursorSlide={onEditorCursorSlide} onSelectionChange={setHasSelection} className="flex-1" />
				</React.Suspense>
			)}
		</section>
	);

	// ── Preview pane (live engine render) — shared by all breakpoints ────────
	// Collapsed → inert AND DeckPreview `active=false` below: per-keystroke
	// renders defer while hidden and ONE render fires on the expand rising edge
	// (the shipped DeckPreview contract), so nothing renders into a 0-width frame.
	// Chromeless = strip the pane to just the slide. True at the Read stop (the newcomer's
	// full-bleed read) AND on an iPhone in landscape (the "cinema" morph — see the body
	// branch below), where the slide fills the frame and swipe is the only verb.
	const previewChromeless = effectiveStop === 'read' || landscapePhone;
	const previewPane = (
		<section
			id="studio-pane-preview"
			inert={!mobile && split.collapsed === 'b' && effectiveStop !== 'read' ? true : undefined}
			className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity group-data-[split-collapsed=b]/split:hidden group-data-[split-dragging]/split:select-none"
		>
			{/* At the Read stop the preview is the whole surface — strip its editorial
			    chrome (header, lens, slide counter, the Collapse trap, the op rail, the
			    debug footer) so it reads as "just the slides" (M3 red-team). Only the
			    live deck + the "Edit this slide" overlay remain. */}
			{!previewChromeless && (
			<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				Preview
				{/* View — the reader lens (shared LensPicker, also used in Present). It
				    filters the PREVIEW; the source stays whole. Labeled at every width. */}
				<LensPicker value={composeLens} onChange={setLens} count={viewSlides.length} total={slides.length} align="start" lenses={composeLensEntries} onAddView={() => { revealBuildDock(); setLensesOpen(true); notify('Reader views live in the Lenses panel — add one there.'); }} />
				{composeLens !== 'full' && (
					<Tip label="Clear reader lens"><button type="button" onClick={() => setLens('full')} className="rounded-full p-0.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Clear reader lens"><X className="size-3.5" /></button></Tip>
				)}
				<span className="flex-1" />
				<button type="button" onClick={() => goToSlide(slideNo - 2)} className="rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Previous slide">‹</button>
				<span className="rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--text-heading)]">Slide {slideNo} / {viewSlides.length}</span>
				<button type="button" onClick={() => goToSlide(slideNo)} className="rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Next slide">›</button>
				{splitUsable && (
					<Tip label="Collapse preview — or drag the divider past its minimum"><Button variant="ghost" size="icon-sm" aria-label="Collapse preview" onClick={() => collapseFromHeader('b')}><PanelRightClose className="size-4" /></Button></Tip>
				)}
			</div>
			)}
			{/* Swipe (touch) + horizontal-wheel (trackpad) change slides; the card's
			    aspect ratio follows the deck's selected Size, not a fixed 16:9. */}
			<div ref={previewHolderRef} className={cn('flex min-h-0 flex-1 items-center justify-center overflow-hidden', landscapePhone ? 'bg-muted px-0 py-3' : 'bg-card p-4 sm:p-5')} onTouchStart={onPreviewTouchStart} onTouchEnd={onPreviewTouchEnd} onWheel={onPreviewWheel}>
				{/* pointer-events-none so a swipe over the slide (an engine iframe, which
				    would otherwise swallow the touch) reaches the swipe container. The debug
				    overlay's press-and-hold rides a parent-hosted capture surface layered
				    ABOVE this (debug-overlay.js), so it works regardless of this rule. */}
				{/* The 760px comfort cap LIFTS while the editor is collapsed — otherwise
				    "collapse editor" delivers the same-size slide in a sea of gutter
				    (decision §5; landscape only — portrait binds to height already). */}
				<div ref={previewBoxRef} className={cn('pointer-events-none relative overflow-hidden bg-background',
					// On an iPhone in landscape the slide is the whole show — drop the card border
					// + shadow, but KEEP `rounded-xl` so this backing box matches the live iframe's
					// own `rounded-xl` corners (a square backing pokes its dark corners past the
					// slide's rounded ones — the "notch" artifact). Elsewhere keep the full card.
					landscapePhone ? 'rounded-xl' : 'rounded-xl border border-border shadow-[0_8px_24px_rgba(10,22,40,.10)]',
					// Fill cases (Read full-bleed, cinema, or editor collapsed) CONTAIN via the
					// measured axis so the whole slide shows, uncropped. Otherwise the pane is
					// width-bound with the 760px comfort cap (portrait binds to height).
					// A landscape PHONE viewport is always wider than a 16:9 slide, so height
					// always binds — force fit-by-height there rather than trusting the measured
					// axis (which raced stale and left the slide width-bound = too tall).
					split.collapsed === 'a' || previewChromeless
						? (previewFitByHeight || landscapePhone ? 'h-full w-auto' : 'h-auto w-full')
						: previewPortrait ? 'h-full w-auto' : 'h-auto w-full max-w-[760px]')}
					style={{ aspectRatio: `${previewRatio[0]} / ${previewRatio[1]}` }}>
					{/* Empty SLOT — the ONE shared preview (hoisted at the studio root) is positioned
					    to overlay this box; the iframe never lives here (moving it would reload it). */}
					<div ref={editorSlotRef} className="size-full" />
				</div>
			</div>
			{/* Slide navigator — jump to any slide, see its component type. Dropped in the
			    cinema morph (iPhone landscape): the whisper layer carries position instead. */}
			{!landscapePhone && (
			<div className="flex items-center gap-1.5 border-t border-border bg-background px-3 py-2">
				{composeLens === 'full' && effectiveStop !== 'read' && (
					<div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
						<RailOp label="Add slide" onClick={opAddSlide}><Plus className="size-3.5" /></RailOp>
						<RailOp label="Duplicate slide" onClick={opDuplicate}><Copy className="size-3.5" /></RailOp>
						<RailOp label="Move slide earlier" onClick={() => opMove(-1)} disabled={curIndex <= 0}><ArrowLeftToLine className="size-3.5" /></RailOp>
						<RailOp label="Move slide later" onClick={() => opMove(1)} disabled={curIndex >= slides.length - 1}><ArrowRightToLine className="size-3.5" /></RailOp>
						<RailOp label={deleteArmed ? 'Confirm delete slide' : 'Delete slide'} onClick={onDeleteClick} disabled={slides.length <= 1} danger armed={deleteArmed}>{deleteArmed ? <Check className="size-3.5" /> : <Trash2 className="size-3.5" />}</RailOp>
					</div>
				)}
			<nav className="flex items-center gap-1.5 overflow-x-auto" aria-label="Slide navigator">
				{viewSlides.map((s, i) => {
					const on = i === slideNo - 1;
					// Read is the newcomer's stop — label each slide by its TITLE (its first
					// heading), not its component class (`big-number`/`split-compare` is jargon
					// they can't read). Write/Build keep the class label — the author wants it.
					const readTitle = slideTitle(s);
					const label = effectiveStop === 'read' ? readTitle || `Slide ${i + 1}` : slideClass(s);
					return (
						<button
							type="button"
							// biome-ignore lint/suspicious/noArrayIndexKey: the slide rail is positional — slide N's index IS its identity.
							key={i}
							onClick={() => goToSlide(i)}
							aria-current={on}
							aria-label={effectiveStop === 'read' ? `Slide ${i + 1}${readTitle ? ` — ${readTitle}` : ''}` : `Slide ${i + 1} — ${slideClass(s)}`}
							className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
						>
							<span className={cn('grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold', on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{i + 1}</span>
							<span className={cn('text-[11px]', effectiveStop === 'read' ? 'max-w-[18ch] truncate font-sans font-medium' : 'font-mono', on ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{label}</span>
						</button>
					);
				})}
			</nav>
			</div>
			)}
			{!previewChromeless && (
			<div className="flex items-center gap-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
				<span className="inline-flex items-center gap-1 text-[var(--chart-3,#2e6f00)]">● Live</span>
				<span className="truncate">{palette} · {mode}</span>
				<span className="flex-1" /><span className="hidden sm:inline">{ratioText(previewRatio)} · {viewSlides.length} slide{viewSlides.length === 1 ? '' : 's'}</span>
			</div>
			)}
		</section>
	);

	// The collapsed-pane restore rails + the divider. The rail lives INSIDE its
	// pane's Panel (react-resizable-panels collapses the pane to `collapsedSize`
	// = 46px); it's hidden until the group carries data-split-collapsed for that
	// side, then it fills the 46px strip (the pane section hides in tandem). Rail
	// badges keep the collapsed pane honest: the editor rail carries the amber
	// issue pill (never editing blind), the preview rail a slide count. 46px
	// matches the Inspector rail geometry so adjacent rails read as a group.
	const splitRailA = (
		<button
			type="button"
			data-slot="split-rail"
			data-side="a"
			className="hidden h-full w-full cursor-pointer flex-col items-center gap-2 border-r border-border bg-[var(--bg-alt)] py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] group-data-[split-collapsed=a]/split:flex"
			aria-label="Expand editor"
			title="Expand editor"
			onClick={() => splitApiRef.current.expand('a')}
		>
			<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]">Edit</span>
			{issues > 0 && (
				<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues}</span>
			)}
		</button>
	);
	const splitHandle = <ResizableHandle aria-label="Resize editor and preview" className="group-data-[studio-stop=read]/split:hidden" />;
	const splitRailB = (
		<button
			type="button"
			data-slot="split-rail"
			data-side="b"
			className="hidden h-full w-full cursor-pointer flex-col items-center gap-2 border-l border-border bg-[var(--bg-alt)] py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] group-data-[split-collapsed=b]/split:flex"
			aria-label="Expand preview"
			title="Expand preview"
			onClick={() => splitApiRef.current.expand('b')}
		>
			<ChevronLeft aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]">Preview</span>
			<span className="font-mono text-[10px] text-muted-foreground">{viewSlides.length}</span>
		</button>
	);

	// ── Left activity bar (desktop) — the ONE launcher for every panel ────────
	// Assistants (Coach) top · Settings (Slide/Deck) mid · Globals (Library,
	// Workspace, account) foot. Group labels + dividers make the grouped
	// exclusivity legible (Coach is independent; Slide/Deck swap one panel). The
	// accessible names are the e2e/demo contract — 'Toggle Coach', 'Toggle Chat', 'Deck scope',
	// 'Slide settings', 'Open Library', 'Workspace settings' (studio-fixture.ts CHROME
	// map + tour-kit SEL) — keep them stable.
	const activityBar = (
		<nav aria-label="Studio panels" className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r border-border bg-card py-2">
			{/* The tool-panel group — ONE mutually-exclusive left slot, ordered by likely
			    reach: the Architect (coach/chat), the Library (assets to insert), and the
			    reader-views Lenses. Clicking the active one closes it; clicking another
			    switches the slot. Library + Lenses are first-class panels here, not a
			    sheet-from-a-globals-icon and not a tab inside the AI coach. */}
			<span className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground/70">Tools</span>
			<BarIcon label="Toggle Coach" hint="Coach — deterministic deck assessment &amp; fixes" caption="Coach" active={coachOpen} onClick={() => setActiveAssistant((p) => (p === 'coach' ? null : 'coach'))}><Gauge className="size-[18px]" /></BarIcon>
			<BarIcon label="Toggle Chat" hint="Chat — AI conversation about your deck" caption="Chat" active={chatOpen} onClick={() => setActiveAssistant((p) => (p === 'chat' ? null : 'chat'))}><MessageSquareHeart className="size-[18px]" /></BarIcon>
			<BarIcon label="Open Library" hint="Library — saved themes, components &amp; finishes" caption="Library" active={libraryOpen} onClick={() => setActiveAssistant((p) => (p === 'library' ? null : 'library'))}><FileBox className="size-[18px]" /></BarIcon>
			<BarIcon label="Toggle Lenses" hint="Lenses — reader views" caption="Lenses" active={lensesOpen} onClick={() => setActiveAssistant((p) => (p === 'lenses' ? null : 'lenses'))}><Eye className="size-[18px]" /></BarIcon>
			<Separator className="my-1 w-6" />
			<span className="font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground/70">Set</span>
			<BarIcon label="Slide settings" hint="Slide settings — this slide only" caption="Slide" active={activeSettings === 'slide'} onClick={() => setActiveSettings((p) => (p === 'slide' ? null : 'slide'))}><FileSliders className="size-[18px]" /></BarIcon>
			<BarIcon label="Deck scope" hint="Deck settings — the whole deck" caption="Deck" active={activeSettings === 'deck'} onClick={() => setActiveSettings((p) => (p === 'deck' ? null : 'deck'))}><SlidersHorizontal className="size-[18px]" /></BarIcon>
			<span className="flex-1" />
			<Separator className="my-1 w-6" />
			<BarIcon label="Workspace settings" hint="Workspace settings" caption="Setup" onClick={() => setWorkspaceOpen(true)}><Settings2 className="size-[18px]" /></BarIcon>
			<span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-inverse)] text-[12px] font-bold text-white">SA</span>
		</nav>
	);

	// The deck switcher — deck identity + CRUD (Switch / Rename / New). SHARED by the
	// full header (Build / compact) AND the slim Write header: deck-switching and
	// New deck are the Write persona's most basic navigation, not strippable chrome,
	// so Write gets the real switcher, not a dead title label. Read stays a calm label
	// (one sample deck; managing decks is a Write-and-up concern — dial up to reach it).
	const deckSwitcher = (
		<DropdownMenu open={deckMenuOpen} onOpenChange={setDeckMenuOpen}>
			<DropdownMenuTrigger asChild>
				{/* No width cap on phones — the deck title is the user's orientation, so
				    it absorbs the bar's free width (siblings are shrink-0; this pill is
				    the one shrinkable item, truncating only when the title outgrows the
				    actual free space instead of a fixed 150px). */}
				<button type="button" data-demo="deck-switcher" className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] sm:max-w-[260px] sm:px-2.5">
					<span className="size-2 shrink-0 rounded-full bg-primary" />
					<span className="truncate text-sm font-semibold text-[var(--text-heading)]">{deck.title}</span>
					<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{metaFor(source)}</span>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Switch deck</DropdownMenuLabel>
				{decks.map((d) => (
					<DropdownMenuItem key={d.id} onSelect={() => loadDeck(d)} className="group">
						<span className={cn('size-2 rounded-full', d.id === deck.id ? 'bg-[var(--accent)]' : 'bg-primary')} />
						<span className="truncate font-semibold text-[var(--text-heading)]">{d.title}</span>
						<span className="ml-auto flex items-center gap-1.5">
							<span className="font-mono text-[11px] text-muted-foreground group-hover:hidden">{d.meta}</span>
							{decks.length > 1 && (
								<button type="button" aria-label={`Delete ${d.title}`} className="hidden rounded p-0.5 text-muted-foreground hover:text-[var(--fail,#b3261e)] group-hover:block" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDeck(d.id); }}><Trash2 className="size-3.5" /></button>
							)}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => { const t = window.prompt('Rename deck', deck.title); if (t != null) renameActiveDeck(t); }}><PencilLine className="size-4" />Rename “{deck.title}”</DropdownMenuItem>
				<DropdownMenuItem data-demo="new-deck" onSelect={() => newDeck()}><Plus className="size-4" />New deck</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<div ref={rootRef} data-studio-root="" className="lx-ui flex h-[100dvh] flex-col bg-background text-foreground">
			{/* Announce a stop change to assistive tech — the surface can change from a
			    keystroke (⌘.) or the "Edit this slide" reveal, which would otherwise be
			    silent (M3/M4 a11y). `stopAnnounce` starts empty and is updated only on a
			    real change (never on mount, never behind Fabricate) by the effect above. */}
			<div role="status" aria-live="polite" className="sr-only">{stopAnnounce}</div>
			{/* ── The ONE shared preview ────────────────────────────────
			    A `position:fixed` host, ALWAYS mounted (outside the Fabricate/mobile/desktop
			    branches below) so it stays warm in every Present-open path, and NEVER moved in
			    the DOM (moving an <iframe> reloads it). `useSharedPreviewSlot` writes its
			    top/left/width/height each frame to overlay the active slot — the editor pane's
			    slot, or (when Present is open) Present's slide-row slot. z-101 sits BETWEEN
			    Present's backdrop (z-100) and chrome (z-102); in the editor it drops to z-15 (above
			    the mobile pane's z-10, under the READ overlay z-20 and sheets/dialogs z-50) and goes
			    pointer-transparent so a swipe over the slide still reaches
			    the pane. The card frame differs per surface: Present draws the full card here;
			    the editor keeps its frame on `previewBoxRef` and this host only clips the corners. */}
			<div
				ref={sharedHostRef}
				// z: Present → 101 (between backdrop 100 and chrome 102). Editor → 15, which sits
				// ABOVE the mobile pane's own `z-10` (whose opaque bg would else cover the slide)
				// yet BELOW the READ "Edit this slide" overlay (z-20) and sheets/dialogs (z-50).
				// visibility/opacity/pointer-events are all CONSTANTS here (parked defaults) and
				// owned imperatively by the controller (useSharedPreviewSlot) — a constant in the
				// JSX means React's diff skips it on re-render, so the controller's imperative
				// value survives (never clobbered back to the default). opacity is the real hide
				// (the live iframe re-asserts its own visibility:visible, which overrides an
				// ancestor's visibility:hidden per CSS); pointer-events:none is the parked default
				// so an invisible host never eats a click. See use-shared-preview-slot.ts.
				style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', opacity: 0, zIndex: presentOpen ? 101 : 15, pointerEvents: 'none' }}
				className={cn('overflow-hidden', presentOpen ? 'rounded-2xl border border-border bg-card shadow-[0_24px_60px_rgba(10,22,40,.18)]' : 'rounded-xl')}
			>
				<DeckPreview options={options} sample={sharedSample} mermaid={sharedMermaid} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} active={sharedActive} coalesce className="size-full" aria-label="Live deck preview" onFirstRender={onPreviewFirstRender} />
			</div>
			{/* ── Top bar ─────────────────────────────────────────────── */}
			{/* Read + Write stops (DESKTOP only): a slim header — deck title · ⌘K · Present ·
			    Share · the dial. Most of the control cluster is gone; ⌘K still reaches
			    every feature, and the dial is the always-visible way to any stop (no
			    "exit" — you are never in a mode, only at a stop). On COMPACT widths the
			    full header stays (its ⋯ overflow carries deck-switch / theme / tours),
			    since a slim header would strand those; the dial rides the full header. */}
			{/* The cinema morph (iPhone landscape) shows NO header — the slide is the whole
			    screen. Every other width/stop keeps its header. */}
			{!landscapePhone && (effectiveStop !== 'build' && !compact ? (
			<header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3.5">
				<LatticeMark mode={mode} className="size-7 shrink-0" />
				{/* Read is calm — the deck is a label (a newcomer has the one sample deck;
				    switching / New deck is a Write-and-up concern). Write gets the real
				    switcher: deck navigation is not strippable chrome. */}
				{effectiveStop === 'read' ? (
					<>
						<span className="min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{deck.title}</span>
						<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{metaFor(source)}</span>
					</>
				) : deckSwitcher}
				<div className="flex-1" />
				<button type="button" onClick={() => setCmdOpen(true)} className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] sm:flex" aria-label="Search or run a command">
					<Search className="size-4" />Search or run…
					<Kbd className="ml-2">⌘K</Kbd>
				</button>
				{/* Present + Share are deliverable verbs — they stay reachable at EVERY stop,
				    never hidden behind a posture (2026-07-17-studio-persona-dial.md, T5 graft). */}
				<Tip label="Present"><Button variant="outline" size="sm" onClick={openPresent} className="gap-1.5 px-2" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button></Tip>
				<Tip label="Share"><Button size="sm" onClick={() => setShareOpen(true)} className="gap-1.5 px-2" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button></Tip>
				<PostureDial posture={posture} quietened={quietened} revealBuild={revealBuild} onChange={changePosture} />
			</header>
			) : (
			<header className={cn('flex h-[54px] shrink-0 items-center gap-1.5 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 transition-[max-height,opacity,transform] duration-200 ease-out sm:gap-3 sm:px-3.5', chromeCollapsed && 'pointer-events-none max-h-0 -translate-y-1 overflow-hidden border-b-0 opacity-0')}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						{/* The real brand mark (not a text tile), and the chevron shows at EVERY
						    width — without it the phone-width trigger reads as a static logo,
						    not a menu. */}
						<button type="button" className="flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 hover:bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] sm:gap-2 sm:px-1.5" aria-label="Workspace launcher">
							<LatticeMark mode={mode} className="size-7" />
							<span className="hidden font-display text-[19px] font-extrabold tracking-tight text-[var(--text-heading)] sm:inline" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Lattice</span>
							<ChevronDown className="size-4 text-muted-foreground" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-60">
						<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Workspace</DropdownMenuLabel>
						<DropdownMenuItem onSelect={() => setView('compose')}><Layers className="size-4" /><div><div className="font-semibold text-[var(--text-heading)]">Decks</div><div className="text-[11px] text-muted-foreground">Your saved decks</div></div></DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setView('fabricate')}><PencilRuler className="size-4" /><div><div className="font-semibold text-[var(--text-heading)]">Fabricate</div><div className="text-[11px] text-muted-foreground">Theme &amp; Component Studio</div></div></DropdownMenuItem>
						<DropdownMenuSeparator />
						{/* Deck CRUD lives in the deck switcher (New deck is there) — the
						    launcher keeps app navigation + Import only, so the two adjacent
						    menus don't offer the same action twice. */}
						<DropdownMenuItem onSelect={() => importInputRef.current?.click()}><Upload className="size-4" />Import deck…</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<Separator orientation="vertical" className="hidden h-5 sm:block" />

				{deckSwitcher}

				<div className="flex-1" />

				{/* ⌘K pill — desktop only (≥1100). On compact the "Search / commands" row
				    inside ⋯ is the search affordance; the ⌘K shortcut stays always-bound. */}
				{!compact && (
					<button type="button" onClick={() => setCmdOpen(true)} className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] lg:flex" aria-label="Search or run a command">
						<Search className="size-4" />Search or run…
						<Kbd className="ml-2">⌘K</Kbd>
					</button>
				)}

				{/* Appearance — desktop groups theme + light/dark into one bordered segment,
				    the mode toggle kept a direct 1-tap button. On compact the theme picker
				    folds into ⋯; the mode toggle stands alone on tablet and joins the ⋯
				    Appearance tail on phones (below). */}
				{!compact && (
					<div className="flex items-center rounded-md border border-border bg-background p-0.5">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm" aria-label="Theme"><Palette className="size-[18px]" /></Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="max-h-[70vh] w-52 overflow-y-auto">
								<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
							</DropdownMenuContent>
						</DropdownMenu>
						<Tip label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Button variant="ghost" size="icon-sm" data-demo="mode" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button></Tip>
					</div>
				)}

				{/* Desktop dividers band the right cluster by altitude — utilities |
				    deliverable verbs | session panels | app surfaces — so global and
				    deck controls don't read as one interleaved run (2026-07-03). */}
				{!compact && <Separator orientation="vertical" className="h-5" />}

				{/* Present + Share — the deliverable verbs, primary at every width. On
				    phones they live one row down in the pane bar (with the panel toggles),
				    which has the free width — the top row spends its width on the deck
				    title (2026-07-03 decision). */}
				{/* Show Me — the guided-tour menu. Five self-driving tours (one engine, five angles);
				    the icon opens the picker. Hidden while a tour runs (take-over owns the screen). */}
				{!mobile && (
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon-sm" data-demo="show-me" aria-label="Show me — guided tours" className={cn('text-[var(--accent)] hover:text-[var(--on-accent)] hover:bg-[var(--accent)]', demoActive && 'pointer-events-none invisible')}><MonitorPlay className="size-[18px]" /></Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent>Show me — a guided tour that drives itself</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" className="w-64">
							<DropdownMenuLabel>Show me…</DropdownMenuLabel>
							{TOURS.map((t) => (
								<DropdownMenuItem key={t.id} data-tour={t.id} onSelect={() => startDemo(t.id)} className="flex-col items-start gap-0.5 py-2">
									<span className="font-medium">{t.label}</span>
									<span className="text-[12px] text-muted-foreground">{t.description}</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{!mobile && <Tip label="Present"><Button variant="outline" size="sm" data-demo="present" onClick={openPresent} className="gap-1.5 px-2 lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button></Tip>}
				{!mobile && <Tip label="Share"><Button size="sm" data-demo="share" onClick={() => setShareOpen(true)} className="gap-1.5 px-2 lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button></Tip>}

				<Separator orientation="vertical" className="hidden h-5 sm:block" />
				{/* The posture dial — the always-visible, reversible way to any stop. Present
				    at every stop (never a buried setting), so no stop can read as a room you
				    must escape. Mobile carries the density on its own Edit/Preview pane bar. */}
				{!mobile && <PostureDial posture={posture} quietened={quietened} revealBuild={revealBuild} onChange={changePosture} />}
				{/* Feedback — a persistent, one-tap entry point (not gated on onboarded — first
				    impressions matter too). Opens a pre-filled GitHub issue; no token, no backend. */}
				{!compact && <Tip label="Send feedback"><Button variant="ghost" size="icon-sm" onClick={() => setFeedbackOpen(true)} aria-label="Send feedback"><MessageSquareHeart className="size-[18px]" /></Button></Tip>}
				{/* Architect + Inspector — the working-panel toggles stay 1-tap at EVERY width
				    (never folded into ⋯): visible aria-pressed/active color, and the #635
				    first-edit Inspector pulse always lands on a visible button. On phones
				    they ride the pane bar below with Present + Share. */}
				{/* Architect + Settings openers — TABLET only. Desktop launches both from the
				    left activity bar; mobile from the pane bar below. (A landscape phone renders
				    no header at all — the cinema morph — so no leak here.) */}
				{bp === 'tablet' && <Tip label="Coach — deterministic deck assessment"><Button variant="ghost" size="icon-sm" aria-pressed={coachOpen} onClick={() => setActiveAssistant((p) => (p === 'coach' ? null : 'coach'))} aria-label="Toggle Coach" className={cn(coachOpen && 'text-[var(--accent)]')}><Gauge className="size-[18px]" /></Button></Tip>}
				{bp === 'tablet' && <Tip label="Chat — AI conversation about your deck"><Button variant="ghost" size="icon-sm" aria-pressed={chatOpen} onClick={() => setActiveAssistant((p) => (p === 'chat' ? null : 'chat'))} aria-label="Toggle Chat" className={cn(chatOpen && 'text-[var(--accent)]')}><MessageSquareHeart className="size-[18px]" /></Button></Tip>}
				{bp === 'tablet' && <Tip label="Settings — deck & slide, in the side panel"><Button variant="ghost" size="icon-sm" aria-pressed={inspectorOpen} onClick={() => setActiveSettings((p) => (p ? null : 'deck'))} aria-label="Settings" className={cn(inspectorOpen && 'text-[var(--accent)]')}><SlidersHorizontal className="size-[18px]" /></Button></Tip>}
				{!compact && <Separator orientation="vertical" className="h-5" />}

				{/* Compact (≤1099): the mode toggle stands alone (1-tap), then ONE ⋯ overflow
				    holds the genuinely-secondary controls — theme picker, Library, Workspace,
				    and a Search/commands row (the touch path to the ⌘K palette). */}
				{compact && <Tip label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Button variant="ghost" size="icon-sm" data-demo="mode" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button></Tip>}
				{compact && (
					<DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon-sm" aria-label="More controls"><MoreHorizontal className="size-[18px]" /></Button>
						</DropdownMenuTrigger>
						{/* Inline, scrollable content — NOT a side-opening submenu. A nested
						    Radix submenu flies out to the side, which on a phone overflows the
						    viewport (clips off-screen) and hides that the theme list scrolls.
						    Actions sit first; the theme picker fills the rest as one scroll
						    region so a clipped row signals "more below". */}
						<DropdownMenuContent align="end" className="w-56 overflow-hidden p-0">
							<ScrollFade className="max-h-[70vh] overflow-y-auto p-1">
								{/* Editor actions — relocated here from the (now mobile-hidden) EDIT toolbar
								    band. Only while EDITING (the edit pane), so the preview pane isn't cluttered. */}
								{mobile && effPane === 'edit' && (
									<>
										<DropdownMenuLabel className="flex items-center gap-2"><PencilLine className="size-4" />Editor</DropdownMenuLabel>
										{insertComponents.length > 0 && (
											<DropdownMenuItem className="pl-8" onSelect={() => setInsertOpen(true)}><Plus className="size-4" />Insert component</DropdownMenuItem>
										)}
										<DropdownMenuItem className="pl-8" disabled={!issues} onSelect={() => editorRef.current?.fixAll()}><ListChecks className="size-4" />Fix all issues{issues > 0 && <span className="ml-auto text-[11px] text-muted-foreground">{issues}</span>}</DropdownMenuItem>
										<DropdownMenuItem className="pl-8" onSelect={() => setHistoryOpen(true)}><History className="size-4" />Version history</DropdownMenuItem>
										<DropdownMenuSeparator />
									</>
								)}
								{/* Show me — the persistent phone entry to the guided tours. The welcome-banner
								    button is the first-run affordance, but it vanishes once dismissed; the topbar
								    menu is desktop/tablet-only. So on mobile the tours live here too, inlined (a
								    nested Radix submenu flies off-screen on a phone), so a newcomer who dismissed
								    the banner can still pick one. */}
								{mobile && !demoActive && (
									<>
										<DropdownMenuLabel className="flex items-center gap-2"><MonitorPlay className="size-4" />Show me…</DropdownMenuLabel>
										{TOURS.map((t) => (
											<DropdownMenuItem key={t.id} data-tour={t.id} onSelect={() => startDemo(t.id)} className="flex-col items-start gap-0.5 py-2 pl-8">
												<span className="font-medium">{t.label}</span>
												<span className="text-[12px] text-muted-foreground">{t.description}</span>
											</DropdownMenuItem>
										))}
										<DropdownMenuSeparator />
									</>
								)}
								<DropdownMenuItem onSelect={() => setLibraryOpen(true)}><FileBox className="size-4" />Library</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setLensesOpen(true)}><Eye className="size-4" />Lenses — reader views</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setWorkspaceOpen(true)}><Settings2 className="size-4" />Workspace settings</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setCmdOpen(true)}><Search className="size-4" />Search / commands<Kbd className="ml-auto text-[10px]">⌘K</Kbd></DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setFeedbackOpen(true)}><MessageSquareHeart className="size-4" />Send feedback</DropdownMenuItem>
								<DropdownMenuSeparator />
								<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
							</ScrollFade>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{/* Library + Workspace + account — on DESKTOP these live in the left activity
				    bar's Globals group; on compact they're in the ⋯ overflow (above). So the
				    top bar carries neither here. */}
			</header>
			))}

			{/* ── Body ─────────────────────────────────────────────────── */}
			{view === 'fabricate' ? (
				<React.Suspense fallback={<div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Loading the Fabricate studio…</div>}>
					<Fabricate options={options} catalog={components} onClose={() => setView('compose')} notify={notify} onSaved={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }} onOpenWorkspace={() => setWorkspaceOpen(true)} />
				</React.Suspense>
			) : landscapePhone ? (
				/* iPhone LANDSCAPE — the "cinema" morph. The slide render is one surface that
				   already moves between the editor's preview slot and Present's slot (the shared
				   hoisted iframe); this is its third position: the slide fills the frame, swipe
				   moves between slides, and every other scrap of chrome is gone (no header, no
				   toolbar, no navigator — all suppressed above / in previewPane via
				   previewChromeless). The only visible overlay is the whisper: a slide-progress
				   counter that fades after ~2s and reappears on a slide change or a tap. Only
				   previewPane mounts here, so the editor UNMOUNTS on entering landscape (text is
				   safe — it lives in `source`; undo/caret/scroll reset) and remounts on rotate
				   back; no editor is mounted, so no software keyboard can appear. Tap (touch-only)
				   re-reveals the whisper; swipe is the real nav — onTouchEnd, not onClick. AT users
				   get the sr-only prev/next + aria-live position inside (VoiceOver eats swipes). */
				/* Fill the `100dvh` root (= the current/visible viewport height on this app's
				   surfaces) — the real bug was never the container height (`dvh` already tracks the
				   visible area); it was the slide fitting by WIDTH. The fix is forcing fit-by-height
				   for the landscape phone (see the previewBox className above). Note: `svh` is NOT a
				   reliable "always-visible" height here — some mobile browsers report `svh > dvh`. */
				<div data-cinema-stage onTouchEnd={() => setWhisperReveal((n) => n + 1)} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted">
					{previewPane}
					<LandscapeWhisper current={slideNo} total={viewSlides.length} revealKey={whisperReveal} />
						{vvDebug && <LandscapeViewportDebug />}
						{/* Screen-reader nav + live position. Cinema is swipe-only for sighted users, but VoiceOver/TalkBack intercept one-finger swipes, so these give AT users an intro, real controls, and an announced position (the visible counter is aria-hidden). */}
						<p className="sr-only">Slide deck. Swipe, or use the previous and next buttons below, to move through slides. Rotate the phone upright to edit.</p>
						<button type="button" className="sr-only" onClick={() => goToSlide(slideNo - 2)} disabled={slideNo <= 1}>Previous slide</button>
						<button type="button" className="sr-only" onClick={() => goToSlide(slideNo)} disabled={slideNo >= viewSlides.length}>Next slide</button>
						<div className="sr-only" aria-live="polite">Slide {slideNo} of {viewSlides.length}</div>
				</div>
			) : mobile ? (
				/* Mobile: one swappable Edit/Preview pane; panels live in sheets. The deck
				   actions stay INLINE and one-tap — an icon-only Edit/Preview toggle reclaims
				   the width that keeps them on the bar at 390px (no ⋯ hiding). The top row
				   spends its width on the deck title (2026-07-03 decision). Contextual extras
				   stay per-pane so the row fits: the issues pill on the Edit pane; History +
				   Slide settings on the Preview pane (the Edit pane's editor header has them). */
				<div className="flex min-h-0 flex-1 flex-col">
					<div role="toolbar" aria-label="Deck actions" className={cn('flex shrink-0 items-center gap-1 border-b border-border bg-card p-1.5 transition-[max-height,opacity,transform,padding] duration-200 ease-out', chromeCollapsed && 'pointer-events-none max-h-0 -translate-y-1 overflow-hidden border-b-0 py-0 opacity-0')}>
						{/* Icon-only Edit/Preview toggle — dropping the two text labels reclaims
						    ~78px, which is what lets the deck actions stay INLINE (one tap, no ⋯)
						    and still fit 390px. (A landscape phone never reaches this toolbar — it
						    renders the cinema morph above.) */}
						<div className="inline-flex rounded-lg border border-border bg-background p-[3px]">
							<PaneBtn active={mobilePane === 'edit'} onClick={() => { setMobilePane('edit'); if (postureRef.current === 'read') { dismissReadHint(); changePosture('write'); } }} icon={<PencilLine className="size-4" />} label="Edit" demo="pane-edit" />
							<PaneBtn active={mobilePane === 'preview'} onClick={() => setMobilePane('preview')} icon={<Eye className="size-4" />} label="Preview" demo="pane-preview" />
						</div>
						{/* Markdown ⟷ Compose — the editing-paradigm toggle, on the EDIT pane. It moved
						    here from the (mobile-hidden) EDIT band; the default is Markdown, so this must
						    stay one tap, not buried in ⋯. */}
						{effPane === 'edit' && (
							<div className="ml-0.5 inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-[3px]">
								<button type="button" aria-label="Markdown source" onClick={() => setEditMode('markdown')} aria-pressed={editMode === 'markdown'} className={cn('inline-flex items-center rounded-md p-1.5 transition-colors', editMode === 'markdown' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground')}><FileText className="size-4" /></button>
								<button type="button" aria-label="Compose — rich editor" onClick={() => setEditMode('compose')} aria-pressed={editMode === 'compose'} className={cn('inline-flex items-center rounded-md p-1.5 transition-colors', editMode === 'compose' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground')}><Sparkles className="size-4" /></button>
							</div>
						)}
						<span className="flex-1" />
						{effPane === 'edit' && issues > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues}</span>}
						{/* Version history + Slide settings ride the pane bar only on the PREVIEW
						    pane — the EDIT pane's own editor header already carries both. */}
						{effPane === 'preview' && <Tip label="Version history — save & restore snapshots"><Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(true)} aria-label="Version history"><History className="size-[18px]" /></Button></Tip>}
						{effPane === 'preview' && <Tip label="Slide settings — look, status, chrome, notes"><Button variant="ghost" size="icon-sm" onClick={() => { setInspectorScope('slide'); setInspectorOpen(true); }} aria-label="Slide settings"><FileSliders className="size-[18px]" /></Button></Tip>}
						<Tip label="Present"><Button variant="outline" size="sm" onClick={openPresent} className="gap-1.5 px-2" aria-label="Present"><Play className="size-4" /></Button></Tip>
						<Tip label="Share"><Button size="sm" onClick={() => setShareOpen(true)} className="gap-1.5 px-2" aria-label="Share"><Share2 className="size-4" /></Button></Tip>
						<Tip label="Coach — deterministic deck assessment"><Button variant="ghost" size="icon-sm" aria-pressed={coachOpen} onClick={() => setActiveAssistant((p) => (p === 'coach' ? null : 'coach'))} aria-label="Toggle Coach" className={cn(coachOpen && 'text-[var(--accent)]')}><Gauge className="size-[18px]" /></Button></Tip>
						<Tip label="Chat — AI conversation about your deck"><Button variant="ghost" size="icon-sm" aria-pressed={chatOpen} onClick={() => setActiveAssistant((p) => (p === 'chat' ? null : 'chat'))} aria-label="Toggle Chat" className={cn(chatOpen && 'text-[var(--accent)]')}><MessageSquareHeart className="size-[18px]" /></Button></Tip>
						<Tip label="Settings — deck & slide"><Button variant="ghost" size="icon-sm" aria-pressed={inspectorOpen} onClick={() => setActiveSettings((p) => (p ? null : 'deck'))} aria-label="Settings" className={cn(inspectorOpen && 'text-[var(--accent)]')}><SlidersHorizontal className="size-[18px]" /></Button></Tip>
					</div>
					{/* Both panes stay MOUNTED — the inactive one is hidden (opacity + inert) but keeps
					    its full size, so the preview keeps rendering the live deck and a swap to it is
					    INSTANT: no iframe remount, no reload, no blank flash (the pane jank that made
					    the demo — and normal editing — feel laborious on a phone). Editor state + the
					    preview frame both persist across swaps. */}
					<div className="relative min-h-0 flex-1">
						<div className={cn('absolute inset-0 flex', effPane === 'edit' ? 'z-10' : 'pointer-events-none invisible')} inert={effPane !== 'edit' ? true : undefined}>{editorPane}</div>
						<div className={cn('absolute inset-0 flex', effPane === 'preview' ? 'z-10' : 'pointer-events-none invisible')} inert={effPane !== 'preview' ? true : undefined}>{previewPane}</div>
						{/* Mobile Read — the phone newcomer the brief centers (M5). The preview pane
						    already renders chromeless full-bleed at the Read stop; this adds the one
						    "Edit this slide" verb + the one-time hint. Tapping it swaps to the edit
						    pane AND steps the dial to Write — the same Read→Write step as desktop. */}
						{effectiveStop === 'read' && effPane === 'preview' && (
							<div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-2.5 px-4">
								{!readHintSeen && (
									<div className="pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border border-border bg-[color-mix(in_srgb,var(--bg-alt)_96%,transparent)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-heading)] shadow-sm backdrop-blur">
										<span>This sample deck is <b className="font-semibold">yours</b> — tap Edit this slide to change it.</span>
										<button type="button" onClick={dismissReadHint} aria-label="Dismiss hint" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-[var(--text-heading)]"><X className="size-3.5" /></button>
									</div>
								)}
								<button type="button" onClick={() => { dismissReadHint(); setMobilePane('edit'); changePosture('write'); }} className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-[var(--on-accent)] shadow-lg">
									<PencilLine className="size-4" />Edit this slide
								</button>
							</div>
						)}
					</div>
				</div>
			) : (
				/* Unified compose spine (M2 spine hoist + M3 Read, 2026-07-17-studio-persona-dial.md).
				   Read, Write and Build share ONE structure so editor + preview mount ONCE and
				   never remount across a dial move — the srcdoc iframe never reloads and the
				   visible slide never jumps. The editor/preview/rails sit at FIXED child indices;
				   only the surrounding chrome + the split track weights change. BUILD gates the
				   chrome on (activity bar + docked Settings/Architect on desktop, right Inspector
				   on tablet). WRITE is the bare editor|preview split. READ collapses the editor
				   track to 0px (the pane stays MOUNTED) for a full-bleed preview + the "Edit this
				   slide" overlay, so the newcomer's first edit (Read→Write) is a track re-weight,
				   never a remount. The split always contributes FIVE children so track lists can't
				   drift (#721 zero-void invariant). */
				<div className={cn('relative flex min-h-0 flex-1', desktop && 'flex-row')}>
					{desktop && effectiveStop === 'build' && activityBar}
					<ResizablePanelGroup
						className="group/split min-h-0 flex-1"
						data-studio-split=""
						orientation="horizontal"
						disabled={!splitUsable}
						{...split.groupProps}
						data-studio-stop={effectiveStop}
						data-split-collapsed={splitUsable && split.collapsed ? split.collapsed : undefined}
						data-split-dragging={split.dragging ? '' : undefined}
					>
						{/* Settings — docks next to the bar (desktop-Build) as a resizable Panel.
						    react-resizable-panels enforces the px min itself; close = the Panel is
						    simply not rendered (the activity-bar icon reopens it). */}
						{desktop && effectiveStop === 'build' && inspectorOpen && (
							<>
								<ResizablePanel id="studio-settings" minSize={SET_MIN} maxSize={PANEL_MAX} defaultSize={SET_DEFAULT} className="overflow-hidden border-r border-border bg-background">
									{inspectorScopeContent}
								</ResizablePanel>
								<ResizableHandle aria-label="Resize settings panel" />
							</>
						)}
						{/* The assistant slot — ONE of Coach / Chat / Lenses / Library, docked next
						    to the editor (desktop-Build) as a resizable Panel. Mutually exclusive;
						    close = the launcher toggle. This is the Coach/Library/Chat resize the
						    2026-07-19 migration adds. */}
						{desktop && effectiveStop === 'build' && assistantOpen && (
							<>
								{/* Library gets its own panel id (+ wider default) so switching the
								    assistant slot Coach→Library is a fresh panel identity — the library
								    applies Library's 380px default instead of caching Coach's ~232px width
								    (each keeps its own persisted width via the per-panel-id bucket). */}
								<ResizablePanel id={libraryOpen ? 'studio-library' : 'studio-assistant'} minSize={assistantMin} maxSize={PANEL_MAX} defaultSize={assistantDefault} className="overflow-hidden border-r border-border bg-card">
									{coachOpen && (
										<>
											<div className="border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Coach</div>
											{coachBody}
										</>
									)}
									{chatOpen && (
										<>
											<div className="border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Chat</div>
											{chatBody}
										</>
									)}
									{lensesOpen && (
										<>
											<div className="border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Lenses</div>
											{lensesBody}
										</>
									)}
									{libraryOpen && (
										<Library docked open onOpenChange={setLibraryOpen} options={options} activePalette={palette} activeFinish={finish} initialFilter={libInitialFilter} onApplyTheme={applyPalette} onApplyFinish={(name) => { const token = `finish-${name}`; setFinish(token); notify(`Applied ${token}.`); }} onInsert={(skeleton) => applyDeckOp(addSlideAfter(source, curIndex, skeleton))} onChanged={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }} notify={notify} />
									)}
								</ResizablePanel>
								<ResizableHandle aria-label="Resize panel" />
							</>
						)}

						{/* Editor pane — collapsible to its rail (46px). Hidden at the Read stop so
						    the preview fills the surface (the pane stays MOUNTED → no remount on the
						    Read→Write step). */}
						<ResizablePanel id="studio-editor" data-pane-role="editor" minSize={240} defaultSize="46" collapsible={split.ready} collapsedSize={46} panelRef={split.editorRef} onResize={split.onEditorResize} className="overflow-hidden">
							{editorPane}
							{splitRailA}
						</ResizablePanel>
						{splitHandle}
						{/* Preview pane — collapsible to its rail (46px); fills the surface at Read
						    (the editor Panel's OUTER div is hidden by id in studio.astro's is:global
						    block; a Tailwind class lands on the inner div and can't shrink the outer). */}
						<ResizablePanel id="studio-preview" data-pane-role="preview" minSize={280} defaultSize="54" collapsible={split.ready} collapsedSize={46} panelRef={split.previewRef} onResize={split.onPreviewResize} className="overflow-hidden">
							{previewPane}
							{splitRailB}
						</ResizablePanel>

						{/* Tablet-Build: the Inspector docks on the RIGHT as a resizable Panel (no
						    activity bar below desktop; the in-panel Slide/Deck segment is its scope). */}
						{bp === 'tablet' && effectiveStop === 'build' && inspectorOpen && (
							<>
								<ResizableHandle aria-label="Resize inspector panel" />
								<ResizablePanel id="studio-tablet-inspector" minSize={SET_MIN} maxSize={PANEL_MAX} defaultSize={296} className="overflow-hidden border-l border-border bg-background">
									{inspectorScopeContent}
								</ResizablePanel>
							</>
						)}
					</ResizablePanelGroup>

					{/* READ overlay — the one primary verb over the full-bleed preview. Absolutely
					    positioned in the (relative) spine wrapper, so it is NOT a grid item and
					    can't affect the #721 track/child count. "Edit this slide" is the single,
					    unmissable, non-hover-gated action (hover fails on touch); it steps the dial
					    to Write. The one-time hint carries the banner's one true job (the deck is
					    yours) as element-attached content that never recurs. */}
					{effectiveStop === 'read' && (
						<div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex flex-col items-center gap-2.5 px-4">
							{!readHintSeen && (
								<div className="pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border border-border bg-[color-mix(in_srgb,var(--bg-alt)_96%,transparent)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-heading)] shadow-sm backdrop-blur">
									<span>This sample deck is <b className="font-semibold">yours</b> — tap Edit this slide to change it.</span>
									<button type="button" onClick={dismissReadHint} aria-label="Dismiss hint" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-[var(--text-heading)]"><X className="size-3.5" /></button>
								</div>
							)}
							<button
								type="button"
								onClick={() => { dismissReadHint(); changePosture('write'); }}
								className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-[var(--on-accent)] shadow-lg transition-transform hover:scale-[1.02]"
							>
								<PencilLine className="size-4" />Edit this slide
							</button>
						</div>
					)}
				</div>
			)}

			{/* ── Compact panels as sheets (tablet + mobile) ───────────── */}
			{compact && view === 'compose' && (
				<>
					<Sheet open={coachOpen} onOpenChange={setCoachOpen}>
						<SheetContent side="left" className="w-[88vw] gap-0 p-0 sm:max-w-[320px]">
							<SheetHeader className="border-b border-border">
								<SheetTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><Gauge className="size-4 text-[var(--accent)]" />Coach</SheetTitle>
								<SheetDescription className="sr-only">Board-readiness scorecard, deterministic quick reads, and per-finding fixes for this deck.</SheetDescription>
							</SheetHeader>
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{coachBody}</div>
						</SheetContent>
					</Sheet>
					{/* Chat — its own compact drawer, a peer of the Coach (they are separate panels). */}
					<Sheet open={chatOpen} onOpenChange={setChatOpen}>
						<SheetContent side="left" className="w-[88vw] gap-0 p-0 sm:max-w-[320px]">
							<SheetHeader className="border-b border-border">
								<SheetTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><MessageSquareHeart className="size-4 text-[var(--accent)]" />Chat</SheetTitle>
								<SheetDescription className="sr-only">A conversation with the AI Architect about this deck, with reviewable edits.</SheetDescription>
							</SheetHeader>
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chatBody}</div>
						</SheetContent>
					</Sheet>
					{/* Lenses (reader views) — its own compact sheet, a peer of the Architect. */}
					<Sheet open={lensesOpen} onOpenChange={setLensesOpen}>
						<SheetContent side="left" className="w-[88vw] gap-0 p-0 sm:max-w-[340px]">
							<SheetHeader className="border-b border-border">
								<SheetTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><Eye className="size-4 text-[var(--accent)]" />Lenses</SheetTitle>
								<SheetDescription className="sr-only">Reader views of this deck — build a subset for one kind of reader, preview it, and approve it.</SheetDescription>
							</SheetHeader>
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{lensesBody}</div>
						</SheetContent>
					</Sheet>
					{/* Settings Sheet — MOBILE only. Same Slide-first segment + scope echo +
					    active body as the desktop/tablet column, just wrapped in a Sheet
					    (no room for a docked column). One source of truth: inspectorScopeContent. */}
					{mobile && (
						<Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
							<SheetContent side="bottom" className="h-[80vh] gap-0 rounded-t-2xl p-0">
								<SheetHeader className="border-b border-border">
									<SheetTitle className="flex items-center gap-2 text-[15px]"><Settings2 className="size-4 text-[var(--accent)]" />Settings</SheetTitle>
									<SheetDescription className="sr-only">Slide-first settings: switch between this slide's overrides and deck-wide defaults.</SheetDescription>
								</SheetHeader>
								{/* No outer overflow: the scope body owns its own scroll region (like the
							    desktop column), so the sheet never nests two scrollbars. */}
							<div className="flex min-h-0 flex-1 flex-col">{inspectorScopeContent}</div>
							</SheetContent>
						</Sheet>
					)}
				</>
			)}

			{/* ── Overlays ─────────────────────────────────────────────── */}
			<ShareSheet open={shareOpen} onOpenChange={setShareOpen} deckTitle={deck.title} source={source} deckId={deck.id} finishClass={finishClass} finishExtraCss={finishExtraCss} options={options} palette={preview.paletteOverride ?? palette} mode={preview.modeOverride ?? (mode === 'dark' ? 'dark' : 'light')} extraTheme={preview.extraTheme} extraCss={previewExtraCss} onPresent={openPresent} notify={notify} />
			<FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} area="Studio" context={{ Deck: deck.title, Theme: `${palette} · ${mode}` }} />
			<WorkspaceSheet open={workspaceOpen} onOpenChange={setWorkspaceOpen} notify={notify} />
			{/* Version history — an ACTION (save/restore snapshots), not a deck setting,
			    so it lives in its own sheet off the top bar rather than in the inspector
			    (which is now settings-only). Restore stays always-visible (not hover-only)
			    so it works on touch. */}
			<Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
				<SheetContent side="right" className="flex w-[88vw] flex-col gap-0 p-0 sm:max-w-[360px]">
					<SheetHeader className="border-b border-border">
						<SheetTitle className="flex items-center gap-2 text-[15px]"><History className="size-4 text-[var(--accent)]" />Version history</SheetTitle>
						<SheetDescription className="text-[11px] leading-snug text-muted-foreground">Snapshots of the deck you can restore. One is saved automatically before each AI edit.</SheetDescription>
					</SheetHeader>
					<div className="flex-1 overflow-y-auto px-4 py-3 min-w-0 overscroll-contain [touch-action:pan-y]">
						<button type="button" onClick={saveVersion} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"><Save className="size-3.5" />Save a version</button>
						{checkpoints.length === 0 ? (
							<p className="px-0.5 py-1 text-[11.5px] leading-relaxed text-muted-foreground">No saved versions yet. Versions are also captured automatically before each AI edit.</p>
						) : (
							<ul className="space-y-0.5">
								{checkpoints.map((cp) => (
									<li key={cp.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--accent-soft)]">
										<span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-[var(--text-heading)]">{cp.label}</span><span className="block font-mono text-[10.5px] text-muted-foreground">{timeAgo(cp.ts)} · {metaFor(cp.source)}</span></span>
										<button type="button" onClick={() => restoreCheckpoint(cp)} className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-background">Restore</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</SheetContent>
			</Sheet>
			{/* Compact (tablet/mobile): Library is the right Sheet. Desktop-Build renders it
			    docked in the assistant slot instead (above), so the sheet is compact-only.
			    Gated on the compose view like its Architect/Lenses sheet peers, so it never
			    floats over the full-screen Fabricate surface. */}
			{compact && view === 'compose' && (
				<Library
					open={libraryOpen}
					onOpenChange={setLibraryOpen}
					options={options}
					activePalette={palette}
					activeFinish={finish}
					initialFilter={libInitialFilter}
					onApplyTheme={applyPalette}
					onApplyFinish={(name) => { const token = `finish-${name}`; setFinish(token); notify(`Applied ${token}.`); }}
					onInsert={(skeleton) => applyDeckOp(addSlideAfter(source, curIndex, skeleton))}
					onChanged={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }}
					notify={notify}
				/>
			)}
			<PresentOverlay open={presentOpen} onClose={() => setPresentOpen(false)} options={options} slides={slides} frontMatter={previewFm} registry={lensReg} startIndex={activeFullIndex} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} notify={notify} slotRef={presentSlotRef} onSlide={onPresentSlide} />
			<CommandPalette
				open={cmdOpen}
				onOpenChange={setCmdOpen}
				decks={decks}
				palettes={BUILTIN_PALETTES}
				onPickDeck={loadDeck}
				onNewDeck={() => newDeck()}
				onPalette={applyPalette}
				onPresent={openPresent}
				onShare={() => setShareOpen(true)}
				onFeedback={() => setFeedbackOpen(true)}
				onFabricate={() => setView('fabricate')}
				onLibrary={() => { revealBuildDock(); setLibraryOpen(true); }}
				onWorkspace={() => setWorkspaceOpen(true)}
				onReshape={() => { revealBuildDock(); setLensesOpen(true); }}
				onWatchDemo={startDemo}
				onInsert={insertComponents.length > 0 ? () => setInsertOpen(true) : undefined}
				onFocus={posture === 'build' ? () => setQuietened(true) : undefined}
				onCollapseEditor={splitUsable && split.collapsed !== 'a' ? () => collapseFromHeader('a') : undefined}
				onCollapsePreview={splitUsable && split.collapsed !== 'b' ? () => collapseFromHeader('b') : undefined}
				onExpandPane={split.collapsed ? () => { const c = splitApiRef.current.collapsed; if (c) splitApiRef.current.expand(c); } : undefined}
				onResetSplit={splitUsable ? () => splitApiRef.current.reset() : undefined}
			/>
			<SlidePicker open={insertOpen} onOpenChange={setInsertOpen} items={insertComponents} options={options} frontMatter={previewFm} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} recent={recentComponents} onInsert={onInsertComponent} />
			{/* Hidden file input for "Import deck…" (.md upload). */}
			<input ref={importInputRef} type="file" accept=".md,.markdown,.mdx,.lattice,text/markdown,text/plain" onChange={onImportFile} className="hidden" aria-hidden="true" tabIndex={-1} />

			{/* The one toast surface — messages (notify) + the Undo action below. */}
			<Toaster />
		</div>
	);
}

// ── small local building blocks ─────────────────────────────────────────
// A scroll container that shows a bottom fade + chevron WHILE more content sits
// below the fold — the only reliable "there's more" cue for a long menu on touch,
// where the OS hides native scrollbars and Radix DropdownMenu has no scroll
// buttons. The cue clears once you reach the bottom. `pointer-events-none` so it
// never eats a tap on the row beneath it.
function ScrollFade({ children, className }: { children: React.ReactNode; className?: string }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [more, setMore] = React.useState(false);
	const check = React.useCallback(() => {
		const el = ref.current;
		if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
	}, []);
	React.useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		// ResizeObserver fires once on observe — catching the settled height after the
		// menu's open animation, when scrollHeight/clientHeight are finally valid.
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
	}, [check]);
	return (
		<div className="relative">
			<div ref={ref} onScroll={check} className={className}>{children}</div>
			{more && (
				<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-popover via-popover/80 to-transparent">
					<ChevronDown className="size-4 translate-y-[-2px] text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
// Icon-only segmented button (Edit / Preview). The label rides `aria-label`/`title`
// (+ aria-pressed for the active side) rather than visible text, so the toggle stays
// compact — that reclaimed width keeps the deck actions inline instead of behind a ⋯.
// The posture dial — the one always-visible, reversible control that replaced the
// one-way graduation ratchet (2026-07-17-studio-persona-dial.md). Stops are named for
// what you DO, never who you are, so no stop reads as a rank; the lit segment is the
// surface you're on (the transient `quietened` overlay lights Write without moving the
// saved posture). Matches the segmented-control idiom (bordered group, card-lift active).
// Assistive-tech announcement per stop (the aria-live region at the shell root).
const POSTURE_ANNOUNCE: Record<Posture, string> = {
	read: 'Read — just the slides',
	write: 'Write — editor and preview',
	build: 'Build — every panel',
};
const POSTURE_STOPS: { id: Posture; label: string; hint: string; icon: React.ReactNode }[] = [
	{ id: 'read', label: 'Read', hint: 'Read — just the slides', icon: <BookOpen className="size-4" /> },
	{ id: 'write', label: 'Write', hint: 'Write — editor + preview', icon: <PencilLine className="size-4" /> },
	{ id: 'build', label: 'Build', hint: 'Build — every panel', icon: <Layers className="size-4" /> },
];
function PostureDial({ posture, quietened, revealBuild, onChange }: { posture: Posture; quietened: boolean; revealBuild: boolean; onChange: (p: Posture) => void }) {
	// Light the EFFECTIVE stop — a transient reveal shows Build, a quiet shows Write —
	// so the dial always matches the surface you're looking at, then re-lights your
	// saved stop when the transient recedes.
	const shown: Posture = revealBuild ? 'build' : quietened ? 'write' : posture;
	// When the lit stop is TRANSIENT (not your saved home), mark it with a dashed
	// outline instead of the solid selected shadow — so it reads as "showing now,"
	// and clicking it to make it your saved home is a deliberate act, never a silent
	// persist of a segment that merely looked already-selected (red-team finding).
	const transient = shown !== posture;
	return (
		<fieldset className="m-0 inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-[3px]">
			<legend className="sr-only">Workspace density</legend>
			{POSTURE_STOPS.map((s) => {
				const lit = shown === s.id;
				return (
					<Tip key={s.id} label={lit && transient ? `${s.hint} · showing now — click to make it your saved home` : s.hint}>
						<button type="button" aria-label={lit && transient ? `${s.hint}, showing temporarily` : s.hint} aria-pressed={lit} onClick={() => onChange(s.id)} className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors', lit ? (transient ? 'bg-card text-[var(--accent)] outline-dashed outline-1 outline-offset-[-2px] outline-[color-mix(in_srgb,var(--accent)_55%,transparent)]' : 'bg-card text-[var(--accent)] shadow-sm') : 'text-muted-foreground hover:text-[var(--text-heading)]')}>
							{s.icon}<span className="hidden sm:inline">{s.label}</span>
						</button>
					</Tip>
				);
			})}
		</fieldset>
	);
}
function PaneBtn({ active, onClick, icon, label, demo }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; demo?: string }) {
	return (
		<Tip label={label}><button type="button" onClick={onClick} data-demo={demo} aria-label={label} aria-pressed={active} className={cn('grid size-8 place-items-center rounded-md text-[13px] font-semibold', active ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}>{icon}</button></Tip>
	);
}

// The one whisper of chrome over the iPhone-landscape "cinema" morph (the slide fills
// the frame, swipe to move, nothing else): a slide-progress counter that fades ~2.2s
// after each slide change (or a tap, via `revealKey`) and reappears on the next.
// Decorative only (aria-hidden): the slide itself carries the content; pointer-events-none
// so it never eats a swipe. See 2026-07-20-landscape-phone-preview-lock.md.
function LandscapeWhisper({ current, total, revealKey }: { current: number; total: number; revealKey: number }) {
	const [shown, setShown] = React.useState(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: current + revealKey are TRIGGERS, not reads — each slide change (current) or tap (revealKey) must re-run the show-then-fade timer.
	React.useEffect(() => {
		setShown(true);
		const t = setTimeout(() => setShown(false), 2200);
		return () => clearTimeout(t);
	}, [current, revealKey]);
	if (total < 1) return null;
	return (
		<div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-500', shown ? 'opacity-100' : 'opacity-0')}>
			<span className="rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--bg-alt)] px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[var(--text-heading)] shadow-sm">{current} / {total}</span>
		</div>
	);
}
// On-device viewport diagnostic for the cinema morph — opt-in via `?vvdebug`. Renders
// IN-FLOW (never position:fixed, which would inherit the very geometry it measures) so the
// numbers are trustworthy. Prints the visual-viewport geometry, the resolved svh/dvh/lvh
// units, the cinema stage height, and the live iframe rect — a device screenshot settles
// whether the slide fits the visible band (this is the readout that finally exposed the
// fit-axis bug). To be promoted into a first-class Workspace debug lever (perf-overlay style).
function LandscapeViewportDebug() {
	const [txt, setTxt] = React.useState('…');
	React.useEffect(() => {
		const vv = typeof window !== 'undefined' ? window.visualViewport : null;
		// Probe what the CSS viewport units actually resolve to on THIS device (svh/dvh/lvh
		// can differ from innerHeight — that's the whole question). One hidden probe per unit.
		const probe = (h: string) => {
			const d = document.createElement('div');
			d.style.cssText = `position:fixed;top:0;left:0;width:0;height:${h};visibility:hidden;pointer-events:none`;
			document.body.appendChild(d);
			const v = d.getBoundingClientRect().height;
			d.remove();
			return Math.round(v);
		};
		const read = () => {
			const f = document.querySelector('iframe')?.getBoundingClientRect();
			const stage = document.querySelector('[data-cinema-stage]')?.getBoundingClientRect();
			setTxt(
				[
					`inner ${window.innerWidth}x${window.innerHeight}`,
					vv ? `vv ${Math.round(vv.width)}x${Math.round(vv.height)} off ${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)}` : 'vv: none',
					`svh ${probe('100svh')} dvh ${probe('100dvh')} lvh ${probe('100lvh')}`,
					stage ? `stage h ${Math.round(stage.height)}` : 'stage: —',
					f ? `frame top ${Math.round(f.top)} bot ${Math.round(f.bottom)} h ${Math.round(f.height)}` : 'frame: —',
				].join('\n'),
			);
		};
		read();
		const id = window.setInterval(read, 300);
		vv?.addEventListener('resize', read);
		vv?.addEventListener('scroll', read);
		return () => {
			window.clearInterval(id);
			vv?.removeEventListener('resize', read);
			vv?.removeEventListener('scroll', read);
		};
	}, []);
	return <pre className="pointer-events-none absolute left-1 top-1 z-30 m-0 whitespace-pre rounded bg-black/70 px-1.5 py-1 font-mono text-[10px] leading-tight text-[#7CFC9B]">{txt}</pre>;
}
// One icon on the desktop left activity bar. `caption` is a PERSISTENT label
// under the glyph (not a hover-only tooltip — those never fire on touch and
// leave a newcomer facing mystery glyphs; 2026-07-06-studio-activity-bar.md).
// `active` is passed only for the panel toggles (Coach/Slide/Deck) → aria-pressed;
// the globals (Library/Workspace) open dialogs, so they get no pressed state.
function BarIcon({ label, hint, caption, active, onClick, children }: { label: string; hint: string; caption: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<Tip label={hint}><button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				'group/bar relative flex w-11 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[8.5px] font-semibold leading-none transition-colors',
				active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]',
			)}
		>
			{/* Active-marker rail, VSCode-style, on the bar's inner edge. */}
			{active && <span aria-hidden="true" className="absolute -left-[7px] inset-y-2 w-[3px] rounded-full bg-[var(--accent)]" />}
			{children}
			<span className="tracking-tight">{caption}</span>
		</button></Tip>
	);
}
function ArchCard({ tag, title, children }: { tag: React.ReactNode; title: string; children: React.ReactNode }) {
	return (
		<div className="relative m-2.5 rounded-xl border border-border bg-background p-3 shadow-[0_1px_2px_rgba(10,22,40,.06)]">
			<span className="absolute right-2.5 top-2.5">{tag}</span>
			<div className="pr-16 text-[12px] font-bold text-[var(--text-heading)]">{title}</div>
			<div className="mt-1">{children}</div>
		</div>
	);
}
function RailOp({ label, onClick, disabled, danger, armed, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; armed?: boolean; children: React.ReactNode }) {
	return (
		<Tip label={label}><button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cn('grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:bg-transparent', danger && !armed && 'hover:bg-[color-mix(in_srgb,var(--fail,#b3261e)_12%,transparent)] hover:text-[var(--fail,#b3261e)]', armed && 'bg-[var(--fail,#b3261e)] text-white hover:bg-[var(--fail,#b3261e)] hover:text-white')}>{children}</button></Tip>
	);
}
function InspGroup({ icon, label, desc, last, children }: { icon: React.ReactNode; label: string; desc?: string; last?: boolean; children: React.ReactNode }) {
	return (
		<div className={cn('py-3', !last && 'border-b border-border')}>
			<div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
			{desc && <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
			{children}
		</div>
	);
}
// A deck-setting row. `desc` adds a plain-language help line under the control —
// no magic, no mystery: every setting says what it does. Obvious toggles can omit it.
function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
	return (
		<div className="my-2">
			<div className="flex items-center justify-between gap-2.5"><span className="text-[12.5px] text-foreground">{label}</span>{children}</div>
			{desc && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
		</div>
	);
}
// Forwards ref + props so it can be a Radix `asChild` trigger (the Size menu).
const Control = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => (
	<button ref={ref} type="button" {...props} className="inline-flex min-w-[116px] items-center justify-between gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-heading)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]">{children}</button>
));
Control.displayName = 'Control';
// Thin adapter over the shared ui/switch primitive, preserving this file's
// {on,onClick,label} call sites. The widget itself is now the shadcn Switch.
function Toggle({ on, onClick, label }: { on?: boolean; onClick?: () => void; label?: string }) {
	return <Switch checked={!!on} onCheckedChange={() => onClick?.()} aria-label={label} />;
}
// A text-DECLARATION row — label + help line, then a full-width input. Unlike a
// Toggle (a binary state), this is where the author states the actual copy that
// will render (the running header / footer text). Draft is local while typing and
// commits on blur or Enter, so the source front-matter (and the editor + every
// export) isn't rewritten on every keystroke. An empty commit clears the setting.
function TextRow({ label, desc, value, placeholder, onCommit }: { label: string; desc?: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
	const [draft, setDraft] = React.useState(value);
	// A real <label htmlFor> (not a bare span) so tapping the label focuses the field,
	// and aria-describedby so a screen reader announces the help line (incl. "Blank
	// hides it") — the one sentence that explains the show/hide behavior.
	const id = React.useId();
	const descId = `${id}-desc`;
	// Re-sync when the stored value changes underneath us (deck switch, restore,
	// AI edit). Value only moves on our own commit during normal typing, so this
	// never fights the author mid-keystroke.
	React.useEffect(() => { setDraft(value); }, [value]);
	return (
		<div className="my-2">
			<label htmlFor={id} className="text-[12.5px] text-foreground">{label}</label>
			{desc && <p id={descId} className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
			<Input
				id={id}
				aria-describedby={desc ? descId : undefined}
				value={draft}
				placeholder={placeholder}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => { if (draft !== value) onCommit(draft); }}
				onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
				className="mt-1.5 h-8 text-[12.5px]"
			/>
		</div>
	);
}
