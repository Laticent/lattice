import {
	AlertTriangle, ArrowLeftToLine, ArrowRightToLine, BookMarked, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileBox, FileSliders, FileText, Gauge, History, Layers, ListChecks, Menu as MenuIcon, Monitor, MonitorPlay, Moon, Palette, PanelLeftClose, PanelRightClose, PencilLine, PencilRuler, Play, Plus, Printer, Save, Settings2, Settings as SettingsCog, Share2, SlidersHorizontal, Sparkles, Sun, SunMoon, Trash2, Upload, Volume2, Wand2, X,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import DeckPreview from '@/components/DeckPreview';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeedbackSheet } from '@/components/site/FeedbackSheet';
import { paletteLabel } from '@/components/site/PaletteSelectItems';
import { sliceSlide } from '@/components/studio/ai/architect-edits.js';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
	DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { PanelBody, PanelEmpty, PanelHeader, PanelNav, PanelSheet, PINNED_FIELD_ROW, SETTING_CONTROL_COL, SETTING_LABEL_COL, SETTING_ROW, SETTING_SCOPE } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { Tip, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type SplitSide, useResizableSplit } from '@/components/ui/use-resizable-split';
import { messageForFailure } from '@/lib/chunk-load';
import { type CrashReport, collectCrashReports, breadcrumb as crashCrumb, noteError as noteCrashError, OPEN_CRASH_REPORT_EVENT, setCrashContext } from '@/lib/crash-sentinel';
import { cornerRadiusCss } from '@/lib/deck-corner';
import { shellKeyAction, zoomKeyAction } from '@/lib/deck-nav';
import { pinnedMode, resolveDeckTheme } from '@/lib/deck-theme';
import { applyTag, catalogFromComponents, type LensDef, type LensRegistry, lensIndices, parseLensRegistry, taggedLensIds, upsertLensRegistry } from '@/lib/lente';
import { normalizeSourceText } from '@/lib/normalize-source-text';
import { acronymEntries, lexiconMap } from '@/lib/resolve-captions';
import { DEFAULT_PACE, PACE_NAMES } from '@/lib/resolve-pace';
import { type SingleSlideOptions, suspendScaleObservers } from '@/lib/single-slide-render';
import { DEFAULT_PALETTE, toggleMode as toggleDocMode } from '@/lib/site-chrome';
import { hasFinePointer, useBreakpoint, useLandscapePhone } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { applyReadAloudDebugParam } from '@/playground/readaloud-overlay-prefs';
import { onToursEnabledChange, toursEnabled } from '@/playground/tour-prefs.js';
import { attachPreviewZoom, type PreviewZoomHandle } from '../../lib/preview-zoom';
import { AcronymEditor } from './AcronymEditor';
import { ArchitectChat } from './ArchitectChat';
import { applyDeckEdit, estimateUsd, type Finding, REFINE_ACTIONS, type RefineActionId, refineSelection, requestFindingFix, resumePendingAuth, useArchitectStatus } from './architect';
import { AutoIcon, autoHeadLabel } from './auto-mark';
import { CatalogSelect, catalogOptions } from './CatalogSelect';
import { CommandPalette } from './CommandPalette';
import type { ComposeHandle } from './ComposeView';
import { CrashReportSheet } from './CrashReportSheet';
import { ActivityRail, BAR_CONTROL, BAR_RULE, BarIcon, ComposeSkeleton, EditorSkeleton, PostureDial } from './chrome-parts';
import { activeClaim, CLAIMS } from './claim-catalog';
import { applyProfileToSource, assessDeck, type CoachAssessment, type CoachCard, type DeckScorecard, pacing, rankFindings, structureCheck, theAsk, topFixes, weakestSlide } from './coach/coach-core';
import { FindingCard, type FindingFixState } from './coach/FindingCard';
import { listStudioComponents, type StudioComponent } from './component-library';
import { activeCorners, CORNERS } from './corners-catalog';
import { addSlideAfter, deleteSlide, duplicateSlide, moveSlide, replaceSlide, SLIDE_SEP } from './deck-ops';
import { DECKS, deckSource, type StudioDeck } from './decks';
import type { EditorHandle } from './Editor';
import { activeEyebrow, EYEBROWS } from './eyebrow-catalog';
import { finishSelectGroups, finishSwatchFor, type SavedFinishMenuEntry } from './FinishPicker';
import { activeFinish } from './finish-catalog';
import { generateSwatch as finishSwatch, generateFinishCss, mergeFinishOverride } from './finish-generate';
import { deleteStudioFinish, listStudioFinishes, type StudioFinish } from './finish-library';
import { type AcronymEntry, frontMatterBlock, getFrontMatter, innerFrontMatter, mergeClassTokens, parseFinishOverride, removeClassTokens, setFrontMatterAcronyms, setFrontMatterBlock, stripFrontMatter, writeFrontMatterLine } from './front-matter';
import { activeHeadline, HEADLINES } from './headline-catalog';
import { IntentTag } from './IntentTag';
import { ChatIcon, FeedbackIcon, LensIcon, PreviewIcon } from './icons';
import { LANG_AUTO, LanguageSelect } from './LanguageSelect';
import { LatticeMark } from './LatticeMark';
import { LensesPanel, type TagChange } from './LensesPanel';
import { LexiconEditor } from './LexiconEditor';
import { Library } from './Library';
import { ARCHETYPES as LENS_ARCHETYPES } from './lens-archetypes';
import { LENSES, LensPicker, lensEntriesFrom } from './lens-picker';
import { type PresentLens, presentationSet, slideClass, slideTitle, splitSlides, unknownComponents, usedComponents } from './lint';
import { checkDiagrams, type DiagramError, extractDiagrams } from './mermaid-check';
import { activeMode, MODES } from './mode-catalog';
import { activeMotionSpeed, activeMotionStyle, MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';
import { PREVIEW_CHROME, PREVIEW_RECT_KEY, STUDIO_SPLIT_KEY, STUDIO_SPLIT_PANEL_IDS } from './preview-rect';
import { ReshapePicker } from './ReshapePicker';
import { activeRule, RULES } from './rule-catalog';
import { ShareSheet } from './ShareSheet';
import { SlideContextBody } from './SlideContext';
import { type ComponentEntry, SlidePicker } from './SlidePicker';
import { DRAWER_LABEL, StudioDrawer } from './StudioDrawer';
import { ScrollFade } from './scroll-fade';
import { importComments } from './slide-comments';
import { getClassTokens } from './slide-directives';
import { sizeRatio } from './slide-size';
import { hasMermaid } from './slide-thumb';
import { applyVariant } from './slide-variants';
import { activeSpectrumCard, SPECTRUM_CARDS } from './spectrum-card-catalog';
import { activeSpectrumCardEdge, SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';
import { activeSpectrum, SPECTRA } from './spectrum-catalog';
import { activeSpectrumEdge, SPECTRUM_EDGES } from './spectrum-edge-catalog';
import { activeSpectrumTrim, SPECTRUM_TRIMS } from './spectrum-trim-catalog';
import { deckOutputLang, languageLabel, resolveSupported } from './studio-language';
import { type Checkpoint, createDeck, DECKS_CLEARED_EVENT, deckLabels, deleteDeck as deleteDeckStore, FLUSH_EVENT, hasStoredPosture, loadBootDeck, loadBootSlide, loadCheckpoints, loadDeckList, loadSettings, loadSource, markBackupNudged, metaFor, type Posture, resolveTitle, retitleSource, SETTINGS_EVENT, saveActiveDeck, saveCheckpoint, saveSettings, saveSource, setDeckLabel, shouldNudgeBackup, storedTitleFor, syncDerivedTitle, titleFromSource } from './studio-store';
import { BUILTIN_PALETTES, ThemeMenuItems, themeSelectGroups } from './ThemePicker';
import { deleteStudioTheme, listStudioThemes, type StudioTheme } from './theme-library';
import { TOURS } from './tours';
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

// ComposeView is the OTHER half of the editor pane, and the heaviest thing left on the
// cold path after the Editor split: ~69KB of its own source plus the whole ProseMirror
// stack (13 vendor modules, ~693KB of source) — for a pane that is NOT the default.
// `editMode` starts at 'markdown', and the toggle that reaches Compose is a deliberate
// user action, so nothing on a cold load needs it. Already conditionally rendered, so
// this is the same drop-in the Fabricate and Editor splits were. A React.lazy over a
// forwardRef component still forwards `ref` in React 19, so `composeRef` reaches its
// useImperativeHandle. See engineering/decisions/2026-08-17-studio-dynamic-loading-audit.md §9.4.
const ComposeView = React.lazy(() => import('./ComposeView').then((m) => ({ default: m.ComposeView })));

// Split out of the #1751 StudioShell-coupling spike — full measurement (-23.8KB gz, -2
// chunks, 29 real e2e tests green) in
// engineering/decisions/2026-08-23-studio-shell-decomposition.md §4. PresentOverlay has no
// forwardRef/imperative handle (unlike Editor/ComposeView above) — StudioShell never holds
// a ref into it — so this is a plain React.lazy with nothing to forward. Present is gated
// by `presentOpen || presentEverOpened` at its render site below, so — unlike
// Editor/ComposeView, which warm unconditionally on Studio mount because they're the
// default pane — the chunk is not fetched until the user's first "Present" click.
const PresentOverlay = React.lazy(() => import('./PresentOverlay').then((m) => ({ default: m.PresentOverlay })));


// Deck Inspector pill-tab sections, ORDERED BY LIKELY REACH — the strip is read left
// to right, so the order is the claim about what an author opens this panel for:
// appearance first, then the repeating furniture, then the once-per-deck facts, then
// brand refinement, then the two axes only some decks use at all.
//
// "Marks" is now "Chrome", and the two panels agree. The slide Inspector had called the
// header/footer/page-number furniture Chrome since it shipped while this one called the
// same four controls Marks — and the slide's Status + Decoration tabs (a Draft badge, a
// corner wash) are what the word "marks" actually describes. The two scopes had each
// other's word. Renaming here frees "Marks" for the slide's overlay tabs
// (SlideContext.tsx) and leaves one vocabulary across both scopes.
//
// "General" is new: the deck's name, language and structural facts — set once, not
// styling, and they were sitting in Look for want of anywhere better. It also absorbs
// the old Developer footer disclosure, so there is one place for "things about this
// deck" instead of a tab strip plus a stray expander.
// See engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md.
type DeckTab = 'look' | 'chrome' | 'general' | 'brand' | 'motion' | 'speech';
const DECK_TABS: { value: DeckTab; label: string }[] = [
	{ value: 'look', label: 'Look' },
	{ value: 'chrome', label: 'Chrome' },
	{ value: 'general', label: 'General' },
	{ value: 'brand', label: 'Accent' },
	{ value: 'motion', label: 'Motion' },
	{ value: 'speech', label: 'Speech' },
];

// The head value for a register with NO named baseline (`stamp:`, `tone:`): absent means
// "the engine's own default shape", which is not a value the register can spell. Radix
// Select rejects an empty value, so the head needs a non-empty sentinel.
/** The profile choices offered in the Coach, mirroring lib/authoring/deck-profiles.js.
 *  This lived inside the component under a comment claiming "a pinned test asserts the two
 *  lists stay in step" — there was no such test, and deleting the `teaching` entry (the one
 *  profile the feature exists for) left the suite green. Module-scoped and exported now so
 *  `studio.coach-profile.test.tsx` can pin it against the engine's PROFILE_NAMES for real. */
export const DECK_PROFILE_CHOICES: [string, string][] = [
	['general', 'General'],
	['teaching', 'Teaching'],
	['mission', 'Mission'],
];

const DEFAULT_SENTINEL = '__default__';

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
// Aspect ratio (w:h) per engine `@size` token — the preview CARD matches the deck's real
// shape, never a hardcoded 16:9. SIZE_RATIO/sizeRatio are the shared source of truth (also
// used by the pre-hydration instant shell); see slide-size.ts.
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
const LIB_MIN = 240; // Library min — fits its header floor (title + a usable search field + the icon-only Import button); tabs scroll below this
const LIB_DEFAULT = 380; // Library docked default — wider than the coach; asset cards need room
// Editor/preview pane MINIMUMS — the width at which the pane's HEADER toolbar stops
// clipping, so "drag to the minimum" never cuts an icon off (it collapses to the rail
// instead). Measured on the real surface (a width sweep reading header.scrollWidth vs
// clientWidth): the editor toolbar floors at ~284px (Add · Fix all · History ·
// Markdown/Compose · collapse, labels already container-query-hidden), the preview at
// ~260px (the always-labeled LensPicker + Slide N/M pill). 300 clears both with margin
// for the editor's conditional Refine/issue controls. Kept ≤ so the 1100px both-panels
// desktop config still fits (bar-fold + side-panel mins; verified). Below this the panes
// collapse to the 46px rail.
// Declared in preview-rect.ts beside the rest of the geometry contract: the pre-paint
// shell has to clamp a restored split by the SAME minimums the library enforces here,
// and two copies of the number is exactly the drift the shell keeps paying for.
const EDITOR_MIN = PREVIEW_CHROME.splitEditorMin;
const PREVIEW_MIN = PREVIEW_CHROME.splitPreviewMin;

// Theme constants + the grouped picker live in ThemePicker.tsx (every shipped
// theme, incl. the AA color-blind-safe set). BUILTIN_PALETTES = anything we can
// drive through `data-palette`.

// The two Coach quick reads COMPUTED FROM `findings` (`topFixes` / `weakestSlide`) — the
// only cards a fresh assessment round can make stale. The other three (`structure`, `ask`,
// `pacing`) read the deck SOURCE and nothing else, so a re-lint that reports the same deck
// tells them nothing. See the staleness effects in the shell body.
const FINDINGS_DERIVED_CHIPS = new Set(['top', 'weak']);

// `assessDeck` refuses to assess a deck with no classed slide (`hasContent`, K1: never fabricate
// a grade), and returns `findings: []` for it — which means "not looked at", NOT "no problems
// found". `topFixes([])` and `weakestSlide([])` cannot tell those apart: both answer "Nothing
// flagged — every slide follows the authoring contract". On a plain-Markdown deck that sat one
// inch below a Deck read card correctly reporting the same deck as unassessed, so the panel
// contradicted itself and the chip was the half that lied. Only the two FINDINGS_DERIVED_CHIPS
// can do this; `structure`, `ask` and `pacing` read the source directly and are honest either way.
const unassessedCard = (id: string): CoachCard => ({
	title: id === 'top' ? 'Top fixes' : 'Weakest slide',
	body: ['Nothing to rank yet — I haven’t assessed this deck. Add a slide with a `_class` directive and I’ll read it.'],
});

// biome-ignore lint/suspicious/noExplicitAny: serialized lint vocabulary from the page.
type Props = { options: SingleSlideOptions; components?: ComponentEntry[]; componentNames?: string[]; catalogUrl?: string; lintVocab?: any; slideHeadings?: Record<string, ('h1' | 'h2')[]>; slideBlocks?: Record<string, string[]> };

export default function StudioShell({ options, components: seedComponents = [], componentNames, catalogUrl, lintVocab, slideHeadings, slideBlocks }: Props) {
	// The component catalog is FETCHED, not inlined (2026-08-17 loading audit §5, §9.3).
	// Serialized into the island's props it was ~180KB raw — 72% of a 433KB HTML document,
	// parsed before hydration on every launch to serve a gallery the user may never open.
	// `seedComponents` still seeds it, so a caller that passes the array directly (every
	// unit test does) behaves exactly as before and never fetches.
	const [components, setComponents] = React.useState<ComponentEntry[]>(seedComponents);
	// RETRY, because the degraded state is silent and wide. A failed fetch leaves the
	// catalog empty, and an empty catalog does not throw — it removes the Add-slide
	// launcher entirely, empties the per-slide drawer's variant controls, and makes the
	// Coach's density/bucket findings vanish so it reports a BETTER grade than the truth.
	// Offline is a supported state here (this is an installed PWA), so a single failure
	// must not be permanent for the tab. `componentNames` keeps LINT honest throughout,
	// but it covers only lint.
	const [catalogAttempt, setCatalogAttempt] = React.useState(0);
	React.useEffect(() => {
		if (components.length || !catalogUrl || catalogAttempt > 3) return;
		let alive = true;
		let timer = 0;
		const retry = () => {
			if (!alive) return;
			// Back off 1s, 2s, 4s — enough to ride out a flaky connection or a service
			// worker revalidating, without hammering a genuinely offline device.
			timer = window.setTimeout(() => alive && setCatalogAttempt((n) => n + 1), 1000 * 2 ** catalogAttempt);
		};
		fetch(catalogUrl)
			.then((r) => (r.ok ? r.json() : null))
			.then((rows) => {
				if (!alive) return;
				if (Array.isArray(rows) && rows.length) setComponents(rows as ComponentEntry[]);
				else retry();
			})
			.catch(retry);
		return () => {
			alive = false;
			if (timer) window.clearTimeout(timer);
		};
	}, [components.length, catalogUrl, catalogAttempt]);
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
	const [composeLens, setComposeLens] = React.useState<PresentLens>('full'); // reader lens for the preview
	// Persona posture — the always-visible, reversible density stop that replaced the
	// one-way `onboarded` ratchet + welcome banner (2026-07-17-studio-persona-dial.md).
	// Persisted, and written ONLY by an explicit dial move (never by engagement), so a
	// user boots where they left off and the surface never drifts. `'write'` is the
	// calm editor|preview surface (the old Focus body, promoted to a home); `'craft'`
	// is the full desktop. `'read'` is the full-bleed newcomer home (a beautiful deck
	// + one "Edit this slide" button); it renders inside the SAME spine with the editor
	// track at 0px but MOUNTED, so a newcomer's first edit (Read→Write) never remounts.
	const [posture, setPostureState] = React.useState<Posture>(() => loadSettings().posture);
	const postureRef = React.useRef(posture);
	postureRef.current = posture;
	const setPosture = React.useCallback((p: Posture) => { setPostureState(p); saveSettings({ posture: p }); }, []);
	// Persist a fresh visitor's DERIVED boot stop exactly once (R1), so posture only
	// ever moves by an explicit dial interaction.
	//
	// It mattered more when `derivePosture` read prior activity: a first-session act
	// like creating a deck changed the derivation's own input, so the stop silently
	// ratcheted at the next boot. Today's derivation is constant for every non-legacy
	// browser (#1286), so that specific drift is gone — but this stays, because it is
	// what makes the stored value the record. Without it a returning user's stop is
	// re-derived on every boot, and any future change to the derivation would
	// retroactively move people who had already settled somewhere.
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
	// `revealCraft` — the transient step-UP, symmetric to `quietened`'s step-down. A
	// Craft-only faculty summoned from Read/Write (Reshape today; the Inspector when
	// it's wired) docks its panel by transiently raising the rendered stop to 'craft'
	// WITHOUT writing the saved `posture` — so reaching a Craft tool never persists
	// Craft (the decision doc's "reachability ≠ arrangement" rule). It recedes when the
	// summoned panels all close, on Esc, on a dial move, and suspend/restores across
	// Fabricate — exactly like `quietened`. The two are opposite directions, so arming
	// one clears the other; hence revealCraft wins the `effectiveStop` precedence.
	const [revealCraft, setRevealCraft] = React.useState(false);
	const revealCraftRef = React.useRef(revealCraft);
	revealCraftRef.current = revealCraft;
	const effectiveStop: Posture = revealCraft ? 'craft' : quietened ? 'write' : posture;
	// Move the dial: clear any transient quiet and persist the stop. Panel open/close is
	// ORTHOGONAL to posture (T2 §4.5) — the dial changes the chrome CEILING (Craft shows
	// the activity-bar launcher; Write hides the docked columns), never forcing a panel
	// open or shut. Your open/closed panels are preserved across moves — they simply
	// aren't rendered on the calmer Write surface — so a Craft↔Write dip never thrashes
	// the coach. (The mount + breakpoint-flip defaults still seed the arrangement.)
	const changePosture = React.useCallback((p: Posture) => {
		setQuietened(false);
		setRevealCraft(false);
		setPosture(p);
	}, [setPosture]);
	// Summon a Craft-only faculty (Reshape, Inspector) from a calmer stop: transiently
	// reveal Craft so the panel can dock, WITHOUT persisting the saved posture. Clears
	// any quiet (opposite direction). At Craft already, it's just the quiet-clear — the
	// reveal is what steps up from Read/Write, and receding it returns you there.
	// CALLER CONTRACT: pair this with a panel-open in the SAME handler (e.g. reshape
	// opens the coach). A bare call self-recedes next commit (harmless, never stuck-on),
	// because the reveal only holds while a summoned panel is docked.
	const revealCraftDock = React.useCallback(() => {
		setQuietened(false);
		if (postureRef.current !== 'craft') setRevealCraft(true);
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
	const [activeAssistant, setActiveAssistant] = React.useState<'coach' | 'chat' | 'lenses' | 'library' | null>(null); // panels start closed at every stop; Craft shows the activity-bar launcher, panels open on demand (T2 §4.5 orthogonality — posture never force-opens a panel)
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
	// Whether any Craft-only panel is docked — read by the `[view]`-only Fabricate
	// restore (which can't list panel state as a dep) to avoid re-revealing Craft with
	// nothing open.
	const panelsOpenRef = React.useRef(false);
	panelsOpenRef.current = architectOpen || lensesOpen || libraryOpen || inspectorOpen;
	// A transient Craft reveal recedes once the faculties it was summoned for all
	// close — mirroring `quietened`'s auto-clear. The summon batches revealCraft + the
	// panel-open in one commit, so on the opening render a panel is already open and
	// this never fires prematurely; it clears only after the last docked panel closes.
	// useLayoutEffect (not useEffect): the recede must run BEFORE paint, or closing the
	// coach paints one frame of empty Craft chrome (activity bar, no panel) + a 52px
	// layout jump before the passive effect clears it (red-team/checker finding).
	React.useLayoutEffect(() => {
		if (revealCraft && !architectOpen && !lensesOpen && !libraryOpen && !inspectorOpen) setRevealCraft(false);
	}, [revealCraft, architectOpen, lensesOpen, libraryOpen, inspectorOpen]);
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
	// Sessions that ended without a clean unload — the crash sentinel's harvest
	// (lib/crash-sentinel.ts). Collected once on mount, BEFORE anything else can
	// write to storage.
	const [crashReports, setCrashReports] = React.useState<CrashReport[]>([]);
	const [crashOpen, setCrashOpen] = React.useState(false);
	// COLLECTED, NEVER ANNOUNCED. There used to be a boot toast here, and it had to
	// go: a browser unloading a backgrounded tab is the ordinary end of most
	// sessions and is indistinguishable from a crash from inside the page, so what
	// the author actually saw was "The Studio stopped unexpectedly" on returning to
	// a tab that had been sitting idle — a crash notice where there had been no
	// crash. An alarm that is usually wrong is worse than no alarm, because it
	// spends the credibility the one true alarm needs. The way IN is Workspace →
	// General → Crash reports, a place the author goes rather than a thing that
	// finds them — and the same group carries the switch that decides whether
	// anything is recorded at all (off by default). This effect only READS, so it
	// is correct either way: with recording off it simply finds whatever was
	// recorded while it was on.
	React.useEffect(() => {
		setCrashReports(collectCrashReports(Date.now()));
	}, []);
	// NOT FIXED HERE, deliberately — see issue #1621. When the browser reloads a
	// dead tab BY ITSELF, this boot often has nothing to say: immediate reporting
	// needs `isSameTab`, which needs a navigation typed `reload`, and at least one
	// real browser does not type its own recovery load that way. Three designs for
	// closing that gap were built and all three were withdrawn — two guessed a
	// deadline against the wrong clock, and the third (a Web Lock held for the life
	// of the document, which is the RIGHT primitive for "is that document still
	// alive") makes the page ineligible for the back/forward cache, which silently
	// kills the `bfcached` signal two lines below in `onPageHide` — the iOS
	// eviction path, on the platform the report came from. Until that trade is
	// settled the report waits out the staleness window, which is slow but never
	// accuses a live tab.
	const dismissCrash = React.useCallback((id: string) => setCrashReports((was) => was.filter((r) => r.id !== id)), []);
	// Workspace → Crash reports → View. See OPEN_CRASH_REPORT_EVENT for why this is
	// an event and not a prop.
	React.useEffect(() => {
		// RE-COLLECT, don't just open. `crashReports` was gathered once at mount,
		// but a report that is not same-tab only becomes eligible after the
		// staleness window — so Workspace could count one (it re-collects on open)
		// while the shell still held none, the sheet was never mounted, and View
		// was a button that did nothing at all.
		const open = () => {
			setCrashReports(collectCrashReports(Date.now()));
			setCrashOpen(true);
		};
		addEventListener(OPEN_CRASH_REPORT_EVENT, open);
		return () => removeEventListener(OPEN_CRASH_REPORT_EVENT, open);
	}, []);
	// Mobile StudioDrawer "back" behavior: a row that opens a further sheet (Library,
	// Reader views, Version history, Search, Feedback, Add slide) used to just
	// close the drawer and open the child — so dismissing the child dropped the user all
	// the way back to the toolbar, not back to the drawer they came from (reported).
	// `closeDrawerAndOpen` arms this flag when the drawer navigates away, and the effect
	// below re-opens the drawer once the surface it left for is gone — but ONLY when the
	// drawer was the one that opened it. Every one of these surfaces has other entry points
	// (the activity bar, the command palette, the tablet dropdown), and those paths never
	// arm the flag, so this is a no-op for them.
	//
	// `returns: false` is REQUIRED for a row that opens NO sheet — "Fix all issues" runs an
	// editor method, "Show me" starts a tour. Arming the flag for those left it armed
	// forever (nothing ever closes to disarm it), so the NEXT close of ANY wrapped sheet,
	// from ANY entry point, sprang the drawer open. Found by two independent design agents
	// reading this code; CI could never have caught it.
	//
	// WHY an effect over "no child is open" rather than wrapping each sheet's own
	// `onOpenChange` (which is what this did first): the wrapper fired on the CLOSING sheet
	// and could not see what opened in the same commit. Two live paths broke it — the
	// command palette's `run` is `onOpenChange(false); fn()`, so drawer → Search → "Library"
	// re-opened the drawer UNDERNEATH the Library it just launched; and Lenses/Library also
	// close via a bare `setActiveAssistant(null)` (the docked frame is a div and never fires
	// `onOpenChange`), which left the flag armed indefinitely. Deriving the reopen from the
	// SET of child surfaces makes both correct by construction: whatever closed, the drawer
	// comes back exactly when nothing it could have launched is on screen any more.
	const [drawerPendingReturn, setDrawerPendingReturn] = React.useState(false);
	const disarmDrawerReturn = React.useCallback(() => setDrawerPendingReturn(false), []);
	const closeDrawerAndOpen = React.useCallback((openChild: () => void, opts?: { returns?: boolean }) => {
		setMoreOpen(false);
		setDrawerPendingReturn(opts?.returns !== false);
		openChild();
	}, []);
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
	// Present OVERLAYS the current view (its z-100 backdrop fully covers Fabricate), so it
	// does NOT leave Fabricate — Escape returns you there with your in-progress theme/component
	// work intact. Present renders its OWN preview (PresentOverlay), so opening it never
	// disturbs the editor's in-flow preview; an earlier version unmounted Fabricate to force a
	// global iframe count of 1, which silently destroyed unsaved fabrication state (Fabricate
	// keeps it in un-persisted useState) — the adversarial trio flagged that as data loss, so
	// Present now leaves Fabricate mounted.
	// Present is the heaviest thing the Studio opens (a second render surface, plus a
	// popup window when the Stage is used) — the crumb is what tells a later
	// crash report that the heap climb started here.
	const openPresent = React.useCallback(() => { crashCrumb('action', 'opened Present'); setPresentOpen(true); }, []);
	// #1751 (engineering/decisions/2026-08-23-studio-shell-decomposition.md):
	// PresentOverlay is React.lazy below. `presentEverOpened` latches true once PresentOverlay
	// has actually MOUNTED (via its `onReady` callback below) and never resets, so from then on
	// it stays mounted across close/reopen like Editor/ComposeView do — PresentOverlay's own
	// internal state (`idx`, its `prevOpenRef` open-transition tracking) is written assuming it
	// never unmounts once it has rendered once; its `if (!open)` cleanup effects (closing the
	// Stage window, resetting rehearsal state) depend on that too.
	//
	// Deliberately NOT latched on `presentOpen` alone (a first cut of this did, and shipped a
	// second regression, caught in review): the chunk fetch is async, so between the click and
	// the mount there is a window where `presentOpen` is true but nothing has mounted yet. If
	// the latch fired eagerly on click, that window's Suspense boundary could never unmount —
	// Escape/backdrop-dismiss below flips `presentOpen` back to false, but with the latch
	// already true the wrapping condition stays true regardless, so the loading fallback would
	// keep showing, unresponsive, until the fetch happens to finish. Gating the latch on actual
	// mount instead means that same Escape/dismiss, pressed before the first mount, unmounts the
	// whole boundary and cancels the wait for real — and is still a no-op safety-wise on every
	// mount AFTER the first, since PresentOverlay is then already staying mounted.
	const [presentEverOpened, setPresentEverOpened] = React.useState(false);
	// While Present is requested but not yet mounted (first load in flight), nothing else owns
	// Escape — PresentOverlay binds its own window Escape handler once mounted, and the shell's
	// own key handler (below, `presentOpenRef.current` check) deliberately defers to it whenever
	// Present is open. Without this, a slow connection leaves Escape (and everything else) dead
	// for however long the chunk takes — a regression this split introduced, since the pre-split
	// PresentOverlay was always mounted and always owned Escape. Scoped narrowly: removes itself
	// the moment PresentOverlay actually mounts (`presentEverOpened` flips true) or Present closes.
	React.useEffect(() => {
		if (!presentOpen || presentEverOpened) return;
		const onLoadingEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setPresentOpen(false);
		};
		window.addEventListener('keydown', onLoadingEscape);
		return () => window.removeEventListener('keydown', onLoadingEscape);
	}, [presentOpen, presentEverOpened]);
	// Regression this same split introduced, caught before merge: `applyReadAloudDebugParam()`
	// (the `?readaloud-debug=1` URL param, a documented on-device debug path) used to fire on
	// every Studio load because PresentOverlay's own boot effect ran unconditionally — it was
	// ALWAYS mounted, just internally hidden. Now that PresentOverlay only mounts on first
	// Present open, that effect no longer runs at Studio boot. Call it here too so the param is
	// honored immediately regardless of whether Present is ever opened; PresentOverlay's own
	// call (on its own first mount) stays as a harmless no-op re-application.
	React.useEffect(() => { applyReadAloudDebugParam(); }, []);
	// PERSIST the live preview-box rect (viewport fractions) on unload, so the next reload's
	// pre-hydration Nacre shell (studio.astro) can place its skeleton at the EXACT rect the
	// app will re-measure — a same-device reload then shows zero geometry jump at hand-off.
	// This replays the app's OWN measured rect (previewBoxRef, the in-flow preview's box),
	// so the shell reimplements none of the split/stop/ratio layout math
	// and can't drift from it. Geometry only — no slide content is stored (that stays the
	// Nacre-only, state-blind skeleton). Skipped while Present is open (its box is the
	// slide-row card, not the editor anchor) and for a parked/collapsed 0-size box.
	// Is the CURRENT layout one the app can BOOT into? A stored rect is REPLAYED by the next
	// load's shell, so it has to describe a layout the app will actually re-measure. Two
	// pieces of layout state are transient in a way the rect cannot express:
	//   · DOCKED PANELS are not persisted at all (`activeAssistant`/`activeSettings` start
	//     null at every stop) — the app always boots with the Settings/assistant columns
	//     closed. A rect captured with the Coach open painted a 601px box on a 1440 Craft
	//     reload that the app immediately re-drew at 708px.
	//   · A COLLAPSED pane lives in sessionStorage while the rect lives in localStorage, so
	//     the two disagree in a NEW TAB by construction.
	//   · A TRANSIENT STOP (`quietened` / `revealCraft`) changes what is rendered without
	//     changing what is persisted, so the measured stop is not the stop that will boot.
	// `splitPanelIds` already names the docked set (just the editor|preview pair means nothing
	// is docked), so it is the honest test for the first — the same list the layout store
	// buckets by.
	// When the layout is not boot-shaped, DROP the stored rect rather than leave a stale one
	// to be replayed: the shell's compute path models every boot layout there is (stop,
	// breakpoint, cinema, the Craft activity rail, the persisted split AND the collapsed
	// side), so falling back to it is correct, not a degradation.
	//
	// Through a REF (the `splitApiRef` idiom below) because the split hook is declared ~1200
	// lines further down — and because the answer wanted is the one true when `pagehide`
	// FIRES, not the one captured when the listener was registered.
	const rectBootShapedRef = React.useRef(true);
	React.useEffect(() => {
		const persistRect = () => {
			if (presentOpen) return;
			if (!rectBootShapedRef.current) {
				try { localStorage.removeItem(PREVIEW_RECT_KEY); } catch {}
				return;
			}
			const el = previewBoxRef.current;
			if (!el) return;
			const r = el.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			if (r.width < 40 || r.height < 40 || vw < 1 || vh < 1) return;
			try {
				localStorage.setItem(
					PREVIEW_RECT_KEY,
					JSON.stringify({
						l: +(r.left / vw).toFixed(4),
						t: +(r.top / vh).toFixed(4),
						w: +(r.width / vw).toFixed(4),
						h: +(r.height / vh).toFixed(4),
					}),
				);
			} catch {}
		};
		const onVisibility = () => { if (document.visibilityState === 'hidden') persistRect(); };
		window.addEventListener('pagehide', persistRect);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('pagehide', persistRect);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, [presentOpen]);
	const [cmdOpen, setCmdOpen] = React.useState(false);
	const [moreOpen, setMoreOpen] = React.useState(false); // the compact "⋯ More" overflow menu
	const [insertOpen, setInsertOpen] = React.useState(false);
	// Every surface a StudioDrawer row can launch. The drawer comes back when the LAST of
	// them closes — see `drawerPendingReturn` above for why this is a set, not a wrapper.
	const drawerChildOpen = lensesOpen || libraryOpen || feedbackOpen || historyOpen || cmdOpen || insertOpen;
	React.useEffect(() => {
		if (!drawerPendingReturn || drawerChildOpen) return;
		setDrawerPendingReturn(false);
		setMoreOpen(true);
	}, [drawerPendingReturn, drawerChildOpen]);
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
			return localStorage.getItem('lattice-studio-palette') || DEFAULT_PALETTE;
		} catch {
			return DEFAULT_PALETTE;
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
	// The saved theme Fabricate opens ON, so a theme can be reopened and edited
	// rather than only made once. Until this existed there was no path back into a
	// saved theme at all: <Fabricate> took no seed, so the CSS a user saved was
	// unreachable from the UI that produced it.
	const [fabricateSeed, setFabricateSeed] = React.useState<StudioTheme | null>(null);
	// A plain function, not a `useCallback`: `setLibraryOpen` and `setView` are not
	// bare state setters here, and every other prop Library takes is an inline arrow
	// anyway — a memo that has to list them buys nothing and can go stale.
	const editTheme = (t: StudioTheme) => {
		setFabricateSeed(t);
		setLibraryOpen(false);
		setView('fabricate');
	};
	// CLEARED ON EVERY EXIT, not just Fabricate's own Close. `view` moves from
	// 'fabricate' through at least six other paths (the launcher's Decks item, the
	// mode buttons, a share/present entry), and a seed left standing means the NEXT
	// visit to Fabricate silently opens on someone else's saved theme — id-pinned, so
	// naming it something new renames and overwrites the original. One effect on the
	// view is the only place that catches all of them.
	React.useEffect(() => {
		if (view !== 'fabricate') setFabricateSeed(null);
	}, [view]);
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
				if (!BUILTIN_PALETTES.includes(p) && !list.some((t) => t.name === p)) applyPalette(DEFAULT_PALETTE);
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
		// The Nacre-only shell carries no slide CSS to clean up (the retired snapshot/newcomer
		// paths owned `#ssr-snap-css` / `#ssr-newcomer-css`); just remove the node after the fade.
		setTimeout(() => el.remove(), 260);
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
	const previewBoxRef = React.useRef<HTMLDivElement>(null);
	// The deck's own corner as a FRACTION of the slide's width, measured off the live render
	// by DeckPreview and published only on change (so not per keystroke). `0` is a square
	// deck: the default, and every deck predating the `corners:` register.
	const [deckCorner, setDeckCorner] = React.useState(0);


	// Dismiss the instant-shell when the editor preview first renders (its own Nacre loader
	// now covers the preview area) OR at the 8s backstop above. The editor DeckPreview lives
	// in-flow in `previewBoxRef` and fires `onFirstRender` on its first paint — idempotent.
	const onPreviewFirstRender = React.useCallback(() => {
		crashCrumb('render', 'first preview paint');
		dismissSsrShell();
	}, [dismissSsrShell]);
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
	const composeRef = React.useRef<ComposeHandle>(null);
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
	// The overflow fix is the forced fit-by-height on the previewBox (see its className) — a
	// landscape phone is always wider than a 16:9 slide, so height binds; the container was
	// never the problem (`100dvh` already equals the visible height). The on-device geometry
	// probe that diagnosed it is now the standalone Viewport-debug overlay (ViewportDebugOverlay
	// + Workspace → Diagnostics + `?vvdebug`); it reads the `data-cinema-stage` element below.
	// See 2026-07-20-landscape-phone-preview-lock.md §Real-device fix.
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
	// The viewed slide's index in `viewSlides` — clamped, and the position the preview reports to
	// the engine as deck context (below). Split out of `slide` because the index is now load-
	// bearing on its own, not just a lookup step.
	const viewIndex = viewSlides.length ? Math.max(0, Math.min(activeSlide, viewSlides.length - 1)) : 0;
	const slide = viewSlides[viewIndex] ?? '';
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
	// Name list first, catalog second: `componentNames` is inlined by studio.astro (~1KB)
	// precisely so the editor's lint never falls back to the stale hardcoded KNOWN subset
	// during the window before the fetched catalog arrives — that subset false-flags valid
	// components on the welcome deck.
	const catalogNames = React.useMemo(
		() => (components.length ? components.map((c) => c.name) : componentNames?.length ? componentNames : KNOWN),
		[components, componentNames],
	);
	const knownWithLocal = React.useMemo(() => [...catalogNames, ...localNames], [catalogNames, localNames]);
	const lintKnown = React.useMemo(() => (validation ? knownWithLocal : usedComponents(source)), [validation, source, knownWithLocal]);
	const issues = React.useMemo(() => unknownComponents(source, lintKnown).length, [source, lintKnown]);

	// Panels are persistent columns on desktop, on-demand sheets below it. Reset
	// their open state to the right default whenever the breakpoint flips so a
	// compact load never auto-pops a sheet and a return to desktop re-docks them.
	// Panels close on a breakpoint flip and open on demand — posture never
	// force-opens the coach (T2 §4.5 orthogonality); Craft's signal is the visible
	// activity-bar launcher, not an auto-docked panel.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the breakpoint flip itself — the body reads no reactive value, but the RESET must fire whenever `compact` changes (a stranded sheet on resize is the bug this closes).
	React.useEffect(() => {
		setActiveAssistant(null); setActiveSettings(null);
		// The "⋯ More" overflow only exists on compact; close it across any tier flip
		// so a menu opened on a phone doesn't strand open after a resize to desktop
		// (where its trigger unmounts) — red-team H4.
		setMoreOpen(false);
	}, [compact]);
	// `compact` is true on BOTH tablet and mobile, so the effect above never fires on
	// a tablet↔mobile flip — and the ⋯/hamburger Menu switches from the tablet DropdownMenu
	// to the mobile StudioDrawer (different component, different trigger identity) at
	// exactly that transition. A menu left open on one side would otherwise reopen as
	// the WRONG surface on the other. Kept as its OWN effect, deliberately separate from
	// the one above, so that effect's dependency array (and its H4 test) stay untouched
	// (round-2 mobile-toolbar competition, graft from "The Verb Row & the View Row").
	// biome-ignore lint/correctness/useExhaustiveDependencies: same shape as the effect above — the reset must fire on the bp/landscape flip itself, not on a reactive value the body reads.
	React.useEffect(() => {
		setMoreOpen(false);
		// Disarm too: a flag armed on a phone must not survive a flip to a tier where the
		// drawer doesn't exist, or the next sheet closed on THAT tier would try to reopen it.
		setDrawerPendingReturn(false);
	}, [bp, landscapePhone]);

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
		// Refresh the pre-paint shell's mirror. Deliberately derived from `src` HERE
		// rather than passed in: this is the deck's real title as the deck states it —
		// its `title:` override, else its heading — never its creation label (which stays
		// put; see IndexEntry). Mirroring the RESOLVED title is what keeps the pre-paint
		// shell from flashing a cover heading the override was set to replace.
		syncDerivedTitle(id, resolveTitle(src)?.text ?? null);
	}, []);

	// The active deck's TITLE, derived live from what's in the editor: a deck is named by
	// its `title:` override when it sets one, else by its first heading — so typing either
	// renames the deck in the switcher, the header, ⌘K, Share and the export filename with
	// no separate rename step. `deck.title` is only the fallback for a deck carrying
	// neither (it holds the last name the deck was loaded/created under).
	const deckTitle = React.useMemo(() => titleFromSource(source, deck.title), [source, deck.title]);

	// Keep the crash record's header current: what was open when it died. LABELS and
	// SIZES only — a deck's title and its slide count, never a line of its content —
	// because this text is what a user is invited to paste into a public issue.
	// Deck SIZE earns its place: a heavy deck is the leading suspect in an
	// out-of-memory report, and it is invisible from any other field.
	React.useEffect(() => {
		setCrashContext({
			Deck: deckTitle,
			Slides: viewSlides.length,
			'Deck size': `${Math.round(source.length / 1024)} KB`,
			Stop: effectiveStop,
			Palette: palette,
		});
	}, [deckTitle, viewSlides.length, source.length, effectiveStop, palette]);
	// A deck SWITCH is a breadcrumb; typing inside one is not (it would flood the ring
	// sixty entries deep in a minute and push out everything that mattered). Through a
	// ref so the crumb carries the title at SWITCH time without making every keystroke
	// that renames the deck re-fire the effect.
	const deckTitleRef = React.useRef(deckTitle);
	deckTitleRef.current = deckTitle;
	// The id rides along with the title because the title is EDITABLE — two crumbs
	// reading "deck: Untitled" are indistinguishable, and a report is read long after
	// the deck has been renamed.
	React.useEffect(() => { crashCrumb('nav', `deck: ${deckTitleRef.current} (${deck.id})`); }, [deck.id]);

	// The deck list as the switcher + ⌘K should SEE it: `decks` holds each deck's
	// stored title/meta, which for the ACTIVE deck goes stale the moment you type —
	// so the active row is projected from the live editor instead.
	const deckList = React.useMemo(() => decks.map((d) => (d.id === deck.id ? { ...d, title: deckTitle, meta: metaFor(source) } : d)), [decks, deck.id, deckTitle, source]);

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
	// The deck's shelf name, RAW from `title:` — empty when the deck has no override, which
	// is the common case: the field then shows its placeholder (the heading-derived name) so
	// the control reads as "this is what the deck is called, blank follows the cover".
	const deckNameOverride = (getFrontMatter(source, 'title') ?? '').trim() ? (getFrontMatter(source, 'title') ?? '') : '';
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
			const normalized = /-dark$/.test(t) ? writeFrontMatterLine(s, 'theme', t.replace(/-dark$/, '')) : s;
			// Also clear a legacy `class: print` so the key is the single source of truth.
			const cleared = removeClassTokens(normalized, 'dark light print');
			return writeFrontMatterLine(cleared, 'color-mode', value === 'default' ? null : value);
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
			// `color-mode: dark` pin before we replace the theme, unless the deck already pins
			// a canvas — so swapping the palette never silently drops the deck's darkness.
			// The menu only offers base names, so `name` itself is never `-dark`.
			//
			// It writes the KEY, not the legacy `class: dark`: that alias is refused whenever
			// `color-mode:` is set (lib/core/deck-class-register.js), so stamping it would be a
			// no-op on exactly the decks most likely to be re-themed — and `color-mode:` is
			// already "the single home for deck color mode" per setDeckColorMode above.
			const cur = (getFrontMatter(s, 'theme') || '').trim();
			const hasCanvasPin = !!(getFrontMatter(s, 'color-mode') || '').trim()
				|| deckClassList.includes('dark') || deckClassList.includes('light');
			if (/-dark$/.test(cur) && !hasCanvasPin) out = writeFrontMatterLine(out, 'color-mode', 'dark');
			return writeFrontMatterLine(out, 'theme', name);
		});
	// …and WRITE to it (the editor + every export update in lock-step).
	const finish = getFrontMatter(source, 'finish') || 'none';
	// A finish's backdrop is BAKED into its CSS (a 5th finish layer, generateFinishCss →
	// `--fin-backdrop-*`), so applying a finish just sets `finish:` — nothing is stamped.
	// The deck author OVERRIDES any baked layer — backdrop strength/clearance included —
	// through the single `finish-override:` front-matter map, which deep-merges into the
	// finish's recipe and regenerates its CSS (see `finishExtraCss`).
	const setFinish = (value: string) => settingsWrite(`Finish → ${value}`, (s) => writeFrontMatterLine(s, 'finish', value === 'none' ? null : value));
	// The `mode:` axis (rendering mode — boardroom / sketch), a sibling of finish.
	// (The key can't be `style:` — that's Marp's built-in inline-CSS directive.)
	// Named `renderMode` locally to avoid clashing with the light/dark `mode` below.
	const renderMode = getFrontMatter(source, 'mode') || 'boardroom';
	const setRenderMode = (value: string) => settingsWrite(`Mode → ${value}`, (s) => writeFrontMatterLine(s, 'mode', value === 'boardroom' ? null : value));
	// Chart motion — the deck-wide `motion:` default (off is the baseline; clears the key). A slide
	// overrides it with a `motion-*` class in the slide drawer. Preview-only; export is untouched.
	// Chart motion — three deck-wide axes (Play / Style / Speed), full parity with the front matter.
	// Play off is the baseline (clears the key); Style default build + Speed default auto are omitted.
	const motionPlay = (getFrontMatter(source, 'motion') || '').trim().toLowerCase() === 'on';
	const toggleMotionPlay = () => settingsWrite(motionPlay ? 'Motion off' : 'Motion on', (s) => writeFrontMatterLine(s, 'motion', motionPlay ? null : 'on'));
	const motionStyle = getFrontMatter(source, 'motion-style') || 'build';
	const setMotionStyleFM = (value: string) => settingsWrite(`Motion style → ${value}`, (s) => writeFrontMatterLine(s, 'motion-style', value === 'build' ? null : value));
	const motionSpeed = getFrontMatter(source, 'motion-speed') || 'auto';
	const setMotionSpeedFM = (value: string) => settingsWrite(`Motion speed → ${value}`, (s) => writeFrontMatterLine(s, 'motion-speed', value === 'auto' ? null : value));
	// The white-label brand bar (`spectrum:` register). `on` is the rainbow default, so it
	// writes no key; off / solid write the register.
	const spectrum = getFrontMatter(source, 'spectrum') || 'on';
	const setSpectrum = (value: string) => settingsWrite(`Brand bar → ${value}`, (s) => writeFrontMatterLine(s, 'spectrum', value === 'on' ? null : value));
	// The accent sub-family — siblings of the brand bar (spectrum STYLE). Each defaults to a
	// no-token value (bar on top / no card rail / auto rule / plain eyebrow), so a default deck
	// writes no key. See lib/core/resolve-spectrum.js / resolve-rule.js / resolve-eyebrow.js.
	const spectrumEdge = getFrontMatter(source, 'spectrum-edge') || 'top';
	const setSpectrumEdge = (value: string) => settingsWrite(`Bar placement → ${value}`, (s) => writeFrontMatterLine(s, 'spectrum-edge', value === 'top' ? null : value));
	const spectrumCard = getFrontMatter(source, 'spectrum-card') || 'off';
	const setSpectrumCard = (value: string) => settingsWrite(`Card rail → ${value}`, (s) => {
		const out = writeFrontMatterLine(s, 'spectrum-card', value === 'off' ? null : value);
		// Turning the rail off drops the placement too — a `spectrum-card-edge:` with no rail is
		// dead front matter the (now-hidden) placement picker could no longer clear.
		return value === 'off' ? writeFrontMatterLine(out, 'spectrum-card-edge', null) : out;
	});
	// Card rail PLACEMENT (`spectrum-card-edge:`) — left is the default (no key); only meaningful
	// when the card rail is on, so the picker is shown only then.
	const spectrumCardEdge = getFrontMatter(source, 'spectrum-card-edge') || 'left';
	const setSpectrumCardEdge = (value: string) => settingsWrite(`Card rail placement → ${value}`, (s) => writeFrontMatterLine(s, 'spectrum-card-edge', value === 'left' ? null : value));
	const headingRule = getFrontMatter(source, 'rule') || 'auto';
	const setHeadingRule = (value: string) => settingsWrite(`Heading rule → ${value}`, (s) => writeFrontMatterLine(s, 'rule', value === 'auto' ? null : value));
	const eyebrow = getFrontMatter(source, 'eyebrow') || 'plain';
	const setEyebrow = (value: string) => settingsWrite(`Eyebrow → ${value}`, (s) => writeFrontMatterLine(s, 'eyebrow', value === 'plain' ? null : value));
	const headline = getFrontMatter(source, 'headline') || 'auto';
	const setHeadline = (value: string) => settingsWrite(`Headline → ${value}`, (s) => writeFrontMatterLine(s, 'headline', value === 'auto' ? null : value));
	// Structural trim (`spectrum-trim:`) — off by default (quiet); `on` flows the spectrum onto
	// the in-content accents. On writes the key; off clears it.
	const spectrumTrim = getFrontMatter(source, 'spectrum-trim') || 'off';
	const setSpectrumTrim = (value: string) => settingsWrite(`Structural trim → ${value}`, (s) => writeFrontMatterLine(s, 'spectrum-trim', value === 'off' ? null : value));
	// ── The registers the Inspector gained in the coverage audit ────────────────────
	// Each one the engine already reads and no panel offered (see
	// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.2). Same
	// shape as every register above: read with a named baseline, and write `null` at
	// that baseline so a default deck carries no key.

	// Corners (`corners:`) — whether the slide surface itself is rounded. lib/core/resolve-corners.js.
	const corners = getFrontMatter(source, 'corners') || 'square';
	const setCorners = (value: string) => settingsWrite(`Corners → ${value}`, (s) => writeFrontMatterLine(s, 'corners', value === 'square' ? null : value));
	// Claim (`claim:`) — how much frame the content sits inside. lib/core/resolve-claim.js.
	const claim = getFrontMatter(source, 'claim') || 'framed';
	const setClaim = (value: string) => settingsWrite(`Claim → ${value}`, (s) => writeFrontMatterLine(s, 'claim', value === 'framed' ? null : value));
	// Deck-wide stamp SHAPE (`stamp:`) and tone SHAPE (`tone:`). These are the DECK
	// halves of two axes whose per-slide overrides the slide Inspector has offered all
	// along — the asymmetry the audit found. There is no named baseline (an absent key
	// means the engine's own default shape), so the head option is a `__default__`
	// sentinel rather than a register value.
	const stampStyleFM = getFrontMatter(source, 'stamp') || '';
	const setStampStyleFM = (value: string) => settingsWrite(value === DEFAULT_SENTINEL ? 'Stamp style → default' : `Stamp style → ${value}`, (s) => writeFrontMatterLine(s, 'stamp', value === DEFAULT_SENTINEL ? null : value));
	const toneStyleFM = getFrontMatter(source, 'tone') || '';
	const setToneStyleFM = (value: string) => settingsWrite(value === DEFAULT_SENTINEL ? 'Tone style → default' : `Tone style → ${value}`, (s) => writeFrontMatterLine(s, 'tone', value === DEFAULT_SENTINEL ? null : value));
	// Pace (`pace:`) — how long a self-presenting deck holds on a new slide before it
	// speaks. lib/core/resolve-pace.mjs; `natural` is the default, so it clears the key.
	const pace = getFrontMatter(source, 'pace') || DEFAULT_PACE;
	const setPace = (value: string) => settingsWrite(`Pace → ${value}`, (s) => writeFrontMatterLine(s, 'pace', value === DEFAULT_PACE ? null : value));
	// Slide splitting (`split:`) — headings (default) or `---` dividers. lib/core/resolve-split.js.
	// `slideSplit`, not `split` — the Studio already has a `split` in scope (the resizable
	// editor/preview divider), and shadowing it silently breaks every layout read below.
	const slideSplit = getFrontMatter(source, 'split') || 'headings';
	const setSlideSplit = (value: string) => settingsWrite(`Slide splitting → ${value}`, (s) => writeFrontMatterLine(s, 'split', value === 'headings' ? null : value));
	// Deck form (`form:`) — the masthead band + bay + rail composition. Mirrors
	// readFormMode in plugins.js: standard is the default and ONLY off/false/no opts out.
	const formOn = !/^(off|false|no)$/i.test((getFrontMatter(source, 'form') || '').trim());
	const toggleForm = () => settingsWrite(formOn ? 'Deck chrome off' : 'Deck chrome on', (s) => writeFrontMatterLine(s, 'form', formOn ? 'off' : null));
	// Auto-glossary (`glossary:`) — an appendix slide built from the acronym registry's
	// definitions. lib/core/glossary-auto.mjs; the canonical written value is `auto`.
	const glossaryOn = /^(auto|on|true|yes)$/i.test((getFrontMatter(source, 'glossary') || '').trim());
	const toggleGlossary = () => settingsWrite(glossaryOn ? 'Auto-glossary off' : 'Auto-glossary on', (s) => writeFrontMatterLine(s, 'glossary', glossaryOn ? null : 'auto'));
	// The deck LOGO and its four placement modifiers. Read by plugins.js + lib/runtime,
	// rendered by the masthead logo tile. `logo:` is a path or URL; the modifiers only
	// mean anything once it is set, so the Inspector hides them until then.
	const logo = getFrontMatter(source, 'logo') || '';
	const setLogo = (v: string) => settingsWrite('Logo', (s) => writeFrontMatterLine(s, 'logo', v.trim() || null));
	const logoOn = getFrontMatter(source, 'logo-on') || 'all';
	const setLogoOn = (value: string) => settingsWrite(`Logo on → ${value}`, (s) => writeFrontMatterLine(s, 'logo-on', value === 'all' ? null : value));
	const logoStyle = getFrontMatter(source, 'logo-style') || 'auto';
	const setLogoStyle = (value: string) => settingsWrite(`Logo style → ${value}`, (s) => writeFrontMatterLine(s, 'logo-style', value === 'auto' ? null : value));
	// Placement + size ride as free numbers (the engine clamps: x/y 0–100 as the logo
	// CENTER in %, scale 0.2–3). A blank field clears the key back to the default spot.
	const logoX = getFrontMatter(source, 'logo-x') || '';
	const logoY = getFrontMatter(source, 'logo-y') || '';
	const logoScale = getFrontMatter(source, 'logo-scale') || '';
	const setLogoNum = (key: 'logo-x' | 'logo-y' | 'logo-scale', label: string) => (v: string) =>
		settingsWrite(label, (s) => writeFrontMatterLine(s, key, v.trim() || null));
	// The masthead META line (`meta:`) — the small line in the status bay.
	const metaLine = getFrontMatter(source, 'meta') || '';
	const setMetaLine = (v: string) => settingsWrite('Meta line', (s) => writeFrontMatterLine(s, 'meta', v.trim() || null));
	// The deck-wide DEFAULT SLIDE CLASS (`class:`) — a modifier stamped on every slide.
	// The Section-rail toggle owns `no-progress` inside the same key, so this field
	// deliberately shows and writes only the OTHER tokens: showing `no-progress` here
	// would let a stray edit silently flip a control two rows up (and the field would
	// re-render with a token the author never typed).
	// The stamp / tone SHAPE vocabularies come from the generated lint vocab — the same
	// source the slide Inspector's per-slide pickers read, so the deck default and the
	// per-slide override can never offer different shapes.
	const stampVocab = (lintVocab as { stampStyles?: { boardroom: string[]; range: string[] } } | null)?.stampStyles ?? { boardroom: [], range: [] };
	const toneVocab = (lintVocab as { toneStyles?: string[] } | null)?.toneStyles ?? [];
	const RAIL_TOKEN = 'no-progress';
	const deckClass = (getFrontMatter(source, 'class') || '').split(/\s+/).filter((t) => t && t !== RAIL_TOKEN).join(' ');
	const setDeckClass = (v: string) => settingsWrite('Default slide class', (s) => {
		const kept = v.trim().split(/\s+/).filter(Boolean);
		if (!deckRail) kept.push(RAIL_TOKEN); // the rail toggle's token survives the edit
		return writeFrontMatterLine(s, 'class', kept.length ? kept.join(' ') : null);
	});
	// The layout DEBUG overlay — a real deck setting (`debug:` front matter), so it
	// rides in previewFm to the render and is stripped from every export. Off is the
	// default; the reveal modes are on-hover / on-always, each with an optional
	// `verbose` (adds the class + box levers). The menu offers every value; a
	// hand-typed value we don't recognize shows verbatim. No aliases.
	const debugValue = getFrontMatter(source, 'debug');
	const setDebug = (value: string | null) => setSource((s) => writeFrontMatterLine(s, 'debug', value));
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
	const setDeckLang = (value: string) => settingsWrite(value === LANG_AUTO ? 'Language → workspace default' : `Language → ${langDisplay(value)}`, (s) => writeFrontMatterLine(s, 'lang', value === LANG_AUTO ? null : value));
	const setDeckSize = (value: string) => settingsWrite(`Size → ${value}`, (s) => writeFrontMatterLine(s, 'size', value));
	const togglePageNumbers = () => settingsWrite(pageNumbers ? 'Page numbers off' : 'Page numbers on', (s) => writeFrontMatterLine(s, 'paginate', pageNumbers ? null : 'true'));
	const toggleLift = () => settingsWrite(lift ? 'Card lift off' : 'Card lift on', (s) => writeFrontMatterLine(s, 'lift', lift ? null : 'on'));
	// Write the declared text (trimmed); a blank field clears the directive so the
	// band turns off — no separate toggle, the presence of text IS the switch.
	// The deck's SHELF NAME — `title:` front matter. This is the only way to CREATE the
	// override: Rename deliberately rewrites whichever source the name already comes from
	// and never grows front matter on a deck that has none, so without this control the
	// override could only be reached by hand-writing YAML into a drawer whose whole purpose
	// is "front matter without the YAML". Blank CLEARS the key (`|| null`), which restores
	// heading derivation — the same shape as Header/Footer, so clearing is discoverable.
	// (`title:` was the FIRST key routed through the lossless `writeFrontMatterLine`, in #1254,
	// because it is the one key an author is told to hand-write — so the deck carrying it is
	// exactly the deck with comments, `_class:` and `style: |` blocks to lose. #1256 moved every
	// other deck-scope control onto that same writer and retired the whole-block one, so being
	// lossless is a property of the module now, not a choice made at this call site.)
	const setDeckName = (v: string) => settingsWrite('Deck name', (s) => writeFrontMatterLine(s, 'title', v.trim() || null));
	const setHeaderText = (v: string) => settingsWrite('Header', (s) => writeFrontMatterLine(s, 'header', v.trim() || null));
	const setFooterText = (v: string) => settingsWrite('Footer', (s) => writeFrontMatterLine(s, 'footer', v.trim() || null));
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
		// Re-read the list AFTER that flush: the deck we're leaving may have been
		// retitled by an edit (titles derive from the heading), and the switcher shows
		// stored titles for every deck but the active one.
		setDecks(loadDeckList());
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
		// Dedupe by the deck's stable creation LABEL, not by its displayed title: the demo
		// types a whole board deck in, so the displayed title (its first heading) is no
		// longer "My First Deck" by the time the walkthrough ends. The label is the one
		// thing that survives that — and because an explicit Rename is what moves it,
		// renaming the deck still lifts it out of the demo slot, which is how a newcomer
		// who KEEPS this deck protects it from the next run. (A fixed id was tried here
		// and reverted: it made re-running a tour silently delete a kept deck along with
		// its checkpoints, chat, and comments.)
		for (const { id, label } of deckLabels()) {
			if (label === DEMO_FIRST_DECK_TITLE) deleteDeckStore(id);
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
		// PRESERVE history.state — `replaceState(null, …)` wipes overlay-back.ts's ownership
		// marker, the only record of its synthetic entry that survives a reload.
		//
		// Be precise about what this fixes, because the first version of this comment was not:
		// today it fixes NOTHING OBSERVABLE. This effect is ref-guarded with `[]` deps, so it
		// runs once on mount, and overlay-back pushes its sentinel only when a panel opens —
		// strictly later. There is no marker here yet to lose. The invariant held by
		// effect-ordering coincidence rather than by construction, which is the whole problem:
		// add a dependency, drop the ref guard, or move this call, and the back guard silently
		// stops recognizing its own entry after a reload, with nothing failing at the moment
		// of the mistake. Passing state through costs one expression and removes the trap.
		window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
		newDeckRef.current();
	}, []);
	// Import a deck from an external `.md` file — seed a new persisted deck with its
	// content (title from the first heading) and load it.
	const importInputRef = React.useRef<HTMLInputElement>(null);
	// Open a deck source into a fresh deck. `comments` (from a .lattice import) are
	// restored onto the NEW deck id so they travel with the file. Returns nothing;
	// notifies on success.
	function openImportedDeck(rawText: string, title: string, comments?: unknown) {
		// THE STUDIO'S DECK-IMPORT LINE-ENDING BOUNDARY, and it belongs HERE — at the funnel —
		// not in a caller. Deck source reaches this function two ways: a plain `.md` via
		// `file.text()`, and a `.lattice` zip whose `deck.md` carries whatever the machine that
		// exported it wrote. A first cut normalized only the `.md` caller and called the boundary
		// covered, which is the same mistake that produced #1349: fix the path you were looking
		// at, declare the class closed. Everything downstream (the editor, ~55 register kernels,
		// every export) assumes LF. `\r\n?` covers Windows CRLF and classic-Mac lone CR, and is
		// a no-op on text that is already LF.
		//
		// It is ONE of the Studio's ingest boundaries, not the only one. `SANCTIONED_EOL_BOUNDARIES` in `tools/check-ownership.js` is the
		// authoritative list — that is why the normalization is a NAMED function rather than an
		// inline `.replace` at each door. A reference doc (`reference-doc.ts`) deliberately does
		// NOT normalize: it is model grounding context, never spliced into deck source and never
		// exported.
		const text = normalizeSourceText(rawText);
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
	// Normalization happens in `openImportedDeck` (the funnel both import paths cross), so
	// this caller does not repeat it — `titleFromSource` reads a heading, which no line-ending
	// convention affects.
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
				// A stale tab fails HERE before it ever reads the file (#1242): the reader is a
				// lazy chunk, and a superseded deploy's URL is gone. Blaming the .lattice file
				// for that sends the user to re-export a perfectly good deck — name the real
				// cause instead. This import is async, so it never reaches the ErrorBoundary.
				.catch((err) => notify(messageForFailure(err, err?.message || 'Could not read that .lattice file.')));
			return;
		}
		file.text().then(importDeckFromText).catch(() => notify('Could not read that file.'));
	}
	// Rename REWRITES whatever the deck's title actually comes from — its `title:`
	// front-matter override when it has one, else its first heading — because that is
	// the deck's title; storing a label beside it would put the switcher and the deck in
	// permanent disagreement. Editing the WINNING source is what keeps Rename honest: on
	// an override deck, rewriting the cover heading instead would appear to do nothing.
	// It goes through settingsWrite like every other source-touching setting, so it lands
	// in the editor and is undoable. A deck with neither has nothing to rewrite: it falls
	// back to the stored label.
	function renameActiveDeck(title: string) {
		const t = title.replace(/\s+/g, ' ').trim();
		if (!t) return;
		// Compare against what would actually be STORED, not the raw input: on the heading
		// path a leading `#` is stripped, so `#Q4` and `Q4` are the same rename. Comparing
		// the raw input meant re-entering an unchanged name wrote an identical source and
		// pushed a fresh undo entry every time, never converging.
		const stored = storedTitleFor(source, t);
		if (stored && stored === resolveTitle(source)?.text) return;
		if (stored && retitleSource(source, t)) {
			settingsWrite(`Rename → ${stored}`, (s) => retitleSource(s, t) ?? s);
		} else if (!resolveTitle(source) && !decksClearedRef.current) {
			// Neither an override nor a heading to carry the name — record it as the deck's
			// explicit label. Gated on `resolveTitle` being null rather than on retitleSource
			// having failed: a deck that HAS a title source but produced no writable value
			// (renaming to a bare `#`) must fall through to nothing, not quietly overwrite the
			// creation label — that field is write-once by design (the demo dedupes on it).
			// Guarded like every other write: a rename during the Privacy & Data
			// clear→reload window must not re-create the index it just wiped.
			// Strip a leading `#` here too. This branch is the label, not a heading, but the
			// prompt prefills a raw heading and a user who edits it can leave the marker on —
			// and a label of `#` is the write-once creation field silently overwritten with
			// punctuation. No writable name means no write at all.
			const label = t.replace(/^#+\s*/, '').trim();
			if (!label) return;
			setDeckLabel(deck.id, label);
			setDeck((cur) => ({ ...cur, title: label }));
			setDecks(loadDeckList());
			notify(`Renamed to “${label}”.`);
			return;
		} else if (!stored) {
			return; // nothing was written — don't claim a rename that didn't happen
		}
		// Report the name the user will SEE, which is display-normalized: markdown stripped
		// from a heading and the whole thing capped at 60. Reporting the stored value made the
		// toast honest about the write and still able to disagree with the switcher beside it.
		notify(`Renamed to “${titleFromSource(retitleSource(source, t) ?? source, stored ?? t)}”.`);
	}
	// What Rename PREFILLS: the deck's raw winning title, not `deckTitle`. `deckTitle` is
	// display-normalized — markdown stripped, hard-capped at 60 chars — and Rename writes
	// its result back into the deck, so prefilling with it silently deleted the author's
	// emphasis and everything past the cap from their cover slide the moment they edited
	// the name. The prompt also NAMES what it is about to rewrite, so a deck whose shelf
	// name is deliberately not its cover doesn't look like Rename is aimed at the slide.
	const renamePrompt = () => {
		const cur = resolveTitle(source);
		const where =
			cur?.from === 'front-matter'
				? 'Rename deck — this rewrites its title: front matter, not the cover slide'
				: cur
					? 'Rename deck — this rewrites its title heading'
					: 'Rename deck';
		const t = window.prompt(where, cur?.text ?? deckTitle);
		if (t != null) renameActiveDeck(t);
	};
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
			if (palette === t.name) applyPalette(DEFAULT_PALETTE);
			notify(`Removed “${t.label}” from your library.`);
		});
	}
	// Navigate to a slide from the preview side (rail / arrows): move the preview
	// AND scroll the editor to that slide (mapping the viewed index back to its
	// position in the full source), so the two panes stay in lock-step.
	// `opts.focus` overrides the pointer-derived default below. Gesture and keyboard
	// navigation passes `false`: turning the deck with a swipe, a wheel or an arrow
	// key is intent to keep reading, and taking the caret would hand the NEXT arrow
	// press to the editor instead of the deck (#1294).
	function goToSlide(i: number, opts: { focus?: boolean; expand?: boolean } = {}) {
		// Moving the preview is INTENT to see it (the Playground's toPreview
		// lesson): a collapsed preview expands first — a no-op when it's open —
		// so a navigation never lands in a hidden pane.
		//
		// `expand: false` for KEY and GESTURE nav. That rule was written for an explicit
		// PICK (a rail row, the ‹ › buttons), where re-opening the pane is the point.
		// An arrow key is not a pick: an author who collapsed the preview to write
		// full-width should not have their layout rearranged by a stray keystroke. With
		// the pane collapsed the arrows still walk the deck — the editor scrolls slide to
		// slide — which is the useful reading of "move through slides" in an editor-only
		// layout, and it leaves the choice of pane widths where the author put it.
		if (opts.expand !== false) splitApiRef.current.expand('b');
		const idx = Math.max(0, Math.min(i, viewSlides.length - 1));
		setActiveSlide(idx);
		const fullIdx = composeLens === 'full' ? idx : slides.indexOf(viewSlides[idx]);
		if (fullIdx < 0) return;
		// Drive WHICHEVER editor is mounted (only one is, per editMode, so the other
		// call is a free no-op) — but take FOCUS only where focus is cheap.
		//
		// With a mouse, focusing is the whole point: picking a slide in the preview is
		// intent to work on it, so the caret lands on its first editable line and the
		// next keystroke edits what you just chose (#1288, #1291). On a TOUCH device
		// the same call raises the software keyboard, which covers half a tablet and
		// has to be dismissed by hand — on every single slide selection. That turns
		// navigation into a chore, so touch gets the reveal WITHOUT the focus: the
		// slide still scrolls into view, and tapping into the text (a deliberate act,
		// with the keyboard as its expected consequence) is what starts editing.
		const focus = opts.focus ?? hasFinePointer();
		editorRef.current?.revealSlide(fullIdx, { focus });
		composeRef.current?.revealSlide(fullIdx, { focus });
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
	// The Compose divider's "Add slide below" — focus that slide, then open the unified
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
	// The shared cross-surface guided-tours flag (tour-prefs). Its switch lives in
	// Workspace → General and its copy promises "hide them everywhere" — which was untrue
	// here: the Studio's own Show-me menu ignored it. Subscribed, so a flip made from the
	// Playground (or the sheet) takes effect without a reload.
	const [toursOn, setToursOn] = React.useState(true);
	React.useEffect(() => {
		setToursOn(toursEnabled());
		const off = onToursEnabledChange(setToursOn);
		return () => {
			off();
		};
	}, []);
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
	// A mobile tour types into the Markdown editor then points at SEL.panePreview
	// (tour-kit.ts) — if Compose typing had already collapsed the pane bar
	// (`chromeCollapsed`, fed by ComposeView's onTypingCollapse) and a tour starts
	// right after, every cursor target on that bar would be zero-height. Force it
	// back open the instant a demo goes live, same as the reveal-on-scroll path a
	// real user already gets. (Round-2 mobile-toolbar competition, graft from
	// CADENCE / The Long Rail — both independently flagged this as a latent,
	// pre-existing hazard the Eight-Cell Bar sits directly on top of.)
	React.useEffect(() => {
		if (demoActive) setChromeCollapsed(false);
	}, [demoActive]);

	// ── Resizable/collapsible editor|preview split (2026-07-02 decision) ─────
	// Active on every non-mobile Compose branch (desktop, tablet, focus) — on
	// mobile the Edit/Preview pane swap owns visibility, and in Fabricate the
	// Compose grid isn't rendered; state is retained across both.
	const splitUsable = !mobile && view === 'compose';
	// What lies BEHIND every phone panel, named for its back chevron. Two answers, because
	// the header and the ⋯ menu render in BOTH views — a flat "Deck" would be a lie inside
	// Fabricate, which is the same class of mistake as the "‹ Studio" this replaces.
	const hostLabel = view === 'fabricate' ? 'Fabricate' : 'Deck';
	// react-resizable-panels split state via the shared hook (2026-07-19 migration).
	// Same surface the hand-rolled useSplit had ({ collapsed, dragging, expand,
	// collapse, reset }) so the ~20 downstream call sites are unchanged. The single-
	// slide preview scales via a cheap outer CSS transform (scaleFrame); the preview is
	// IN-FLOW in its pane, so it follows the divider THROUGH the drag natively — like the
	// Playground's in-flow iframe. It deliberately does NOT suspend scaleFrame for
	// the drag's duration: the old suspend (from the retired fixed-host era) froze it
	// so the slide overhung the shrinking neighbor pane (the "bleed"). One transform
	// write on one host per frame is negligible; onDragEnd runs one authoritative refit
	// as a belt-and-suspenders snap.
	// The panels the group is ABOUT TO RENDER — in the same order and under the same
	// conditions as the JSX below, which is why this sits beside the hook rather than being
	// inferred from it. Two things read it, and they are why it is a list of real ids now
	// rather than the hand-spelled 'SAEPT' key it used to be:
	//   · it IS the persistence bucket, so each configuration (Coach open, Library open
	//     wider, Settings docked, bare Write, tablet Inspector) keeps its own remembered
	//     widths — Library carries its own id because it docks wider than Coach/Lenses;
	//   · the hook hands it to the library as the group's starting layout, which it can only
	//     do if it knows the ids BEFORE the group mounts (#1523). Passed as
	//     `clientOnlyPanelIds` because that seed is only safe on an island that never
	//     server-renders — this one is `client:only` (studio.astro). The Playground, which
	//     hydrates, deliberately does not pass it (#1553).
	// `splitConfigKey` is DERIVED from this list, so those two cannot drift. Be precise about
	// what that does and does not buy: it does NOT tie the list to the JSX below, which stays a
	// second hand-maintained copy of the same four conditions ~2,200 lines away. A panel added
	// to the render and not to this list is worse than a missed restore — `configKey` would not
	// change either, so the restore effect never re-runs on that toggle, and the seed can render
	// another config's saved share (the library rejects an incomplete `defaultLayout` in its init
	// path but not in `getPanelStyles`). Every reachable combination was enumerated and agrees
	// today; keep them in step by hand, and treat this note as the reason to.
	const splitPanelIds = [
		...(desktop && effectiveStop === 'craft' && inspectorOpen ? ['studio-settings'] : []),
		...(desktop && effectiveStop === 'craft' && assistantOpen ? [libraryOpen ? 'studio-library' : 'studio-assistant'] : []),
		...STUDIO_SPLIT_PANEL_IDS,
		...(bp === 'tablet' && effectiveStop === 'craft' && inspectorOpen ? ['studio-tablet-inspector'] : []),
	];
	const splitConfigKey = splitPanelIds.join(',');
	const split = useResizableSplit({
		storageKey: STUDIO_SPLIT_KEY,
		active: splitUsable,
		// The complement of the shell's `defaultPreviewFrac`, derived rather than restated: the
		// two must sum to 100, and a designer re-tuning the default split will find one file.
		defaultRatio: 100 - PREVIEW_CHROME.defaultPreviewFrac * 100,
		configKey: splitConfigKey,
		clientOnlyPanelIds: splitPanelIds,
		onCollapse: (side) => notify(side === 'b' ? 'Preview collapsed — rendering paused.' : 'Editor collapsed.'),
		// No onDragStart suspend — scaleFrame tracks the pane live (see above). One
		// authoritative refit of every live host on release covers any host that was
		// disconnected mid-drag.
		onDragEnd: () => suspendScaleObservers(false),
	});
	// Stable handle for callbacks defined above/below without dep churn (the
	// Playground's splitApiRef pattern).
	const splitApiRef = React.useRef(split);
	splitApiRef.current = split;
	// Whether the CURRENT layout is one the app can boot into — read by the preview-rect
	// persistence above at `pagehide` time. See the note there for why a docked panel or a
	// collapsed pane disqualifies the rect.
	// `effectiveStop === posture` is the third clause, and it is not optional: `quietened` (⌘.)
	// and `revealCraft` change the RENDERED stop without persisting it, so a session that ends
	// with either armed measures one stop and boots into another. Ending a Craft session with
	// quiet armed stored a Write-shaped rect that the next load replayed against Craft — the box
	// 29px off, through the replay path the shell trusts over compute.
	rectBootShapedRef.current = splitPanelIds.length === STUDIO_SPLIT_PANEL_IDS.length && effectiveStop === posture && !(splitUsable && split.collapsed);
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
	// The Coach's profile control. `null` = let the deck decide (its own `profile:` front
	// matter, then inference, then the lenient fallback). Session-only and deliberately
	// NOT written into the deck: an override is a "what would this look like as…" lens,
	// and silently rewriting the author's front matter from a dropdown is not that.
	const [profileOverride, setProfileOverride] = React.useState<string | null>(null);
	// Diagrams Mermaid's own parser rejects. `null` until the check has run for this deck
	// (or when it can't run) — DISTINCT from `[]`, which is the positive statement "every
	// diagram parses". The chat grounds on that difference: an empty list lets it say the
	// diagrams are fine, `null` leaves it silent rather than guessing. See mermaid-check.ts.
	const [diagramErrors, setDiagramErrors] = React.useState<DiagramError[] | null>(null);
	const [deckHasContent, setDeckHasContent] = React.useState(false);
	const [assessing, setAssessing] = React.useState(true);
	// The active deterministic Coach chip result card (one open at a time). No model.
	const [coachCard, setCoachCard] = React.useState<{ id: string; card: CoachCard } | null>(null);
	const [talkMinutes, setTalkMinutes] = React.useState<number | null>(null);
	// Bumped by anything that supersedes an in-flight chip answer — another chip, the toggle,
	// Close. `theAsk`, `structureCheck` and `pacing(src, minutes)` all await a lazily-imported
	// chunk, so a click stays in flight long enough for the user to act again.
	const chipRunRef = React.useRef(0);
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
			assessDeck(source, lintVocab, components, localNames, savedFinishLintNames, profileOverride ?? undefined).then((a: CoachAssessment) => {
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
	}, [source, lintVocab, components, localNames, savedFinishLintNames, profileOverride]);
	// Mermaid's own verdict on this deck's diagrams, for the chat's grounding — the answer
	// to the question the Architect used to fabricate. Keyed on the DIAGRAM TEXT rather
	// than the source, so editing prose around a diagram doesn't re-parse it; a deck with
	// no diagrams never loads the (~1MB) library at all. Debounced past the assessment so
	// a burst of typing settles first. A failure to load reports `[]` rather than a guess.
	const diagramSignature = React.useMemo(() => extractDiagrams(source).map((d) => d.code).join('\u0000'), [source]);
	React.useEffect(() => {
		let live = true;
		// UNKNOWN until this round answers. Without the reset, the previous deck's verdict —
		// or the pre-edit one, across the 900ms debounce — kept grounding the prompt as
		// current fact. A deck with no diagrams is also `null`: there is nothing to report,
		// and "every diagram parses cleanly" over a deck with none is a vacuous claim that
		// invites the model to discuss diagrams that don't exist.
		setDiagramErrors(null);
		if (!diagramSignature) return;
		// Read the deck through the ref, so the DIAGRAM TEXT is the only trigger — depending
		// on `source` would re-parse on every prose keystroke for no change in the answer.
		const id = setTimeout(() => {
			checkDiagrams(sourceRef.current, options?.mermaidUrl ?? '').then((errs) => {
				if (live) setDiagramErrors(errs);
			});
		}, 900);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, [diagramSignature, options?.mermaidUrl]);
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
		// Only the findings-DERIVED cards go stale here. This clear used to be unconditional,
		// and because `findings` is a fresh array out of every assessment round, the round that
		// lands ~400ms after any deck change wiped whatever quick read the author had opened in
		// the meantime — including the three cards that round says nothing about. In the jsdom
		// suite the settling round landed 25-30ms before the "Structure" chip click and the card
		// was gone before the assertion could see it (#1831); in the Studio it is an author
		// clicking a chip inside the debounce window and watching the card vanish unprompted.
		setCoachCard((c) => (c && FINDINGS_DERIVED_CHIPS.has(c.id) ? null : c));
	}, [findingKeys, stopFixTimer]);

	// …and the deck moving is what makes ANY quick read stale, so that clear keys on `source`.
	// `source` changes synchronously with the edit, where the findings round trails it by the
	// 400ms debounce — so the card now also clears when the author expects it to, not a beat
	// later, and a chip clicked AFTER the edit is no longer canceled by that edit's round.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `source` is the staleness signal; the setter is stable.
	React.useEffect(() => {
		setCoachCard(null);
	}, [source]);

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
				// ⌘. quiets to Write — the opposite of a Craft reveal, so drop any reveal first.
				// If we're dismissing a TRANSIENT reveal, close its summoned panel(s) too (see Esc).
				if (viewRef.current !== 'fabricate') { if (revealCraftRef.current) { setActiveAssistant(null); setActiveSettings(null); } setRevealCraft(false); setQuietened((v) => !v); }
			} else if (e.key === 'Escape') {
				// Esc clears either transient overlay (whichever is armed) back to the saved stop.
				// Dismissing a transient Craft REVEAL also closes the panel(s) it was summoned for:
				// a summon + Esc is one "never mind" episode, so the panel must not linger open-but-
				// hidden and pop back on the next Craft visit (adversarial-trio R4). A panel opened at
				// a PERSISTENT Craft stop (revealCraft already false) is untouched — its orthogonal
				// preservation across a Craft↔Write dip is the documented, intended behavior.
				if (viewRef.current !== 'fabricate') { if (revealCraftRef.current) { setActiveAssistant(null); setActiveSettings(null); } setRevealCraft((v) => (v ? false : v)); setQuietened((v) => (v ? false : v)); }
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	// Fabricate is its own full-screen surface; never sit quietened OR craft-revealed
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
			suspendedRevealRef.current = revealCraftRef.current;
			if (quietenedRef.current) setQuietened(false);
			if (revealCraftRef.current) setRevealCraft(false);
		} else {
			if (suspendedQuietRef.current) { suspendedQuietRef.current = false; setQuietened(true); }
			// Only re-reveal Craft if the summoned panel actually survived Fabricate — a
			// breakpoint flip mid-Fabricate can reset the panels, and restoring a reveal
			// with nothing open would flash Craft for one frame before the recede clears it.
			if (suspendedRevealRef.current) { suspendedRevealRef.current = false; if (panelsOpenRef.current) setRevealCraft(true); }
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
	// Mirrors for the mount-once navigation listeners below: the keydown handler is
	// bound to `window` for the shell's lifetime, so it must read the LIVE slide,
	// mover and Present state rather than the render that installed it.
	const slideNoRef = React.useRef(slideNo);
	slideNoRef.current = slideNo;
	const goToSlideRef = React.useRef(goToSlide);
	goToSlideRef.current = goToSlide;
	const presentOpenRef = React.useRef(presentOpen);
	presentOpenRef.current = presentOpen;
	// The full-deck index of the slide currently in view (for handing off to Present).
	const activeFullIndex = composeLens === 'full' ? slideNo - 1 : Math.max(0, slides.indexOf(viewSlides[slideNo - 1]));

	// The preview card's aspect follows the deck's selected Size (not a fixed 16:9);
	// The preview box CONTAINS the slide (whole slide visible, never cropped) at the deck's
	// aspect ratio, letterboxing the pane's spare axis.
	//
	// PRIOR ART (retired, #1186): a pure-CSS `width: min(100%, 100cqh × ratio)` against
	// `container-type:size` on the pane — no measured state, no race. It broke on a real
	// iPad/iOS Safari: `100cqh` intermittently resolves to 0 against a flex-derived container
	// height, collapsing the box to 0-width. The shared render kernel gates its reveal on a
	// real pixel width (single-slide-render.ts's `frameHasPainted` + `clientWidth`), so a
	// 0-width box left the preview stuck on its loader forever — the reported "tablet preview
	// is broken." engineering/decisions/2026-07-21-studio-preview-reframe-in-place.md diagnosed
	// this as the keystone root cause and prescribed a letterbox; a pure-CSS aspect-ratio
	// letterbox was re-verified here and found to ALSO collapse (Chromium: `aspect-ratio` +
	// `max-width/max-height: 100%` + `margin:auto` alone resolves to the box's tiny intrinsic
	// size, not the pane's bounds, when neither axis has an explicit basis).
	//
	// So this measures instead — the same technique PresentOverlay already ships (its
	// `slideMaxW` state, ResizeObserver on `slideRowRef`): a ResizeObserver reads the holder's
	// real CONTENT-box size and the box's width is computed in JS as `min(paneW, paneH × ratio,
	// cap)`. A transient 0-dim read (the iOS load reflow the retired comment warned about) is
	// ignored — `measure()` only commits a size when BOTH dims are positive, so the box holds
	// its last good size instead of collapsing.
	//
	// A CALLBACK ref, not `useRef` + a mount-once `useEffect` (checker-caught regression): the
	// holder isn't a stable node for the shell's lifetime — `previewPane` (below) is one of
	// several MUTUALLY EXCLUSIVE JSX branches (mobile / landscape-phone / desktop-tablet), so
	// crossing one (e.g. rotating a phone) unmounts the old holder and mounts a fresh one. A
	// `[]`-dep effect captures the FIRST holder only; the observer is left watching a detached
	// node (which reports 0×0 and is correctly ignored by the `w>0 && h>0` guard above) while
	// the NEW holder goes unobserved forever — `previewPaneSize` freezes at the pre-rotation
	// value. A ref CALLBACK fires on every attach/detach, so each new holder gets its own
	// observer and the stale one is torn down with it.
	const previewRatio = sizeRatio(deckSize);
	const previewRatioValue = previewRatio[0] / previewRatio[1];
	const [previewPaneSize, setPreviewPaneSize] = React.useState<{ w: number; h: number } | null>(null);
	const previewHolderRoRef = React.useRef<ResizeObserver | null>(null);
	// The zoom controller rides the SAME callback ref as the observer, and for the
	// same reason spelled out above: the holder is not a stable node, so a `[]`-dep
	// effect would leave the listeners bound to a detached pre-rotation holder while
	// the live one answered no gesture at all.
	const zoomRef = React.useRef<PreviewZoomHandle | null>(null);
	// The badge's EXISTENCE is React state; its NUMBER is not. A pinch samples at
	// pointer rate (~120Hz on a good trackpad), so a `useState(scale)` here fired a
	// fresh setState per sample and re-rendered this whole (very large) component
	// mid-gesture — measured at 4x/6x CPU throttle as two ~55ms long tasks and 15
	// frames over 32ms during one pinch, against ZERO for the pan that writes the
	// same transform without touching the badge. A boolean bails out of re-rendering
	// on every sample after the first (React compares with Object.is), and the
	// percentage is written straight to the DOM below.
	const [previewZoomed, setPreviewZoomed] = React.useState(false);
	const previewZoomScale = React.useRef(1);
	const zoomBadgeRef = React.useRef<HTMLButtonElement>(null);
	const paintZoomBadge = React.useCallback((scale: number) => {
		previewZoomScale.current = scale;
		setPreviewZoomed(scale > 1);
		const el = zoomBadgeRef.current;
		if (!el) return; // not mounted yet — the mount render reads the ref for its first text
		const pct = `${Math.round(scale * 100)}%`;
		if (el.textContent === pct) return;
		el.textContent = pct;
		el.setAttribute('aria-label', `Reset zoom to fit — currently ${pct}`);
	}, []);
	const previewHolderRef = React.useCallback((holder: HTMLDivElement | null) => {
		previewHolderRoRef.current?.disconnect();
		previewHolderRoRef.current = null;
		zoomRef.current?.dispose();
		zoomRef.current = null;
		if (!holder || typeof ResizeObserver === 'undefined') return;
		// ZOOM owns the preview's whole input stream — swipe and wheel navigation
		// included. A NATIVE-listener controller rather than the React
		// `onTouchStart`/`onWheel` handlers it replaces, for two reasons that both bite
		// silently: React's synthetic touch/wheel listeners are PASSIVE, so a
		// `preventDefault()` in them cannot stop the browser zooming the page under us;
		// and the swipe rule and the zoom rule have to agree about what the current
		// gesture IS. Two listeners racing over one touch stream is exactly how a pinch
		// came to be measured as a 120px swipe and turned the deck (verified on the real
		// Studio: pinch on slide 3 landed on slide 4 at 1440 and 820).
		// Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.
		//
		// Every getter is LAZY, so this never depends on child-vs-parent ref ordering,
		// and `navRef` is the file's latest-ref idiom — the callback is `[]`-stable.
		zoomRef.current = attachPreviewZoom(holder, {
			viewport: () => previewBoxRef.current,
			target: () => previewBoxRef.current?.querySelector<HTMLElement>('[aria-label="Live deck preview"]') ?? null,
			onNav: (action) => navRef.current(action),
			onZoom: paintZoomBadge,
		});
		const measure = (contentRect?: { width: number; height: number }) => {
			// `entry.contentRect` is the CONTENT box (excludes padding/border) — the same box
			// `100cqh` measured pre-fix. `clientWidth`/`clientHeight` are the PADDING box
			// (checker-caught: reading them here over-sized the letterbox by 2× the holder's
			// padding, eating into the intended gutter). Fall back to them only for the
			// synchronous first call below, where no ResizeObserverEntry exists yet.
			const w = contentRect ? contentRect.width : holder.clientWidth;
			const h = contentRect ? contentRect.height : holder.clientHeight;
			if (w > 0 && h > 0) setPreviewPaneSize({ w, h });
		};
		measure();
		const ro = new ResizeObserver(([entry]) => measure(entry?.contentRect));
		ro.observe(holder);
		previewHolderRoRef.current = ro;
		// `paintZoomBadge` is itself `useCallback([])`, so listing it keeps this ref
		// callback stable — the holder is not re-bound on every render.
	}, [paintZoomBadge]);
	// ── Slide navigation: all three input verbs, on every surface ─────────────────
	// Touch swipe, wheel (mouse OR trackpad, either axis) and the arrow keys all
	// turn the viewed deck, at every breakpoint. No verb is gated on device class:
	// a "desktop" is as likely to be a touchscreen laptop as a tower, a tablet
	// takes a keyboard case and a mouse, and a phone can be paired with both
	// (#1294). The thresholds come from the shared kernel so the shell, Present and
	// the export player cannot drift apart again — the horizontal-only wheel
	// rule this replaces ignored every wheel mouse ever made.
	//
	// `nav('next'|'prev')` is the one mover: goToSlide(slideNo) is next,
	// goToSlide(slideNo - 2) is prev (both clamp).
	//
	// GESTURE NAV DOES NOT TAKE THE CARET (`focus: false`). Clicking a filmstrip
	// row is intent to work on that slide, so it lands the caret there; flicking or
	// arrowing through the deck is intent to keep READING, and yanking focus into
	// CodeMirror would hand the very next arrow press to the caret instead of the
	// deck — one keystroke of navigation, then silence.
	// Every action the kernel can name gets its own landing, keyed by name. An
	// `action === 'next' ? … : …` two-way collapse silently turned Home into "prev"
	// and End into "prev" — the keymap carries four actions, not two, so a binary
	// switch is wrong the moment `first`/`last` reach it.
	const nav = React.useCallback((action: string) => {
		const cur = slideNoRef.current; // 1-based; goToSlide takes a 0-based index
		const to = action === 'next' ? cur : action === 'prev' ? cur - 2 : action === 'first' ? 0 : action === 'last' ? Number.MAX_SAFE_INTEGER : null;
		if (to === null) return; // an action this surface does not implement — do nothing, quietly
		goToSlideRef.current(to, { focus: false, expand: false });
	}, []);
	// The latest-ref idiom this file already uses for `goToSlideRef`/`slideNoRef`:
	// the holder's `[]`-stable callback ref reaches navigation through here rather
	// than closing over a `nav` declared below it.
	const navRef = React.useRef(nav);
	navRef.current = nav;
	// Zoom is a property of LOOKING AT ONE SLIDE, not of the deck.
	//
	// NOT because the offset would be "random" — this comment used to say so, and it
	// was simply false. The kernel works in viewport-relative pixels and every slide
	// renders into the same box at the same fit scale, so persisting (scale, x, y)
	// would land on the IDENTICAL region of the next slide.
	//
	// The real reason is weaker, and is recorded as such: consecutive slides are often
	// the same layout, but often enough they are not (a table, then a section title),
	// and arriving at 3× on a slide whose content sits somewhere else reads as a bug.
	// Reconsidered after #1555 with both directions written up — persisting serves the
	// actual boardroom use ("row 3 in Q1, now Q2, now Q3"), and the asymmetry runs
	// against resetting, since unwanted persistence is one click on the badge to undo
	// where unwanted reset has no undo at all — and KEPT, on a human call: never
	// surprising beats never re-pinching. Settled, not merely unexamined.
	// See engineering/decisions/2026-08-10-preview-pinch-zoom.md § "Three judgment
	// calls worth naming".
	// biome-ignore lint/correctness/useExhaustiveDependencies: slideNo IS the trigger; the handle is a ref.
	React.useEffect(() => {
		zoomRef.current?.reset();
	}, [slideNo]);
	// Arrow keys (and PageUp/PageDown, what a presentation clicker emits) turn the
	// deck from anywhere in the shell that isn't a typing target — so Read, where
	// there is no editor at all, arrows straight through, and Write/Craft arrow
	// through whenever the caret isn't in the text. `shellKeyAction` returns null
	// for a modified chord, for a focused input/contenteditable, and for a focused
	// item inside an open menu or dialog.
	//
	// Present and Fabricate are excluded: Present binds its OWN window handler
	// (with Space, Escape and the overview keys on top), so leaving this one live
	// would move the deck twice per press, and Fabricate is a full-screen surface
	// with no deck on show.
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (presentOpenRef.current || viewRef.current === 'fabricate') return;
			// SOMETHING ALREADY ANSWERED THIS KEY. A widget that owns the arrows for its
			// own focus movement — every Radix roving-focus group: the Inspector's pill
			// tabs, its Auto/Light/Dark and M/L/XL radio segments, the Library's column —
			// calls `preventDefault()` and does NOT stop propagation, so the event still
			// reaches this window listener. Without this check one ArrowRight both moved
			// the highlight AND turned the deck, which re-pointed a slide-scoped Inspector
			// at a different slide mid-interaction. Honoring `defaultPrevented` covers
			// every such widget generically, including ones not written yet — a role
			// allowlist has to be extended for each new one and silently misses the rest.
			if (e.defaultPrevented) return;
			// ZOOM BY KEYBOARD. The other three verbs are pointer-free; zoom shipped
			// reachable only by pinch, ctrl+wheel or a middle button — i.e. gated on
			// pointer capability, which is exactly what the input-verb parity rule
			// forbids. `+`/`-`/`0` (the browser's own zoom keys) close it, so a
			// keyboard-only or switch user has a route in and, crucially, a route back
			// to fit: the reset badge only EXISTS once you have already zoomed.
			// `zoomKeyAction` shares the typing/modifier guard with navigation, so it
			// stands down in the editor and never steals a ⌘+/⌘- browser zoom.
			const zoomAct = zoomKeyAction(e, document.activeElement);
			if (zoomAct) {
				e.preventDefault();
				const h = zoomRef.current;
				if (h) {
					if (zoomAct === 'reset') h.reset();
					else h.stepBy(zoomAct === 'in' ? 1 : -1);
				}
				return;
			}
			const act = shellKeyAction(e, document.activeElement);
			if (!act) return;
			e.preventDefault();
			nav(act);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [nav]);

	// ── The editor's live preview (in-flow; Present owns its own) ──────────────────
	// The editor preview is a normal layout child of `previewBoxRef` (see below) — no
	// hoisted fixed host, no measure-and-track. Present renders its OWN preview
	// (PresentOverlay), so there is no shared iframe to re-aim and no iOS fixed-vs-visual
	// drift. `mermaid` is unified to the shown slide so a same-signature edit stays a patch.
	// DECK CONTEXT, not a lone slide. The preview renders the whole viewed deck and displays
	// `viewIndex` (DeckPreview's `slideIndex`). Handing the engine one sliced-out slide is what
	// printed "1" as the page number on EVERY slide: the engine numbers a slide by its ordinal
	// position among the sections of the document it parses, so a one-slide document is always
	// page 1 of 1. It is the VIEWED set (a reader lens reshapes the deck), so a lens numbers
	// within what the audience actually sees — the same set Present and the overview number over.
	// Memoized: this joins the WHOLE deck, and the shell re-renders far more often than the
	// deck changes (every panel toggle, every clock tick). The value is what DeckPreview diffs
	// by string value, so a stable identity also keeps the render deps honest.
	const editorSample = React.useMemo(() => previewFm + viewSlides.join(SLIDE_SEP), [previewFm, viewSlides]);
	// The alignment fallback (DeckPreview's `slideMarkdown`): the shown slide ALONE. Used when the
	// engine's section count disagrees with `viewSlides.length` — a `_focusSteps` / `split: headings`
	// deck, where one authored slide becomes several sections and an index cannot name the shown
	// slide. Then the preview renders this instead: the right slide, honestly numbered 1 of 1.
	const editorSlideAlone = React.useMemo(() => previewFm + slide, [previewFm, slide]);
	const editorMermaid = hasMermaid(slide);
	// Whether the editor preview should render (else it parks — iframe kept warm, per-keystroke
	// renders deferred): on-screen in the desktop/tablet pane (not collapsed), the Read
	// full-bleed, or the active mobile preview pane — never in Fabricate or while Present is up.
	const editorSlotVisible = view !== 'fabricate' && !presentOpen && (mobile ? effPane === 'preview' : effectiveStop === 'read' || split.collapsed !== 'b');

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
	const reshapeEntry = React.useMemo(() => components.find((c) => c.name === reshapeComponent), [components, reshapeComponent]);
	const reshapeVariants = React.useMemo(() => reshapeEntry?.variants ?? [], [reshapeEntry]);
	// The component's OWN axes decide replace-vs-toggle; the vocab axes and its declared
	// variant set are the fallbacks. Every one of these has to be passed: dropping the
	// declared variants made each reshape STACK a token instead of replacing (and made
	// "Default" stop clearing), while the picker's preview tiles — which did pass them —
	// showed the correctly-swapped result (#1281).
	const reshapeVariantAxes = React.useMemo(() => reshapeEntry?.variantAxes ?? [], [reshapeEntry]);
	const onReshape = (token: string) => mutateSlideFromPanel((c) => applyVariant(c, token, reshapeAxes, reshapeVariants, reshapeVariantAxes));

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
			chipRunRef.current++;
			setCoachCard(null);
			return;
		}
		// Without this token the late answer wrote unconditionally, so a card the user had CLOSED
		// came back from the dead, and an older chip's answer overwrote the chip they clicked
		// last — chip highlight included, since `coachCard?.id` drives it.
		const token = ++chipRunRef.current;
		let card: CoachCard;
		// Claim "not assessed" only once a round has actually FINISHED and come back with nothing:
		// `!assessing` as well as the flag and an empty findings list. While a round is in flight
		// the honest answer is not yet known, and saying so would be its own overclaim — and a
		// findings array with entries in it is proof the deck was assessed whatever the flag
		// currently reads, since the two are published by the same round and can be observed out
		// of step. Both narrowings were caught by studio.coach-card-race.test.tsx (#1840), which
		// parks the round and injects findings directly.
		if (!assessing && !deckHasContent && !findings.length && FINDINGS_DERIVED_CHIPS.has(id)) card = unassessedCard(id);
		else if (id === 'top') card = topFixes(findings);
		else if (id === 'weak') card = weakestSlide(findings);
		else if (id === 'ask') card = await theAsk(source);
		else if (id === 'structure') card = await structureCheck(source);
		else card = await pacing(source, talkMinutes ?? undefined);
		if (chipRunRef.current !== token) return;
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
				<div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--warn)_28%,transparent)] bg-[color-mix(in_srgb,var(--warn)_7%,transparent)] px-3 py-2">
					<AlertTriangle className="size-4 text-[var(--warn)]" />
					<span className="text-xs font-semibold text-[var(--text-heading)]">{issues} inline issue{issues > 1 ? 's' : ''}</span>
					<button type="button" onClick={() => editorRef.current?.fixAll()} className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">Fix all</button>
				</div>
			)}
			{/* Deck-level assessment — the REAL engine scorecard. TWO grades, not one: Craft is
			    genre-blind (same bar for every deck), Style is measured against a named profile and
			    is always shown WITH that profile, so a style score can never read as a verdict on
			    worth. Never a fabricated grade for an empty deck (K1). */}
			<ArchCard tag={<IntentTag intent={scoreIntent(scorecard?.craft.band)} />} title="Deck read">
				{!deckHasContent ? (
					<p className="text-xs leading-relaxed text-muted-foreground">Add a slide or two and I’ll assess the deck — craft, style, and the fixes that matter most. No grade is shown for an empty deck.</p>
				) : assessing && !scorecard ? (
					<div className="space-y-2" role="status" aria-label="Assessing">
						<div className="h-7 w-16 animate-pulse rounded bg-[var(--bg-alt)]" />
						<div className="h-2 w-full animate-pulse rounded bg-[var(--bg-alt)]" />
						<div className="h-2 w-2/3 animate-pulse rounded bg-[var(--bg-alt)]" />
					</div>
				) : scorecard ? (
					<>
						<div className="grid grid-cols-2 gap-2">
							{([['craft', 'Craft', 'Genre-blind — the same bar for every deck.'], ['style', 'Style', `Fit against the ${scorecard.profile.label} profile.`]] as const).map(([half, label, hint]) => (
								<div key={half} className="rounded-lg border border-border px-2.5 py-2">
									<div className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
									<div className="mt-0.5 flex items-baseline gap-1.5">
										<span className="font-sans text-[26px] font-extrabold leading-none" style={{ color: scoreIntent(scorecard[half].band) === 'fix' ? 'var(--fail,#b3261e)' : 'var(--text-heading)' }}>{scorecard[half].band}</span>
										<span className="text-[13px] font-semibold text-[var(--text-heading)]">{Math.round(scorecard[half].score)}</span>
									</div>
									<p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{scorecard[half].summary}</p>
									<p className="sr-only">{hint}</p>
								</div>
							))}
						</div>
						{/* The profile is never applied silently — it is named, its ORIGIN is named, and it
						    can be changed here. Nothing is ever inferred — a deck that declares
						    nothing is judged on `general`, and the control says so. */}
						<div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-[var(--bg-alt)] px-2.5 py-1.5">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Style judged as</span>
							<select
								aria-label="Deck profile — the genre the Style score is measured against"
								value={profileOverride ?? ''}
								onChange={(e) => setProfileOverride(e.target.value || null)}
								className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-heading)]"
							>
								<option value="">{scorecard.profile.label} ({scorecard.profile.origin})</option>
								{DECK_PROFILE_CHOICES.map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
							</select>
							{profileOverride && (
								<>
									{/* KEEP IT. The dropdown is a lens; without this it is a lens onto a number the
									    author cannot hold on to — session-only, invisible to the CLI and to anyone
									    they share the deck with. Declared-only is the right default (inference was
									    measured making 40 of 46 decks WORSE than abstaining), but declared-only with
									    no way to declare from here is why the two decks that reported the original
									    bug only recovered because someone hand-edited their front matter. */}
									<button
										type="button"
										onClick={() => {
											void applyProfileToSource(source, profileOverride).then((next) => {
												if (next === source) { notify('Couldn’t write that profile — nothing changed.'); return; }
												setCheckpoints(saveCheckpoint(deck.id, source, 'Before profile change', Date.now()));
												setSource(next);
												setProfileOverride(null);
												notify(`Deck now declares profile: ${profileOverride} — ⌘Z or restore from History to undo.`);
											});
										}}
										className="rounded-md border border-[var(--accent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]"
									>
										Keep in front matter
									</button>
									<button type="button" onClick={() => setProfileOverride(null)} className="text-[10.5px] font-semibold text-[var(--accent)]">reset</button>
								</>
							)}
							{scorecard.profile.declaredInvalid && (
								<span className="basis-full text-[10px] leading-snug text-[var(--warn)]">Front matter says <code>profile: {scorecard.profile.declaredInvalid}</code>, which isn’t a profile — using {scorecard.profile.label} instead.</span>
							)}
						</div>
						{/* Grouped by half. The categories carry `half` and it was previously unused, so
						    the panel showed two grades and then seven undifferentiated rows — undercutting
						    the split the change is about. */}
						<div className="mt-2.5 space-y-2">
							{(['craft', 'style'] as const).flatMap((half) => [
								<div key={`h-${half}`} className="pt-0.5 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
									{half === 'craft' ? 'Craft — same bar for every deck' : `Style — vs ${scorecard.profile.label}`}
								</div>,
								...scorecard.categories.filter((c) => c.half === half).map((c) => (
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
								)),
							])}
						</div>
						<p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground">Live · deterministic. Both scores measure what was <em>found</em>, not whether the deck is good — nothing here can judge whether your argument or your numbers persuade. Free.</p>
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
				<p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-widest text-[var(--pass)]">Free · no model</p>
				{coachCard && (
					<div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[12px] font-semibold text-foreground">{coachCard.card.title}</span>
							<button type="button" onClick={() => { chipRunRef.current++; setCoachCard(null); }} aria-label="Close"><X className="size-3 text-muted-foreground" /></button>
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
												((t) =>
													pacing(source, v).then((card) => {
														if (chipRunRef.current !== t) return;
														setCoachCard({ id: 'pacing', card });
													}))(++chipRunRef.current);
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
	// The "add a reader view" trigger lives in the SHEET HEADER, beside the close — the
	// slot every other panel's actions use (the Library's import is the pattern; this
	// panel was the one with its action buried at the bottom of the body). The state is
	// hoisted so the header can own the trigger while `LensesPanel` still renders the
	// archetype picker; the docked column keeps its own inline button (uncontrolled).
	const [lensAdding, setLensAdding] = React.useState(false);
	const lensCanAdd = React.useMemo(
		() => LENS_ARCHETYPES.some((a) => !lensReg.lenses.some((l) => l.id === a.id)),
		[lensReg],
	);
	React.useEffect(() => { if (!lensesOpen) setLensAdding(false); }, [lensesOpen]);

	// `hosted` = the sheet, whose HEADER owns the add trigger. The docked column is NOT
	// hosted and keeps its own inline dashed button — this body is shared by both, so
	// passing the controlled props unconditionally silently removed the docked column's
	// only way to add a reader view. Caught by the unit suite, which drives the docked one.
	const renderLensesBody = (hosted: boolean) => (
		<div className="min-h-0 flex-1 overflow-y-auto p-2.5 min-w-0 overscroll-contain [touch-action:pan-y]">
			{/* The lede, in the body. It used to be the header's `description`, which is
			    what made this one of four header heights; moving it OUT of the header was
			    right, but the first cut moved it only into `srDescription` — so a sighted
			    user lost the explanation entirely while the sentence lived on for screen
			    readers alone. Found by the independent checker. */}
			<p className="px-1.5 pb-2.5 text-[13px] leading-snug text-[var(--text-muted)]">
				A subset of this deck for one reader — you approve exactly what they see.
			</p>
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
				{...(hosted ? { adding: lensAdding, onAddingChange: setLensAdding } : {})}
			/>
		</div>
	);

	// Coach and Chat are two SEPARATE panels — the deterministic assessment and the
	// AI conversation have nothing to do with each other, so each gets its own toolbar
	// icon + drawer (no tab-switching cognitive load). Reader-views (Lenses) + Library
	// are their own panels too; all share the one mutually-exclusive assistant slot.
	const coachBody = <div className="flex min-h-0 flex-1 flex-col overflow-y-auto min-w-0 overscroll-contain [touch-action:pan-y]">{architectCards}</div>;
	// The chat grounds on the SAME deterministic facts the Coach panel shows — the engine
	// scorecard and findings — so the two can never argue from different truths, plus the
	// component catalog the Lattice primer is built from, plus Mermaid's own verdict on
	// this deck's diagrams (diagramErrors, below).
	const chatGrounding = React.useMemo(
		() => ({ scorecard, findings, catalog: components, ...(diagramErrors ? { diagrams: diagramErrors } : {}) }),
		[scorecard, findings, components, diagramErrors],
	);
	// The mobile sheet header's actions node, held as STATE (not a ref): a portal needs the
	// element to exist on a render pass, and a ref mutation alone wouldn't trigger one.
	const [chatCostSlot, setChatCostSlot] = React.useState<HTMLElement | null>(null);
	// A FACTORY, not one element: the docked column wants the chat to render its own header
	// row (title left, cost right — see ChatCost), while the mobile sheet already has
	// PanelHeader and only wants the cost.
	const chatBodyWith = (title?: string, costSlot?: HTMLElement | null) => <ArchitectChat title={title} costSlot={costSlot} deckId={deck.id} source={source} aiReady={ai.ready} grounding={chatGrounding} onApply={applyChatEdit} onConnect={() => setWorkspaceOpen(true)} onManageDocs={() => { setLibInitialFilter('refdoc'); setLibraryOpen(true); }} notify={notify} />;

	// ── Inspector body (groups) — shared by the desktop column and the sheet ──
	const inspectorBody = (
		// `SETTING_SCOPE` makes this body the container the rows measure themselves against,
		// so they stack when the PANEL is dragged narrow — not when the window is.
		<div className={cn('space-y-3 pt-1', SETTING_SCOPE)}>
			<PillTabs tabs={DECK_TABS} value={deckTab} onValueChange={(v) => setDeckTab(v as DeckTab)} ariaLabel="Deck settings sections" />
			{deckTab === 'look' && (
			<div>
				<TabNote>How the deck looks — its palette, light or dark, slide shape, and the surface behind your content.</TabNote>
				<Field label="Theme" desc="This deck's color palette." help={<>Pinning a theme saves it <strong>with the deck</strong>, so it survives a change to the website theme and travels into every export. <strong>Auto</strong> (the link icon) follows the website theme instead.</>}>
					<CatalogSelect
						ariaLabel="Choose deck theme"
						swatchShape="round"
						className="w-full"
						value={deckThemeBase || '__auto__'}
						onValueChange={(v) => setDeckTheme(v === '__auto__' ? null : v)}
						// The head names what Auto RESOLVES to (the website theme), not just the
						// word — the same shape every auto head in both scopes now uses. It is
						// safe to be this long again because the control owns a fixed half of
						// its row and truncates (SETTING_ROW); it used to widen the whole row.
						groups={[{ options: [{ value: '__auto__', label: autoHeadLabel(paletteLabel(palette)), icon: <AutoIcon />, title: 'Automatic — follow the website theme (no theme pinned to the deck).' }] }, ...themeSelectGroups(savedMenu)]}
					/>
				</Field>
				{/* The saved-theme manager is a SIBLING of the Field, not a child: the Field's
				    control column is a right-aligned half-row, so a full-width list inside it
				    would sit beside the dropdown instead of beneath the setting. (The saved
				    FINISH list below was already shaped this way.) */}
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
				<Field label="Color mode" desc="Light, dark, or follow something." help={<>The mode the deck opens in <strong>everywhere</strong> it's rendered. <strong>Light</strong> / <strong>Dark</strong> pin it. <strong>System</strong> follows the viewer's OS. <strong>Match site</strong> adopts the host — the website toggle here, the OS in a shared file. <strong>Theme default</strong> uses the theme's own mode. <strong>Print</strong> is ink on white, for paper.</>}>
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
				<Field label="Size" desc="Slide shape and dimensions." help={<>16:9 is the default landscape. The portrait and square formats are for social and mobile — they change what fits on a slide, so check a dense slide after switching.</>}>
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
				<Field label="Mode" desc="Crisp, or hand-drawn." help={<>The rendering hand: <strong>Boardroom</strong> is the clean default; <strong>Sketch</strong> draws headings, boxes and rules by hand. Separate from Finish — the two combine.</>}>
					{/* The rendering MODE (boardroom / sketch) — a separate axis from Finish
					    (the backdrop). The two compose. Front-matter key `mode:` (Marp already
					    owns `style:` for inline CSS, so the axis is named "mode"). */}
					<CatalogSelect ariaLabel="Choose mode" value={activeMode(renderMode).name} onValueChange={setRenderMode} className="w-full" groups={[{ options: catalogOptions(MODES) }]} />
				</Field>
				<Field label="Finish" desc="A backdrop behind every slide." help={<>A palette-blind layer stack — a soft gradient, wash or grain — painted behind the content. It follows whatever palette the deck is on, so it never fights the theme. Tune one in Fabricate to save your own.</>}>
					<CatalogSelect
						ariaLabel="Choose finish"
						value={activeSavedFinish ? `finish-${activeSavedFinish.name}` : activeFinish(finish).name}
						onValueChange={setFinish}
						className="w-full"
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
				<Field label="Card lift" desc="A soft shadow under card surfaces." help={<>The "Struck" elevation — a zero-blur shadow that lifts cards, KPI tiles and stats off the slide. It reads in both light and dark and survives the PDF export. A slide opts out with <code>_class: flat</code>.</>}><Toggle label="Card lift" on={lift} onClick={toggleLift} /></Field>
				<More label="More look settings">
					<Field label="Corners" desc="Square or rounded slide corners." help={<>Rounds the <strong>slide surface itself</strong> — a lighter, more screen-native frame. Square is the default. A slide opts back out with <code>_class: corners-square</code>.</>}>
						<CatalogSelect ariaLabel="Choose corners" value={activeCorners(corners).name} onValueChange={setCorners} className="w-full" groups={[{ options: catalogOptions(CORNERS) }]} />
					</Field>
					<Field label="Claim" desc="How much frame content sits inside." help={<>How much of the slide the content claims. <strong>Framed</strong> is the standard margin. <strong>Quiet</strong> pulls the frame back for dense or serial slides, <strong>Hero</strong> pushes it out for a statement, and <strong>Bleed</strong> runs content to the edges with no frame at all.</>}>
						<CatalogSelect ariaLabel="Choose claim" value={activeClaim(claim).name} onValueChange={setClaim} className="w-full" groups={[{ options: catalogOptions(CLAIMS) }]} />
					</Field>
				</More>
			</div>
			)}
			{deckTab === 'chrome' && (
			<div>
				<TabNote>The furniture that repeats on every slide — running header and footer, page numbers, the section rail, and your logo.</TabNote>
				<TextRow label="Header" desc="The line along the top. Blank hides it." help={<>A deck title or client name, repeated on every slide. Any slide can hide it on its own with <code>_class: no-header</code>.</>} value={headerText} placeholder={`e.g. ${deckTitle}`} onCommit={setHeaderText} />
				<TextRow label="Footer" desc="The line along the bottom. Blank hides it." help={<>A confidentiality or source line, repeated on every slide. Any slide can hide it on its own with <code>_class: no-footer</code>.</>} value={footerText} placeholder="e.g. Confidential" onCommit={setFooterText} />
				<Field label="Page numbers" desc="Number every slide."><Toggle label="Page numbers" on={pageNumbers} onClick={togglePageNumbers} /></Field>
				<Field label="Section rail" desc="Progress dots down the edge." help={<>The rail that tracks where you are in the deck. On by default; turning it off stamps <code>class: no-progress</code> on the deck.</>}><Toggle label="Section rail" on={deckRail} onClick={toggleDeckRail} /></Field>
				<TextRow label="Logo" desc="A path or URL to your mark." help={<>Drawn into the masthead of every slide. Point it at a file beside the deck (<code>./brand/mark.svg</code>) or a full URL. A local file is dropped from an in-browser export, which has no filesystem to copy it from — use a URL if the deck is going to be shared as a bundle.</>} value={logo} placeholder="e.g. ./brand/mark.svg" onCommit={setLogo} />
				{/* The four logo modifiers mean nothing without a logo, so they stay hidden
				    until one is set — otherwise the tab opens with four dead rows. */}
				{logo.trim() !== '' && (
					<div className="mt-1 space-y-0.5 border-l-2 border-border pl-2.5">
						<Field label="Show on" desc="Every slide, or just the cover.">
							<CatalogSelect ariaLabel="Choose which slides carry the logo" value={logoOn} onValueChange={setLogoOn} className="w-full" groups={[{ options: [{ value: 'all', label: 'All slides' }, { value: 'title', label: 'Title slide only' }] }] } />
						</Field>
						<Field label="Treatment" desc="Auto, or the brand mark." help={<><strong>Auto</strong> lets the mark sit as drawn. <strong>Brand</strong> treats it as a brand mark — the masthead gives it the placement and weight a logo expects rather than treating it as an image.</>}>
							<CatalogSelect ariaLabel="Choose logo treatment" value={logoStyle} onValueChange={setLogoStyle} className="w-full" groups={[{ options: [{ value: 'auto', label: 'Auto' }, { value: 'brand', label: 'Brand mark' }] }] } />
						</Field>
						<TextRow label="Size" desc="A multiplier. Blank is default." help={<>Scales the mark — <code>1</code> is its default size. Clamped to 0.2–3; anything outside that is ignored rather than applied.</>} value={logoScale} placeholder="e.g. 1.2" onCommit={setLogoNum('logo-scale', 'Logo size')} />
						<TextRow label="Across" desc="0–100. Blank keeps the default spot." help={<>Where the logo's <strong>center</strong> sits horizontally, as a percentage of the slide — <code>0</code> is the left edge, <code>100</code> the right. Set both Across and Down to move it off the masthead entirely.</>} value={logoX} placeholder="e.g. 92" onCommit={setLogoNum('logo-x', 'Logo across')} />
						<TextRow label="Down" desc="0–100. Blank keeps the default spot." help={<>Where the logo's <strong>center</strong> sits vertically, as a percentage of the slide — <code>0</code> is the top edge, <code>100</code> the bottom.</>} value={logoY} placeholder="e.g. 8" onCommit={setLogoNum('logo-y', 'Logo down')} />
					</div>
				)}
				<TextRow label="Meta line" desc="Small print in the masthead bay." help={<>The status line beside the heading — a date, a document number, a review stage. Distinct from the footer: it belongs to the masthead, so it sits with the title rather than at the foot of the slide.</>} value={metaLine} placeholder="e.g. Q3 FY26 · Board review" onCommit={setMetaLine} />
			</div>
			)}
			{deckTab === 'general' && (
			<div>
				<TabNote>What this deck is and how it's put together — set once, mostly at the start.</TabNote>
				<TextRow
					label="Deck name"
					desc="What this deck is called."
					help={<>Used in the deck switcher, in Share, and as the export filename. {deckNameOverride.trim() ? <>Clear the field to go back to following the cover heading.</> : <>Right now it follows the cover heading (“{deckTitle}”) — type a name here only when the shelf name isn't what belongs on the title slide.</>}</>}
					value={deckNameOverride}
					placeholder="Follows the cover heading"
					onCommit={setDeckName}
				/>
				<Field label="Language" desc="The deck's language." help={<>Two things at once: the document language carried into every export and read-aloud, and the language the AI writes content in. <strong>Auto</strong> (the link icon) inherits the workspace default. English only for now.</>}>
					<LanguageSelect
						value={deckLang || LANG_AUTO}
						ariaLabel="Choose deck language"
						includeAuto
						autoLabel={`Automatic — ${langDisplay(workspaceLang)}`}
						resolvedAuto={langDisplay(workspaceLang)}
						onValueChange={setDeckLang}
					/>
				</Field>
				<Field label="New slide on" desc="Headings, or --- dividers." help={<>How the markdown body divides into slides. <strong>Headings</strong> (the default) starts a slide at each <code>##</code>, so the deck needs no separators — a <code>---</code> still works. <strong>Dividers</strong> splits only on <code>---</code>.</>}>
					<CatalogSelect ariaLabel="Choose how slides split" value={slideSplit} onValueChange={setSlideSplit} className="w-full" groups={[{ options: [{ value: 'headings', label: 'Each ## heading' }, { value: 'rule', label: '--- dividers only' }] }] } />
				</Field>
				<Field label="Deck chrome" desc="The masthead band and status bay." help={<>The Form composition model — the masthead band, the meta/status bay and the progress rail. On for every deck by default; turning it off strips all three, leaving bare slides.</>}><Toggle label="Deck chrome" on={formOn} onClick={toggleForm} /></Field>
				<Field label="Auto-glossary" desc="Append a glossary slide." help={<>Builds a reference appendix from the <strong>definitions</strong> in your acronym registry (Speech ▸ Acronyms). It shows in the live preview — but only once at least one term carries a definition, so nothing appears until then.</>}><Toggle label="Auto-glossary" on={glossaryOn} onClick={toggleGlossary} /></Field>
				<TextRow label="Default slide class" desc="A modifier applied to every slide." help={<>Space-separated modifiers stamped on every slide — e.g. <code>no-note</code>. Color belongs to <strong>Color mode</strong>, which supersedes a <code>dark</code>/<code>light</code> token here, and a component name is ignored outright. The Section rail toggle owns its own token in this key and isn't shown here.</>} value={deckClass} placeholder="e.g. no-note" onCommit={setDeckClass} />
				{/* Developer — the two preview-only authoring aids. They used to be a footer
				    disclosure hanging below the tab strip; they are facts about this deck like
				    everything else here, so they live in General's own "more" instead. */}
				<More label="Developer">
					<p className="mb-2 text-[11px] leading-snug text-muted-foreground">Aids while you write. Preview-only — none of this appears in the export.</p>
					<Field label="Inline validation" desc="Flag unknown components as you type."><Toggle label="Inline validation" on={validation} onClick={() => { setValidation((v) => { notify(v ? 'Inline validation off — the editor stops flagging components.' : 'Inline validation on — unknown components are flagged again.'); return !v; }); }} /></Field>
					{/* Debug overlay — outlines every box by layout mode and labels the
					    structural ones on hover; `always` pins them. A deck setting (`debug:`
					    front matter), preview-only, stripped from every export.
					    engineering/decisions/2026-07-01-debug-bounding-boxes.md */}
					<Field label="Debug overlay" desc="Outline every layout box." help={<>Outlines each box by layout mode (grid / flex / flow) and labels the structural ones. <strong>Verbose</strong> adds the class and box levers. Stripped from every export, so it can safely ride in the deck.</>}>
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
				</More>
			</div>
			)}
			{deckTab === 'brand' && (
			<div>
				<TabNote>Where your accent shows. Set the theme accent to a client's brand color and everything here follows it, white-labeling the deck.</TabNote>
				<Field label="Brand bar" desc="The strip along the slide edge." help={<>The colored strip on each slide's top edge (a divider shows it as a left rail). <strong>Rainbow</strong> is the default; <strong>Solid</strong> repaints it in the theme accent — set that accent to a client's brand color to white-label the deck.</>}>
					{/* The white-label spectrum — the rainbow bar on the top border / divider
					    rail. `spectrum:` register: Rainbow (default) / None / Solid accent. Set
					    the theme accent to a client's brand and Solid follows. */}
					<CatalogSelect ariaLabel="Choose brand bar" value={activeSpectrum(spectrum).name} onValueChange={setSpectrum} className="w-full" groups={[{ options: catalogOptions(SPECTRA) }]} />
				</Field>
				{/* The accent sub-family (spectrum siblings + heading rule + eyebrow). Each reads
				    the shared --spectrum token where relevant, so it follows the Brand bar style. */}
				<Field label="Bar placement" desc="Which edge the bar sits on." help={<>Top by default. <strong>Off</strong> drops only the bar — table rails and rules keep their color.</>}>
					<CatalogSelect ariaLabel="Choose bar placement" value={activeSpectrumEdge(spectrumEdge).name} onValueChange={setSpectrumEdge} className="w-full" groups={[{ options: catalogOptions(SPECTRUM_EDGES) }]} />
				</Field>
				<Field label="Card rail" desc="A spectrum rail on card surfaces." help={<>Tunable independently of the brand bar. Off by default; <strong>Auto</strong> follows the bar, or pin Solid / Duo / Mono / Rainbow.</>}>
					<CatalogSelect ariaLabel="Choose card rail" value={activeSpectrumCard(spectrumCard).name} onValueChange={setSpectrumCard} className="w-full" groups={[{ options: catalogOptions(SPECTRUM_CARDS) }]} />
				</Field>
				{spectrumCard !== 'off' && (
					<Field label="Card rail placement" desc="Which edge of each card." help={<>Left by default.</>}>
						<CatalogSelect ariaLabel="Choose card rail placement" value={activeSpectrumCardEdge(spectrumCardEdge).name} onValueChange={setSpectrumCardEdge} className="w-full" groups={[{ options: catalogOptions(SPECTRUM_CARD_EDGES) }]} />
					</Field>
				)}
				<Field label="Structural trim" desc="Accent on in-content details." help={<>Whether the spectrum flows onto table rails, the timeline spine, code strips and <code>hr</code>. <strong>Quiet</strong> (the default) keeps those a neutral hairline and leaves the spectrum on the brand bar.</>}>
					<CatalogSelect ariaLabel="Choose structural trim" value={activeSpectrumTrim(spectrumTrim).name} onValueChange={setSpectrumTrim} className="w-full" groups={[{ options: catalogOptions(SPECTRUM_TRIMS) }]} />
				</Field>
				<Field label="Heading rule" desc="The underline under a heading." help={<>A full hairline, a short rule, an accent segment, or none. <strong>Auto</strong> draws one only where the masthead already does.</>}>
					<CatalogSelect ariaLabel="Choose heading rule" value={activeRule(headingRule).name} onValueChange={setHeadingRule} className="w-full" groups={[{ options: catalogOptions(RULES) }]} />
				</Field>
				<Field label="Eyebrow" desc="The mark on the kicker line." help={<>The kicker is the small mono-caps line above a heading. This is the mark that leads it — a dot, bar, arrow, underline, or plain.</>}>
					<CatalogSelect ariaLabel="Choose eyebrow" value={activeEyebrow(eyebrow).name} onValueChange={setEyebrow} className="w-full" groups={[{ options: catalogOptions(EYEBROWS) }]} />
				</Field>
				<Field label="Headline alignment" desc="Auto, or pin left / center / right." help={<>Aligns the whole framing cluster together — eyebrow, heading, rule, subtitle, note, key insight, caption. <strong>Auto</strong> keeps each component's own default.</>}>
					<CatalogSelect ariaLabel="Choose headline alignment" value={activeHeadline(headline).name} onValueChange={setHeadline} className="w-full" groups={[{ options: catalogOptions(HEADLINES) }]} />
				</Field>
				<More label="More accent settings">
					{(stampVocab.boardroom.length > 0 || stampVocab.range.length > 0) && (
						<Field label="Stamp shape" desc="The shape a state badge renders in." help={<>Sets the default shape for every state badge in the deck — the Draft / Confidential markers a slide carries. <strong>Boardroom</strong> holds the restrained set; <strong>More</strong> is the wider range. A slide overrides it in its own settings.</>}>
							<CatalogSelect
								ariaLabel="Choose stamp shape"
								value={stampStyleFM || DEFAULT_SENTINEL}
								onValueChange={setStampStyleFM}
								className="w-full"
								groups={[
									{ options: [{ value: DEFAULT_SENTINEL, label: 'Default — tab' }] },
									{ label: 'Boardroom', options: stampVocab.boardroom.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) })) },
									...(stampVocab.range.length ? [{ label: 'More', options: stampVocab.range.map((n) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) })) }] : []),
								]}
							/>
						</Field>
					)}
					{toneVocab.length > 0 && (
						<Field label="Tone shape" desc="How a review tone shows." help={<>Sets the default shape for pass / warn / fail tones across the deck — a side <strong>rail</strong>, a full <strong>edge</strong>, or a soft <strong>glow</strong>. A slide overrides it in its own settings.</>}>
							<CatalogSelect
								ariaLabel="Choose tone shape"
								value={toneStyleFM || DEFAULT_SENTINEL}
								onValueChange={setToneStyleFM}
								className="w-full"
								groups={[{ options: [
									{ value: DEFAULT_SENTINEL, label: 'Default — rail' },
									...toneVocab.map((t) => { const n = t.replace('tone-', ''); return { value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }; }),
								] }]}
							/>
						</Field>
					)}
				</More>
			</div>
			)}
			{deckTab === 'motion' && (
			<div>
				<TabNote>How charts animate on the live surfaces (Studio, Present) — they play once when a slide is shown. Preview-only: it changes nothing in the exported PDF or PPTX, and any slide can override it.</TabNote>
				<Field label="Play" desc="Animate charts in this deck." help={<>Off keeps every chart static. A single slide can still force motion on or off in its own settings.</>}>
					<Toggle label="Chart motion" on={motionPlay} onClick={toggleMotionPlay} />
				</Field>
				<Field label="Style" desc="How a chart moves in." help={<><strong>Build</strong> reveals in reading order, <strong>Together</strong> fades everything in at once, <strong>Rise</strong> lifts marks into place.</>}>
					<CatalogSelect ariaLabel="Choose motion style" value={activeMotionStyle(motionStyle).name} onValueChange={setMotionStyleFM} className="w-full" groups={[{ options: catalogOptions(MOTION_STYLE_ENTRIES) }]} />
				</Field>
				<Field label="Speed" desc="How fast the build runs." help={<><strong>Auto</strong> paces to the chart's size, so a big chart doesn't crawl and a small one doesn't flash past.</>}>
					<CatalogSelect ariaLabel="Choose motion speed" value={activeMotionSpeed(motionSpeed).name} onValueChange={setMotionSpeedFM} className="w-full" groups={[{ options: catalogOptions(MOTION_SPEED_ENTRIES) }]} />
				</Field>
			</div>
			)}
			{deckTab === 'speech' && (
			<div>
				<TabNote>Teach read-aloud how to say tricky words, symbols and acronyms — carried into the deck and its captions.</TabNote>
				<Field label="Pace" desc="How long a slide holds before speaking." help={<>The rhythm a self-presenting deck keeps. <strong>Brisk</strong> for a demo or an audience that knows the material, <strong>Natural</strong> for boardroom delivery, <strong>Deliberate</strong> for a technical audience or one reading in a second language.</>}>
					<CatalogSelect ariaLabel="Choose pace" value={pace} onValueChange={setPace} className="w-full" groups={[{ options: PACE_NAMES.map((n: string) => ({ value: n, label: n.charAt(0).toUpperCase() + n.slice(1) + (n === DEFAULT_PACE ? ' (default)' : '') })) }]} />
				</Field>
				<InspGroup icon={<Volume2 className="size-3.5" />} label="Lexicon" desc="A tricky word or symbol to say a certain way, or to silence. Overrides the built-in symbol commons.">
					<LexiconEditor lexicon={lexicon} onChange={setLexicon} />
				</InspGroup>
				<InspGroup icon={<BookMarked className="size-3.5" />} label="Acronyms" desc="A term's spoken expansion (and an optional glossary definition) — e.g. EBITDA → “ee bit dah”." last>
					<AcronymEditor acronyms={acronyms} onChange={setAcronyms} />
				</InspGroup>
			</div>
			)}
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
			    which most screen readers don't announce.)

			    "Configure", not "Editing": you edit the deck's CONTENT in the editor, and this
			    panel sets how it is configured — calling both "editing" made the two read as the
			    same act. Both lines are active and address the author directly ("Set it once…",
			    "What you set here…") rather than describing the panel to itself. */}
			<div role="status" aria-live="polite" className="border-b border-border px-3.5 py-2.5" style={{ background: inspectorScope === 'deck' ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--warn, #9a6a00) 12%, transparent)' }}>
				{inspectorScope === 'deck' ? (
					<>
						<div className="flex min-w-0 items-center gap-2">
							<SlidersHorizontal className="size-4 shrink-0 text-[var(--accent)]" />
							<span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--accent)]">Configure the whole deck</span>
							<span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">Deck-wide</span>
							{!mobile && <Tip label="Close settings"><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Collapse settings" className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"><X className="size-4" /></button></Tip>}
						</div>
						<p className="mt-1 text-[11px] leading-snug text-muted-foreground">Set it once here and all {slides.length} slides follow.</p>
					</>
				) : (
					<>
						<div className="flex min-w-0 items-center gap-2">
							<FileSliders className="size-4 shrink-0" style={{ color: 'var(--warn, #9a6a00)' }} />
							<span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: 'var(--warn, #9a6a00)' }}>Configure slide {activeFullIndex + 1}</span>
							<span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ background: 'color-mix(in srgb, var(--warn, #9a6a00) 16%, transparent)', color: 'var(--warn, #9a6a00)' }}>Override</span>
							{!mobile && <Tip label="Close settings"><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Collapse settings" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-[var(--text-heading)]"><X className="size-4" /></button></Tip>}
						</div>
						<p className="mt-1 text-[11px] leading-snug text-muted-foreground">What you set here beats the deck, for this slide only. Leave it blank and the deck decides.</p>
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
				{issues > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-2 py-0.5 font-sans text-[11px] font-semibold normal-case tracking-normal text-[var(--warn)]"><AlertTriangle className="size-3" />{issues} issue{issues > 1 ? 's' : ''}</span>}
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
				{/* "Add slide" — the same name the preview rail's `+` carries, because it is the
				    same door (#1654). Two controls sharing one accessible name is correct for one
				    action reachable from two places, but it makes a bare `getByRole('button',
				    { name: 'Add slide' })` ambiguous: e2e opens the gallery through
				    `openAddSlide` in docs/e2e/studio-fixture.ts, never by open-coded name.
				    The VISIBLE label is the bare verb, and that is a fit constraint rather than a
				    style choice: this row is `flex … gap-2` with no wrap and no shrink guard, and
				    it has ~0 slack between the container query that reveals the labels (36rem) and
				    the width at which they all fit. Spelling this one "Add slide" cost ~18px and
				    wrapped the whole toolbar onto a second line at editor-pane widths 576-591px —
				    which is where a 1280x900 laptop sits at the default split (measured: the band
				    grew 46.19px → 61.38px). "Add" is SHORTER than the "Insert" it replaces, so the
				    row now has more slack than before, and the accessible name still contains the
				    visible text (WCAG 2.5.3). */}
				{insertComponents.length > 0 && <Tip label="Add slide"><button type="button" onClick={() => setInsertOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)]" aria-label="Add slide"><Plus className="size-3" /><span className="hidden @[36rem]:inline">Add</span></button></Tip>}
				{reshapeVariants.length > 0 && <ReshapePicker chunk={activeChunk} variants={reshapeVariants} axes={reshapeAxes} variantAxes={reshapeVariantAxes} options={options} frontMatter={previewFm} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} onReshape={onReshape} />}
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
				<React.Suspense fallback={<ComposeSkeleton />}>
				<ComposeView ref={composeRef} source={source} onChange={setSource} resetKey={deck.id} className="flex-1" visible={mobile ? effPane === 'edit' : !(effectiveStop === 'read' || split.collapsed === 'a')} onTypingCollapse={mobile ? setChromeCollapsed : undefined} onOpenSlideSettings={openSlideSettings} slideHeadings={slideHeadings} slideBlocks={slideBlocks} onInsertBelow={openInsertAfter} onCursorSlide={onEditorCursorSlide} />
				</React.Suspense>
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
			// [container-type:inline-size]: make the pane a size container so its header
			// controls collapse on PANE width (mirrors the editor pane). The preview iframe
			// now lives IN-FLOW inside this pane and is never position:fixed, so this
			// containment is harmless — there is no fixed descendant to trap (the old hoisted
			// host, which this containment would have trapped, is retired).
			className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity [container-type:inline-size] group-data-[split-collapsed=b]/split:hidden group-data-[split-dragging]/split:select-none"
		>
			{/* At the Read stop the preview is the whole surface — strip its editorial
			    chrome (header, lens, slide counter, the Collapse trap, the op rail, the
			    debug footer) so it reads as "just the slides" (M3 red-team). Only the
			    live deck + the "Edit this slide" overlay remain. */}
			{!previewChromeless && (
			<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				{/* The band's own name. It earns its place only where the pane is ONE OF TWO —
				    the editor sits beside it and the two headers name which is which. On a phone
				    (<=699px, the single-pane tier) it is redundant with the Preview tab that is
				    lit in the pane switcher directly above it, and it is the one thing in this
				    row that is pure label: dropping it hands ~72px back to the lens pill, which
				    is what was truncating to "Full de…" at 390px. Stacked variants, not two
				    competing utilities: the container query keeps the narrow-PANE rule (a
				    splitter dragged in), `min-[700px]` adds the tier rule (a phone). */}
				<span className="hidden shrink-0 @[24rem]:min-[700px]:inline">Preview</span>
				{/* View — the reader lens (shared LensPicker, also used in Present). It filters
				    the PREVIEW; the source stays whole. `dense` collapses its label to an icon
				    when the PANE is narrow (the pane is a size container above), so a tight
				    preview keeps a usable header instead of overflowing. */}
				<LensPicker value={composeLens} onChange={setLens} count={viewSlides.length} total={slides.length} align="start" lenses={composeLensEntries} dense onAddView={() => { revealCraftDock(); setLensesOpen(true); notify('Add a reader view in the Reader views panel.'); }} />
				{composeLens !== 'full' && (
					<Tip label="Clear reader lens"><button type="button" onClick={() => setLens('full')} className="rounded-full p-0.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Clear reader lens"><X className="size-3.5" /></button></Tip>
				)}
				<span className="flex-1" />
				{/* The zoom's only chrome, and it earns its place twice: it tells a reader
				    who zoomed by accident WHY the slide is cropped, and it is the pointer-free
				    way back to fit (a middle-click also resets, but a trackpad has no middle
				    button). Absent at fit scale — an always-on "100%" would be noise.
				    Its metrics are the row's pill metrics (`px-2 py-0.5`, 12px) — it was 11px,
				    which made it 1.6px shorter than the counter it sits two controls from. That
				    read as slop rather than as hierarchy once the lens picker was sized to the
				    counter too: three pills in one row are one pill shape or they are a mistake. */}
				{previewZoomed && (
					// Mount-time text comes from the ref (the controller set it before flipping
					// the boolean); every later sample updates this node directly, never through
					// a render. See `paintZoomBadge`.
					<Tip label="Reset zoom to fit"><button ref={zoomBadgeRef} type="button" onClick={() => zoomRef.current?.reset()} className="shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)]" aria-label={`Reset zoom to fit — currently ${Math.round(previewZoomScale.current * 100)}%`}>{Math.round(previewZoomScale.current * 100)}%</button></Tip>
				)}
				<button type="button" onClick={() => goToSlide(slideNo - 2)} className="shrink-0 rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Previous slide">‹</button>
				<span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--text-heading)]">Slide {slideNo} / {viewSlides.length}</span>
				<button type="button" onClick={() => goToSlide(slideNo)} className="shrink-0 rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Next slide">›</button>
				{splitUsable && (
					<Tip label="Collapse preview — or drag the divider past its minimum"><Button variant="ghost" size="icon-sm" aria-label="Collapse preview" onClick={() => collapseFromHeader('b')}><PanelRightClose className="size-4" /></Button></Tip>
				)}
			</div>
			)}
			{/* Swipe (touch) and wheel (mouse or trackpad, either axis) change slides
			    here; the arrow keys do the same from the window listener above, so all
			    three verbs work on every device. A PINCH, a ctrl/⌘+wheel and a middle-
			    button drag zoom the slide instead of turning the deck. Every one of those
			    is bound by `attachPreviewZoom` on this node (see the holder ref above) —
			    NOT as React props, whose synthetic touch/wheel listeners are passive and
			    so cannot preventDefault the browser's own page zoom. The card's aspect
			    ratio follows the deck's selected Size, not a fixed 16:9. */}
			<div ref={previewHolderRef} className={cn('flex min-h-0 flex-1 items-center justify-center overflow-hidden', landscapePhone ? 'bg-muted px-0 py-3' : 'bg-card p-4 sm:p-5')}>
				{/* pointer-events-none so a swipe over the slide (an engine iframe, which
				    would otherwise swallow the touch) reaches the swipe container. The debug
				    overlay's press-and-hold rides a parent-hosted capture surface layered
				    ABOVE this (debug-overlay.js), so it works regardless of this rule. */}
				{/* The slide fills whatever the pane gives it — there is no fixed width cap.
				    A 760px "comfort cap" used to apply unless the editor was FULLY collapsed,
				    which made the splitter feel one-way: dragging it left shrank the slide, but
				    dragging right did nothing until the editor hit zero and the cap fell off in
				    one jump (#1283). The cap was grafted from the Stage runner-up for the
				    opposite problem — "collapse editor" delivering the same-size slide in a sea
				    of gutter (2026-07-02-resizable-editor-preview-panes.md §5) — and lifting it
				    only at full collapse fixed that one case while leaving every intermediate
				    drag capped. The letterbox math below already bounds growth (paneH × ratio),
				    so removing the cap outright is what makes the drag continuous in BOTH
				    directions without reintroducing the gutter it was added to prevent. */}
				<div ref={previewBoxRef} className={cn('pointer-events-none relative overflow-hidden bg-background',
					// On an iPhone in landscape the slide is the whole show — drop the card border
					// + shadow. Elsewhere keep the full card.
					//
					// The CORNER is no longer a `rounded-xl` this box picks for itself. It used to
					// be, and that was the defect (#1649): a fixed 12px of the STUDIO's chrome
					// clipped over a slide the engine renders square, so the preview showed a corner
					// the exported deck does not have, painted in the app's palette rather than the
					// deck's — most obvious when the two themes disagree. The engine owns the slide's
					// corner now (`corners:` front matter), and this box follows what the RENDER
					// reports (docs/src/lib/deck-corner.ts) rather than re-deriving it from the
					// source — a source reader cannot see a per-slide `_class: corners-square`, a
					// deck-wide `class:` opt-in, or a theme's own `--slide-radius`, and would clip
					// this box over a slide the engine drew square.
					landscapePhone ? '' : 'border border-border shadow-[0_8px_24px_rgba(10,22,40,.10)]')}
					// CONTAIN to a clean deck-ratio (usually 16:9) box. Width = the SMALLER of the
					// pane's measured width and its height-derived width (paneH × ratio) — see
					// `previewPaneSize` above for why this is JS-measured, not `cqh`. So it fits
					// inside the pane on ANY shape: a portrait phone binds to width (letterboxed
					// top/bottom), landscape binds to height. Pre-measurement (first paint) falls
					// back to `100%` — the flex holder still centers a full-width box correctly,
					// it's just not yet height-letterboxed for one frame.
					// The live preview lives IN-FLOW inside this box (no hoisted host tracking it),
					// so the box's own geometry IS the preview geometry — and the loading
					// placeholder, which fills this same box, tracks the drag with it.
					style={{
						aspectRatio: `${previewRatio[0]} / ${previewRatio[1]}`,
						width: previewPaneSize
							? `${Math.floor(Math.min(previewPaneSize.w, previewPaneSize.h * previewRatioValue))}px`
							: '100%',
						// The box and the slide inside it are clipped to ONE shape. A percentage pair
						// against THIS box's aspect, so the corner is circular and holds its
						// proportion at every split position; `0px` — a hard corner — whenever the
						// deck is square, which is the default and every deck predating the register.
						borderRadius: cornerRadiusCss(deckCorner, previewRatioValue),
					}}>
					{/* The editor's live preview lives IN-FLOW here (no hoisted fixed host, no
					    measure-and-track controller). Being a normal layout child, the browser keeps
					    it glued to this box through split-drag, keyboard, pinch-zoom, and the iOS
					    URL-bar for free — the fixed-vs-visual-viewport drift is structurally
					    unreachable because nothing is a position:fixed element chasing a slot.
					    Present renders its OWN preview (PresentOverlay), so this one idles
					    (active=false) while presenting but stays warm. */}
					{/* Preview-scoped boundary — a render/effect throw in the live preview (e.g. a
					    chart slide's anima reveal/teardown, #1186) is contained HERE, leaving the
					    editor + toolbar + slide navigator alive, instead of unmounting the whole
					    island. `resetKeys` clears the fault when the user navigates to another
					    slide or deck, so a per-slide fault self-recovers without a reload. */}
					{/* onError feeds the crash sentinel: a React fault is contained here and never
					    reaches `window`, so without this hand-off the trail would show the preview
					    going quiet with no reason recorded. */}
					<ErrorBoundary label="The preview" resetKeys={[deck.id, slideNo]} onError={(err) => noteCrashError(err, 'preview boundary')}>
						<DeckPreview focused onCorner={setDeckCorner} options={options} sample={editorSample} slideIndex={viewIndex} slideCount={viewSlides.length} slideMarkdown={editorSlideAlone} mermaid={editorMermaid} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} active={editorSlotVisible} coalesce className="size-full" aria-label="Live deck preview" onFirstRender={onPreviewFirstRender} loader chartDetail />
					</ErrorBoundary>
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
					// they can't read). Write/Craft keep the class label — the author wants it.
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
				<span className="inline-flex shrink-0 items-center gap-1 text-[var(--pass)]">● Live</span>
				<span className="truncate">{palette} · {mode}</span>
				{/* Ratio + count hide on a NARROW PANE (container query, not the sm: viewport —
				    a wide iPad viewport with a dragged-narrow pane would otherwise keep showing
				    it and crowd the row). */}
				<span className="flex-1" /><span className="hidden shrink-0 @[20rem]:inline">{ratioText(previewRatio)} · {viewSlides.length} slide{viewSlides.length === 1 ? '' : 's'}</span>
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
				<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warn)]"><AlertTriangle className="size-3" />{issues}</span>
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
	// The rail itself is `ActivityRail` in chrome-parts.tsx, shared with the pre-paint
	// instant shell (which renders it at build time with every panel closed). What stays
	// here is only the STATE: which slot is showing, and what a click does to it.
	const activityBar = (
		<ActivityRail
			state={{ assistant: activeAssistant, settings: activeSettings }}
			onAssistant={(id) => setActiveAssistant((p) => (p === id ? null : id))}
			onSettings={(id) => setActiveSettings((p) => (p === id ? null : id))}
			onWorkspace={() => setWorkspaceOpen(true)}
		/>
	);

	// Feedback — a persistent, one-tap entry point (not gated on onboarded — first
	// impressions matter too). Opens a pre-filled GitHub issue; no token, no backend.
	// ONE definition, rendered by BOTH headers (the slim Read/Write header and the
	// full Craft/compact one) at the SAME tail slot, so stepping the dial never moves
	// it — nor anything beside it. Before this it lived only in the full header, which
	// made the desktop right cluster jump 70px on every Write↔Craft step and left Read
	// and Write with no feedback affordance at all.
	/**
	 * THE LOGO IS A DROPDOWN AT EVERY WIDTH AND EVERY STOP — the first item on the
	 * persist list (owner, 2026-08-18: *"as the available width decreases things that
	 * persist are the logo drop down, deck selection dropdown, dial and search"*).
	 *
	 * It is hoisted here because the slim Read/Write header used to render a BARE
	 * `LatticeMark` while the full header rendered this menu, so resizing a desktop
	 * window across 1099 made the workspace launcher appear out of nowhere. Same
	 * control, one definition, both headers — a discontinuity you can see is a
	 * discontinuity in the source.
	 */
	const workspaceLauncher = (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					{/* The real brand mark (not a text tile), and the chevron shows at EVERY
					    width — without it the phone-width trigger reads as a static logo,
					    not a menu. */}
					<button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1 hover:bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] sm:gap-2 sm:px-1.5" aria-label="Workspace launcher">
						<LatticeMark mode={mode} className="size-7" />
						{/* DESKTOP ONLY. Below 1100 the header is out of room — adding the feedback
						    button pushed the ⋯ Menu clean off an 820px tablet — and 64px of
						    decoration is the first thing to spend when the mark and the chevron
						    already say "brand, and it opens".
						    Gated on `compact`, NOT on a Tailwind width class, because Tailwind's
						    `lg` is 1024px and this app's desktop boundary is 1100px. A `lg:inline`
						    here reclaimed nothing across 700–1023 that mattered and nothing AT ALL
						    across 1024–1099 — that band rendered the wordmark either way, so it
						    paid the feedback button's 44px straight out of the deck title (at
						    1024 the title fell from `Markdo…` to `M…`). Same source of truth as
						    every other gate in this header is what keeps that from recurring. */}
						{!compact && <span className="font-display text-[19px] font-extrabold tracking-tight text-[var(--text-heading)]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Lattice</span>}
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
	);

	const feedbackButton = (
		<Tip label="Send feedback">
			<Button variant="ghost" size="icon-sm" onClick={() => setFeedbackOpen(true)} aria-label="Send feedback" className="hidden lg:inline-flex"><FeedbackIcon className="size-[18px]" /></Button>
		</Tip>
	);

	/**
	 * THE ROW'S RIGHT-HAND SIDE, COLLAPSED INTO ONE CONTROL WHILE THE SEARCH IS OPEN.
	 *
	 * Opening the inline ⌘K field used to make the trailing cluster VANISH — the row
	 * reclaimed its right-hand side and gave the width to the field. The owner tapped
	 * that on a real iPad: *"it looks really odd that it takes up all the space. i would
	 * much rather we collapse the icons to the right into a hamburger menu."* The
	 * reclaimed width is still right (at tablet the row has 0px of spare, so the field
	 * could not otherwise open at all); what was wrong is that the row's right edge
	 * disappeared with it, and a bar with nothing on one end reads as broken rather than
	 * as focused.
	 *
	 * So the width is still reclaimed — the cluster just collapses into one 26px button
	 * instead of into nothing, and every control it displaces is inside it.
	 *
	 * WHAT GOES IN IS "EVERYTHING THE ROW HIDES", the owner's call over a narrower
	 * Present/Share/feedback set. That differs by tier, which is why the gates below are
	 * not decoration:
	 *   desktop → theme, light/dark, tours, Present, Share, feedback, Workspace
	 *   tablet  → the above MINUS the desktop-only appearance segment and tours button,
	 *             PLUS Coach, Chat, Settings, and the contents of the ⋯ menu the row
	 *             carries there (Library, Lenses) — because the row hides that ⋯ too, so
	 *             everything reachable THROUGH it is also displaced.
	 * `bp === 'tablet'` rather than `compact`, matching the gates on the controls this
	 * stands in for; `searchExpanded` is already `!mobile`, so no phone branch is owed.
	 *
	 * NOT the "Search / commands" row the tablet ⋯ carries. It opens the very field this
	 * menu only exists underneath.
	 *
	 * `data-inline-search-keep-open` is load-bearing: this button is a SIBLING of the
	 * Command widget, and the field's capture-phase outside-click dismissal would
	 * otherwise close the search on the pointerdown that opens this menu, unmounting the
	 * trigger mid-press. See the note at that effect in CommandPalette.tsx.
	 *
	 * Every row closes the search on its way out (`fromOverflow`), because running one of
	 * these is leaving the search, and a field left open behind a Share dialog is the
	 * transport bug #1198 is about in a different costume.
	 */
	const fromOverflow = (fn: () => void) => () => {
		setCmdOpen(false);
		fn();
	};
	const searchExpanded = cmdOpen && !mobile;
	/**
	 * A MENU ROW IS VISIBLE EXACTLY WHEN ITS INLINE TWIN IS NOT — otherwise the same action
	 * has two homes at the same moment, which is the duplication this row keeps removing
	 * elsewhere (Slide settings, Send feedback).
	 *
	 * Two things decide it. The WIDTH LADDER is CSS (`Present` is `md:inline-flex`, so its
	 * menu row is `md:hidden`), and it has to stay CSS so the pre-paint skeleton can mirror
	 * it. Whether the SEARCH has taken the row is React state, and when it has, every inline
	 * control is gone at every width — so the menu shows everything again.
	 */
	const twin = (atWidth: string) => (searchExpanded ? undefined : atWidth);
	const overflowMenu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon-sm" aria-label="More controls" data-inline-search-keep-open="" className="shrink-0"><MenuIcon className="size-[18px]" /></Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" data-inline-search-keep-open="" className="w-56 overflow-hidden p-0">
				<ScrollFade className="max-h-[70vh] overflow-y-auto p-1">
					<DropdownMenuItem onSelect={fromOverflow(openPresent)} className={twin('md:hidden')}><Play className="size-4" />Present</DropdownMenuItem>
					<DropdownMenuItem onSelect={fromOverflow(() => setShareOpen(true))} className={twin('md:hidden')}><Share2 className="size-4" />Share…</DropdownMenuItem>
					{bp === 'tablet' && (
						<>
							<DropdownMenuItem onSelect={fromOverflow(() => setActiveAssistant((p) => (p === 'coach' ? null : 'coach')))}><Gauge className="size-4" />Coach</DropdownMenuItem>
							<DropdownMenuItem onSelect={fromOverflow(() => setActiveAssistant((p) => (p === 'chat' ? null : 'chat')))}><ChatIcon className="size-4" />Chat</DropdownMenuItem>
							<DropdownMenuItem onSelect={fromOverflow(() => setActiveSettings((p) => (p ? null : 'deck')))}><SlidersHorizontal className="size-4" />Settings — deck &amp; slide</DropdownMenuItem>
							<DropdownMenuItem onSelect={fromOverflow(() => setLibraryOpen(true))}><FileBox className="size-4" />Library</DropdownMenuItem>
							{/* "Reader views", not "Lenses — reader views": this row is an entry point into the panel, and
							    every entry point owes the panel's own title (#1211). It was the one the rename missed — the
							    tablet overflow says one word while the phone drawer row, the activity bar and the panel header
							    all say the other. The register split is now policy, not just a comment on the panel:
							    2026-08-25-lens-view-defaults-and-depth.md §2. */}
							<DropdownMenuItem onSelect={fromOverflow(() => setLensesOpen(true))}><LensIcon className="size-4" />Reader views</DropdownMenuItem>
						</>
					)}
					<DropdownMenuItem onSelect={fromOverflow(() => setWorkspaceOpen(true))}><SettingsCog className="size-4" />Workspace settings</DropdownMenuItem>
					<DropdownMenuItem onSelect={fromOverflow(() => setFeedbackOpen(true))} className={twin('lg:hidden')}><FeedbackIcon className="size-4" />Send feedback</DropdownMenuItem>
					{toursOn && !demoActive && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuLabel>Show me…</DropdownMenuLabel>
							{TOURS.map((t) => (
								<DropdownMenuItem key={t.id} data-tour={t.id} onSelect={fromOverflow(() => startDemo(t.id))} className="flex-col items-start gap-0.5 py-2">
									<span className="font-medium">{t.label}</span>
									<span className="text-[12px] text-muted-foreground">{t.description}</span>
								</DropdownMenuItem>
							))}
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={fromOverflow(toggleMode)}>{mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}{mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</DropdownMenuItem>
					<DropdownMenuSeparator />
					<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
				</ScrollFade>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// The deck switcher — deck identity + CRUD (Switch / Rename / New). SHARED by the
	// full header (Craft / compact) AND the slim Write header: deck-switching and
	// New deck are the Write persona's most basic navigation, not strippable chrome,
	// so Write gets the real switcher, not a dead title label. Read stays a calm label
	// (one sample deck; managing decks is a Write-and-up concern — dial up to reach it).
	const deckSwitcher = (
		<DropdownMenu open={deckMenuOpen} onOpenChange={setDeckMenuOpen}>
			<DropdownMenuTrigger asChild>
				{/* No fixed width cap at ANY width — the deck title is the user's orientation,
				    so the pill sizes to its content and lets the flex-1 spacer to its right
				    absorb the bar's free space. It's the one shrinkable item (min-w-0 + a
				    truncating title; every sibling is shrink-0), so it shows the title in FULL
				    whenever there's room and truncates only when the bar genuinely fills —
				    never clipped to an arbitrary 180/260px.
				    ── THE FLOOR (#1417) ──────────────────────────────────────────────
				    `min-w-0` alone lets this pill shrink BELOW the intrinsic width of its own
				    `shrink-0` children, which then render OUTSIDE its border box: at 700px the
				    chevron sat up to 20.5px past the pill's right edge, visibly clipped. That
				    failure is invisible to every overflow oracle in the repo, because all of
				    them read `scrollWidth` on the HEADER — and the pill is precisely the element
				    engineered to keep the header's `scrollWidth` quiet while it absorbs the
				    pressure, so it is the one element that can break silently. `min-w-*` stops
				    the shrink where the pill's own children still fit and lets the ROW overflow
				    honestly instead, where the header-level guards can see it.
				    The number is the pill's non-shrinking content, and it is arithmetic over the
				    classes on this very tag — keep the two in step (the e2e spec re-derives it
				    from the rendered box and fails if they drift):
				      compact  2px border + 2x8px `px-2`    + 8px `gap-2` + 16px chevron = 42px
				      desktop  2px border + 2x10px `px-2.5` + 2x8px gaps + 8px dot + 16px = 62px
				    Structural alternatives were measured and rejected: dropping `min-w-0` so the
				    pill's own `min-width: auto` floors it pins the pill at the FULL title width
				    (a flex item's min-content contribution is not reduced by `min-width:0` on the
				    truncating child), and `contain: inline-size` on the title zeroes its intrinsic
				    size in BOTH directions — the pill then never grows to show a title at all. */}
				<button type="button" data-demo="deck-switcher" className={cn(BAR_CONTROL, 'flex items-center gap-2 rounded-md border border-border bg-background text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]', compact ? 'min-w-[42px] px-2' : 'min-w-[62px] px-2.5')}>
					{/* The active-deck dot is DESKTOP-ONLY decoration. Below 1100 it cost 16px
					    (dot + its gap) out of a pill that had 51px to spend at the 700px floor —
					    so the deck title, the thing this pill exists to show, rendered at ZERO
					    width while a decorative dot held its ground. Same trade the wordmark in
					    the launcher beside it already makes, and the same boundary (`compact`,
					    the app's own 1100px line, never Tailwind's `lg`). */}
					{/* …and it is `--text-body`, not `bg-primary`. `--primary` IS `--accent`
					    (tailwind.css maps them), so a self-declared decoration was drawing in
					    the bar's scarcest signal color — accent is a pointer, and this one
					    pointed at nothing. Decoration in the pointer color is a false pointer;
					    the accent budget is spent once, on Present.
					    `--text-body` rather than `--text-muted`, though: muted took this dot from
					    5.96:1 to 2.64:1 in cuoio, which is the site's DEFAULT palette — trading a
					    false pointer for a dot nobody can see is not the fix. Body keeps it
					    legible while leaving accent to mean one thing. */}
					{!compact && <span className="size-2 shrink-0 rounded-full bg-[var(--text-body)]" />}
					<span className="truncate text-sm font-semibold text-[var(--text-heading)]">{deckTitle}</span>
					{/* Slide-count meta shows only when the bar has room (≥xl); on a tight
					    desktop/tablet the deck title takes priority. */}
					{/* `--text-body`, not `--text-muted`, for the same reason as the dial labels
					    and the ⌘K placeholder: this is READ TEXT (the deck's slide count), and
					    `--text-muted` is the theme's declared-decorative, WCAG-exempt channel —
					    2.64:1 measured here at 11px, where 1.4.3 wants 4.5:1. Found while
					    verifying the other two; same root cause, same header, so it is fixed
					    here rather than logged. */}
					<span className="hidden shrink-0 font-mono text-[11px] text-[var(--text-body)] xl:inline">{metaFor(source)}</span>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Switch deck</DropdownMenuLabel>
				{deckList.map((d) => (
					<DropdownMenuItem key={d.id} onSelect={() => loadDeck(d)} className="group">
						<span className={cn('size-2 rounded-full', d.id === deck.id ? 'bg-[var(--accent)]' : 'bg-primary')} />
						<span className="truncate font-semibold text-[var(--text-heading)]">{d.title}</span>
						{/* shrink-0: the title beside this is the flexible one (it truncates). Without
						    it a long deck name squeezes the meta until `7 slides` wraps to two lines
						    and the row grows — visible the moment a deck is named by a long heading. */}
						<span className="ml-auto flex shrink-0 items-center gap-1.5">
							<span className="font-mono text-[11px] text-muted-foreground group-hover:hidden">{d.meta}</span>
							{decks.length > 1 && (
								<button type="button" aria-label={`Delete ${d.title}`} className="hidden rounded p-0.5 text-muted-foreground hover:text-[var(--fail,#b3261e)] group-hover:block" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDeck(d.id); }}><Trash2 className="size-3.5" /></button>
							)}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={renamePrompt}><PencilLine className="size-4" />Rename “{deckTitle}”</DropdownMenuItem>
				<DropdownMenuItem data-demo="new-deck" onSelect={() => newDeck()}><Plus className="size-4" />New deck</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// ONE palette, three transports (2026-08-16). The props are built once here and handed
	// to whichever surface the width calls for: `cmdInline` is the desktop header combobox,
	// `cmdPalette` the overlay every other tier uses. They are MUTUALLY EXCLUSIVE — desktop
	// renders only the inline one, compact only the overlay — so `⌘K` never has two homes
	// and the command list has exactly one definition (CommandPalette.tsx).
	const cmdProps = {
				open: cmdOpen,
				onOpenChange: setCmdOpen,
				// Running a command is a deliberate departure, not a dismissal: the drawer
				// must not follow you to wherever the command took you. Without this, all
				// ~31 commands sprang the drawer back open on top of the result.
				onRun: () => setDrawerPendingReturn(false),
				decks: deckList,
				palettes: BUILTIN_PALETTES,
				onPickDeck: loadDeck,
				onNewDeck: () => newDeck(),
				onPalette: applyPalette,
				onPresent: openPresent,
				onShare: () => setShareOpen(true),
				onFeedback: () => setFeedbackOpen(true),
				onFabricate: () => setView('fabricate'),
				onLibrary: () => { revealCraftDock(); setLibraryOpen(true); },
				onWorkspace: () => setWorkspaceOpen(true),
				onReshape: () => { revealCraftDock(); setLensesOpen(true); },
				onWatchDemo: startDemo,
				onInsert: insertComponents.length > 0 ? () => setInsertOpen(true) : undefined,
				onFocus: posture === 'craft' ? () => setQuietened(true) : undefined,
				onCollapseEditor: splitUsable && split.collapsed !== 'a' ? () => collapseFromHeader('a') : undefined,
				onCollapsePreview: splitUsable && split.collapsed !== 'b' ? () => collapseFromHeader('b') : undefined,
				onExpandPane: split.collapsed ? () => { const c = splitApiRef.current.collapsed; if (c) splitApiRef.current.expand(c); } : undefined,
				onResetSplit: splitUsable ? () => splitApiRef.current.reset() : undefined,
	};
	// eslint-disable-next-line -- the spread is the point: one prop set, two mount points.
	// DESKTOP AND TABLET BOTH GET THE INLINE FIELD (owner's call, 2026-08-17): ⌘K should not
	// change its presentation with the width. Only the LAUNCHER differs, and only because the
	// tablet row has no pixels for a pill — measured, its flex spacer is 0px from 700 through
	// 834 — so `idlePill` is off there and the ⋯ menu's "Search / commands" row plus ⌘K stay
	// the way in. Phones keep the sheet: its bottom-docked field is a solved keyboard problem
	// (reported from a real device), not a stylistic difference.
	const cmdInline = !mobile ? <CommandPalette inline {...cmdProps} /> : null;
	const cmdPalette = mobile ? <CommandPalette {...cmdProps} /> : null;
	/**
	 * THE ROW YIELDS ITS RIGHT-HAND SIDE WHILE THE FIELD IS OPEN (owner's call, 2026-08-17:
	 * "we should reclaim space by hiding everything to the right").
	 *
	 * Before this, the field grew only into the flex spacer, so the cost of opening it landed
	 * on the LEFT: measured at 1440, the deck title went 311 → 263px and the posture dial slid
	 * 48px left, while Present/Share never moved. At tablet it could not open at all, because
	 * the spacer there is 0px. Hiding the trailing cluster inverts that — the controls the user
	 * is not using while searching pay, and the deck they are searching within does not.
	 *
	 * It also dissolves the narrow-desktop burst this branch had to work around: with the tail
	 * gone there is room at 1100/1160 in Craft without leaning on the field's min-width floor.
	 *
	 * Deliberately NOT applied to phones — `cmdInline` is null there and the sheet owns the
	 * whole screen anyway, so there is no row to reclaim.
	 */


	return (
		// Where the phone's back chevron says it goes, published once for every panel
		// below. The answer is a property of the LAUNCH PATH, not of the panel: the
		// Library reached from the ⋯ menu returns there ("‹ Menu"), the same Library
		// reached from the Eight-Cell Bar returns to what was behind it ("‹ Deck").
		// `drawerPendingReturn` is already exactly that signal — it is the flag that
		// decides whether the drawer re-opens when this panel closes — so the chevron
		// and the actual destination cannot disagree.
		//
		// NOT "‹ Studio", which is what this shipped as for one commit and was wrong in a
		// way worth naming: it says you are LEAVING the Studio, and you never do. Every
		// one of these panels is inside it. The three real destinations are the deck, the
		// Fabricate view, and this menu — and `hostLabel` is the first two.
		<PanelNav
			back={drawerPendingReturn ? DRAWER_LABEL : hostLabel}
			// Tapping the deck means "put me on the deck". Without this it meant "go back
			// one level", because the pending re-open does not care HOW the child closed —
			// so dismissing a menu-launched panel by tapping the visible deck sprang the ⋯
			// menu up instead of landing on the deck (reported). The back gesture and the
			// "‹ Menu" chevron still step back one level; that is what back means.
			onLeave={disarmDrawerReturn}
		>
		<div ref={rootRef} data-studio-root="" className="lx-ui flex h-[100dvh] flex-col bg-background text-foreground">
			{/* Announce a stop change to assistive tech — the surface can change from a
			    keystroke (⌘.) or the "Edit this slide" reveal, which would otherwise be
			    silent (M3/M4 a11y). `stopAnnounce` starts empty and is updated only on a
			    real change (never on mount, never behind Fabricate) by the effect above. */}
			<div role="status" aria-live="polite" className="sr-only">{stopAnnounce}</div>
			{/* ── Top bar ─────────────────────────────────────────────── */}
			{/* Read + Write stops (DESKTOP only): a slim header — deck title · ⌘K · Present ·
			    Share · the dial. Most of the control cluster is gone; ⌘K still reaches
			    every feature, and the dial is the always-visible way to any stop (no
			    "exit" — you are never in a mode, only at a stop). On COMPACT widths the
			    full header stays (its ⋯ overflow carries deck-switch / theme / tours),
			    since a slim header would strand those; the dial rides the full header. */}
			{/* The cinema morph (iPhone landscape) shows NO header — the slide is the whole
			    screen. Every other width/stop keeps its header. */}
			{!landscapePhone && (effectiveStop !== 'craft' && !compact ? (
			<header className={cn('flex h-[54px] shrink-0 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3.5',
				// THE CLIP LIFTS WHILE SEARCH IS OPEN — one of the TWO clips the inline dropdown
				// has to clear, and the less interesting one. `overflow-x-auto` is this row's
				// overflow survival valve (#1381), and `overflow-x: auto` computes
				// `overflow-y: auto` too, so it would clip the dropdown into the 54px band.
				// Swapping to `overflow-visible` while the field is open costs nothing: the row
				// cannot be scrolled and focused-elsewhere at the same time, and the valve returns
				// the moment the field closes. The OTHER clip — the one that actually kept the card
				// invisible through three attempts — is the `Command` root's own `overflow-hidden`;
				// it is neutralized in CommandPalette.tsx, and that note is the one to read before
				// touching this, because lifting either clip ALONE paints nothing and invites the
				// wrong conclusion. The scroll valve is KEPT: it never had to be traded away.
				searchExpanded ? 'relative z-30 overflow-visible' : 'overflow-x-auto overscroll-x-contain')}>
				{workspaceLauncher}
				{/* Read is calm — the deck is a label (a newcomer has the one sample deck;
				    switching / New deck is a Write-and-up concern). Write gets the real
				    switcher: deck navigation is not strippable chrome. */}
				{effectiveStop === 'read' ? (
					<>
						<span className="min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{deckTitle}</span>
						<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{metaFor(source)}</span>
					</>
				) : deckSwitcher}
				{/* IDENTITY BAND: app · deck · view-of-the-deck (2026-08-16, owner's ordering).
				    The dial sits WITH the deck rather than out in the action cluster, so the
				    row's left-to-right reads as descending scope — which app, which deck, which
				    view of it — and only then utilities and verbs. The rule is what makes that
				    legible: without it the dial reads as a stray third object rather than the
				    close of a band (measured, it also pulls the row's largest gap 144 → 130px).
				    Cost, accepted knowingly: the dial no longer holds a fixed x. It now sits
				    behind a content-sized, truncating deck pill, so its position moves with the
				    deck's NAME and with the stop (Read renders a plain label, Write a switcher)
				    — measured at 171px of travel across the three stops. That is the cheapest
				    stability in the row to spend: this repo's own 2026-07-03 review found the
				    mode control is "the least-used control on the bar". Present, Share and
				    feedback keep their pinned x — see the tail note below. */}
				{!compact && <Separator orientation="vertical" className={BAR_RULE} />}
				{!mobile && <PostureDial posture={posture} quietened={quietened} revealCraft={revealCraft} onChange={changePosture} />}
				<div className="flex-1" />
				{/* The search is the header's own combobox now, not a button that opens an
				    overlay (2026-08-16). Closed it renders the same pill it always did — the SSR
				    skeleton draws that pill and `studio-shell-parity` measures it, so the idle box
				    must not move. Opened it becomes the field, grown into the row's free space with
				    the command list beneath it.
				    No `Tip` wrapper any more: a tooltip belongs on a button, not on a control that
				    turns into a text field under the pointer — and Radix would keep it armed while
				    you type. The ⌘K hint the tooltip carried is drawn inside the pill itself.
				    Desktop only. `cmdPalette` below mounts the OVERLAY for compact tiers, and the
				    two are mutually exclusive, so exactly one search surface exists per width. */}
				{cmdInline}
				{/* THE ROW YIELDS ITS TAIL WHILE THE FIELD IS OPEN (owner's call, 2026-08-17).
				    The #1371 x-invariant below is about the IDLE row and is unaffected: these
				    three still sit at the same x at Read, Write and Craft, and still mirror the
				    full header, whenever the search is closed. While it is open they are not
				    moved — they are GONE — so there is no x to disagree about, and the width they
				    were holding goes to the field instead of coming out of the deck title.
				    `studio-header-fit`'s open-state guard asserts exactly that. */}
				{searchExpanded ? overflowMenu : (<>
				{/* THE TAIL — Present · Share · feedback — mirrors the full header's tail
				    EXACTLY, and that is the point: all three sit at the SAME x at Read, Write
				    and Craft (#1371). It survives the dial moving to the identity band precisely
				    BECAUSE the trailing run is what the invariant is about: everything the full
				    header carries that this one doesn't (appearance, tours, their rules) sits
				    LEFT of these three and is absorbed by the flex spacer, so the run's
				    right-gaps are identical in both. Move or drop one element in this trailing
				    run without doing the same in the full header and the whole cluster slides on
				    every dial step. `studio-header-fit.spec.ts` asserts the x-stability but NOT
				    the order, so the mirror is on you.
				    Present/Share stay reachable at EVERY stop, never hidden behind a posture
				    (2026-07-17-studio-persona-dial.md, T5 graft), and the accent CTA is still
				    the last LABELED control — only the icon-only feedback button sits outboard,
				    which is what the comparable set does. */}
				<Tip label="Present"><Button size="sm" onClick={openPresent} className="gap-1.5 px-2" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button></Tip>
				<Tip label="Share"><Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-1.5 px-2" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button></Tip>
				{feedbackButton}
				{!mobile && overflowMenu}</>)}
			</header>
			) : (
			<header className={cn('flex h-[54px] shrink-0 items-center gap-1.5 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 transition-[max-height,opacity,transform] duration-200 ease-out',
				// See the slim header's note: the clip lifts while the inline search is open.
				searchExpanded ? 'relative z-30 overflow-visible' : 'overflow-x-auto overscroll-x-contain', compact ? 'sm:gap-1.5 sm:px-2.5' : 'sm:gap-3 sm:px-3.5', chromeCollapsed && 'pointer-events-none max-h-0 -translate-y-1 overflow-hidden border-b-0 opacity-0')}>
				{/* SCROLLABLE WHEN IT OVERFLOWS — the failure mode, made survivable. Everything
				    above is about making the row FIT; this is about what happens the day it
				    doesn't. Today the tail simply leaves the screen, silently, and on a tablet
				    the control it takes with it is the ⋯ Menu — the only route to Library,
				    Reader views and Workspace settings (that is #1381, exactly). Raise Chrome's
				    minimum font size (a low-vision setting: Settings → Appearance → Customize
				    fonts) to 18px and the words push this row over again at 700px; at 24px the
				    ⋯ is gone entirely. `overflow-x: auto` turns "unreachable" into "scroll to
				    it" for THAT case and every future one, and it is INERT the rest of the
				    time: a row whose content fits cannot scroll, and shows no scrollbar. The
				    scrollbar is deliberately NOT hidden — it is the only signal that the row
				    has more in it, and `native-widgets.css` already owns how it looks.
				    `overscroll-x-contain` keeps a swipe at either end from chaining into the
				    browser's back gesture. This does NOT weaken the guards: `check:overflow`
				    and `studio-header-fit.spec.ts` both assert `scrollWidth <= clientWidth` on
				    this element, which is exactly as red on a real overflow as it was before. */}
				{/* Below desktop this row runs at the PHONE's density — 6px gaps, 10px side
				    padding — instead of the desktop 12px/14px. `compact` is true on mobile too and
				    `sm:` starts at 640, so this reaches 640–699 as well: that band used to jump to
				    desktop density for 60px just before the mobile layout takes over, and now matches
				    the phone header below it. One fewer seam, not a new one. It carries ~14 gaps, so that is
				    ~78px of width reclaimed at no cost in function at all, which is most of what
				    the posture dial's words are paid for (#1401). Not a third density: below `sm`
				    the header already sat at 6px/10px, so a tablet now reads as a wider phone
				    header rather than a squeezed desktop one. Gated on `compact` — the app's own
				    1100px boundary — never on Tailwind's `lg` (1024), whose 76px of disagreement
				    with it would leave 1024–1099 at desktop density while still `compact`. The
				    density earns its place across the WHOLE band, not just at the floor: force
				    desktop density back on and the deck title truncates to `Markdown for the …`
				    at 1024 and to `M…` at 820 (measured). A JSX ternary branch admits exactly one
				    element, which is why this note sits inside the tag rather than above it. */}
				{workspaceLauncher}

				{/* DESKTOP-ONLY, like the two dividers further down the row. `hidden sm:block`
				    drew these from 640px up, so a tablet paid 7px each (1px rule + one 6px gap)
				    for a banding device the phone header below it does without — and at the
				    700px floor this row had NO free width to pay it from, so it came out of the
				    deck title. Gating on `compact` finishes the #1408 density move (below
				    desktop this row reads as a wider phone header, not a squeezed desktop one)
				    and is the same source of truth as every other gate here: the app's 1100px
				    boundary, never Tailwind's `sm`/`lg`. */}
				{!compact && <Separator orientation="vertical" className={BAR_RULE} />}

				{deckSwitcher}

				{/* IDENTITY BAND — the twin of the slim header's; see the long note there for
				    the ordering rationale and the x-drift it knowingly costs. Both headers must
				    carry this pair, or the two rows disagree about where the dial lives and the
				    stop change becomes a jump.
				    Unlike the rule above it, this one is NOT `!compact`: the tablet renders this
				    Gated `!compact`, NOT `!mobile`, and that is a budget fact rather than a taste
				    one: a rule costs 7px here (1px + one 6px gap) and `studio-header-fit.spec.ts`
				    measures ~19px of spare at the 700px floor against a ratcheted floor of 16 —
				    so the tablet has about 3px to spend and this does not fit. Shipped at
				    `!mobile` it took that floor to 9px and turned the guard red, which is the
				    guard doing its job. Below desktop the row already does without the other two
				    rules and reads as a wider phone header (#1408), so the band closes on
				    proximity there instead.
				    The dial keeps its WORDS at every width it renders at (≥700) — why, and what
				    that width is bought with, is on the dial itself in `chrome-parts.tsx`; the
				    short version is #1401: icon-only made the stops unreachable on touch, and
				    the row pays for the labels by keeping tours in ⋯ and running at the phone's
				    density below desktop. */}
				{!compact && <Separator orientation="vertical" className={cn(BAR_RULE, 'hidden xl:block')} />}
				{!mobile && <PostureDial posture={posture} quietened={quietened} revealCraft={revealCraft} onChange={changePosture} />}

				<div className="flex-1" />

				{/* ⌘K search — desktop only (≥1100). On compact the "Search / commands" row
				    inside ⋯ is the search affordance; the ⌘K shortcut stays always-bound. */}
				{/* The search is the header's own combobox now, not a button that opens an
				    overlay (2026-08-16). Closed it renders the same pill it always did — the SSR
				    skeleton draws that pill and `studio-shell-parity` measures it, so the idle box
				    must not move. Opened it becomes the field, grown into the row's free space with
				    the command list beneath it.
				    No `Tip` wrapper any more: a tooltip belongs on a button, not on a control that
				    turns into a text field under the pointer — and Radix would keep it armed while
				    you type. The ⌘K hint the tooltip carried is drawn inside the pill itself.
				    Desktop only. `cmdPalette` below mounts the OVERLAY for compact tiers, and the
				    two are mutually exclusive, so exactly one search surface exists per width. */}
				{cmdInline}
				{/* EVERYTHING RIGHT OF THE FIELD YIELDS WHILE IT IS OPEN (owner's call,
				    2026-08-17: "we should reclaim space by hiding everything to the right").
				    Appearance, the banding rules, tours, Present, Share, feedback, and the
				    compact mode toggle + Menu are all inside this branch — the whole trailing
				    run, at every tier that gets the inline field.
				    WHY IT IS THE RIGHT SIDE THAT PAYS: before this, the field grew only into
				    the flex spacer, so opening it cost the LEFT — measured at 1440 the deck
				    title went 311 -> 263px and the dial slid 48px — and at tablet it could not
				    grow at all, the spacer there being 0px from 700 through 834. The controls
				    you are not using while searching are the right ones to spend.
				    Idle is untouched, so `studio-shell-parity` and the SSR skeleton do not
				    move; the open state is guarded by `studio-header-fit`'s open-state test. */}
				{searchExpanded ? overflowMenu : (<>

				{/* Appearance — desktop groups theme + light/dark into one bordered segment,
				    the mode toggle kept a direct 1-tap button. On compact the theme picker
				    folds into ⋯; the mode toggle stands alone on tablet and joins the ⋯
				    Appearance tail on phones (below). */}
				{!compact && (
					<div className="hidden h-8 items-center rounded-md border border-border bg-background p-[3px] xl:flex">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon-sm" aria-label="Theme" className="size-[26px]"><Palette className="size-[18px]" /></Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="max-h-[70vh] w-52 overflow-y-auto">
								<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
							</DropdownMenuContent>
						</DropdownMenu>
						<Tip label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Button variant="ghost" size="icon-sm" data-demo="mode" className="size-[26px]" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button></Tip>
					</div>
				)}

				{/* Desktop dividers band the right cluster by altitude — utilities |
				    deliverable verbs | session panels | app surfaces — so global and
				    deck controls don't read as one interleaved run (2026-07-03). */}
				{!compact && <Separator orientation="vertical" className={cn(BAR_RULE, 'hidden xl:block')} />}

				{/* Present + Share — the deliverable verbs, primary at every width. On
				    phones they live one row down in the pane bar (with the panel toggles),
				    which has the free width — the top row spends its width on the deck
				    title (2026-07-03 decision). */}
				{/* WHICH VERB WEARS THE FILL IS NOW A DECISION, not a default
				    (2026-08-16-studio-toolbar-placement.md). It used to be neither: Share
				    rendered `<Button size="sm">` with no `variant`, i.e. shadcn's default
				    solid, while Present was EXPLICITLY demoted to `variant="outline"`. That
				    arrived fully formed in this file's first commit (c9ecdae) and was never
				    argued anywhere — then 2026-07-03-studio-brand-mark-toolbar.md:39 cited
				    "Share is the bar's only filled CTA" as a PREMISE, and the phone bar
				    copied the tone split. An omitted prop had become a rule.
				    Present carries the fill now: it is the more frequent verb for every
				    persona, it repeats within a session where Share is once per deck
				    lifecycle, its real-world trigger is time-pressured ("we're starting"),
				    and it is the terminal act of a *presentation* engine. Share publishes —
				    the least reversible thing on the bar should not also be the most
				    attractive target 12px from a quiet outline.
				    The rule that outranks the choice: EXACTLY ONE full-strength fill. Zero
				    of 17 comparable tools run two, and this row already lost most of its
				    pop-out to spending accent five times over (Share's fill, the lit dial
				    segment, the tours glyph, the deck dot, the mark). Whichever verb wins,
				    the other is `variant="outline"` — never both filled. */}
				{/* Show Me — the guided-tour menu. Five self-driving tours (one engine, five angles);
				    the icon opens the picker. Hidden while a tour runs (take-over owns the screen). */}
				{/* DESKTOP ONLY. Below 1100 the tours ride the ⋯ overflow instead (tablet) or the
				    drawer's "Show me" door (mobile, `onStartDemo`) — one CHROME launcher per tier,
				    never two. (⌘K's "Watch demo" is not a second one: the palette reaches every
				    feature at every width by standing invariant, which is what makes it not a
				    duplicate home.) This is width the row buys back for the dial's words (#1401):
				    a tour is a considered, once-per-session detour, so it is the cheapest thing in
				    this run to put one tap further away — and it puts tablet on the SAME footing as
				    the phone rather than inventing a third pattern. None of the six protected 1-tap
				    controls (Present/Share/Coach/Chat/Settings/pane toggle) moved. */}
				{!compact && toursOn && (
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									{/* NOT accent-colored any more. Measured, this glyph was the loudest thing in
								    the row relative to its importance: the only saturated icon in the run (a
								    1.44:1 luminance step plus a large chroma step off its neighbors), the
								    largest clear space of any control, and more accent ink than the deck's own
								    identity dot — for a once-per-session detour this repo already judged cheap
								    enough to bury one tap deeper on tablet (#1401). Accent is a pointer and the
								    bar was spending it five times; a hover tint keeps the affordance without
								    competing with the CTA two slots away. */}
								<Button variant="ghost" size="icon-sm" data-demo="show-me" aria-label="Show me — guided tours" className={cn('hidden text-[var(--text-body)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] xl:inline-flex', demoActive && 'pointer-events-none invisible')}><MonitorPlay className="size-[18px]" /></Button>
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
				{/* DESKTOP-ONLY — see the note on its twin above the deck switcher. It closes
				    the utilities band; the verbs open after it. */}
				{!compact && <Separator orientation="vertical" className={BAR_RULE} />}
				{/* The dial used to sit HERE, between this rule and the verbs. It moved up to
				    the identity band beside the deck (2026-08-16) — the note is on its new site.
				    What stayed behind is the rule, which now reads as "utilities end, actions
				    begin" instead of "…and now a mode control". */}
				{!mobile && <Tip label="Present"><Button size="sm" data-demo="present" onClick={openPresent} className="hidden gap-1.5 px-2 md:inline-flex lg:px-3" aria-label="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button></Tip>}
				{!mobile && <Tip label="Share"><Button variant="outline" size="sm" data-demo="share" onClick={() => setShareOpen(true)} className="hidden gap-1.5 px-2 md:inline-flex lg:px-3" aria-label="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button></Tip>}
				{/* Architect + Inspector — the working-panel toggles stay 1-tap at EVERY width
				    (never folded into ⋯): visible aria-pressed/active color, and the #635
				    first-edit Inspector pulse always lands on a visible button. On phones
				    they ride the pane bar below with Present + Share. */}
				{/* Architect + Settings openers — TABLET only. Desktop launches both from the
				    left activity bar; mobile from the pane bar below. (A landscape phone renders
				    no header at all — the cinema morph — so no leak here.) */}
				{/* Feedback sits directly above the Settings button in this right-hand run, at
				    tablet AND desktop — the one fixed address for it. Tablet reaches it in one
				    tap here instead of two through ⋯ (that row is gone: one action, one home).
				    Desktop has no header Settings button (the activity bar owns it), so the same
				    slot puts feedback last — which is exactly where the slim header ends too. */}
				{!mobile && feedbackButton}
				{/* No trailing separator on desktop: it separated the feedback button from
				    nothing (the controls after it are compact-only), and the 13px it spent
				    was 13px the slim header could never match. */}

				{/* Compact (≤1099): the mode toggle stands alone (1-tap). The Menu
				    trigger below it is SHARED by tablet and mobile (same position, same
				    accessible name, exactly one exists per breakpoint) but opens a different
				    surface per tier: tablet keeps the flat DropdownMenu; mobile gets the
				    StudioDrawer (2026-07-26-studio-mobile-eight-cell-bar.md) — five fixed named
				    zones instead of one 30-item scroll, and none of the six protected controls
				    (Present/Share/Coach/Chat/Settings/pane toggle) are anywhere in it. */}
				{/* Workspace settings promoted to the header, between mode and the Menu —
				    it was buried a drawer-open + one more tap deep and shouldn't have been
				    (reported). Opened directly here, it never arms `drawerPendingReturn`, so
				    closing it doesn't spuriously reopen the drawer; it's dropped from the
				    drawer's own Workspace row below to avoid the exact "same setting, two
				    homes" problem just fixed for Slide settings. */}
				{mobile && <Tip label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Button variant="ghost" size="icon-sm" data-demo="mode" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button></Tip>}
				{mobile && (
					<Tip label="Workspace settings"><Button variant="ghost" size="icon-sm" aria-label="Workspace settings" onClick={() => setWorkspaceOpen(true)}><SettingsCog className="size-[18px]" /></Button></Tip>
				)}
				{mobile && (
					<Button variant="ghost" size="icon-sm" aria-label="Menu" onClick={() => setMoreOpen(true)}><MenuIcon className="size-[18px]" /></Button>
				)}
				{mobile && (
					<StudioDrawer
						open={moreOpen}
						hostLabel={hostLabel}
						onOpenChange={setMoreOpen}
						onNavigate={closeDrawerAndOpen}
						effPane={effPane}
						insertComponents={insertComponents}
						issues={issues}
						onInsert={() => setInsertOpen(true)}
						onFixAll={() => editorRef.current?.fixAll()}
						onVersionHistory={() => setHistoryOpen(true)}
						onLenses={() => setLensesOpen(true)}
						demoActive={demoActive}
						tours={TOURS}
						onStartDemo={startDemo}
						onLibrary={() => setLibraryOpen(true)}
						onSearch={() => setCmdOpen(true)}
						onFeedback={() => setFeedbackOpen(true)}
						palette={palette}
						savedThemes={savedMenu}
						onApplyPalette={applyPalette}
					/>
				)}
				{!mobile && overflowMenu}</>)}

				{/* Library + Workspace + account — on DESKTOP these live in the left activity
				    bar's Globals group; on compact they're in the ⋯ overflow (above). So the
				    top bar carries neither here. */}
			</header>
			))}

			{/* ── Body ─────────────────────────────────────────────────── */}
			{view === 'fabricate' ? (
				/* Fabricate is a full view branch, so it needs its OWN `main` — the ADR's first
				   draft missed exactly this branch (§10-R-M1). `React.Suspense` renders no DOM
				   node, so the landmark goes inside it, around the view. */
				<main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
					{/* The page's one H1. The Studio is a full-page app whose visible top-level label is the
					    branded site header, not a heading — so every shell shipped with NO h1 at all, and a
					    screen-reader user landing here got a heading outline that started at the deck's own
					    h2s with nothing naming the page. Visually hidden rather than drawn, because the
					    surface deliberately has no room for a title bar. Inside <main> on purpose: outside it
					    the heading would be page content sitting in no landmark. */}
					<h1 className="sr-only">Lattice Studio</h1>
					<React.Suspense fallback={<div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Loading the Fabricate studio…</div>}>
						<Fabricate options={options} catalog={components} seed={fabricateSeed} savedThemes={savedThemes} onClose={() => { setFabricateSeed(null); setView('compose'); }} notify={notify} onSaved={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }} onOpenWorkspace={() => setWorkspaceOpen(true)} />
					</React.Suspense>
				</main>
			) : landscapePhone ? (
				/* iPhone LANDSCAPE — the "cinema" morph. The editor's in-flow preview fills the
				   frame full-bleed here: the slide is the whole surface, swipe
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
				<main id="main-content" tabIndex={-1} data-cinema-stage onTouchEnd={() => setWhisperReveal((n) => n + 1)} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted">
					{/* The page's one H1. The Studio is a full-page app whose visible top-level label is the
					    branded site header, not a heading — so every shell shipped with NO h1 at all, and a
					    screen-reader user landing here got a heading outline that started at the deck's own
					    h2s with nothing naming the page. Visually hidden rather than drawn, because the
					    surface deliberately has no room for a title bar. Inside <main> on purpose: outside it
					    the heading would be page content sitting in no landmark. */}
					<h1 className="sr-only">Lattice Studio</h1>
					{previewPane}
					<LandscapeWhisper current={slideNo} total={viewSlides.length} revealKey={whisperReveal} />
						{/* Screen-reader nav + live position. Cinema is swipe-only for sighted users, but VoiceOver/TalkBack intercept one-finger swipes, so these give AT users an intro, real controls, and an announced position (the visible counter is aria-hidden). */}
						<p className="sr-only">Slide deck. Swipe, or use the previous and next buttons below, to move through slides. Rotate the phone upright to edit.</p>
						<button type="button" className="sr-only" onClick={() => goToSlide(slideNo - 2)} disabled={slideNo <= 1}>Previous slide</button>
						<button type="button" className="sr-only" onClick={() => goToSlide(slideNo)} disabled={slideNo >= viewSlides.length}>Next slide</button>
						<div className="sr-only" aria-live="polite">Slide {slideNo} of {viewSlides.length}</div>
				</main>
			) : mobile ? (
				/* Mobile: one swappable Edit/Preview pane; panels live in sheets. THE EIGHT-CELL
				   BAR (2026-07-26-studio-mobile-eight-cell-bar.md, round 2 of the mobile-toolbar
				   design competition): eight edge-to-edge captioned cells, identical on both
				   panes — nothing appears, disappears, or reflows when you switch panes. Zero
				   gaps + zero container padding is the width reclaim (today's bar computes to
				   392px of gap-1/p-1.5 chrome for 9 uncaptioned controls, 2px over budget at
				   390px); merging Markdown/Compose/Preview into one 3-way segment is what makes
				   eight cells fit instead of nine. History, Slide settings and the "···" menu's
				   old contents move into the StudioDrawer (below the header's Menu
				   trigger, unchanged in position) — ten compliant 44px cells would compute to
				   38.8px each, under the touch floor, so eight is the largest bar this width
				   can hold. Present/Share/Coach/Chat/Settings/the pane toggle are never in the
				   drawer — HARD RULE per the round-1 postmortem: those six stay one tap, inline,
				   always, full stop. */
				<main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
					{/* The page's one H1. The Studio is a full-page app whose visible top-level label is the
					    branded site header, not a heading — so every shell shipped with NO h1 at all, and a
					    screen-reader user landing here got a heading outline that started at the deck's own
					    h2s with nothing naming the page. Visually hidden rather than drawn, because the
					    surface deliberately has no room for a title bar. Inside <main> on purpose: outside it
					    the heading would be page content sitting in no landmark. */}
					<h1 className="sr-only">Lattice Studio</h1>
					{/* `role="group"`, NOT `role="toolbar"` (2026-08-16). This shipped as a
					    toolbar, and a toolbar is a PROMISE OF BEHAVIOR, not a label: the ARIA
					    pattern obliges one tab stop into the widget plus arrow-key roving focus.
					    This bar implemented none of it — measured at 390px, eight buttons, zero
					    `tabindex` management, no `onKeyDown` — so AT announced "Deck actions,
					    toolbar" and the user's learned model was then wrong in both directions:
					    arrows did nothing, and the widget ate eight tab stops. That is the
					    textbook 4.1.2 role-misuse failure.
					    `group` keeps the accessible name (the reason the attribute was added)
					    and promises nothing that isn't implemented. Implementing the real
					    pattern is the better end state and is worth doing — it would take these
					    eight stops to one — but it is a keyboard-behavior change that has to
					    land with its own spec updates, not ride along in a placement pass. It is
					    filed rather than half-built here; a half-built toolbar is what we just
					    removed. */}
					{/* A real `<fieldset>`, so the group role is the ELEMENT's, not an attribute
					    bolted onto a div — the same idiom PostureDial already uses, and what
					    `lint/a11y/useSemanticElements` asks for. The resets matter: a fieldset
					    ships a groove border, padding, and an intrinsic `min-width` that would
					    each break this flex row, so `m-0 p-0 min-w-0 border-x-0 border-t-0` take
					    them off and leave only the `border-b` this bar actually wants. (`m-0` is
					    a bare reset — it adds no space, so HARD RULE #20 is satisfied.) */}
					<fieldset aria-label="Deck actions" className={cn('m-0 flex min-w-0 shrink-0 items-stretch border-x-0 border-t-0 border-b border-border bg-card p-0 transition-[max-height,opacity,transform,padding] duration-200 ease-out', chromeCollapsed && 'pointer-events-none max-h-0 -translate-y-1 overflow-hidden border-b-0 opacity-0')}>
						<BarIcon variant="bar" label="Markdown source" hint="Markdown source" caption="Source" active={effPane === 'edit' && editMode === 'markdown'} demo={editMode === 'markdown' ? 'pane-edit' : undefined} badge={issues} describedBy={issues > 0 ? 'mobile-issue-count' : undefined} onClick={() => { setMobilePane('edit'); setEditMode('markdown'); if (postureRef.current === 'read') { dismissReadHint(); changePosture('write'); } }}><FileText className="size-[17px]" /></BarIcon>
						{issues > 0 && <span id="mobile-issue-count" className="sr-only">{issues} unresolved {issues === 1 ? 'issue' : 'issues'}</span>}
						<BarIcon variant="bar" label="Compose — rich editor" hint="Compose — rich editor" caption="Compose" active={effPane === 'edit' && editMode === 'compose'} demo={editMode === 'compose' ? 'pane-edit' : undefined} onClick={() => { setMobilePane('edit'); setEditMode('compose'); if (postureRef.current === 'read') { dismissReadHint(); changePosture('write'); } }}><Sparkles className="size-[17px]" /></BarIcon>
						<BarIcon variant="bar" label="Preview" hint="Preview" caption="Preview" active={effPane === 'preview'} demo="pane-preview" onClick={() => setMobilePane('preview')}><PreviewIcon className="size-[17px]" /></BarIcon>
						<span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
						<BarIcon label="Toggle Coach" hint="Coach — deterministic deck assessment" caption="Coach" variant="bar" active={coachOpen} onClick={() => setActiveAssistant((p) => (p === 'coach' ? null : 'coach'))}><Gauge className="size-[17px]" /></BarIcon>
						<BarIcon label="Toggle Chat" hint="Chat — AI conversation about your deck" caption="Chat" variant="bar" active={chatOpen} onClick={() => setActiveAssistant((p) => (p === 'chat' ? null : 'chat'))}><ChatIcon className="size-[17px]" /></BarIcon>
						<BarIcon label="Settings" hint="Settings — deck & slide" caption="Settings" variant="bar" active={inspectorOpen} onClick={() => setActiveSettings((p) => (p ? null : 'deck'))}><SlidersHorizontal className="size-[17px]" /></BarIcon>
						<span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
						<BarIcon label="Present" hint="Present" caption="Present" variant="bar" tone="solid" demo="present" onClick={openPresent}><Play className="size-[17px]" /></BarIcon>
						<BarIcon label="Share" hint="Share" caption="Share" variant="bar" tone="outline" demo="share" onClick={() => setShareOpen(true)}><Share2 className="size-[17px]" /></BarIcon>
					</fieldset>
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
				</main>
			) : (
				/* Unified compose spine (M2 spine hoist + M3 Read, 2026-07-17-studio-persona-dial.md).
				   Read, Write and Craft share ONE structure so editor + preview mount ONCE and
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
					{desktop && effectiveStop === 'craft' && activityBar}
					{/* The skip-link target and the ONE `main` landmark of this document (ADR
					    §5). It wraps the split rather than retagging it — `ResizablePanelGroup`
					    renders react-resizable-panels' own `div` and exposes no tag prop, so a
					    retag isn't available here; §5 sanctions a wrapper on the app surface
					    (the deck's never-wrap rule is about the measuring probe and export
					    bytes, neither of which exists in the Studio). It carries the split's
					    flex sizing so the group still fills the spine.
					    The activity bar stays OUTSIDE as a sibling: it is a `nav`, and a `nav`
					    keeps its landmark role inside `main` — the panel launcher belongs
					    beside the work region, not within it. Same reasoning would apply to any
					    future `aside` (§10-R3): there are none today, so nothing here nests a
					    landmark inside `main`. */}
					<main id="main-content" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1">
						{/* The page's one H1. The Studio is a full-page app whose visible top-level label is the
						    branded site header, not a heading — so every shell shipped with NO h1 at all, and a
						    screen-reader user landing here got a heading outline that started at the deck's own
						    h2s with nothing naming the page. Visually hidden rather than drawn, because the
						    surface deliberately has no room for a title bar. Inside <main> on purpose: outside it
						    the heading would be page content sitting in no landmark. */}
						<h1 className="sr-only">Lattice Studio</h1>
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
						{/* Settings — docks next to the bar (desktop-Craft) as a resizable Panel.
						    react-resizable-panels enforces the px min itself; close = the Panel is
						    simply not rendered (the activity-bar icon reopens it). */}
						{desktop && effectiveStop === 'craft' && inspectorOpen && (
							<>
								<ResizablePanel id="studio-settings" minSize={SET_MIN} maxSize={PANEL_MAX} defaultSize={SET_DEFAULT} className="overflow-hidden border-r border-border bg-background">
									{inspectorScopeContent}
								</ResizablePanel>
								<ResizableHandle aria-label="Resize settings panel" />
							</>
						)}
						{/* The assistant slot — ONE of Coach / Chat / Lenses / Library, docked next
						    to the editor (desktop-Craft) as a resizable Panel. Mutually exclusive;
						    close = the launcher toggle. This is the Coach/Library/Chat resize the
						    2026-07-19 migration adds. */}
						{desktop && effectiveStop === 'craft' && assistantOpen && (
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
									{chatOpen && chatBodyWith('Chat')}
									{lensesOpen && (
										<>
											<div className="border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Reader views</div>
											{renderLensesBody(false)}
										</>
									)}
									{libraryOpen && (
										<Library docked open onOpenChange={setLibraryOpen} options={options} activePalette={palette} activeFinish={finish} initialFilter={libInitialFilter} onApplyTheme={applyPalette} onApplyFinish={(name) => { const token = `finish-${name}`; setFinish(token); notify(`Applied ${token}.`); }} onInsert={(skeleton) => applyDeckOp(addSlideAfter(source, curIndex, skeleton))} onEditTheme={editTheme} onChanged={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }} notify={notify} />
									)}
								</ResizablePanel>
								<ResizableHandle aria-label="Resize panel" />
							</>
						)}

						{/* Editor pane — collapsible to its rail (46px). Hidden at the Read stop so
						    the preview fills the surface (the pane stays MOUNTED → no remount on the
						    Read→Write step). */}
						<ResizablePanel id={STUDIO_SPLIT_PANEL_IDS[0]} data-pane-role="editor" minSize={EDITOR_MIN} defaultSize="46" collapsible={split.ready} collapsedSize={PREVIEW_CHROME.splitRailW} panelRef={split.editorRef} onResize={split.onEditorResize} className="overflow-hidden">
							{editorPane}
							{splitRailA}
						</ResizablePanel>
						{splitHandle}
						{/* Preview pane — collapsible to its rail (46px); fills the surface at Read
						    (the editor Panel's OUTER div is hidden by id in studio.astro's is:global
						    block; a Tailwind class lands on the inner div and can't shrink the outer). */}
						<ResizablePanel id={STUDIO_SPLIT_PANEL_IDS[1]} data-pane-role="preview" minSize={PREVIEW_MIN} defaultSize="54" collapsible={split.ready} collapsedSize={PREVIEW_CHROME.splitRailW} panelRef={split.previewRef} onResize={split.onPreviewResize} className="overflow-hidden">
							{previewPane}
							{splitRailB}
						</ResizablePanel>

						{/* Tablet-Craft: the Inspector docks on the RIGHT as a resizable Panel (no
						    activity bar below desktop; the in-panel Slide/Deck segment is its scope). */}
						{bp === 'tablet' && effectiveStop === 'craft' && inspectorOpen && (
							<>
								<ResizableHandle aria-label="Resize inspector panel" />
								<ResizablePanel id="studio-tablet-inspector" minSize={SET_MIN} maxSize={PANEL_MAX} defaultSize={296} className="overflow-hidden border-l border-border bg-background">
									{inspectorScopeContent}
								</ResizablePanel>
							</>
						)}
					</ResizablePanelGroup>
					</main>

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
					<PanelSheet open={coachOpen} onOpenChange={setCoachOpen} side="left" width="sm">
						<PanelHeader
							icon={<Gauge />}
							title="Coach"
							srDescription="Craft and style scores, deterministic quick reads, and per-finding fixes for this deck."
						/>
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{coachBody}</div>
					</PanelSheet>
					{/* Chat — its own compact drawer, a peer of the Coach (they are separate panels). */}
					<PanelSheet open={chatOpen} onOpenChange={setChatOpen} side="left" width="sm">
						<PanelHeader
							icon={<ChatIcon />}
							title="Chat"
							srDescription="A conversation with the AI Architect about this deck, with reviewable edits."
							// The chat portals its cost readout in here, rather than spending a row of its
							// own on it directly under this header — see ArchitectChat's header note.
							actions={<span ref={setChatCostSlot} className="flex items-center" />}
						/>
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chatBodyWith(undefined, chatCostSlot)}</div>
					</PanelSheet>
					{/* Reader views — its own compact sheet, a peer of the Architect.
					    Titled "Reader views", NOT "Lenses": every entry point into this panel
					    says "Reader views" (the drawer row, the activity-bar toggle, the
					    command palette), and the panel used to answer with a different word
					    set in 11px uppercase — the one treatment the drawer's own rules ban.
					    "Lenses" survives as the internal name (`lensesBody`, `lens-picker`),
					    which is fine; it just is not what a user is shown (#1211). */}
					<PanelSheet open={lensesOpen} onOpenChange={setLensesOpen} side="left" width="sm">
						<PanelHeader
							icon={<LensIcon />}
							title="Reader views"
							actions={lensCanAdd ? (
								<Tip label="Add a reader view">
									<Button type="button" variant="outline" size="icon-sm" aria-label="Add a reader view" onClick={() => setLensAdding(true)}>
										<Plus className="size-4" />
									</Button>
								</Tip>
							) : undefined}
							// The lede moved OUT of the header and into the zero state, where it has
							// room and where it is actually needed. As a header `description` it
							// wrapped to two lines and made this one of four different header
							// heights in a set of surfaces that claim to share a frame.
							srDescription="A subset of this deck for one reader — you approve exactly what they see."
						/>
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderLensesBody(true)}</div>
					</PanelSheet>
					{/* Settings Sheet — MOBILE only. Same Slide-first segment + scope echo +
					    active body as the desktop/tablet column, just wrapped in a Sheet
					    (no room for a docked column). One source of truth: inspectorScopeContent. */}
					{mobile && (
						<PanelSheet open={inspectorOpen} onOpenChange={setInspectorOpen} width="md">
							<PanelHeader
								icon={<Settings2 />}
								title="Settings"
								srDescription="Slide-first settings: switch between this slide's overrides and deck-wide defaults."
							/>
							{/* No outer overflow: the scope body owns its own scroll region (like the
							    desktop column), so the sheet never nests two scrollbars. */}
							<div className="flex min-h-0 flex-1 flex-col">{inspectorScopeContent}</div>
						</PanelSheet>
					)}
				</>
			)}

			{/* ── Overlays ─────────────────────────────────────────────── */}
			<ShareSheet open={shareOpen} onOpenChange={setShareOpen} deckTitle={deckTitle} source={source} deckId={deck.id} finishClass={finishClass} finishExtraCss={finishExtraCss} options={options} palette={preview.paletteOverride ?? palette} mode={preview.modeOverride ?? (mode === 'dark' ? 'dark' : 'light')} extraTheme={preview.extraTheme} extraCss={previewExtraCss} onPresent={openPresent} notify={notify} />
			<FeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} area="Studio" context={{ Deck: deckTitle, Theme: `${palette} · ${mode}` }} />
			{/* The crash report — mounted only once there IS one, so a healthy session
			    pays nothing for it. Opened from the boot toast, and from Workspace →
			    Diagnostics via the `lattice:open-crash-report` event. */}
			{crashReports.length > 0 && <CrashReportSheet open={crashOpen} onOpenChange={setCrashOpen} reports={crashReports} onDismiss={dismissCrash} />}
			<WorkspaceSheet open={workspaceOpen} onOpenChange={setWorkspaceOpen} notify={notify} />
			{/* Version history — an ACTION (save/restore snapshots), not a deck setting,
			    so it lives in its own sheet off the top bar rather than in the inspector
			    (which is now settings-only). Restore stays always-visible (not hover-only)
			    so it works on touch. */}
			<PanelSheet open={historyOpen} onOpenChange={setHistoryOpen} side="right" width="sm">
				<PanelHeader
					icon={<History />}
					title="Version history"
					srDescription="Snapshots you can restore. One is captured automatically before each AI edit."
				/>
				{/* The zero state OWNS the empty panel rather than floating at the top of it,
				    and it carries the lede the header used to. Measured before this change:
				    73% of the sheet was blank under a single 12px line — the worst dead air in
				    the app, and exactly the kind that argues for a shorter sheet when the real
				    gap is a blank slate. */}
				{checkpoints.length === 0 ? (
					<PanelBody center>
						<PanelEmpty
							icon={<History />}
							title="No saved versions yet"
							action={<button type="button" onClick={saveVersion} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"><Save className="size-3.5" />Save a version</button>}
						>
							Snapshots you can restore. One is captured automatically before each AI edit.
						</PanelEmpty>
					</PanelBody>
				) : (
					<PanelBody padded={false} className="px-4 py-3">
						<button type="button" onClick={saveVersion} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"><Save className="size-3.5" />Save a version</button>
						<ul className="space-y-0.5">
							{checkpoints.map((cp) => (
								<li key={cp.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--accent-soft)]">
									<span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-[var(--text-heading)]">{cp.label}</span><span className="block font-mono text-[10.5px] text-muted-foreground">{timeAgo(cp.ts)} · {metaFor(cp.source)}</span></span>
									<button type="button" onClick={() => restoreCheckpoint(cp)} className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-background">Restore</button>
								</li>
							))}
						</ul>
					</PanelBody>
				)}
			</PanelSheet>
			{/* Compact (tablet/mobile): Library is the right Sheet. Desktop-Craft renders it
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
					onEditTheme={editTheme}
					onChanged={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }}
					notify={notify}
				/>
			)}
			{(presentOpen || presentEverOpened) && (
				<React.Suspense
					fallback={
						// A <button>, not a <div onClick>, so the dismiss affordance is natively
						// keyboard-reachable too — it mirrors the Escape handler above; both are the
						// loading window's only way out, since PresentOverlay itself (which normally
						// owns both) hasn't mounted yet to take over.
						<button
							type="button"
							onClick={() => setPresentOpen(false)}
							aria-label="Cancel opening Present"
							className="lx-ui fixed inset-0 z-[100] grid cursor-default place-items-center bg-background text-[13px] text-muted-foreground"
						>
							Loading Present…
						</button>
					}
				>
					<PresentOverlay open={presentOpen} onClose={() => setPresentOpen(false)} onReady={() => setPresentEverOpened(true)} options={options} slides={slides} frontMatter={previewFm} registry={lensReg} startIndex={activeFullIndex} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={previewExtraCss} notify={notify} />
				</React.Suspense>
			)}
			{cmdPalette}
			<SlidePicker open={insertOpen} onOpenChange={setInsertOpen} items={insertComponents} options={options} frontMatter={previewFm} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} recent={recentComponents} onInsert={onInsertComponent} />
			{/* Hidden file input for "Import deck…" (.md upload). */}
			<input ref={importInputRef} type="file" accept=".md,.markdown,.mdx,.lattice,text/markdown,text/plain" onChange={onImportFile} className="hidden" aria-hidden="true" tabIndex={-1} />

			{/* The one toast surface — messages (notify) + the Undo action below. */}
			<Toaster />
		</div>
		</PanelNav>
	);
}

// ── small local building blocks ─────────────────────────────────────────
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
	craft: 'Craft — every panel',
};

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
		<Tip label={label}><button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cn('grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:bg-transparent', danger && !armed && 'hover:bg-[color-mix(in_srgb,var(--fail,#b3261e)_12%,transparent)] hover:text-[var(--fail,#b3261e)]', armed && 'bg-[var(--fail-fill,#b3261e)] text-white hover:bg-[var(--fail-fill,#b3261e)] hover:text-white')}>{children}</button></Tip>
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
// Merged ONCE, at module scope. Both halves are constants, and `cn` is
// `twMerge(clsx(...))` — parsing nine arbitrary-variant class names
// (`max-[699px]:[&:has(input:focus)]:…`) is not free, and `Field` renders ~10 times per
// Inspector state change. Doing it per render made the docs suite time out under load
// (`studio.theme-depth.test.tsx`, 5s, a different case each run) while every file still
// passed in isolation — the signature of a render-path cost, not a logic break.
const FIELD_ROW = cn(SETTING_ROW, PINNED_FIELD_ROW);
// Merged once, for the reason spelled out above FIELD_ROW: `cn` is twMerge(clsx(...)) and
// `Field` renders ~20 times per Inspector state change, so a per-render merge here is a
// measurable cost — it is what timed the docs suite out twice in this change alone.
const FIELD_LABEL = cn(SETTING_LABEL_COL, 'text-[12.5px] text-foreground');

// The one-line framing that opens each Inspector tab — says what the whole group is FOR
// before the individual rows explain themselves. (The slide Inspector's TabIntro, same job,
// same weight; kept local to each file rather than shared because the two panels size their
// type independently.)
function TabNote({ children }: { children: React.ReactNode }) {
	return <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">{children}</p>;
}

// A "more" disclosure INSIDE a tab — that tab's lowest-reach rows, collapsed by default.
// Without it every row carries the same weight, so `Card rail placement` (a sub-option of a
// sub-option) sits as prominently as `Brand bar` and the common controls are buried under
// the rare ones. Collapsed, not hidden: nothing becomes unreachable, it just stops competing.
function More({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<details className="mt-2 border-t border-border/60 pt-2">
			<summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-[var(--text-heading)]">{label}</summary>
			<div className="mt-1">{children}</div>
		</details>
	);
}

// A deck-setting row. `desc` is the plain-language line under the control — kept to a
// CLAUSE, because eight rows of three-sentence prose is a wall the eye skips, which
// defeats the purpose the prose was written for. The full explanation moves to `help`,
// rendered as a ⓘ beside the label (HelpTip — a popover, so it opens on touch too).
// The rule: `desc` says what the control does, `help` says why you'd reach for it and
// what the values mean. Obvious toggles can omit both.
//
// ONE row geometry for the whole drawer: label on the left, control on the right, help
// line underneath. `TextRow` below routes through this too, so a text field sits exactly
// where a dropdown sits — it used to stack (label, help, then a full-width input), which
// read as a different kind of row and cost three lines of height per field. On a phone
// that is the difference between the field being on screen when the keyboard opens and
// being behind it.
//
// `htmlFor` makes the label a REAL <label> (tapping it focuses the field) instead of a
// span; `descId` names the help line so the field can `aria-describedby` it. Both are
// opt-in, so the dropdown/toggle rows — whose controls carry their own `aria-label` —
// render exactly the markup they did before.
function Field({ label, desc, help, htmlFor, descId, children }: { label: string; desc?: string; help?: React.ReactNode; htmlFor?: string; descId?: string; children: React.ReactNode }) {
	return (
		<div className="my-2">
			{/* `PINNED_FIELD_ROW` holds the row you are TYPING in above the keyboard — the
			    position the command palette's docked field occupies, borrowed rather than
			    recomputed. It goes on the LABEL+CONTROL row, not the whole block: the help
			    line stays in flow, because a four-line description pinned over the deck would
			    eat most of what a keyboard leaves and the palette's dock is one row. Phone-only,
			    and only rows that actually own an `<input>` can trigger it (`:has(input:focus)`),
			    so the dropdown and toggle rows carry the class inertly. */}
			<div className={FIELD_ROW}>
				{/* The ⓘ sits WITH the label, not at the row's end: it explains the setting, so
				    it reads as part of its name rather than as a second control. It is INLINE
				    (see HelpTip) — a flex sibling took its own 20px of the row and wrapped
				    "Color mode" onto two lines.
				    The label owns its HALF of the row (SETTING_LABEL_COL) rather than shrinking
				    to fit whatever the control wants; that is what aligns every control in the
				    column, and it is why an option label can carry its resolved value again
				    without widening its row. */}
				<span className={FIELD_LABEL}>
					{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
					{help && <HelpTip label={`More about ${label}`}>{help}</HelpTip>}
				</span>
				<span className={SETTING_CONTROL_COL}>{children}</span>
			</div>
			{desc && <p id={descId} className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
		</div>
	);
}
// Forwards ref + props so it can be a Radix `asChild` trigger (the Size menu).
const Control = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ children, ...props }, ref) => (
	<button ref={ref} type="button" {...props} className="inline-flex w-full items-center justify-between gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--text-heading)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]">{children}</button>
));
Control.displayName = 'Control';
// Thin adapter over the shared ui/switch primitive, preserving this file's
// {on,onClick,label} call sites. The widget itself is now the shadcn Switch.
function Toggle({ on, onClick, label }: { on?: boolean; onClick?: () => void; label?: string }) {
	return <Switch checked={!!on} onCheckedChange={() => onClick?.()} aria-label={label} />;
}
// A text-DECLARATION row. Unlike a Toggle (a binary state), this is where the author
// states the actual copy that will render (the deck name, the running header / footer
// text). Draft is local while typing and commits on blur or Enter, so the source
// front-matter (and the editor + every export) isn't rewritten on every keystroke. An
// empty commit clears the setting.
//
// The geometry is `Field`'s, not its own — see the note there.
function TextRow({ label, desc, help, value, placeholder, onCommit }: { label: string; desc?: string; help?: React.ReactNode; value: string; placeholder?: string; onCommit: (v: string) => void }) {
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
		<Field label={label} desc={desc} help={help} htmlFor={id} descId={desc ? descId : undefined}>
			<Input
				id={id}
				aria-describedby={desc ? descId : undefined}
				value={draft}
				placeholder={placeholder}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => { if (draft !== value) onCommit(draft); }}
				onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
				// Takes the row's remaining width, so its right edge lands where every
				// dropdown's does. The 116px floor is `Control`'s own min-width — the field
				// can never be squeezed narrower than the dropdowns it sits among, however
				// long the label gets.
				// `h-9` (36px), NOT the `h-8` this had while it was a full-width field of its
				// own: that is `Control`'s height, so the field and the dropdowns it now sits
				// among share a baseline instead of missing it by 4px on every row.
				className="h-9 w-full text-[12.5px]"
			/>
		</Field>
	);
}
