import {
	AlertTriangle, ArrowLeftToLine, ArrowRightToLine, Check, ChevronDown, ChevronLeft, ChevronRight,
	Copy, Eye, FileBox, FileSliders, FileText, Focus, Frame, History, Layers, ListChecks, Minimize2, MonitorPlay, Moon, MoreHorizontal, Palette, PanelLeftClose, PanelRightClose, PencilLine, PencilRuler, Play, Plus, Save, Search, Settings2, Share2, SlidersHorizontal, Sparkles, Sun, Trash2, Upload, Wand2, X,
} from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
	DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SplitHandle, SplitRail, type SplitSide, useSplit } from '@/components/ui/split';
import { type SingleSlideOptions, suspendScaleObservers } from '@/lib/single-slide-render';
import { toggleMode as toggleDocMode } from '@/lib/site-chrome';
import { cn } from '@/lib/utils';
import { ArchitectChat, DiffCard } from './ArchitectChat';
import { applyDeckEdit, type Finding, REFINE_ACTIONS, type RefineActionId, refineSelection, requestFindingFix, resumePendingAuth, runArchitect, useArchitectStatus } from './architect';
import { CommandPalette } from './CommandPalette';
import { listStudioComponents, type StudioComponent } from './component-library';
import { addSlideAfter, deleteSlide, duplicateSlide, moveSlide, replaceSlide } from './deck-ops';
import { DECKS, deckSource, type StudioDeck } from './decks';
import { Editor, type EditorHandle } from './Editor';
import { activeFinishLabel, FinishMenuItems, type SavedFinishMenuEntry } from './FinishPicker';
import { generateSwatch as finishSwatch, generateFinishCss, mergeFinishOverride } from './finish-generate';
import { deleteStudioFinish, listStudioFinishes, type StudioFinish } from './finish-library';
import { frontMatterBlock, getFrontMatter, mergeClassTokens, parseFinishOverride, removeClassTokens, setFrontMatter, stripFrontMatter } from './front-matter';
import { type ComponentEntry, InsertComponent } from './InsertComponent';
import { IntentTag } from './IntentTag';
import { LatticeMark } from './LatticeMark';
import { Library } from './Library';
import { LensPicker } from './lens-picker';
import { type PresentLens, presentationSet, scoreDeck, slideClass, splitSlides, unknownComponents, usedComponents } from './lint';
import { activeModeLabel, ModeMenuItems } from './ModePicker';
import { PresentOverlay } from './PresentOverlay';
import { ShareSheet } from './ShareSheet';
import { SlideContext } from './SlideContext';
import { activeSpectrumLabel, SpectrumMenuItems } from './SpectrumPicker';
import { importComments } from './slide-comments';
import { listFindings } from './studio-lint';
import { type Checkpoint, createDeck, deleteDeck as deleteDeckStore, FLUSH_EVENT, hasPriorStudioUse, loadCheckpoints, loadDeckList, loadSettings, loadSource, markBackupNudged, metaFor, renameDeck as renameDeckStore, saveCheckpoint, saveSettings, saveSource, shouldNudgeBackup, titleFromSource } from './studio-store';
import { activePaletteLabel, BUILTIN_PALETTES, ThemeMenuItems } from './ThemePicker';
import { deleteStudioTheme, listStudioThemes, type StudioTheme } from './theme-library';
import { useBreakpoint } from './use-breakpoint';
import { useStudioDemo } from './use-studio-demo';
import { WorkspaceSheet } from './WorkspaceSheet';
import { isEvictionProneBrowser } from './workspace-backup';

// The Fabricate studio (theme / component / finish fabrication) is a large,
// self-contained subtree — FinishStudio, LayoutStudio, CodeField, the manifest
// completion, and its own big lucide-icon set — reached only via the
// `view === 'fabricate'` tab. Code-split it so its ~chunk stays out of the
// initial Studio island payload (the heaviest thing a mobile user waits on) and
// loads on first open. It's already mount-on-view, so this is a drop-in.
const Fabricate = React.lazy(() => import('./Fabricate').then((m) => ({ default: m.Fabricate })));

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
// The editor|preview split's five middle tracks: rail-a | editor | handle |
// preview | rail-b (2026-07-02 resizable-panes decision §5). ONE source of
// truth consumed by EVERY non-mobile grid branch (desktop, tablet, focus) so
// their track lists can't drift; the desktop branch appends its flanking
// Architect/Inspector columns around these. The fr custom properties carry the
// unit INSIDE the var (`0.92fr` — `var(--x)fr` is invalid CSS) and fall back to
// the pre-paint seed (studio.astro writes --split-studio-a/-b) then the default.
// The flex pair sums to 2 (ratio DOUBLED — 0.92/1.08, never 0.46/0.54): per CSS
// Grid §12.7.1, when one pane clamps at its px minimum a flex sum < 1 leaves a
// dead void instead of redistributing (the iPad void bug — see splitFlexPair in
// ui/split.tsx, whose emitted vars these fallbacks must match). A collapsed
// side's pane+handle tracks drop to 0px and its 46px rail (the Inspector-rail
// geometry) takes the edge.
//
// INVARIANT — pair-space ≥ 2×minB (560px): the sum-2 flex pair guarantees zero
// grid void only while the editor+preview space is at least twice the larger
// minimum. Worst case today: 1100 (desktop threshold) − 232 (Architect) − 300
// (Inspector) − 1 (handle) = 567px — SEVEN px of headroom. Widening either
// flank by ≥8px total, raising the preview minimum, or padding the grid
// silently reopens a hairline void band near ratio 0.5 (issue #721; the
// near-0.5 case is asserted by the 1100px e2e in docs/e2e/split.spec.ts).
function splitTracks(collapsed: SplitSide | null): string[] {
	if (collapsed === 'a') return ['46px', '0px', '0px', 'minmax(0,1fr)', '0px'];
	if (collapsed === 'b') return ['0px', 'minmax(0,1fr)', '0px', '0px', '46px'];
	return [
		'0px',
		'minmax(240px, var(--split-a, var(--split-studio-a, 0.92fr)))',
		'1px',
		'minmax(280px, var(--split-b, var(--split-studio-b, 1.08fr)))',
		'0px',
	];
}
// Theme constants + the grouped picker live in ThemePicker.tsx (every shipped
// theme, incl. the AA color-blind-safe set). BUILTIN_PALETTES = anything we can
// drive through `data-palette`.

// biome-ignore lint/suspicious/noExplicitAny: serialized lint vocabulary from the page.
type Props = { options: SingleSlideOptions; components?: ComponentEntry[]; lintVocab?: any };

export default function StudioShell({ options, components = [], lintVocab }: Props) {
	// Persisted deck list (seeded from the built-ins), the active deck, and its
	// source — restored from localStorage so edits survive a switch AND a reload.
	const [decks, setDecks] = React.useState<StudioDeck[]>(() => loadDeckList());
	const [deck, setDeck] = React.useState<StudioDeck>(() => loadDeckList()[0] ?? DECKS[0]);
	const [source, setSource] = React.useState(() => {
		const first = loadDeckList()[0] ?? DECKS[0];
		return loadSource(first.id) ?? deckSource(first);
	});
	const [activeSlide, setActiveSlide] = React.useState(0); // 0-based; index into the VIEWED set
	const [composeLens, setComposeLens] = React.useState<PresentLens>('full'); // reader lens for the preview
	// First-run state. A newcomer (never engaged) gets a reduced-density shell —
	// side panels closed, a one-time welcome cue — so the killer intro deck and the
	// editor lead, not 35+ controls. `onboarded` flips true the moment they engage
	// (dismiss the welcome, edit, or open a panel) and persists, so it's one-time.
	// Newcomer = never engaged AND no prior Studio activity. The `onboarded` flag
	// postdates pre-existing users (it defaults false for them), so fall back to
	// hasPriorStudioUse() — a saved deck index or any edited source — to treat
	// returning users as already-onboarded and never show them the first-run cue.
	const [onboarded, setOnboarded] = React.useState(() => loadSettings().onboarded || hasPriorStudioUse());
	const onboardedRef = React.useRef(onboarded);
	onboardedRef.current = onboarded;
	const [architectOpen, setArchitectOpen] = React.useState(() => onboarded); // newcomers start calm
	const [inspectorOpen, setInspectorOpen] = React.useState(false); // PM-4: preview is sacred
	const [historyOpen, setHistoryOpen] = React.useState(false); // Version-history sheet (an action, not a deck setting — lives outside the inspector)
	// One-time welcome banner — shown only to a newcomer; dismiss graduates them.
	const [welcomeOpen, setWelcomeOpen] = React.useState(() => !onboarded);
	// First contextual reveal of the Architect fires once per session.
	const firstEditRef = React.useRef(false);
	// After the Coach reveals, a one-time gentle pulse on the Inspector toggle so a
	// newcomer discovers it — no panel hijack; cleared the moment they open it.
	const [inspectorPulse, setInspectorPulse] = React.useState(false);
	// Focus mode — a transient "quiet the noise" posture (2026-06-30-studio-focus-mode.md):
	// hides the Architect + Inspector columns and most of the topbar, leaving just
	// Editor + Preview + slide nav. Nothing is removed — ⌘K stays live, so every
	// feature is one keystroke away. Opt-in per session (not sticky, not a default).
	const [focus, setFocus] = React.useState(false);
	const [notesOpen, setNotesOpen] = React.useState(false); // speaker-notes drawer (own surface, not the Inspector)
	const [deckMenuOpen, setDeckMenuOpen] = React.useState(false); // deck switcher — controlled so the demo can open it
	const [view, setView] = React.useState<'compose' | 'fabricate'>('compose');
	const [shareOpen, setShareOpen] = React.useState(false);
	const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
	const [libraryOpen, setLibraryOpen] = React.useState(false);
	// When the reference-doc picker's "Manage in Library" link opens the Library, jump
	// it straight to the Docs tab (#651). Undefined for the normal Library button.
	const [libInitialFilter, setLibInitialFilter] = React.useState<'refdoc' | undefined>(undefined);
	const [presentOpen, setPresentOpen] = React.useState(false);
	const [cmdOpen, setCmdOpen] = React.useState(false);
	const [moreOpen, setMoreOpen] = React.useState(false); // the compact "⋯ More" overflow menu
	const [insertOpen, setInsertOpen] = React.useState(false);
	const [architectTab, setArchitectTab] = React.useState<'coach' | 'chat'>('coach');
	const [checkpoints, setCheckpoints] = React.useState<Checkpoint[]>(() => loadCheckpoints((loadDeckList()[0] ?? DECKS[0]).id));
	const [toast, setToast] = React.useState<string | null>(null);
	const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const [palette, setPalette] = React.useState(() => {
		try {
			return localStorage.getItem('lattice-studio-palette') || 'indaco';
		} catch {
			return 'indaco';
		}
	});
	const [mobilePane, setMobilePane] = React.useState<'edit' | 'preview'>('preview');
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
	// The insert palette = your saved local components (first) + the built-in catalog.
	const insertComponents = React.useMemo<ComponentEntry[]>(
		() => [...localComponents.map((c) => ({ name: c.name, bucket: 'local', description: 'Your saved component', skeleton: c.skeleton })), ...components],
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
	const editorRef = React.useRef<EditorHandle>(null);
	// The Studio root — the demo stage mounts over it and scopes its selectors here.
	const rootRef = React.useRef<HTMLDivElement>(null);
	// Indirection so the demo can drive the slide-settings drawer's commit funnel —
	// `mutateActiveSlide` is defined lower down (it needs `activeFullIndex`), so the
	// hook reads it through this ref, assigned once it exists.
	const mutateSlideRef = React.useRef<(fn: (chunk: string) => string) => void>(() => {});

	const bp = useBreakpoint();
	const compact = bp !== 'desktop'; // tablet + mobile: panels become sheets
	const mobile = bp === 'mobile'; // single swappable pane

	// Deck-level front-matter (size / paginate / header / footer) is split off the
	// body so it never reads as a phantom slide, but is prepended back to whatever
	// single slide the preview renders so its directives (e.g. `size`) take effect.
	const fm = React.useMemo(() => frontMatterBlock(source), [source]);
	const body = React.useMemo(() => stripFrontMatter(source), [source]);
	const slides = React.useMemo(() => splitSlides(body), [body]);
	// The canonical deck is `slides`; the preview/rail render the VIEWED set — the
	// full deck, or a reader-lens reshape of it (the editor always holds the source).
	const viewSlides = React.useMemo(() => (composeLens === 'full' ? slides : presentationSet(slides, composeLens)), [slides, composeLens]);
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
	const deckScore = React.useMemo(() => scoreDeck(source, lintKnown), [source, lintKnown]);

	// Panels are persistent columns on desktop, on-demand sheets below it. Reset
	// their open state to the right default whenever the breakpoint flips so a
	// compact load never auto-pops a sheet and a return to desktop re-docks them.
	// A newcomer (read via ref so graduating mid-session doesn't slam panels) keeps
	// the Architect closed on desktop too — reduced density until they engage.
	React.useEffect(() => {
		if (compact) { setArchitectOpen(false); setInspectorOpen(false); }
		else { setArchitectOpen(onboardedRef.current); setInspectorOpen(false); }
		// The "⋯ More" overflow only exists on compact; close it across any tier flip
		// so a menu opened on a phone doesn't strand open after a resize to desktop
		// (where its trigger unmounts) — red-team H4.
		setMoreOpen(false);
	}, [compact]);

	// Graduate a newcomer to the full-density shell — one-time, persisted. Called
	// when they dismiss the welcome, make their first edit, or open a panel.
	const graduate = React.useCallback(() => {
		setOnboarded((was) => { if (!was) saveSettings({ onboarded: true }); return true; });
		setWelcomeOpen(false);
	}, []);

	// Persist the active deck's source (debounced) so edits survive a switch AND a
	// reload. Skipped on the very first render (nothing changed yet).
	const firstSave = React.useRef(true);
	React.useEffect(() => {
		if (firstSave.current) {
			firstSave.current = false;
			return;
		}
		const id = setTimeout(() => saveSource(deck.id, source), 400);
		return () => clearTimeout(id);
	}, [source, deck.id]);
	// The backup path (workspace-backup.packWorkspace → requestSourceFlush) asks
	// for an immediate write-through, so a download can't race the 400ms timer
	// above — without this, a JUST-edited built-in deck could drop out of the
	// backup entirely (no stored source yet at pack time).
	React.useEffect(() => {
		const flush = () => saveSource(deck.id, source);
		window.addEventListener(FLUSH_EVENT, flush);
		return () => window.removeEventListener(FLUSH_EVENT, flush);
	}, [source, deck.id]);

	// Persist the editor preference as it changes.
	React.useEffect(() => {
		saveSettings({ validation });
	}, [validation]);

	// Deck-level Look directives, READ from the deck's front-matter.
	const deckSize = getFrontMatter(source, 'size') || '16:9';
	const pageNumbers = getFrontMatter(source, 'paginate') === 'true';
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
	// …and WRITE to it (the editor + every export update in lock-step).
	const finish = getFrontMatter(source, 'finish') || 'none';
	// A finish's backdrop is BAKED into its CSS (a 5th finish layer, generateFinishCss →
	// `--fin-backdrop-*`), so applying a finish just sets `finish:` — nothing is stamped.
	// The deck author OVERRIDES any baked layer — backdrop strength/clearance included —
	// through the single `finish-override:` front-matter map, which deep-merges into the
	// finish's recipe and regenerates its CSS (see `finishExtraCss`).
	const setFinish = (value: string) => setSource((s) => setFrontMatter(s, 'finish', value === 'none' ? null : value));
	// The `mode:` axis (rendering mode — boardroom / sketch), a sibling of finish.
	// (The key can't be `style:` — that's Marp's built-in inline-CSS directive.)
	// Named `renderMode` locally to avoid clashing with the light/dark `mode` below.
	const renderMode = getFrontMatter(source, 'mode') || 'boardroom';
	const setRenderMode = (value: string) => setSource((s) => setFrontMatter(s, 'mode', value === 'boardroom' ? null : value));
	// The white-label brand bar (`spectrum:` register). `on` is the rainbow default, so it
	// writes no key; off / solid write the register.
	const spectrum = getFrontMatter(source, 'spectrum') || 'on';
	const setSpectrum = (value: string) => setSource((s) => setFrontMatter(s, 'spectrum', value === 'on' ? null : value));
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
	const setDeckSize = (value: string) => setSource((s) => setFrontMatter(s, 'size', value));
	const togglePageNumbers = () => setSource((s) => setFrontMatter(s, 'paginate', pageNumbers ? null : 'true'));
	// Write the declared text (trimmed); a blank field clears the directive so the
	// band turns off — no separate toggle, the presence of text IS the switch.
	const setHeaderText = (v: string) => setSource((s) => setFrontMatter(s, 'header', v.trim() || null));
	const setFooterText = (v: string) => setSource((s) => setFrontMatter(s, 'footer', v.trim() || null));
	// Rail ON → clear `no-progress`; rail OFF → stamp it (deck-wide, non-destructive
	// to any other author classes).
	const toggleDeckRail = () => setSource((s) => (deckRail ? mergeClassTokens(s, 'no-progress') : removeClassTokens(s, 'no-progress')));

	function loadDeck(d: StudioDeck) {
		// Flush the current deck's edits before leaving it (the debounce may not
		// have fired), then restore the target deck's saved source.
		saveSource(deck.id, source);
		setDeck(d);
		setSource(loadSource(d.id) ?? deckSource(d));
		setActiveSlide(0);
		setView('compose');
	}
	// New / rename / delete — all persisted via the store, then reflected in the
	// live deck list and switcher.
	function newDeck() {
		saveSource(deck.id, source);
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
		saveSource(deck.id, source);
		for (const d of loadDeckList()) {
			if (d.title === DEMO_FIRST_DECK_TITLE) deleteDeckStore(d.id);
		}
		const d = createDeck(DEMO_FIRST_DECK_TITLE);
		setDecks(loadDeckList());
		setDeck(d);
		setSource(''); // a blank canvas — the demo types the board deck into it
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
		saveSource(deck.id, source);
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
	const activePalette = React.useMemo(() => activePaletteLabel(palette, savedMenu), [palette, savedMenu]);
	const activeFin = React.useMemo(() => activeFinishLabel(finish, savedFinishMenu), [finish, savedFinishMenu]);
	const activeMan = React.useMemo(() => activeModeLabel(renderMode), [renderMode]);
	const activeSpec = React.useMemo(() => activeSpectrumLabel(spectrum), [spectrum]);
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
	// Transient bottom-center confirmation, so no action in the prototype is a
	// dead click (real ones confirm; not-yet-wired ones say so honestly).
	const notify = React.useCallback((msg: string) => {
		setToast(msg);
		if (toastTimer.current) clearTimeout(toastTimer.current);
		toastTimer.current = setTimeout(() => setToast(null), 2600);
	}, []);
	React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

	// ── Self-driving demo walkthrough ───────────────────────────────────────
	// A guided "watch it drive itself" tour: a fake cursor + captions play a
	// storyboard against the LIVE Studio, driving real setters (not synthetic
	// events), and hand the wheel back the instant the viewer clicks or types.
	const { demoActive, startDemo } = useStudioDemo(rootRef, {
		palette,
		createFirstDeck: createDemoFirstDeck,
		setSource,
		typeTail: (t: string) => editorRef.current?.typeTail(t),
		goToSlide,
		setView,
		setArchitectOpen,
		setArchitectTab,
		setInspectorOpen,
		applyPalette,
		toggleMode,
		setPresentOpen,
		setShareOpen,
		setNotesOpen,
		setDeckMenuOpen,
		mutateSlide: (fn: (chunk: string) => string) => mutateSlideRef.current(fn),
		fixAll: () => editorRef.current?.fixAll(),
		setActiveSlide,
		setFocus,
		setWelcomeOpen,
		setCmdOpen,
		notify,
	});

	// ── Resizable/collapsible editor|preview split (2026-07-02 decision) ─────
	// Active on every non-mobile Compose branch (desktop, tablet, focus) — on
	// mobile the Edit/Preview pane swap owns visibility, and in Fabricate the
	// Compose grid isn't rendered; state is retained across both.
	const splitUsable = bp !== 'mobile' && view === 'compose';
	const split = useSplit({
		storageKey: 'lattice-docs-split-studio',
		defaultRatio: 0.46, // mirrors the historical 0.92fr/1.08fr grid
		min: [240, 280],
		railWidth: 46, // the Inspector rail's geometry — collapsed rails read as a rail group
		active: splitUsable,
		paneIds: ['studio-pane-editor', 'studio-pane-preview'],
		onCollapse: (side) => notify(side === 'b' ? 'Preview collapsed — rendering paused.' : 'Editor collapsed.'),
	});
	// Stable handle for callbacks defined above/below without dep churn (the
	// Playground's splitApiRef pattern).
	const splitApiRef = React.useRef(split);
	splitApiRef.current = split;
	// Suspend the per-host scaleFrame ResizeObservers during a divider drag —
	// otherwise every drag frame rescales the preview iframe; resume runs one
	// authoritative re-fit per live host (mirrors the Playground's FIT suspend).
	React.useEffect(() => {
		if (!split.dragging) return;
		suspendScaleObservers(true);
		return () => suspendScaleObservers(false);
	}, [split.dragging]);
	// Collapse via a header glyph (or a ⌘K command): if focus was inside the
	// now-inert pane it would drop to <body>; hand it to the always-visible rail.
	const collapseFromHeader = React.useCallback((side: SplitSide) => {
		splitApiRef.current.collapse(side);
		requestAnimationFrame(() => {
			document.querySelector<HTMLButtonElement>(`[data-studio-split] [data-slot='split-rail'][data-side='${side}']`)?.focus();
		});
	}, []);

	// Contextual reveal: the FIRST genuine authoring edit a newcomer makes opens the
	// Architect (desktop) so the coach appears exactly when they start writing — then
	// graduate. Fired by the editor's onUserEdit (a real keystroke/paste/delete), NOT
	// by any `source` change — so a programmatic write (speaker note, AI apply,
	// checkpoint restore, deck switch) never triggers this misleading cue. (Defined
	// after `notify` so it isn't referenced in the TDZ.)
	const onFirstUserEdit = React.useCallback(() => {
		if (onboardedRef.current || firstEditRef.current) return;
		firstEditRef.current = true;
		if (!compact) setArchitectOpen(true);
		// Now that they're authoring, nudge them toward the deck Inspector (look,
		// chrome, running marks) with a one-time pulse — gentler than auto-opening it.
		setInspectorPulse(true);
		notify('Your AI Coach reviews the deck as you write — it just opened on the left.');
		graduate();
	}, [compact, notify, graduate]);

	// ── Architect (AI) ───────────────────────────────────────────────────────
	const ai = useArchitectStatus();
	const [aiBusy, setAiBusy] = React.useState<string | null>(null);
	const [hasSelection, setHasSelection] = React.useState(false);
	const [refineBusy, setRefineBusy] = React.useState(false);
	// Deck-wide deterministic findings (the real lint-core list the editor underlines)
	// — surfaced in the Coach panel so each can be fixed with AI. A proposed fix is a
	// reviewable diff keyed by finding; nothing applies until the author clicks Apply.
	const [findings, setFindings] = React.useState<Finding[]>([]);
	const [fixBusy, setFixBusy] = React.useState<string | null>(null);
	const [fixProposal, setFixProposal] = React.useState<{ key: string; before: string; after: string; edit: unknown } | null>(null);
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
	// Run one architect instruction. Applies real edits when a model is connected;
	// degrades honestly (points at Workspace) when it is not.
	const runArchitectAction = React.useCallback(
		async (key: string, label: string, instruction: string) => {
			if (aiBusy) return;
			setAiBusy(key);
			notify(`${label}…`);
			try {
				const out = await runArchitect(source, instruction);
				if (out.status === 'offline') {
					notify('Connect a model in Workspace → AI, then this applies automatically.');
					setWorkspaceOpen(true);
				} else if (out.status === 'blocked') {
					notify(out.note);
					setWorkspaceOpen(true);
				} else if (out.status === 'advice') {
					notify(out.note);
				} else {
					// Checkpoint the pre-edit deck so an AI change is reversible from
					// history, not just ⌘Z.
					setCheckpoints(saveCheckpoint(deck.id, source, `Before ${label}`, Date.now()));
					setSource(out.source);
					notify(`${out.note} — ⌘Z or restore from History to undo.`);
				}
			} catch {
				notify(`${label} failed — try again.`);
			} finally {
				setAiBusy(null);
			}
		},
		[aiBusy, source, notify, deck.id],
	);

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
				const out = await refineSelection(action, sel.text);
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
	React.useEffect(() => {
		if (!validation) {
			setFindings([]);
			return;
		}
		let live = true;
		listFindings(lintVocab, source, localNames, savedFinishLintNames).then((f) => {
			if (live) setFindings(f);
		});
		return () => {
			live = false;
		};
	}, [validation, source, lintVocab, localNames, savedFinishLintNames]);
	// A clean proposal can outlive its finding after an edit; clear it when the
	// finding set changes so a stale diff card never lingers.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on findings identity only — clearing a stale proposal when the list changes.
	React.useEffect(() => setFixProposal(null), [findings]);

	// Ask the Architect to fix ONE finding — proposes a reviewable diff (nothing
	// applied yet). Honest degradation with no model / at the cap.
	const fixFinding = React.useCallback(
		async (finding: Finding, key: string) => {
			if (fixBusy) return;
			setFixBusy(key);
			setFixProposal(null);
			notify('Asking the Architect to fix this…');
			try {
				const out = await requestFindingFix(source, finding, components);
				if (out.status === 'offline') {
					notify('Connect a model in Workspace → AI to fix a finding.');
					setWorkspaceOpen(true);
				} else if (out.status === 'blocked') {
					notify(out.note);
					setWorkspaceOpen(true);
				} else if (out.status === 'nochange') {
					notify('The model had no rewrite to propose for this one.');
				} else {
					setFixProposal({ key, before: out.before, after: out.after, edit: out.edit });
				}
			} catch {
				notify('Fix failed — try again.');
			} finally {
				setFixBusy(null);
			}
		},
		[fixBusy, source, components, notify],
	);
	// Apply the reviewed fix — checkpoint first (reversible from History), splice the
	// edited slide back, and jump the preview to it.
	const applyFix = React.useCallback(() => {
		if (!fixProposal) return;
		setCheckpoints(saveCheckpoint(deck.id, source, 'Before AI fix', Date.now()));
		setSource(applyDeckEdit(source, fixProposal.edit));
		setFixProposal(null);
		notify('Fix applied — ⌘Z or restore from History to undo.');
	}, [fixProposal, source, deck.id, notify]);

	// ⌘K (command palette), ⌘. (toggle Focus), Esc (leave Focus). Radix
	// popovers/sheets/dialogs handle Escape first and stop its propagation, so
	// `Esc` only reaches here — and only leaves Focus — when nothing is open.
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setCmdOpen((v) => !v);
			} else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
				e.preventDefault();
				setFocus((v) => !v);
			} else if (e.key === 'Escape') {
				setFocus((v) => (v ? false : v));
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	// Fabricate is its own full-screen surface; never sit "focused" behind it.
	React.useEffect(() => { if (view === 'fabricate') setFocus(false); }, [view]);

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
	const slideNo = Math.min(activeSlide, viewSlides.length - 1) + 1;
	// The full-deck index of the slide currently in view (for handing off to Present).
	const activeFullIndex = composeLens === 'full' ? slideNo - 1 : Math.max(0, slides.indexOf(viewSlides[slideNo - 1]));

	// The preview card's aspect follows the deck's selected Size (not a fixed 16:9);
	// portrait shapes bind to height so they fit the pane, landscape to width.
	const previewRatio = sizeRatio(deckSize);
	const previewPortrait = previewRatio[1] > previewRatio[0];
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

	// Structural slide ops (full lens only). Each rewrites the source, moves the
	// active slide to follow the edit, and reveals it in the editor next frame
	// (after the value-sync effect has pushed the new doc into CodeMirror).
	const curIndex = slideNo - 1;
	function applyDeckOp(r: { source: string; active: number }) {
		setSource(r.source);
		setActiveSlide(r.active);
		requestAnimationFrame(() => editorRef.current?.revealSlide(r.active));
	}
	const opAddSlide = () => { applyDeckOp(addSlideAfter(source, curIndex)); notify('Slide added.'); };
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
	// Insert a library component as a new slide after the current one (its authored
	// skeleton), via the same deck-op the toolbar uses.
	const onInsertComponent = (c: ComponentEntry) => { applyDeckOp(addSlideAfter(source, curIndex, c.skeleton)); notify(`Inserted “${c.name}”.`); };

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
	// The "This slide" drawer owns the note + class controls (SlideContext).
	const mutateActiveSlide = React.useCallback((fn: (chunk: string) => string) => {
		setSource((s) => {
			const chunk = splitSlides(stripFrontMatter(s))[activeFullIndex];
			return chunk == null ? s : replaceSlide(s, activeFullIndex, fn(chunk)).source;
		});
	}, [activeFullIndex]);
	mutateSlideRef.current = mutateActiveSlide;

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

	const architectCards = (
		<>
			{issues > 0 && (
				<div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_28%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_7%,transparent)] px-3 py-2">
					<AlertTriangle className="size-4 text-[var(--chart-2,#9c3f00)]" />
					<span className="text-xs font-semibold text-[var(--text-heading)]">{issues} inline issue{issues > 1 ? 's' : ''}</span>
					<button type="button" onClick={() => editorRef.current?.fixAll()} className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">Fix all</button>
				</div>
			)}
			<ArchCard tag={<IntentTag intent={deckScore.intent} />} title="Board-ready">
				<div className="flex items-baseline gap-2"><span className="font-sans text-[28px] font-extrabold leading-none text-[var(--text-heading)]">{deckScore.score.toFixed(1)}</span><span className="text-[13px] text-muted-foreground">/ 10 · boardroom</span></div>
				<div className="mt-2 space-y-1.5 text-xs">
					{deckScore.rows.map((r) => <ScoreRow key={r.label} ok={r.ok} label={r.label} v={r.note} />)}
				</div>
			</ArchCard>
			{findings.length > 0 && (
				<ArchCard tag={<IntentTag intent="review" label="FINDINGS" />} title={`${findings.length} to address`}>
					<p className="text-xs leading-relaxed text-muted-foreground">The deck linter's per-slide notes. {ai.ready ? 'Fix any one with AI — review the diff before it lands.' : <>Connect a model in Workspace to fix these with AI.</>}</p>
					<ul className="mt-2 space-y-2">
						{findings.slice(0, 6).map((f, i) => {
							const key = `${f.slide}:${f.rule}:${i}`;
							const isErr = f.severity === 'error';
							return (
								<li key={key} className="rounded-lg border border-border bg-background px-2.5 py-2">
									<div className="flex items-start gap-2">
										<span className="mt-0.5 shrink-0" style={{ color: isErr ? 'var(--chart-2,#9c3f00)' : 'var(--chart-4,#9a6a00)' }}><AlertTriangle className="size-3.5" /></span>
										<div className="min-w-0 flex-1">
											<span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Slide {f.slide} · {f.rule}</span>
											<p className="text-[12px] leading-snug text-foreground">{f.message}</p>
										</div>
										{ai.ready && <Chip busy={fixBusy === key} onClick={() => fixFinding(f, key)}>Fix with AI</Chip>}
									</div>
									{fixProposal?.key === key && <DiffCard before={fixProposal.before} after={fixProposal.after} onApply={applyFix} onDiscard={() => setFixProposal(null)} />}
								</li>
							);
						})}
					</ul>
					{findings.length > 6 && <p className="mt-2 text-[11px] text-muted-foreground">+{findings.length - 6} more — the editor underlines them all.</p>}
				</ArchCard>
			)}
			<ArchCard tag={<IntentTag intent="info" label="COACH" />} title="Tighten the story">
				<p className="text-xs leading-relaxed text-muted-foreground">Lead every slide with its takeaway, not its detail — the number, then the supporting rows.{!ai.ready && <span className="text-[var(--text-muted)]"> Connect a model in Workspace for one-click rewrites.</span>}</p>
				<Chip busy={aiBusy === 'lead'} onClick={() => runArchitectAction('lead', 'Rewrite lead', `Rewrite slide ${activeFullIndex + 1} so it opens with its single headline takeaway or number, then the supporting rows. Return the whole slide, same component.`)}>Rewrite lead</Chip>
			</ArchCard>
			<ArchCard tag={<IntentTag intent="info" label="RESHAPE" />} title="Reshape for a reader">
				<p className="text-xs leading-relaxed text-muted-foreground">Reorient the deck without losing the source.</p>
				<div className="mt-2 flex flex-wrap gap-1.5"><Chip onClick={() => { setLens('exec'); notify('Preview reshaped to the Exec summary — headline slides only.'); }}>Exec summary</Chip><Chip busy={aiBusy === 'technical'} onClick={() => runArchitectAction('technical', 'Reshape: Technical', 'Rewrite the deck in a more technical, detail-forward voice — concrete metrics, methods, and specifics over narrative. Edit each slide that needs it; keep the component types.')}>Technical</Chip><Chip busy={aiBusy === 'narrative'} onClick={() => runArchitectAction('narrative', 'Reshape: Narrative', 'Rewrite the deck in a more narrative, story-forward voice — a throughline from problem to payoff, plain language. Edit each slide that needs it; keep the component types.')}>Narrative</Chip></div>
			</ArchCard>
		</>
	);

	// The Architect panel: a Coach/Chat toggle over the static cards or the real
	// conversational thread (with reviewable apply/discard diff cards).
	const architectBody = (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 gap-1 px-2.5 pt-2.5">
				<button type="button" onClick={() => setArchitectTab('coach')} aria-pressed={architectTab === 'coach'} className={cn('flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold', architectTab === 'coach' ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground')}>Coach</button>
				<button type="button" onClick={() => setArchitectTab('chat')} aria-pressed={architectTab === 'chat'} className={cn('flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold', architectTab === 'chat' ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground')}>Chat</button>
			</div>
			{architectTab === 'coach' ? <div className="min-h-0 flex-1 overflow-y-auto">{architectCards}</div> : <ArchitectChat deckId={deck.id} source={source} aiReady={ai.ready} onApply={applyChatEdit} onConnect={() => setWorkspaceOpen(true)} onManageDocs={() => { setLibInitialFilter('refdoc'); setLibraryOpen(true); }} notify={notify} />}
		</div>
	);

	// ── Inspector body (groups) — shared by the desktop column and the sheet ──
	const inspectorBody = (
		<>
			<InspGroup icon={<Palette className="size-3.5" />} label="Look" desc="The deck's visual identity — palette, light or dark, size, and surface.">
				<Field label="Theme" desc="The color palette every slide draws from.">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Control aria-label="Choose theme"><span className="flex min-w-0 items-center gap-2"><span className="size-3.5 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]" style={{ background: activePalette.color }} /><span className="truncate">{activePalette.label}</span></span> <ChevronDown className="size-3.5" /></Control>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="max-h-[60vh] w-52 overflow-y-auto">
							<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
						</DropdownMenuContent>
					</DropdownMenu>
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
				<Field label="Appearance" desc="Renders the whole deck in light or dark."><Control onClick={toggleMode} aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{mode === 'dark' ? 'Dark' : 'Light'} {mode === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}</Control></Field>
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
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Control aria-label="Choose mode"><span className="flex min-w-0 items-center gap-2"><span className="size-3.5 shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]" style={{ background: activeMan.swatch, backgroundSize: activeMan.backgroundSize }} /><span className="truncate">{activeMan.label}</span></span> <ChevronDown className="size-3.5" /></Control>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<ModeMenuItems mode={renderMode} onPick={setRenderMode} />
							</DropdownMenuContent>
						</DropdownMenu>
					</Field>
				<Field label="Finish" desc="A backdrop texture applied to every slide — a soft gradient, wash, or grain behind the content.">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Control aria-label="Choose finish"><span className="flex min-w-0 items-center gap-2"><span className="size-3.5 shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]" style={{ background: activeFin.swatch, backgroundSize: activeFin.backgroundSize }} /><span className="truncate">{activeFin.label}</span></span> <ChevronDown className="size-3.5" /></Control>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="max-h-[60vh] w-56 overflow-y-auto">
								<FinishMenuItems finish={finish} onPick={setFinish} saved={savedFinishMenu} />
							</DropdownMenuContent>
						</DropdownMenu>
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
					<Field label="Brand bar" desc="The colored strip along each slide's top edge. Set Solid to a client's brand color to white-label the deck.">
							{/* The white-label spectrum — the rainbow bar on the top border / divider
							    rail. `spectrum:` register: Rainbow (default) / None / Solid accent. Set
							    the theme accent to a client's brand and Solid follows. */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Control aria-label="Choose brand bar"><span className="flex min-w-0 items-center gap-2"><span className="size-3.5 shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]" style={{ background: activeSpec.swatch, backgroundSize: activeSpec.backgroundSize }} /><span className="truncate">{activeSpec.label}</span></span> <ChevronDown className="size-3.5" /></Control>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<SpectrumMenuItems spectrum={spectrum} onPick={setSpectrum} />
								</DropdownMenuContent>
							</DropdownMenu>
						</Field>
				</InspGroup>
			{/* The deck's running marks — the header, footer, page number, and rail that
			    repeat across slides. Header & footer are text you DECLARE (the whole point:
			    you say what the band reads); page numbers & the rail are on/off. The group is
			    named for its CONTENTS, not its scope — the drawer header already says these are
			    deck-wide, so the title needn't restate it (that was the redundancy). A single
			    slide hides any of them from its Slide settings. */}
			<InspGroup icon={<Frame className="size-3.5" />} label="Running marks" desc="The header, footer, page number, and section rail.">
					<TextRow label="Header" desc="The line along the top — a deck title or client name. Blank hides it." value={headerText} placeholder={`e.g. ${deck.title}`} onCommit={setHeaderText} />
					<TextRow label="Footer" desc="The line along the bottom — a confidentiality or source line. Blank hides it." value={footerText} placeholder="e.g. Confidential" onCommit={setFooterText} />
					<Field label="Page numbers"><Toggle label="Page numbers" on={pageNumbers} onClick={togglePageNumbers} /></Field>
					<Field label="Section rail" desc="Show the progress dots that track position through the deck."><Toggle label="Section rail" on={deckRail} onClick={toggleDeckRail} /></Field>
				</InspGroup>
			<InspGroup icon={<Wand2 className="size-3.5" />} label="Authoring" desc="Aids while you write. Preview-only — none of this appears in the export." last>
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
			</InspGroup>
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
			inert={split.collapsed === 'a' ? true : undefined}
			className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity [container-type:inline-size] group-data-[split-arming=a]/split:opacity-60 group-data-[split-dragging]/split:select-none"
		>
			<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				Edit
				<span className="flex-1" />
				{issues > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 font-sans text-[11px] font-semibold normal-case tracking-normal text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues} issue{issues > 1 ? 's' : ''}</span>}
				{hasSelection && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button type="button" disabled={refineBusy} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40" aria-label="Refine selection" title="Refine selection"><Wand2 className="size-3" /><span className="hidden @[36rem]:inline">Refine</span></button>
						</DropdownMenuTrigger>
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
				{insertComponents.length > 0 && <button type="button" onClick={() => setInsertOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)]" aria-label="Insert component" title="Insert component"><Plus className="size-3" /><span className="hidden @[36rem]:inline">Insert</span></button>}
				<button type="button" onClick={() => editorRef.current?.fixAll()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] disabled:opacity-40" disabled={!issues} aria-label="Fix all issues" title="Fix all issues"><ListChecks className="size-3" /><span className="hidden @[36rem]:inline">Fix all</span></button>
				{/* Version history — deck-level recovery, docked in the editor header beside
				    the Slide-settings launcher (always visible; not in the top nav). */}
				<Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(true)} aria-label="Version history" title="Version history — save & restore snapshots"><History className="size-[18px]" /></Button>
				<Button variant="ghost" size="icon-sm" onClick={() => setNotesOpen(true)} aria-label="Slide settings" title="Slide settings — look, status, chrome, notes"><FileSliders className="size-[18px]" /></Button>
				<span className="hidden items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-foreground @[36rem]:inline-flex"><FileText className="size-3" />Markdown</span>
				{splitUsable && (
					<Button variant="ghost" size="icon-sm" aria-label="Collapse editor" title="Collapse editor — or drag the divider past its minimum" onClick={() => collapseFromHeader('a')}>
						<PanelLeftClose className="size-4" />
					</Button>
				)}
			</div>
			<Editor ref={editorRef} value={source} onChange={setSource} knownComponents={validation ? knownWithLocal : NO_KNOWN} completionComponents={insertComponents} completionFinishValues={editorFinishValues} completionFinishClasses={editorFinishClasses} lintVocab={lintVocab} extraComponentNames={localNames} onCursorSlide={onEditorCursorSlide} onSelectionChange={setHasSelection} onUserEdit={onFirstUserEdit} className="flex-1" />
		</section>
	);

	// ── Preview pane (live engine render) — shared by all breakpoints ────────
	// Collapsed → inert AND DeckPreview `active=false` below: per-keystroke
	// renders defer while hidden and ONE render fires on the expand rising edge
	// (the shipped DeckPreview contract), so nothing renders into a 0-width frame.
	const previewPane = (
		<section
			id="studio-pane-preview"
			inert={split.collapsed === 'b' ? true : undefined}
			className="flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity group-data-[split-arming=b]/split:opacity-60 group-data-[split-dragging]/split:select-none"
		>
			<div className="flex items-center gap-2 border-b border-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
				Preview
				{/* View — the reader lens (shared LensPicker, also used in Present). It
				    filters the PREVIEW; the source stays whole. Labeled at every width. */}
				<LensPicker value={composeLens} onChange={setLens} count={viewSlides.length} total={slides.length} align="start" />
				{composeLens !== 'full' && (
					<button type="button" onClick={() => setLens('full')} className="rounded-full p-0.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Clear reader lens" title="Clear reader lens"><X className="size-3.5" /></button>
				)}
				<span className="flex-1" />
				<button type="button" onClick={() => goToSlide(slideNo - 2)} className="rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Previous slide">‹</button>
				<span className="rounded-full border border-border bg-card px-2 py-0.5 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--text-heading)]">Slide {slideNo} / {viewSlides.length}</span>
				<button type="button" onClick={() => goToSlide(slideNo)} className="rounded px-1.5 text-muted-foreground hover:text-[var(--accent)]" aria-label="Next slide">›</button>
				{splitUsable && (
					<Button variant="ghost" size="icon-sm" aria-label="Collapse preview" title="Collapse preview — or drag the divider past its minimum" onClick={() => collapseFromHeader('b')}>
						<PanelRightClose className="size-4" />
					</Button>
				)}
			</div>
			{/* Swipe (touch) + horizontal-wheel (trackpad) change slides; the card's
			    aspect ratio follows the deck's selected Size, not a fixed 16:9. */}
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-card p-4 sm:p-5" onTouchStart={onPreviewTouchStart} onTouchEnd={onPreviewTouchEnd} onWheel={onPreviewWheel}>
				{/* pointer-events-none so a swipe over the slide (an engine iframe, which
				    would otherwise swallow the touch) reaches the swipe container. The debug
				    overlay's press-and-hold rides a parent-hosted capture surface layered
				    ABOVE this (debug-overlay.js), so it works regardless of this rule. */}
				{/* The 760px comfort cap LIFTS while the editor is collapsed — otherwise
				    "collapse editor" delivers the same-size slide in a sea of gutter
				    (decision §5; landscape only — portrait binds to height already). */}
				<div className={cn('pointer-events-none relative overflow-hidden rounded-xl border border-border bg-background shadow-[0_8px_24px_rgba(10,22,40,.10)]', previewPortrait ? 'h-full w-auto' : cn('h-auto w-full', split.collapsed === 'a' ? 'max-w-none' : 'max-w-[760px]'))} style={{ aspectRatio: `${previewRatio[0]} / ${previewRatio[1]}` }}>
					<DeckPreview options={options} sample={previewFm ? previewFm + slide : slide} mermaid={false} paletteOverride={activeTheme?.name} extraTheme={extraTheme} extraCss={previewExtraCss} active={split.collapsed !== 'b'} debounceMs={140} className="size-full" aria-label="Live deck preview" />
				</div>
			</div>
			{/* Slide navigator — jump to any slide, see its component type */}
			<div className="flex items-center gap-1.5 border-t border-border bg-background px-3 py-2">
				{composeLens === 'full' && (
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
					return (
						<button
							type="button"
							// biome-ignore lint/suspicious/noArrayIndexKey: the slide rail is positional — slide N's index IS its identity.
							key={i}
							onClick={() => goToSlide(i)}
							aria-current={on}
							aria-label={`Slide ${i + 1} — ${slideClass(s)}`}
							className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]')}
						>
							<span className={cn('grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold', on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{i + 1}</span>
							<span className={cn('font-mono text-[11px]', on ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{slideClass(s)}</span>
						</button>
					);
				})}
			</nav>
			</div>
			<div className="flex items-center gap-3 border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
				<span className="inline-flex items-center gap-1 text-[var(--chart-3,#2e6f00)]">● Live</span>
				<span className="truncate">{palette} · {mode}</span>
				<span className="flex-1" /><span className="hidden sm:inline">{ratioText(previewRatio)} · {viewSlides.length} slide{viewSlides.length === 1 ? '' : 's'}</span>
			</div>
		</section>
	);

	// The split's fixed grid children — rails + handle, shared by EVERY non-mobile
	// branch so the five splitTracks() columns always match five children (rails
	// are always rendered; a 0px track + visibility gating hides them). Rail
	// badges keep the collapsed pane honest: the editor rail carries the existing
	// amber issue pill (never editing blind), the preview rail a slide count.
	const splitRailA = (
		<SplitRail direction="right" label="Edit" labelExpand="Expand editor" {...split.railProps('a')}>
			{issues > 0 && (
				<span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues}</span>
			)}
		</SplitRail>
	);
	const splitHandle = <SplitHandle {...split.handleProps} />;
	const splitRailB = (
		<SplitRail direction="left" label="Preview" labelExpand="Expand preview" {...split.railProps('b')}>
			<span className="font-mono text-[10px] text-muted-foreground">{viewSlides.length}</span>
		</SplitRail>
	);

	return (
		<div ref={rootRef} data-studio-root="" className="lx-ui flex h-[100dvh] flex-col bg-background text-foreground">
			{/* ── Top bar ─────────────────────────────────────────────── */}
			{/* Focus mode: a slim header — deck title · ⌘K · Exit. Most of the
			    control cluster is gone; ⌘K still reaches every feature. */}
			{focus ? (
			<header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3.5">
				<LatticeMark mode={mode} className="size-7 shrink-0" />
				<span className="min-w-0 truncate text-sm font-semibold text-[var(--text-heading)]">{deck.title}</span>
				<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{metaFor(source)}</span>
				<div className="flex-1" />
				<button type="button" onClick={() => setCmdOpen(true)} className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] sm:flex" aria-label="Search or run a command">
					<Search className="size-4" />Search or run…
					<span className="ml-2 rounded border border-border bg-background px-1.5 font-mono text-[11px]">⌘K</span>
				</button>
				<Button variant="outline" size="sm" onClick={() => setFocus(false)} className="gap-1.5" title="Exit focus (Esc)" aria-label="Exit focus mode"><Minimize2 className="size-4" /><span className="hidden sm:inline">Exit focus</span></Button>
			</header>
			) : (
			<header className="flex h-[54px] shrink-0 items-center gap-1.5 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 sm:gap-3 sm:px-3.5">
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
						{/* Fabricate is advanced (theme/component authoring) — hidden until a newcomer engages. */}
						{onboarded && <DropdownMenuItem onSelect={() => setView('fabricate')}><PencilRuler className="size-4" /><div><div className="font-semibold text-[var(--text-heading)]">Fabricate</div><div className="text-[11px] text-muted-foreground">Theme &amp; Component Studio</div></div></DropdownMenuItem>}
						<DropdownMenuSeparator />
						{/* Deck CRUD lives in the deck switcher (New deck is there) — the
						    launcher keeps app navigation + Import only, so the two adjacent
						    menus don't offer the same action twice. */}
						<DropdownMenuItem onSelect={() => importInputRef.current?.click()}><Upload className="size-4" />Import deck…</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<span className="hidden h-5 w-px bg-border sm:block" />

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

				<div className="flex-1" />

				{/* ⌘K pill — desktop only (≥1100). On compact the "Search / commands" row
				    inside ⋯ is the search affordance; the ⌘K shortcut stays always-bound. */}
				{!compact && (
					<button type="button" onClick={() => setCmdOpen(true)} className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] lg:flex" aria-label="Search or run a command">
						<Search className="size-4" />Search or run…
						<span className="ml-2 rounded border border-border bg-background px-1.5 font-mono text-[11px]">⌘K</span>
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
						<Button variant="ghost" size="icon-sm" data-demo="mode" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button>
					</div>
				)}

				{/* Desktop dividers band the right cluster by altitude — utilities |
				    deliverable verbs | session panels | app surfaces — so global and
				    deck controls don't read as one interleaved run (2026-07-03). */}
				{!compact && <span className="h-5 w-px bg-border" />}

				{/* Present + Share — the deliverable verbs, primary at every width. On
				    phones they live one row down in the pane bar (with the panel toggles),
				    which has the free width — the top row spends its width on the deck
				    title (2026-07-03 decision). */}
				{!mobile && <Button variant="ghost" size="icon-sm" onClick={startDemo} aria-label="Watch demo" title="Watch demo — the Studio drives itself" className={cn('text-[var(--accent)] hover:text-[var(--on-accent)] hover:bg-[var(--accent)]', demoActive && 'pointer-events-none invisible')}><MonitorPlay className="size-[18px]" /></Button>}
				{!mobile && <Button variant="outline" size="sm" data-demo="present" onClick={() => setPresentOpen(true)} className="gap-1.5 px-2 lg:px-3" title="Present"><Play className="size-4" /><span className="hidden lg:inline">Present</span></Button>}
				{!mobile && <Button size="sm" data-demo="share" onClick={() => setShareOpen(true)} className="gap-1.5 px-2 lg:px-3" title="Share"><Share2 className="size-4" /><span className="hidden lg:inline">Share</span></Button>}

				<span className="hidden h-5 w-px bg-border sm:block" />
				{/* Focus — drop to Editor + Preview, hide the panels, quiet the noise (desktop only; tablet/mobile already collapse panels). Advanced — revealed once a newcomer engages. */}
				{!compact && onboarded && <Button variant="ghost" size="icon-sm" onClick={() => setFocus(true)} aria-label="Enter focus mode" title="Focus — hide panels, just write (⌘.)"><Focus className="size-[18px]" /></Button>}
				{/* Architect + Inspector — the working-panel toggles stay 1-tap at EVERY width
				    (never folded into ⋯): visible aria-pressed/active color, and the #635
				    first-edit Inspector pulse always lands on a visible button. On phones
				    they ride the pane bar below with Present + Share. */}
				{!mobile && <Button variant="ghost" size="icon-sm" aria-pressed={architectOpen} onClick={() => { graduate(); setArchitectOpen((v) => !v); }} aria-label="Toggle Architect" title="Architect — AI coach &amp; chat" className={cn(architectOpen && 'text-[var(--accent)]')}><Sparkles className="size-[18px]" /></Button>}
				{!mobile && <Button variant="ghost" size="icon-sm" aria-pressed={inspectorOpen} onClick={() => { graduate(); setInspectorPulse(false); setInspectorOpen((v) => !v); }} aria-label="Toggle Deck inspector" title="Deck inspector — look, chrome, running marks" className={cn(inspectorOpen && 'text-[var(--accent)]', inspectorPulse && 'text-[var(--accent)] ring-2 ring-[var(--accent)] animate-pulse')}><SlidersHorizontal className="size-[18px]" /></Button>}
				{!compact && <span className="h-5 w-px bg-border" />}

				{/* Compact (≤1099): the mode toggle stands alone (1-tap), then ONE ⋯ overflow
				    holds the genuinely-secondary controls — theme picker, Library, Workspace,
				    and a Search/commands row (the touch path to the ⌘K palette). */}
				{compact && <Button variant="ghost" size="icon-sm" aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleMode}>{mode === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</Button>}
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
								{onboarded && <DropdownMenuItem onSelect={() => setLibraryOpen(true)}><FileBox className="size-4" />Library</DropdownMenuItem>}
								{onboarded && <DropdownMenuItem onSelect={() => setWorkspaceOpen(true)}><Settings2 className="size-4" />Workspace settings</DropdownMenuItem>}
								<DropdownMenuItem onSelect={() => setCmdOpen(true)}><Search className="size-4" />Search / commands<span className="ml-auto rounded border border-border bg-background px-1.5 font-mono text-[10px]">⌘K</span></DropdownMenuItem>
								<DropdownMenuSeparator />
								<ThemeMenuItems palette={palette} onPick={applyPalette} saved={savedMenu} />
							</ScrollFade>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{/* Library + Workspace + avatar — desktop primary; on compact they live in ⋯
				    (above). Advanced surfaces — hidden until a newcomer engages. */}
				{!compact && onboarded && <Button variant="ghost" size="icon-sm" onClick={() => setLibraryOpen(true)} aria-label="Open Library" title="Library — saved themes &amp; components"><FileBox className="size-[18px]" /></Button>}
				{!compact && onboarded && <Button variant="ghost" size="icon-sm" onClick={() => setWorkspaceOpen(true)} aria-label="Workspace settings"><Settings2 className="size-[18px]" /></Button>}
				{!compact && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-inverse)] text-[12px] font-bold text-white">SA</span>}
			</header>
			)}

			{/* ── First-run welcome (newcomers only; dismiss graduates) ──── */}
			{welcomeOpen && view === 'compose' && (
				<div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-[var(--accent-soft)] px-3.5 py-2 text-[13px] text-[var(--text-heading)]">
					<Sparkles className="hidden size-4 shrink-0 text-[var(--accent)] sm:block" />
					<p className="min-w-0 flex-1 leading-snug">
						<span className="font-semibold">New here?</span> This is a sample deck <span className="hidden sm:inline">about Lattice</span> — edit any slide to make it yours. Your AI Coach <Sparkles className="inline size-3.5 align-text-bottom text-[var(--accent)]" /> and deck settings <SlidersHorizontal className="inline size-3.5 align-text-bottom text-[var(--accent)]" /> are one tap away in the toolbar.
					</p>
					{!mobile && !demoActive && <button type="button" onClick={startDemo} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:opacity-90"><MonitorPlay className="size-3.5" />Watch demo</button>}
					<button type="button" onClick={graduate} className="shrink-0 rounded-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-background px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Got it</button>
					<button type="button" onClick={graduate} aria-label="Dismiss welcome" className="shrink-0 rounded p-1 text-muted-foreground hover:text-[var(--text-heading)]"><X className="size-4" /></button>
				</div>
			)}

			{/* ── Body ─────────────────────────────────────────────────── */}
			{view === 'fabricate' ? (
				<React.Suspense fallback={<div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Loading the Fabricate studio…</div>}>
					<Fabricate options={options} catalog={components} onClose={() => setView('compose')} notify={notify} onSaved={() => { refreshThemes(); refreshComponents(); refreshFinishes(); }} onOpenWorkspace={() => setWorkspaceOpen(true)} />
				</React.Suspense>
			) : mobile ? (
				/* Mobile: one swappable Edit/Preview pane; panels live in sheets. The deck
				   actions stay INLINE and one-tap — an icon-only Edit/Preview toggle reclaims
				   the width that keeps them on the bar at 390px (no ⋯ hiding). The top row
				   spends its width on the deck title (2026-07-03 decision). Contextual extras
				   stay per-pane so the row fits: the issues pill on the Edit pane; History +
				   Slide settings on the Preview pane (the Edit pane's editor header has them). */
				<div className="flex min-h-0 flex-1 flex-col">
					<div role="toolbar" aria-label="Deck actions" className="flex shrink-0 items-center gap-1 border-b border-border bg-card p-1.5">
						{/* Icon-only Edit/Preview toggle — dropping the two text labels reclaims
						    ~78px, which is what lets the deck actions stay INLINE (one tap, no ⋯)
						    and still fit 390px. */}
						<div className="inline-flex rounded-lg border border-border bg-background p-[3px]">
							<PaneBtn active={mobilePane === 'edit'} onClick={() => setMobilePane('edit')} icon={<PencilLine className="size-4" />} label="Edit" />
							<PaneBtn active={mobilePane === 'preview'} onClick={() => setMobilePane('preview')} icon={<Eye className="size-4" />} label="Preview" />
						</div>
						<span className="flex-1" />
						{mobilePane === 'edit' && issues > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_35%,transparent)] bg-[color-mix(in_srgb,var(--chart-2,#9c3f00)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--chart-2,#9c3f00)]"><AlertTriangle className="size-3" />{issues}</span>}
						{/* Version history + Slide settings ride the pane bar only on the PREVIEW
						    pane — the EDIT pane's own editor header already carries both. */}
						{mobilePane === 'preview' && <Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(true)} aria-label="Version history" title="Version history — save & restore snapshots"><History className="size-[18px]" /></Button>}
						{mobilePane === 'preview' && <Button variant="ghost" size="icon-sm" onClick={() => setNotesOpen(true)} aria-label="Slide settings" title="Slide settings — look, status, chrome, notes"><FileSliders className="size-[18px]" /></Button>}
						<Button variant="outline" size="sm" onClick={() => setPresentOpen(true)} className="gap-1.5 px-2" title="Present" aria-label="Present"><Play className="size-4" /></Button>
						<Button size="sm" onClick={() => setShareOpen(true)} className="gap-1.5 px-2" title="Share" aria-label="Share"><Share2 className="size-4" /></Button>
						<Button variant="ghost" size="icon-sm" aria-pressed={architectOpen} onClick={() => { graduate(); setArchitectOpen((v) => !v); }} aria-label="Toggle Architect" title="Architect — AI coach &amp; chat" className={cn(architectOpen && 'text-[var(--accent)]')}><Sparkles className="size-[18px]" /></Button>
						<Button variant="ghost" size="icon-sm" aria-pressed={inspectorOpen} onClick={() => { graduate(); setInspectorPulse(false); setInspectorOpen((v) => !v); }} aria-label="Toggle Deck inspector" title="Deck inspector — look, chrome, running marks" className={cn(inspectorOpen && 'text-[var(--accent)]', inspectorPulse && 'text-[var(--accent)] ring-2 ring-[var(--accent)] animate-pulse')}><SlidersHorizontal className="size-[18px]" /></Button>
					</div>
					{mobilePane === 'edit' ? editorPane : previewPane}
				</div>
			) : focus ? (
				/* Focus: Editor | Preview only — Architect/Inspector hidden, ⌘K still
				   reaches everything (2026-06-30-studio-focus-mode.md). */
				<div
					className="group/split grid min-h-0 flex-1"
					data-studio-split=""
					data-split-collapsed={split.collapsed ?? undefined}
					style={{ ...split.gridVars, gridTemplateColumns: splitTracks(split.collapsed).join(' ') }}
					{...split.containerProps}
				>
					{splitRailA}
					{editorPane}
					{splitHandle}
					{previewPane}
					{splitRailB}
				</div>
			) : (
				/* Desktop: Architect? | split | Inspector · Tablet: just the split
				   (panels → sheets). The split contributes FIVE children (rail | editor
				   | handle | preview | rail) via splitTracks() — one helper for every
				   branch so track lists can't drift. */
				<div
					className="group/split grid min-h-0 flex-1"
					data-studio-split=""
					data-split-collapsed={split.collapsed ?? undefined}
					style={{
						...split.gridVars,
						// Track count must MATCH the rendered children: the Architect aside is
						// only present when open, so its column is omitted when closed (a fixed
						// '0px' track here would push the editor into it and collapse it).
						gridTemplateColumns: (compact
							? splitTracks(split.collapsed)
							: [...(architectOpen ? ['232px'] : []), ...splitTracks(split.collapsed), inspectorOpen ? '300px' : '46px']
						).join(' '),
					}}
					{...split.containerProps}
				>
					{/* Architect — persistent column only on desktop */}
					{!compact && architectOpen && (
						<aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-card">
							<div className="border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Architect</div>
							{architectBody}
						</aside>
					)}

					{splitRailA}
					{editorPane}
					{splitHandle}
					{previewPane}
					{splitRailB}

					{/* Inspector — persistent column/rail only on desktop (PM-4) */}
					{!compact && (inspectorOpen ? (
						<aside className="flex min-h-0 flex-col overflow-y-auto border-l border-border bg-background">
							<div className="border-b border-border px-3.5 py-3">
								<div className="flex items-center gap-2">
									<Settings2 className="size-4 text-[var(--accent)]" />
									<span className="text-sm font-bold text-[var(--text-heading)]">Deck</span>
									<span className="ml-auto rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">deck-wide</span>
									{/* Collapse back to the rail — the mirror of the rail's expand chevron,
									    so the same affordance toggles both ways (open with ‹, close with ›). */}
									<button type="button" onClick={() => setInspectorOpen(false)} aria-label="Collapse Deck inspector" title="Collapse Deck inspector" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-[var(--accent)]"><ChevronRight className="size-4" /></button>
								</div>
								<p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">Applies to the whole deck — each slide inherits it. Change just one in its Slide settings.</p>
							</div>
							<div className="space-y-0 px-3.5 pb-4">{inspectorBody}</div>
						</aside>
					) : (
						<aside className="flex min-h-0 flex-col items-center gap-2 border-l border-border bg-background py-2.5">
							<button type="button" onClick={() => setInspectorOpen(true)} className="grid size-[30px] place-items-center rounded-lg border border-border text-foreground hover:text-[var(--accent)]" aria-label="Open Deck inspector"><ChevronLeft className="size-4" /></button>
							<Palette className="size-[18px] text-muted-foreground" />
							<Frame className="size-[18px] text-muted-foreground" />
							<Wand2 className="size-[18px] text-muted-foreground" />
							<span className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground" style={{ writingMode: 'vertical-rl', rotate: '180deg' }}>Deck</span>
						</aside>
					))}
				</div>
			)}

			{/* ── Compact panels as sheets (tablet + mobile) ───────────── */}
			{compact && view === 'compose' && (
				<>
					<Sheet open={architectOpen} onOpenChange={setArchitectOpen}>
						<SheetContent side="left" className="w-[88vw] gap-0 p-0 sm:max-w-[320px]">
							<SheetHeader className="border-b border-border">
								<SheetTitle className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><Sparkles className="size-4 text-[var(--accent)]" />Architect</SheetTitle>
								<SheetDescription className="sr-only">Board-readiness scorecard, coaching, and reshape suggestions for this deck.</SheetDescription>
							</SheetHeader>
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{architectBody}</div>
						</SheetContent>
					</Sheet>
					<Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
						<SheetContent side="right" className="w-[88vw] gap-0 p-0 sm:max-w-[340px]">
							<SheetHeader className="border-b border-border">
								<SheetTitle className="flex items-center gap-2 text-[15px]"><Settings2 className="size-4 text-[var(--accent)]" />Deck<span className="ml-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">deck-wide</span></SheetTitle>
								<SheetDescription className="text-[11px] leading-snug text-muted-foreground">Applies to the whole deck — each slide inherits it. Change just one in its Slide settings.</SheetDescription>
							</SheetHeader>
							<div className="space-y-0 overflow-y-auto px-3.5 pb-4">{inspectorBody}</div>
						</SheetContent>
					</Sheet>
				</>
			)}

			{/* ── Overlays ─────────────────────────────────────────────── */}
			<SlideContext
				open={notesOpen}
				onOpenChange={setNotesOpen}
				deckId={deck.id}
				chunk={slides[activeFullIndex] ?? ''}
				source={source}
				slideNumber={activeFullIndex + 1}
				lintVocab={lintVocab}
				catalog={components}
				savedFinishNames={savedFinishMenu.map((f) => f.name)}
				onMutate={mutateActiveSlide}
			/>
			<ShareSheet open={shareOpen} onOpenChange={setShareOpen} deckTitle={deck.title} source={source} deckId={deck.id} finishClass={finishClass} finishExtraCss={finishExtraCss} options={options} palette={palette} mode={mode === 'dark' ? 'dark' : 'light'} extraTheme={extraTheme} extraCss={previewExtraCss} onPresent={() => setPresentOpen(true)} notify={notify} />
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
					<div className="flex-1 overflow-y-auto px-4 py-3">
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
			<Library
				open={libraryOpen}
				onOpenChange={(o) => { setLibraryOpen(o); if (!o) setLibInitialFilter(undefined); }}
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
			<PresentOverlay open={presentOpen} onClose={() => setPresentOpen(false)} options={options} slides={slides} frontMatter={previewFm} startIndex={activeFullIndex} paletteOverride={activeTheme?.name} extraTheme={extraTheme} extraCss={previewExtraCss} notify={notify} />
			<CommandPalette
				open={cmdOpen}
				onOpenChange={setCmdOpen}
				decks={decks}
				palettes={BUILTIN_PALETTES}
				onPickDeck={loadDeck}
				onPalette={applyPalette}
				onPresent={() => setPresentOpen(true)}
				onShare={() => setShareOpen(true)}
				onFabricate={() => setView('fabricate')}
				onReshape={() => { setFocus(false); setArchitectOpen(true); }}
				onWatchDemo={startDemo}
				onInsert={insertComponents.length > 0 ? () => setInsertOpen(true) : undefined}
				onFocus={() => setFocus(true)}
				onCollapseEditor={splitUsable && split.collapsed !== 'a' ? () => collapseFromHeader('a') : undefined}
				onCollapsePreview={splitUsable && split.collapsed !== 'b' ? () => collapseFromHeader('b') : undefined}
				onExpandPane={split.collapsed ? () => { const c = splitApiRef.current.collapsed; if (c) splitApiRef.current.expand(c); } : undefined}
				onResetSplit={splitUsable ? () => splitApiRef.current.reset() : undefined}
			/>
			<InsertComponent open={insertOpen} onOpenChange={setInsertOpen} components={insertComponents} onInsert={onInsertComponent} />
			{/* Hidden file input for "Import deck…" (.md upload). */}
			<input ref={importInputRef} type="file" accept=".md,.markdown,.mdx,.lattice,text/markdown,text/plain" onChange={onImportFile} className="hidden" aria-hidden="true" tabIndex={-1} />

			{/* Transient toast — no dead clicks in the prototype */}
			{toast && (
				<div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4">
					<div className="max-w-[min(92vw,440px)] rounded-full border border-border bg-[var(--surface-inverse)] px-4 py-2 text-center text-[13px] font-medium text-white shadow-[0_8px_24px_rgba(10,22,40,.22)]">{toast}</div>
				</div>
			)}
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
function PaneBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
	return (
		<button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={cn('grid size-8 place-items-center rounded-md text-[13px] font-semibold', active ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}>{icon}</button>
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
function ScoreRow({ ok, label, v }: { ok?: boolean; label: string; v: string }) {
	return (
		<div className="flex items-center gap-1.5">
			{ok ? <span className="text-[var(--chart-3,#2e6f00)]">✓</span> : <AlertTriangle className="size-3 text-[var(--chart-2,#9c3f00)]" />}
			<span className="text-foreground">{label}</span>
			<span className={cn('ml-auto font-mono text-[11px]', ok ? 'text-[var(--chart-3,#2e6f00)]' : 'text-[var(--chart-2,#9c3f00)]')}>{v}</span>
		</div>
	);
}
function RailOp({ label, onClick, disabled, danger, armed, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; armed?: boolean; children: React.ReactNode }) {
	return (
		<button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn('grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-30 disabled:hover:bg-transparent', danger && !armed && 'hover:bg-[color-mix(in_srgb,var(--fail,#b3261e)_12%,transparent)] hover:text-[var(--fail,#b3261e)]', armed && 'bg-[var(--fail,#b3261e)] text-white hover:bg-[var(--fail,#b3261e)] hover:text-white')}>{children}</button>
	);
}
function Chip({ children, onClick, busy }: { children: React.ReactNode; onClick?: () => void; busy?: boolean }) {
	return <button type="button" onClick={onClick} disabled={busy} className="mt-2 mr-1.5 inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] text-[var(--accent)] disabled:opacity-60">{busy && <Sparkles className="size-3 animate-pulse" />}{children}</button>;
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
function Toggle({ on, onClick, label }: { on?: boolean; onClick?: () => void; label?: string }) {
	return (
		<button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={onClick} className={cn('relative h-[22px] w-[38px] rounded-full transition-colors', on ? 'bg-primary' : 'bg-border')}>
			<span className={cn('absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-[2px]')} />
		</button>
	);
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
