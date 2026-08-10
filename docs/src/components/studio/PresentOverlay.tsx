import { ChevronLeft, ChevronRight,  EyeOff, Grid2x2, Minimize2, Monitor, MousePointer2, Pause, Play, Sparkles, Timer, Volume2, VolumeX, X } from 'lucide-react';
import * as React from 'react';
import { type ChartDetailHandle, ChartDetailLayer } from '@/components/chart-detail-layer';
import DeckPreview from '@/components/DeckPreview';
import { createPresenterController } from '@/components/studio/present/presenter-window.js';
import { buildPlanFromMetas, metasFromSource } from '@/components/studio/present/rehearsal.js';
import { Tip } from '@/components/ui/tooltip';
import { type PaceName, slideBeatMs } from '@/lib/cadenza';
import { type LensProjection, type LensRegistry, lensEligibility, readerLenses } from '@/lib/lente';
import { acronymSpokenMap, frontMatterCaptions, frontMatterLang, lexiconMap } from '@/lib/resolve-captions';
import { frontMatterPace, resolvePaceName } from '@/lib/resolve-pace';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { createStage, resolveTheme, type Stage as VetrinaStage } from '@/lib/vetrina';
import { beatOverride, DEFAULT_LOOKAHEAD, onNarrationPrefsChange, pacePref, resolveLookahead } from '@/playground/narration-prefs.js';
// The chart narrators live once in lib/core/chart-narration.js (HARD RULE #1),
// bundled to the browser via read-along-core — the SAME kernel the CLI/export
// narrates chart slides from, so a given chart slide narrates identically on both
// surfaces (they agree on which Markdown is a chart slide under the house `---`-per-
// section convention; the export aligns to rendered sections, this to the `---` set). #902
import { narrateChart } from '@/playground/read-along-core.generated.js';
import { applyReadAloudDebugParam, onReadAloudOverlayEnabledChange, readAloudOverlayEnabled } from '@/playground/readaloud-overlay-prefs';
// The frozen shared transport kernel (HARD RULE #1) — the SAME swipe geometry the
// vanilla export player uses, so a swipe means the same thing in both surfaces.
import { keyAction, PRESENT_KEYMAP } from '../../../../lib/core/present-transport.mjs';
import { attachPreviewZoom, type PreviewZoomHandle } from '../../lib/preview-zoom';
import { SLIDE_SEP } from './deck-ops';
import { LENSES, LensPicker, lensEntriesFrom } from './lens-picker';
import { type PresentLens, presentationPairs } from './lint';
import { resolveNarration } from './narration-resolve';
import { PresentCaption } from './PresentCaption';
import { PresentRail } from './PresentRail';
import { cueDisplayText, guideAimFor, guideCueFor, POINTER_BOX } from './present-guide';
import { isSectionBoundary, sectionsFromSlides } from './present-sections';
import ReadAloudOverlay from './ReadAloudOverlay';
import { narrationLatencyKey, narrationReadiness, prefetchFrontOf, slideToSpeech, spokenSentencesPerSlide, useReadAloud, warmNarrationWindow } from './read-aloud';
import { mergeReadiness, readinessWindow } from './readiness-window';
import { SlideOverview } from './SlideOverview';
import { getCaption } from './slide-caption';
import { getNote } from './slide-notes';
import { hasMermaid } from './slide-thumb';
import { buildPresenterStageDoc } from './studio-presenter';

// Present = a verb (plan §17): a full-screen takeover you ENTER and exit, with a
// reader-facing lens switch that actually RESHAPES the deck (meet the reader where
// they want to go) and real slide navigation (←/→/Space). The slide is the live
// engine render.
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Stable empty identities. Both feed memo/state comparisons that run on the audio thread —
// a fresh `[]` each pass would defeat exactly the re-render narrowing they exist for.
const EMPTY_SENTENCES: string[][] = [];
const EMPTY_SENTENCES_N: number[] = [];
/** Cheap elementwise compare, so an unchanged readiness poll keeps its array identity. */
function sameFractions(a: number[], b: number[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// The narration-source priority read-aloud speaks: a slide's speaker note (the real
// talk track) — else a recognized chart's computed facts — else the component-aware
// DOM projection (`projectDeckSpeech`, the SAME shared kernel the CLI export narrates,
// run in-browser) — else, until that projection is ready, the generic markdown
// flatten. The projection is the unification: it makes live read-aloud speak a deck
// exactly as the exported captions do (label-first KPIs, hidden-gloss handling,
// stripped URLs). Resolved per-index (below, `narrationAt`) so the current slide's
// reader AND the autoplay warm-ahead prefetch derive the same text for a slide.

// A reader-facing explanation for a withheld lens. Fail-closed projection (design §6.3) never shows the
// full deck as a fallback for a scoped lens — it says, plainly, why the view isn't available, so the
// author can see (in Present) that an unapproved / stale / empty lens is gated exactly as a reader will.
const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
	unapproved: { title: 'This view is awaiting approval', body: 'A human hasn’t approved this reader view yet, so it isn’t shown. Approve it in the Reader views panel to make it readable.' },
	drifted: { title: 'This view is out of date', body: 'The deck changed since this view was approved, so it’s withheld until re-approved. Re-approve it in the Reader views panel.' },
	empty: { title: 'This view has no slides', body: 'No slide is tagged into this view, so there’s nothing to present. Tag slides into it, then approve.' },
	hidden: { title: 'This view isn’t available', body: 'This reader view is hidden.' },
	unknown: { title: 'This view doesn’t exist', body: 'No reader view by that name is defined for this deck.' },
};

type RehearsalBeat = { at: number; kind: string; text: string; hold: number };
type RehearsalSlide = { index: number; target: number; why: string; beats: RehearsalBeat[] };
type RehearsalPlan = { totalTarget: number; suggestMinutes: number; slides: RehearsalSlide[] };

export function PresentOverlay({ open, onClose, options, slides, frontMatter = '', registry, startIndex = 0, paletteOverride, extraTheme, modeOverride, extraCss, notify }: { open: boolean; onClose: () => void; options: SingleSlideOptions; slides: string[]; frontMatter?: string; registry?: LensRegistry; startIndex?: number; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; notify: (msg: string) => void }) {
	const [lens, setLens] = React.useState<PresentLens>('full');
	const [idx, setIdx] = React.useState(() => Math.max(0, Math.min(startIndex, slides.length - 1)));
	// Start Present on the slide you were editing (full lens), set SYNCHRONOUSLY on the
	// open transition — DURING RENDER, not in an effect — so the first present slide IS
	// the cursor slide. `idx` state persists across open/close (this component stays
	// mounted, just returns null when closed), so a plain lazy-init alone wouldn't fix a
	// RE-open; adjusting state during render re-renders before paint, killing the
	// persisted-idx / slide-0 flash — Present's own preview mounts already showing the
	// cursor slide, not slide 0.
	const prevOpenRef = React.useRef(open);
	if (open !== prevOpenRef.current) {
		prevOpenRef.current = open;
		if (open) {
			setLens('full');
			setIdx(Math.max(0, Math.min(startIndex, slides.length - 1)));
		}
	}
	// Read-aloud diagnostics overlay — a first-class, draggable on-brand readout
	// (ReadAloudOverlay), toggled by the shared cross-surface pref (the Workspace
	// "Read-aloud diagnostics" switch AND the `?readaloud-debug=1` URL param). When on,
	// the reader captures its live clock/sync/trace and the overlay renders it. Off, it's
	// a true no-op — no capture, no panel. Subscribes so a flip mounts/unmounts it live.
	const [readAloudDebug, setReadAloudDebug] = React.useState(false);
	React.useEffect(() => {
		applyReadAloudDebugParam();
		setReadAloudDebug(readAloudOverlayEnabled());
		return onReadAloudOverlayEnabledChange(setReadAloudDebug);
	}, []);
	const [playing, setPlaying] = React.useState(false);
	const [overviewOpen, setOverviewOpen] = React.useState(false); // slide sorter (G)
	const [autoplay, setAutoplay] = React.useState(false); // chain read-aloud across slides
	const [rehearse, setRehearse] = React.useState(false); // Practice mode — folded into Present (plan §line 266)
	const [elapsed, setElapsed] = React.useState(0); // rehearsal seconds
	const [captionsOn, setCaptionsOn] = React.useState(true); // CC — show/hide the caption crawl (independent of voice)
	// GUIDE — the third rung (#1397). CC shows the words, Voice speaks them, Guide points at the
	// part of the slide being narrated. Independent of both, and off by default: it is a delivery
	// flourish, not something to surprise a presenter with.
	const [guideOn, setGuideOn] = React.useState(false);
	const [muted, setMuted] = React.useState(true); // Voice — muted by default (boardroom-safe); captions still run on the silent cadence
	// Quiet Bloom (S4): the chrome is quiet at rest (Play + position + section title + thin
	// rail) and BLOOMS the arrows / CC / Voice / caption on intent (pointer move, wheel, key,
	// touch), then folds back. `revealed` drives the bloom; `showHint` is the one-time cue.
	const [revealed, setRevealed] = React.useState(true);
	const [showHint, setShowHint] = React.useState(false);
	// Chart mark-detail reveal on the delivery slide. Present's card is pointer-events-none (a swipe
	// surface), so the reveal runs in PINNED mode — a parent hit-surface (pointer-events:auto) over the
	// current chart, re-pinned after each slide render (onRender → onSlide), plus number-key reveal
	// routed through the presenter key handler. The card is the positioning stage; the frame lives in it.
	const cardRef = React.useRef<HTMLDivElement>(null);
	const dialogRef = React.useRef<HTMLDivElement>(null);
	const chartDetailRef = React.useRef<ChartDetailHandle>(null);

	// Reader projection — FAIL CLOSED (design §6.3). A registry (tag-driven) lens routes through the
	// library's `lensEligibility`, which refuses to project a lens that is unapproved / drifted / hidden
	// / EMPTY (returns `{status:'unavailable', reason}`) rather than silently falling open to the whole
	// deck. A scoping lens can be a REDACTION, so a fail-open would leak to a reader exactly the slides
	// the author kept out — the human-in-the-loop breach this whole feature exists to prevent. `full` is
	// the identity (the whole deck) and gates nothing, so it projects directly.
	const projection = React.useMemo<LensProjection>(() => {
		// `full` is the identity — the whole deck, always safe. EVERY other id is reader-scoped and must
		// fail CLOSED: it projects only if it's an APPROVED registry lens, else the reader sees
		// "unavailable" — never deck content. Keying on `lens === 'full'` (not "is it a registry id?") is
		// deliberate: a non-full id that ISN'T a registry entry — a stale `lens-default: exec`, a typo, a
		// future pinned-link default — must also fail closed, not fall through to the whole deck.
		if (lens === 'full') return { status: 'ok', pairs: presentationPairs(slides, 'full', registry) };
		if (registry) return lensEligibility(slides, registry, lens); // unknown/unapproved/drifted/hidden/empty → unavailable
		return { status: 'unavailable', reason: 'unknown' };
	}, [slides, lens, registry]);
	// The presented slides — empty when the lens is unavailable, so the render shows the explicit
	// "unavailable" state (below) instead of a stale or full-deck fallback.
	const set = React.useMemo(() => (projection.status === 'ok' ? projection.pairs.map((p) => p.slide) : []), [projection]);
	// The reason a lens is withheld (null when it projects) — drives the reader-facing banner.
	const unavailable = projection.status === 'ok' ? null : projection.reason;
	// Reader-side picker catalog: a registry deck offers ONLY reader-eligible lenses (approved,
	// non-empty, visible) — the human-in-the-loop gate at the UI. A deck with no reader views shows just
	// "Full deck" (the picker then renders a static label — nothing to switch to).
	const lensEntries = React.useMemo(
		() => (registry && registry.lenses.length > 1 ? lensEntriesFrom(readerLenses(slides, registry)) : LENSES),
		[registry, slides],
	);
	// Deck sections (from `divider` slides) — the grouping the single progress rail uses.
	const sections = React.useMemo(() => sectionsFromSlides(set), [set]);
	// The ORIGINAL author slide index of each presented slide, positionally aligned with `set`.
	// A front-matter `captions:` map is keyed by author slide NUMBER, so under a filtered reader lens
	// (which drops slides) we resolve it through the original index, not the
	// position in the filtered set — else a caption would bind to the wrong slide.
	const setIndices = React.useMemo(() => (projection.status === 'ok' ? projection.pairs.map((p) => p.index) : []), [projection]);
	// Front-matter `captions:` (Layer 1, §16) — slide NUMBER (1-based) → read-as text. Memoized on
	// the front matter, symmetric with the acronym registry memo below.
	const fmCaptions = React.useMemo(() => frontMatterCaptions(frontMatter), [frontMatter]);
	const count = set.length;
	const clamped = Math.min(idx, Math.max(0, count - 1));
	const cur = set[clamped] ?? '';

	// Component-aware DOM narration for the presented set — the SAME shared projection
	// the CLI export uses (`projectDeckToSpeech`), run in-browser, so live read-aloud
	// and the exported captions speak a deck identically. Async with a slideToSpeech
	// fallback until ready (Present opens instantly); a slide's note/chart narrator
	// still wins over it. Recomputed when the presented SET or theme changes. Dropped
	// wholesale if the render's section count doesn't match the slide count (an
	// autosplit would misalign indices) — the same guard the export's `mergeNarration`
	// applies. TAGGED with the `set` it was computed for (a stable per-lens reference):
	// `narrationAt` only reads it when the tag still matches the current set, so a
	// same-length lens switch can never speak the previous lens's text (no stale read).
	const [projected, setProjected] = React.useState<{ set: string[]; texts: string[] }>({ set: [], texts: [] });
	// biome-ignore lint/correctness/useExhaustiveDependencies: recompute on presented SET or theme change; extraTheme keyed by name (its content hash).
	React.useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const target = set; // the reference this render's projection belongs to
		const source = frontMatter + target.join(SLIDE_SEP);
		import('./narration-projection')
			.then(({ projectDeckSpeech }) => projectDeckSpeech(options, source, paletteOverride, extraTheme, extraCss, modeOverride))
			.then((texts) => { if (!cancelled && texts.length === target.length) setProjected({ set: target, texts }); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [open, set, frontMatter, paletteOverride, extraTheme?.name, modeOverride, extraCss, options]);

	// Resolve a slide's narration by its index in the presented set, through the ONE shared
	// precedence ladder (`narration-resolve.ts`): inline caption → front-matter caption →
	// note → chart facts → DOM projection. Index-based (not text-based) because the
	// projection is index-aligned to `set`.
	//
	// The ladder is shared with the exports because a mismatch there does not degrade, it
	// MISSES: the webpage export looks each spoken sentence up in the clip store by a
	// content-complete key, so narration resolved even slightly differently is audio the
	// author prepared and can never bake. See narration-resolve.ts.
	//
	// The projection wins ONLY when it was computed for the current set (reference tag) —
	// even as an EMPTY string then, which is why `fallback` is supplied only when the tag
	// does NOT match: a genuinely contentless slide must read silent (matching the export)
	// rather than fall through to the flatten. Until the projection lands (or after a lens
	// switch invalidates the tag) the markdown flatten keeps Present off dead air and off a
	// stale lens's narration.
	const narrationAt = React.useCallback(
		(i: number) => {
			const md = set[i] ?? '';
			const aligned = projected.set === set;
			return resolveNarration({
				caption: getCaption(md),
				fmCaption: fmCaptions.get((setIndices[i] ?? i) + 1), // front-matter captions[author slide number]
				note: getNote(md),
				chart: narrateChart(md),
				projected: aligned ? (projected.texts[i] ?? '') : null,
				fallback: aligned ? null : slideToSpeech(md),
			});
		},
		[set, setIndices, fmCaptions, projected],
	);
	const narrationAtRef = React.useRef(narrationAt);
	narrationAtRef.current = narrationAt;

	// The text the reader actually speaks — a STATE, not a live derivation, so the
	// async fallback→projection upgrade never tears the reader down mid-read. A real
	// navigation (slide or lens change) always adopts the new slide's narration (the
	// reader SHOULD reset on navigation). A projection LANDING upgrades the current
	// slide's text only while it is NOT being read — otherwise the swap would rebuild
	// the track, stop playback, and (worst) hang autoplay on the slide, since the
	// teardown fires no onFinish. The projection is picked up on the next slide instead.
	//
	// It is a RECORD — `{ idx, text }` — not a bare string, and that is load-bearing (#1394).
	// The auto-advance effect below needs a signal meaning "the reader is now ready for the
	// slide we just moved to". A bare string cannot say that: React bails out of the whole
	// re-render when a `useState` setter is handed an equal string, so two consecutive slides
	// whose narration resolves IDENTICALLY (the same speaker note, two contentless slides)
	// produced no commit, no new track, and therefore no effect — `autoAdvanceRef` stayed
	// armed, the new slide never spoke, and the chain was dead until the presenter stepped in.
	// A fresh record commits on every navigation regardless of what the text says, while the
	// `track` memo still keys on the STRING, so identical text keeps the same track object and
	// the reader is not needlessly torn down.
	const [narration, setNarration] = React.useState<{ idx: number; text: string }>({ idx: -1, text: '' });
	const narrationText = narration.text;
	const setNarrationText = React.useCallback((text: string) => setNarration((n) => (n.text === text ? n : { idx: n.idx, text })), []);
	const playingRef = React.useRef(false);
	// Autoplay intent (chain across slides) + a per-advance flag. Declared HERE (read by
	// the projection-upgrade guard below) though set later; the guard runs post-commit
	// when both reflect the live state. `autoAdvanceRef` is true across the whole
	// between-slides hand-off — the window the plain `!playingRef` guard used to miss.
	const autoplayRef = React.useRef(false);
	autoplayRef.current = autoplay;
	const autoAdvanceRef = React.useRef(false);
	// The record's IDENTITY is the advance effect's trigger, so it must change only when the
	// narration actually did. This effect fires on `set` as well as `clamped` (the lens can
	// re-derive the slide array without the deck changing), and a fresh `{idx,text}` object for
	// an unchanged pair would re-run the advance effect mid-beat: its cleanup clears the pending
	// timer and drops `holding`, the body then bails on the already-consumed `autoAdvanceRef`,
	// and the chain dies silently — the #1394 symptom through a new door. `setNarrationText`
	// already guards its half; this is the other half.
	// biome-ignore lint/correctness/useExhaustiveDependencies: navigation trigger (slide/lens); narrationAt read via ref so a projection landing doesn't re-fire this.
	React.useEffect(() => {
		const text = narrationAtRef.current(clamped);
		setNarration((n) => (n.idx === clamped && n.text === text ? n : { idx: clamped, text }));
	}, [clamped, set]);
	// Projection-landing upgrade: swap the CURRENT slide's fallback narration for the
	// richer DOM-projection text once it resolves — but ONLY when the slide is idle and
	// NOT in an autoplay run. During autoplay (including the brief between-slides hand-off
	// where `playingRef` is momentarily false) this in-place swap would rebuild the track
	// and tear the reader down WITHOUT firing onFinish, hanging the chain — the #904
	// regression. Every navigation already adopts projection text via the effect above
	// once `projected` has landed, so autoplay loses nothing by skipping the in-place swap.
	// biome-ignore lint/correctness/useExhaustiveDependencies: projection-landing upgrade; reads clamped/narrationAt/intent via refs by design.
	React.useEffect(() => {
		if (playingRef.current || autoplayRef.current || autoAdvanceRef.current) return;
		setNarrationText(narrationAtRef.current(clamped));
	}, [projected]);

	// ── Dual-screen presenter window (the shared kernel; same speaker view as the
	// Drawing Board). We render THIS deck's stage doc asynchronously (the engine)
	// and hand the kernel live position + per-slide note; its prev/next relay back
	// into setIdx. Refs keep the once-created controller reading current values.
	const [presenterOn, setPresenterOn] = React.useState(false);
	const stageDocRef = React.useRef('');
	const clampedRef = React.useRef(0);
	const countRef = React.useRef(0);
	const curRef = React.useRef('');
	clampedRef.current = clamped;
	countRef.current = count;
	curRef.current = cur;
	const presenterRef = React.useRef<ReturnType<typeof createPresenterController> | null>(null);
	if (!presenterRef.current) {
		presenterRef.current = createPresenterController({
			buildDoc: () => stageDocRef.current,
			// Forward the Studio's resolved accent so the brand-dark presenter window speaks the
			// SAME accent as this overlay (both read the site `--accent`/`--on-accent`), instead
			// of a hardcoded one. Read live so a mid-present palette change is reflected on refresh.
			getState: () => {
				const cs = getComputedStyle(document.documentElement);
				return {
					index: clampedRef.current,
					total: countRef.current,
					note: getNote(curRef.current) || '',
					accent: cs.getPropertyValue('--accent').trim() || undefined,
					onAccent: cs.getPropertyValue('--on-accent').trim() || undefined,
				};
			},
			onGo: (delta: number) => setIdx((i) => Math.max(0, Math.min(i + delta, countRef.current - 1))),
			onToggle: (on: boolean) => setPresenterOn(on),
		});
	}
	// Build (and rebuild) the presenter stage doc while presenting — async (engine
	// render), so a presenter already open is refreshed once the doc lands.
	const fmAll = frontMatter;
	// biome-ignore lint/correctness/useExhaustiveDependencies: rebuild when the presented SET or theme changes; extraTheme keyed by name (its content hash).
	React.useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const source = fmAll + set.join(SLIDE_SEP);
		buildPresenterStageDoc(options, source, set.length, paletteOverride, extraTheme, extraCss, modeOverride)
			.then(({ doc }) => {
				if (cancelled) return;
				stageDocRef.current = doc;
				presenterRef.current?.refresh();
			})
			.catch(() => {});
		return () => { cancelled = true; };
	}, [open, set, fmAll, paletteOverride, extraTheme?.name, modeOverride, extraCss, options]);
	// Keep the second screen's current/next + notes in step with navigation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on index change; the controller reads live state via refs.
	React.useEffect(() => { presenterRef.current?.sync(); }, [clamped]);

	// Real read-aloud: a synchronized teleprompter over the current slide's prose,
	// with spoken audio when a voice is connected. Owns its own transport (the dock
	// play button drives it in read-aloud mode; the rehearsal clock in Rehearse).
	// Narration priority: the slide's speaker note when it has one (the real talk
	// track) — else a recognized chart's computed facts (narrateChart; a funnel's
	// stage-to-stage conversion % exists only in the render, never the source
	// slideToSpeech reads) — else the generic on-slide prose.
	// Autoplay = read-aloud that chains across slides. Refs (declared above, near the
	// narration state the projection-upgrade guard reads) let the once-bound onFinish read
	// live position/intent without re-binding the reader each slide.
	// The deck's author-supplied acronym registry (term → spoken expansion), parsed from
	// front-matter. Author pronunciations beat the built-in dictionary and the patterns,
	// on BOTH the live reader and the warm-ahead prefetch (same map → cache keys match).
	const acronyms = React.useMemo(() => acronymSpokenMap(frontMatter), [frontMatter]);
	// The deck's read-aloud lexicon (`lexicon:` front-matter) — author say-as for a word or glyph
	// beats the built-in Speech Symbol Commons, on the live reader AND the warm-ahead prefetch.
	const lexicon = React.useMemo(() => lexiconMap(frontMatter), [frontMatter]);
	// The deck's language (Marp `lang:`). A non-English deck bypasses Cadenza's English
	// lexicon + number/period say-as so read-aloud doesn't inject English into it (#919) —
	// threaded into the reader AND the warm-ahead prefetch so both agree with the export.
	const lang = React.useMemo(() => frontMatterLang(frontMatter) ?? undefined, [frontMatter]);

	const reader = useReadAloud(
		narrationText,
		{
			acronyms,
			lexicon,
			lang,
			muted,
			debug: readAloudDebug,
			debugLabel: `slide ${clamped + 1}/${count}`,
			onFinish: () => {
				if (!autoplayRef.current) return;
				if (clampedRef.current < countRef.current - 1) {
					autoAdvanceRef.current = true; // play the next slide once it mounts
					setIdx((i) => Math.min(i + 1, countRef.current - 1));
				} else {
					setAutoplay(false); // walked off the last slide — autoplay is done
				}
			},
		},
	);
	// After an autoplay advance, start the NEW slide's reader. Keyed on the NARRATION RECORD,
	// NOT on `clamped` and no longer on `reader.track`.
	//
	// Not `clamped` — the #904 fix. Narration is async STATE, so the slide index changes ONE
	// commit before the reader is rebuilt for the new text; a play() fired on the index-change
	// commit raced that rebuild and, on a loaded main thread, ran on a reader the pending
	// rebuild then tore down — reader.playing=false, no caption, chain frozen (the "two slides
	// then stops" report).
	//
	// Not `reader.track` either — the #1394 fix. `track` is memoized on its TEXT, so two
	// consecutive slides narrating identically produced the same object, the effect never
	// re-ran, and autoplay hung there permanently. The record commits once per navigation
	// whatever the text says, which is the honest "a new slide arrived" signal; and because it
	// commits in the same pass that (re)builds the reader — `useReadAloud` is called before
	// this effect, so its per-track rebuild effect is registered first and runs first in the
	// SAME commit — the reader is always ready by the time we play. When the text repeats, no
	// rebuild is needed at all and the intact reader is simply replayed from the top.
	//
	// The autoAdvanceRef guard still keeps manual prev/next/jump from auto-playing, and it is
	// what makes the extra fires this key can produce (a projection landing) free.
	const readerRef = React.useRef(reader);
	readerRef.current = reader;
	playingRef.current = reader.playing;
	// Holding the between-slide beat: the new slide is up, the voice hasn't started yet.
	// Drives the caption band's reservation (below) so the band doesn't collapse and re-grow
	// across every transition — that flicker would be a new jank the beat itself introduced.
	const [holding, setHolding] = React.useState(false);
	// The pending between-slide beat, so a transport tap can CANCEL it rather than race it.
	const beatTimerRef = React.useRef(0);
	// The pace prefs, re-read on change so a Workspace switch takes effect on the live deck.
	const [pace, setPace] = React.useState<{ name: PaceName; slide?: number; section?: number }>({ name: 'natural' });
	React.useEffect(() => {
		const read = () => setPace({ name: pacePref() as PaceName, slide: beatOverride('slide'), section: beatOverride('section') });
		read();
		return onNarrationPrefsChange(read);
	}, []);
	// How long to hold on arriving at the CURRENT slide. Read through a ref by the
	// auto-advance effect so a pref change never re-fires that effect mid-transition.
	// The deck's OWN declared rhythm. Memoized on the front-matter block rather than derived
	// from the source, so an author typing in the editor does not re-create this on every
	// keystroke and thrash the beat effect that reads it.
	const deckPace = React.useMemo(() => frontMatterPace(frontMatter), [frontMatter]);
	const beatForArrival = React.useCallback((): number => {
		const md = set[clamped] ?? '';
		const kind = isSectionBoundary(md) ? 'section' : 'slide';
		// RESOLUTION ORDER (lib/core/resolve-pace.mjs states it once):
		//   ms override → deck `pace:` → workspace preset → natural.
		// The deck beats the workspace preset, which is the whole point: a deliberately slow,
		// weighty deck must not play brisk because the recipient's browser happens to hold that.
		// The presenter keeps a live escape hatch in the exact-millisecond override, which
		// `slideBeatMs` applies ahead of any name and which never persists into the artifact.
		const name = resolvePaceName(deckPace, pace.name) as PaceName;
		return slideBeatMs(kind, name, kind === 'section' ? pace.section : pace.slide);
	}, [set, clamped, pace, deckPace]);
	const beatForArrivalRef = React.useRef(beatForArrival);
	beatForArrivalRef.current = beatForArrival;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `narration` is the arrival signal (a fresh record per navigation, committed alongside the reader's rebuild); reader/pace are read via ref by design.
	React.useEffect(() => {
		if (!autoAdvanceRef.current) return;
		autoAdvanceRef.current = false;
		// THE BETWEEN-SLIDE BEAT (Part 3). The new slide is already rendered and on screen;
		// hold here before speaking so the audience reads it first. Advancing and speaking in
		// the same tick — what this did before — is the reverse of what every practitioner
		// prescribes, and it is why delivery read as "way too fast" even while individual
		// slides sounded fine. The deliberate pause was literally 0 ms; the only gap was
		// whatever the network cost, which is the accidental pause Part 2 removed.
		//
		// Depth comes from the boundary: arriving at a `divider` slide is a section break and
		// gets the longer beat. A 0 beat (Brisk with an explicit 0 override) plays immediately
		// rather than scheduling a pointless timer.
		const beat = beatForArrivalRef.current();
		if (beat <= 0) {
			readerRef.current.play();
			return;
		}
		setHolding(true);
		const id = window.setTimeout(() => {
			beatTimerRef.current = 0;
			setHolding(false);
			// Re-check intent at FIRE time, not schedule time: Pause (or leaving Present)
			// during the beat must not be overridden by a timer set before it. `autoplay` is
			// cleared by pause/close, so it is the honest signal that the chain is still wanted.
			//
			// `playing` is the second guard, and it is not redundant. Tapping the transport
			// during a beat starts the slide immediately; this timer is still pending and the
			// tap SET `autoplay`, so on autoplay alone it would fire a second, non-resume
			// play() — which is a barge-in: abort, reset, back to word one, cutting off the
			// sentence already sounding (red team, #1352).
			if (autoplayRef.current && !readerRef.current.playing) readerRef.current.play();
		}, beat);
		beatTimerRef.current = id;
		return () => {
			window.clearTimeout(id);
			beatTimerRef.current = 0;
			setHolding(false);
		};
	}, [narration]);
	// A slide with no readable prose never fires onFinish (nothing to read), which
	// would stall the chain — so while autoplaying, skip an empty slide straight to
	// the next (or end the run if it's the last).
	React.useEffect(() => {
		if (!autoplay || reader.track.cues.length > 0) return;
		if (clamped < count - 1) {
			autoAdvanceRef.current = true;
			setIdx((i) => Math.min(i + 1, count - 1));
		} else {
			setAutoplay(false);
		}
	}, [autoplay, reader.track.cues.length, clamped, count]);
	// Warm-ahead: keep a WINDOW of upcoming slides synthesized in the background, so a
	// slide transition never pays a cold first-sentence round trip. The within-slide
	// scheduler only ever runs ahead of a slide's OWN remaining sentences, never across a
	// boundary — this is what closes that gap.
	//
	// Three things changed here (2026-08-03), each fixing a way the old version quietly
	// did nothing:
	//   · WINDOW, not one slide. It warmed exactly `clamped + 1`, so a 2-sentence slide
	//     followed by an 8-sentence one warmed a fraction of what was about to be spoken.
	//     The depth is a workspace pref, `auto` by default → sized from the measured p95
	//     synth latency for the ACTIVE voice (narration-prefs.js), so a slow link warms
	//     deeper without anyone configuring anything.
	//   · Not autoplay-only. It required `autoplay`, so arrow-key navigation — how a
	//     presenter actually drives a deck — prefetched nothing whatsoever. Voice being ON
	//     is the honest signal of intent to hear audio; that is the gate now. This also
	//     covers Present opening with Voice already on, and the moment the user unmutes:
	//     both land here, so the CURRENT slide is warm before Play is ever pressed.
	//   · The current slide is in the window. It was assumed already playing; on open (or
	//     on unmute before Play) it is not, and that first cold sentence IS the "press play
	//     and wait" the reporter described.
	// Still gated on `!muted`: never synthesize — never BILL — audio the user won't hear.
	//
	// KNOWN, ACCEPTED GAP (red-team finding, carried forward): a chain of several
	// consecutive EMPTY slides advances almost instantly (the skip-effect below), so this
	// re-fires at each transient index with little head start. A deeper window makes this
	// milder than it was — the slide after the chain is usually already in the window —
	// but it is not eliminated. Not a correctness bug: a slower warm just means playback
	// does the synth itself when it arrives.
	const [lookahead, setLookahead] = React.useState(DEFAULT_LOOKAHEAD);
	// Resolve the window against the live voice + pref, and re-resolve when either moves.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-resolve when the active voice changes (rung) as well as on a pref change.
	React.useEffect(() => {
		if (!open) return;
		let live = true;
		// Ask the voice model for the key it RECORDS under. Assembling one here is what
		// broke this the first time: Present built a calibration-shaped `openrouter-tts`
		// while the recorder wrote `openrouter-tts|hexgrad/kokoro-82m|af_heart`, so every
		// lookup missed, `n` stayed 0, and `auto` silently pinned to the default forever
		// while looking healthy (Copilot review, #1352).
		const resolve = () => {
			narrationLatencyKey().then((k) => {
				if (live) setLookahead(resolveLookahead(k));
			});
		};
		resolve();
		const unsubscribe = onNarrationPrefsChange(resolve);
		return () => {
			live = false;
			unsubscribe();
		};
	}, [open, reader.rung]);
	React.useEffect(() => {
		if (!open || muted) return; // never synth (bill) TTS the user won't hear while Voice is muted
		// Nearest-first: the slide being spoken now, then the ones after it. Order matters —
		// voice-model's prefetch queue is FIFO at a small fixed concurrency, so whatever is
		// enqueued first is what wins the race that is actually about to happen.
		const texts: string[] = [];
		for (let i = clamped; i <= clamped + lookahead && i < set.length; i++) texts.push(narrationAt(i));
		if (!texts.length) return;
		// Stop this warm from firing any FURTHER requests once it's superseded — the slide
		// advanced again, Voice was muted, or Present closed — so an abandoned warm doesn't
		// keep working through the rest of the window in the background (independent-checker
		// finding). A request already in flight when this fires just finishes on its own;
		// see warm()'s own comment in voice-model.js.
		const ctl = new AbortController();
		warmNarrationWindow(texts, ctl.signal, acronyms, lang, lexicon);
		return () => ctl.abort();
	}, [open, muted, clamped, lookahead, set, narrationAt, acronyms, lang, lexicon]);
	// Per-slide narration readiness for the rail's "ready" band.
	//
	// Split into an EXPENSIVE part and a CHEAP part, because this has to be polled. The
	// band's whole job is to keep advancing while playback is frozen — that is what says
	// "buffering" rather than "crashed" — and a stall involves no navigation, so a
	// recompute-on-navigation would leave it motionless during exactly the event it exists
	// to report.
	//
	// The expensive part (splitting the deck into spoken sentences — one `buildTrack` per
	// slide) depends only on the deck, so it is memoized. The polled part is one
	// `getAllKeys` plus a set intersection.
	// `narrationAt` (not the ref) is the honest dependency: it already re-creates when the DOM
	// projection lands, which is exactly when a slide's narration text — and therefore its
	// cache keys — change.
	// GATED ON `open`. This memo sits above the `if (!open) return null` and PresentOverlay is
	// mounted for the whole Studio session, so ungated it ran a full buildTrack over every slide
	// on every deck edit — an O(deck) pass on the EDITOR's typing path, for a readiness display
	// nobody had open (Munger inversion, #1352). Present-only work belongs to Present.
	const readinessSentences = React.useMemo(
		() => (open ? spokenSentencesPerSlide(set.map((_, i) => narrationAt(i)), { acronyms, lang, lexicon }) : EMPTY_SENTENCES),
		[open, set, narrationAt, acronyms, lang, lexicon],
	);
	const [readyFractions, setReadyFractions] = React.useState<number[]>([]);
	// WINDOWED, from the playhead forward (#1392). The poll used to ask about every sentence in
	// the deck, every 2s, on the same main thread as `decodeAudioData` — the surface a whole
	// commit went into proving must not stutter.
	//
	// It never needed to. The rail's prefetch front is contiguous from the playhead by
	// construction: it stops at the first slide that is not fully cached, because you would
	// stall at that gap before reaching anything beyond it. Slides far ahead therefore cannot
	// change what is drawn until you get there. Bounding the question at the lookahead depth
	// plus a small margin removes the deck-size term entirely — and at that point the store's
	// single `getAllKeys` is comfortably the right primitive, which is the other half of the
	// lesson: the previous attempt here replaced that read with one probe per sentence, on the
	// reasoning that it should scale with the deck rather than the store, and measured 7x SLOWER
	// on an empty store — the state every new user is in. It was reverted. Ask a smaller
	// question, don't buy a cleverer answer.
	//
	// A small look-BACK as well as the forward window. It buys nothing for the fills — the front
	// is floored at the playhead — but the per-slide `ready` array also feeds the rail's
	// assistive label, and presenters step backwards constantly. Without it, tabbing to the slide
	// you just left would stop announcing "narration ready" for audio that is plainly cached.
	//
	// WHAT THE WINDOW MAY NOT DO IS SHRINK WHAT THE RAIL DRAWS. Readiness reads the on-device
	// store, so a deck PREPARED in an earlier session is cached end to end — and a windowed poll
	// that zero-fills everything outside its bounds reports a 5-slide runway on a 60-slide deck
	// that is fully ready, because `prefetchFrontOf` stops at the first unmeasured slide. That
	// turns "prepared" into a bar that looks unprepared, on the one indicator whose entire job is
	// telling a buffering deck from a broken one (#1389). The optimization would have eaten the
	// feature it was optimizing.
	//
	// So: one FULL sweep when Present opens (or the deck changes), then windowed refreshes that
	// MERGE into what is already known instead of replacing it. The repeating 2s cost — the one
	// that lands on the same main thread as `decodeAudioData` — is what gets bounded; the
	// once-per-open cost is not worth bounding. A value outside the current window is the last
	// measurement of that slide, which can only be stale toward over-reporting runway the viewer
	// has not reached yet, and the window sweeps over it as they advance.
	const { from: windowStart, to: windowEnd } = readinessWindow(clamped, readinessSentences.length, lookahead);
	// False until this deck has had its one full sweep. Reset by the effect below whenever the
	// deck (or Present's openness) changes, so a new deck never inherits the previous one's
	// readiness and never skips its own sweep.
	const sweptRef = React.useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `readinessSentences` IS the trigger — its identity changing means a different deck, whose sweep has not happened.
	React.useEffect(() => {
		sweptRef.current = false;
	}, [readinessSentences]);
	React.useEffect(() => {
		if (!open || muted) {
			setReadyFractions([]);
			return;
		}
		let live = true;
		const refresh = () => {
			const full = !sweptRef.current;
			const from = full ? 0 : windowStart;
			const to = full ? readinessSentences.length : windowEnd;
			narrationReadiness(readinessSentences.slice(from, to))
				.then((slice) => {
					if (live && full) sweptRef.current = true;
					if (live)
						// Keep the OLD array identity when nothing moved. This fires every 2s for as
						// long as Present is open, and a fresh array each time re-rendered the whole
						// tree — including the rail — on the same main thread as audio decode, for no
						// visible change. Most polls report exactly what the last one did.
						setReadyFractions((prev) => {
							const r = mergeReadiness(prev, slice, from, readinessSentences.length);
							return sameFractions(prev, r) ? prev : r;
						});
				})
				.catch(() => {
					// A failed read invalidates the sweep too: otherwise the next tick would refresh
					// only the window and leave the rest of the deck zeroed for good.
					sweptRef.current = false;
					if (live) setReadyFractions((prev) => (prev.length === 0 ? prev : EMPTY_SENTENCES_N));
				});
		};
		refresh();
		// 2s: slow enough to be invisible against a single IndexedDB key read, fast enough
		// that a viewer watching a stall sees the runway grow rather than a frozen bar.
		const id = window.setInterval(refresh, 2000);
		return () => {
			live = false;
			window.clearInterval(id);
		};
		// `clamped` and `windowEnd` join the deps because the WINDOW moves with the playhead —
		// without them the poll would keep asking about the slides around wherever Present was
		// opened. Re-arming on navigation is also what refreshes the rail immediately on a jump
		// rather than up to 2s later.
	}, [open, muted, readinessSentences, windowStart, windowEnd]);

	// ── THE GUIDE RUNG (#1397) ───────────────────────────────────────────────────────────────
	//
	// A Vetrina cursor that points at the part of the slide currently being narrated. Two things
	// decide whether it feels right, and both are architectural rather than cosmetic.
	//
	// ONE CONDUCTOR. Read-aloud owns the clock. There is no timer anywhere in here: the cursor
	// moves when `reader.active.cueIndex` changes and at no other time. Vetrina's storyboard
	// would have paced itself on its own `readMs` dwell, and two clocks over one narration drift
	// apart WITHIN a slide — the cursor ends up pointing at the sentence before or after the one
	// being spoken, which is worse than not pointing at all. So this drives the bare stage, not
	// a walkthrough, and when synthesis stalls the cursor simply holds where it is.
	//
	// CROSS-FRAME. The slide is a same-origin iframe and Vetrina's stage never enters one. The
	// target is a `RectSource` (the #1400 widening) backed by the shared frame-geometry bridge,
	// so the library still knows nothing about iframes and the Studio supplies the mapping.
	const guideStageRef = React.useRef<VetrinaStage | null>(null);
	const guidePointRef = React.useRef<AbortController | null>(null);
	/** Is the fake cursor currently ON SCREEN? Decides gesture-then-show vs gesture-only below. */
	const guideShownRef = React.useRef(false);
	/** The element the last gesture named. The BLOCK-change cadence compares on this: a cue that
	 *  resolves to the same element is a rest, not another trip. */
	const guideAimRef = React.useRef<Element | null>(null);
	const guideLive = open && guideOn && !rehearse;
	// Does the CURRENT sentence have something on the slide to point at? Drives both the fake
	// cursor's visibility and whether the real one may be hidden — see the two notes below.
	const [guideAiming, setGuideAiming] = React.useState(false);
	React.useEffect(() => {
		if (!guideLive) return;
		const host = dialogRef.current;
		if (!host) return;
		// `caption: 'none'` — a bare pointer layer. Present already owns its chrome and its exit;
		// a second Exit button and a "click anywhere to take over" hint would be chrome competing
		// with chrome. Guide never drives the deck, so there is nothing to take over FROM.
		// Two theme choices, both made by looking at it on the real surface rather than by taste:
		//
		// `cues: { anticipate: false }` — no streak. In a walkthrough the anticipation sweep leads
		// the eye across a whole app once per beat; here the cursor moves a short distance several
		// times per SLIDE, and a light streak drawn across the deck on every sentence reads as a
		// scratch on the slide rather than as guidance.
		//
		// `speed: 'fast'` — the cursor must not trail the voice. `point()` spends a "register
		// beat" before it glides, which exists because in a walkthrough the viewer reads the
		// caption FIRST and the cursor follows. Guide inverts that: the narration is already
		// speaking, so the same pause lands the cursor on a sentence the voice has half finished.
		// `fast` scales both the register beat and the glide by 0.72, which is the in-API lever
		// for this and keeps the motion curve the library curates.
		const stage = createStage({ root: host, onExit: () => setGuideOn(false), theme: resolveTheme({ accent: 'var(--accent, #2b6ef2)', caption: 'none', pointer: 'arrow', speed: 'fast', cues: { anticipate: false } }) });
		// BORN HIDDEN. Vetrina spawns its cursor at the center of the screen, which in a walkthrough
		// is neutral chrome — and in Present is the middle of the slide card, directly on the title.
		// So switching Guide on dropped an arrow onto the deck's own words and left it there until
		// the first cue resolved. No target yet is the same state as no target later, and it gets
		// the same answer.
		stage.setCursorVisible(false);
		guideShownRef.current = false;
		guideStageRef.current = stage;
		return () => {
			guidePointRef.current?.abort();
			guidePointRef.current = null;
			guideStageRef.current = null;
			guideShownRef.current = false;
			guideAimRef.current = null; // the next run starts with no "last named thing" to rest on
			setGuideAiming(false); // no stage, nothing aimed — and the real pointer comes straight back
			stage.destroy();
		};
	}, [guideLive]);

	// Move on the reader's beat — but on the BLOCK, not on the sentence.
	//
	// A cue is a sentence, and gesturing on every one of them is what made Guide read as a
	// karaoke follower: six or eight trips per dense slide, several of them between two
	// sentences of the same paragraph. The hand of a presenter rests, moves to a thing worth
	// naming, makes a gesture that fits it, and withdraws. So a cue that resolves to the SAME
	// element as the last one is a REST: no move, no ink, nothing at all.
	//
	// Abort any gesture still in flight first: a block change while the cursor is mid-stroke
	// must retarget, not queue up behind it and arrive two sentences late.
	const activeCue = reader.active?.cueIndex ?? -1;
	// THE SLIDE IS PART OF THE TRIGGER, and leaving it out is a silent stop.
	//
	// A cue index is per-SLIDE, so it resets to 0 on every navigation. On a deck whose slides
	// narrate in one or two sentences, the index that ends slide 1 can be the index that begins
	// slide 2 — the state never changes, React bails out of the effect entirely, and Guide
	// simply stops after the first slide with no error anywhere. Measured on the real overlay: a
	// three-slide deck produced exactly ONE gesture in forty seconds.
	//
	// This is #1394's defect in a second place (the advance effect keyed on a memo that repeated
	// text made identical), and the same fix applies — trigger on a value that changes whenever a
	// navigation happens, regardless of what the narration says.
	const guideBeat = `${narration.idx}:${activeCue}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the beat (slide + cue index) IS the trigger; track/frame are read at fire time on purpose.
	React.useEffect(() => {
		const stage = guideStageRef.current;
		if (!stage) return;
		// NO TARGET IS A STATE, NOT A SKIP. Returning early here left the cursor parked on the
		// PREVIOUS sentence's target — a confident arrow resting on an unrelated line for as long
		// as the narration stays off-slide, while the real pointer was hidden. That is strictly
		// worse than not pointing at all, which is the bar this module sets for itself. So the
		// cursor is hidden while there is nothing to aim at, and an in-flight gesture is aborted:
		// `activeCue` drops to -1 on every slide change, and a stroke left running through the
		// teardown of the frame it was drawn into is exactly the vanished-target case.
		const frame = () => cardRef.current?.querySelector<HTMLIFrameElement>('iframe.live') ?? null;
		const text = activeCue >= 0 ? cueDisplayText(reader.track.cues[activeCue]) : '';
		// ASK THE CHEAP QUESTION FIRST. `guideAimFor` reads no layout; the full decision measures
		// every block on the slide. This effect runs once per SENTENCE and acts once per BLOCK, so
		// on the common path — the next sentence of a paragraph already named — nothing here
		// forces a reflow while audio is playing.
		const aim = text ? guideAimFor(frame, text) : null;
		// THE REST. Same element as the last cue → the hand stays where the last gesture left it.
		// Guarded on the cursor actually being on screen, so the first cue of a block still gets
		// its gesture after a stretch of unresolvable narration on the same block.
		if (aim && aim === guideAimRef.current && guideShownRef.current) return;
		const cue = aim ? guideCueFor(frame, text) : null;
		setGuideAiming(!!cue);
		if (!cue) {
			guidePointRef.current?.abort();
			guidePointRef.current = null;
			guideAimRef.current = null;
			stage.setCursorVisible(false);
			guideShownRef.current = false;
			return;
		}
		guidePointRef.current?.abort();
		const ctl = new AbortController();
		guidePointRef.current = ctl;
		guideAimRef.current = cue.el;
		// THE CURSOR'S KEEP-OUT is its own 28px footprint plus a hair, in PARENT pixels — the
		// space Vetrina's stage works in. The frame-scale conversion belongs on the other side of
		// the bridge, where the slide's own coordinates are (`guideCueFor`).
		const opts = { strength: cue.strength, clearance: POINTER_BOX / 2 + 5, rest: cue.rest };
		const run = stage.gesture(cue.kind, cue.target, ctl.signal, opts);
		if (guideShownRef.current) {
			run.catch(() => {}); // an abort here is a retarget, not an error
			return;
		}
		// COMING FROM HIDDEN: the INK draws, and the hand materializes at rest when it is done.
		//
		// Vetrina spawns its cursor at the center of the screen, which in Present is the middle
		// of the slide card — directly on the deck's own title. Revealing before the stroke put a
		// visible arrow there and then swept it across the slide. Revealing after is both correct
		// and what the gesture is for: the underline draws itself, and the hand is simply there,
		// beside it, when it finishes. Nothing is ever shown mid-travel from an arbitrary origin.
		run.then(() => {
			if (ctl.signal.aborted || guideStageRef.current !== stage) return;
			guideShownRef.current = true;
			stage.setCursorVisible(true);
		}).catch(() => {});
	}, [guideBeat, guideLive]);

	// HIDE THE REAL POINTER, with the safety rules that matter more than the effect: only over
	// the slide and its backdrop (never the dock — Pause must always be findable and clickable),
	// only while Guide is live AND actually aiming at something, back INSTANTLY on any movement,
	// and re-hidden after a few seconds of stillness so bumping the mouse does not kill the effect
	// for the rest of the deck.
	//
	// The `guideAiming` term is the one that matters: taking away the viewer's pointer is only
	// paid for by putting a better one in its place. On a slide narrated by a speaker note there
	// is no better one, so hiding would leave them with NO pointer at all — the two halves of
	// this feature have to fail together.
	const [pointerHidden, setPointerHidden] = React.useState(false);
	React.useEffect(() => {
		if (!guideLive || !guideAiming) {
			setPointerHidden(false);
			return;
		}
		let idle = 0;
		const arm = () => {
			window.clearTimeout(idle);
			idle = window.setTimeout(() => setPointerHidden(true), 3000);
		};
		const onMove = () => {
			setPointerHidden(false);
			arm();
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		arm();
		return () => {
			window.clearTimeout(idle);
			window.removeEventListener('pointermove', onMove);
			setPointerHidden(false);
		};
	}, [guideLive, guideAiming]);

	// The rail's prefetch edge: per-slide fractions collapsed into one contiguous front, floored
	// at the progress edge so an LRU eviction behind the playhead can never draw the buffer
	// trailing playback.
	//
	// The floor is the SLIDE index, deliberately not `clamped + reader.progress`. Mixing in the
	// within-slide fraction made this memo recompute on every progress tick — an O(slides) scan
	// plus a fresh rail render per frame — while buying nothing: the floor only exists to stop the
	// buffer drawing BEHIND the playhead, and slide granularity settles that. Sub-slide precision
	// there cost audio smoothness on the main thread.
	const prefetchFront = React.useMemo(() => prefetchFrontOf(readyFractions, clamped), [readyFractions, clamped]);

	// The ONE Play (present redesign S3): Play narrates the current slide AND advances (like a
	// video) — it enables autoplay-chaining and plays; Pause pauses (autoplay stays on, so resume
	// keeps chaining; the deck's natural end turns autoplay off via onFinish). No separate "Auto".
	//
	// THE BEAT COUNTS AS PLAYING. During a between-slide hold the previous slide's reader has
	// ended and the next has not started, so `reader.playing` is false — but the deck is
	// mid-delivery and the button says Pause. Without this branch the tap took the ELSE path:
	// it started the slide early AND left the beat's timer pending, which then fired a second,
	// non-resume play() — a barge-in that cut the sentence and restarted from word one. So a
	// beat is paused by CANCELING it, not by pausing a reader that isn't running yet.
	const togglePresentation = React.useCallback(() => {
		if (beatTimerRef.current) {
			window.clearTimeout(beatTimerRef.current);
			beatTimerRef.current = 0;
			setHolding(false);
			setAutoplay(false);
			return;
		}
		if (readerRef.current.playing) {
			readerRef.current.pause();
			setAutoplay(false); // pausing stops the chain; resume re-enables it. Prevents the empty-slide
			// auto-skip from resurrecting playback when you navigate onto a divider after Pause.
		} else {
			setAutoplay(true);
			readerRef.current.play();
		}
	}, []);
	const rungLabel = reader.rung && reader.rung !== 'silent' ? (reader.rung === 'kokoro' ? 'Aria · local' : 'Aria · cloud') : 'Captions';


	// REAL rehearsal plan — the deterministic planner the Drawing Board ships
	// (drawing-board-rehearsal.js): metas → per-slide dwell targets, role-specific
	// "why", and timed delivery beats. Pure (no engine). Two-pass: probe for the
	// suggested length, then build the plan to it.
	const plan = React.useMemo<RehearsalPlan | null>(() => {
		try {
			const metas = metasFromSource(set.join(SLIDE_SEP));
			if (!metas.length) return null;
			const probe = buildPlanFromMetas(metas, 1) as RehearsalPlan;
			return buildPlanFromMetas(metas, Math.max(1, probe.suggestMinutes)) as RehearsalPlan;
		} catch {
			return null;
		}
	}, [set]);
	const slidePlan = plan?.slides[clamped] ?? null;
	// Target = the plan's total; "behind" once you run past the cumulative budget
	// for where you are in the deck.
	const target = plan?.totalTarget ?? Math.max(60, count * 40);
	const cumTarget = plan ? plan.slides.slice(0, clamped + 1).reduce((s, sp) => s + sp.target, 0) : Math.round((target * (clamped + 1)) / count);
	const behind = elapsed > cumTarget + 5;
	// Slide-local elapsed drives the timed beat (its `at` is a 0–1 fraction of the
	// slide's target). Reset slideStart whenever the slide changes.
	const elapsedRef = React.useRef(0);
	elapsedRef.current = elapsed;
	const [slideStart, setSlideStart] = React.useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on slide change; elapsed read via ref to avoid re-reset each tick.
	React.useEffect(() => setSlideStart(elapsedRef.current), [clamped]);
	const slideElapsed = Math.max(0, elapsed - slideStart);
	const frac = slidePlan?.target ? slideElapsed / slidePlan.target : 0;
	const activeBeat = slidePlan?.beats?.filter((b) => frac >= b.at).slice(-1)[0] ?? null;
	const coach = activeBeat?.text || slidePlan?.why || '';

	// The current present slide, rendered by Present's OWN in-flow DeckPreview (below) — Present
	// no longer borrows a hoisted shared host. `null` while a lens is withheld (fail-closed) →
	// the slot shows the "unavailable" card instead of any slide. `hasMermaid(cur)` keeps the
	// render signature aligned with the editor so same-slide navigation stays a patch.
	// DECK CONTEXT (see DeckPreview's `slideIndex`): render the whole presented set and display
	// `clamped`. Presenting one sliced-out slide printed "1" as the page number on every slide —
	// the engine numbers a slide by its position among the sections it parses, so a one-slide
	// document is page 1 of 1. Numbering over the PRESENTED set (not the authored deck) is
	// deliberate: under a reader lens the audience's "3 of 12" is its position in what is shown.
	// Memoized: it joins the whole presented set, and Present re-renders every second while the
	// rehearsal clock runs — the deck itself changes far less often than that.
	const presentSample = React.useMemo(() => (unavailable ? null : frontMatter + set.join(SLIDE_SEP)), [unavailable, frontMatter, set]);
	// Alignment fallback — the presented slide alone (see DeckPreview's `slideMarkdown`).
	const presentSlideAlone = React.useMemo(() => frontMatter + cur, [frontMatter, cur]);
	const presentMermaid = unavailable ? false : hasMermaid(cur);

	function pickLens(nextLens: PresentLens) {
		setLens(nextLens);
		setIdx(0);
	}
	function toggleRehearse() {
		reader.stop(); // read-aloud and rehearsal are mutually exclusive transports
		setAutoplay(false);
		setRehearse((v) => !v);
		setElapsed(0);
		setPlaying(false);
	}

	// The rehearsal clock — ticks only while playing in Rehearse mode.
	React.useEffect(() => {
		if (!open || !rehearse || !playing) return;
		const id = setInterval(() => setElapsed((e) => e + 1), 1000);
		return () => clearInterval(id);
	}, [open, rehearse, playing]);
	// Reset rehearsal state whenever Present closes.
	React.useEffect(() => {
		if (!open) { setRehearse(false); setElapsed(0); setPlaying(false); setAutoplay(false); presenterRef.current?.close(); }
	}, [open]);
	const dismissHint = React.useCallback(() => {
		setShowHint(false);
		try { window.localStorage.setItem('lattice-present-hint', '1'); } catch {}
	}, []);
	const goNext = React.useCallback(() => { dismissHint(); setIdx((i) => Math.min(i + 1, count - 1)); }, [count, dismissHint]);
	const goPrev = React.useCallback(() => { dismissHint(); setIdx((i) => Math.max(i - 1, 0)); }, [dismissHint]);
	const goFirst = React.useCallback(() => { dismissHint(); setIdx(0); }, [dismissHint]);
	const goLast = React.useCallback(() => { dismissHint(); setIdx(Math.max(count - 1, 0)); }, [count, dismissHint]);
	// The kernel's action names → this overlay's movers, so the shared keymap drives
	// navigation instead of a hand-written key list that drifts from every other surface.
	const NAV = React.useMemo<Record<string, () => void>>(() => ({ next: goNext, prev: goPrev, first: goFirst, last: goLast }), [goNext, goPrev, goFirst, goLast]);

	// ── Quiet Bloom reveal (S4) ────────────────────────────────────────────────
	// `wake()` reveals the bloom chrome and arms a fold-back timer; a pointer over the
	// dock (or focus within it) PINS it open so it can't fold while you're aiming a click.
	const pinnedRef = React.useRef(false);
	const hideTimer = React.useRef<number | null>(null);
	const wake = React.useCallback(() => {
		setRevealed(true);
		if (hideTimer.current) window.clearTimeout(hideTimer.current);
		hideTimer.current = window.setTimeout(() => {
			if (!pinnedRef.current) setRevealed(false);
		}, 2800);
	}, []);
	React.useEffect(() => {
		if (open) {
			pinnedRef.current = false; // a pin can't survive a close (pointerLeave/blur never fires on unmount)
			wake();
		}
		return () => {
			if (hideTimer.current) window.clearTimeout(hideTimer.current);
		};
	}, [open, wake]);


	// Swipe (touch) + wheel (mouse or trackpad) navigation, alongside the keyboard. Both
	// reuse the shared kernel's geometry — swipe's threshold/ratio and the wheel gate's
	// dominant-axis + cooldown — so Present, the Studio shell, the presenter screen and
	// the export player all turn a deck on the same numbers (#1294).
	// Every input verb on the backdrop — swipe, wheel, pinch, middle-drag — is bound
	// by ONE native-listener controller (`attachPreviewZoom`), not by React props.
	// Two reasons, both silent failures otherwise: React's synthetic touch/wheel
	// listeners are PASSIVE, so `preventDefault()` in them cannot stop the browser
	// zooming the whole page under the slide; and the swipe rule and the zoom rule
	// have to agree about what the current gesture IS — a pinch used to clear the
	// 45px swipe threshold here exactly as it did in the shell, so pinching to read a
	// dense slide mid-talk turned it instead.
	// Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.
	const backdropRef = React.useRef<HTMLDivElement>(null);
	const zoomRef = React.useRef<PreviewZoomHandle | null>(null);
	const [zoomScale, setZoomScale] = React.useState(1);
	// Latest-ref idiom: the controller attaches ONCE per open (re-attaching mid-
	// gesture would drop it), so it must not close over a `goNext`/`overviewOpen`
	// that changes every slide.
	const navRef = React.useRef({ goNext, goPrev, wake, overviewOpen });
	navRef.current = { goNext, goPrev, wake, overviewOpen };
	React.useEffect(() => {
		const surface = backdropRef.current;
		if (!open || !surface) return;
		const handle = attachPreviewZoom(surface, {
			viewport: () => cardRef.current,
			target: () => cardRef.current?.querySelector<HTMLElement>('[aria-label="Presented slide"]') ?? null,
			onNav: (action) => { if (action === 'next') navRef.current.goNext(); else if (action === 'prev') navRef.current.goPrev(); },
			onZoom: setZoomScale,
			onInput: () => navRef.current.wake(),
			// The overview owns navigation by tap while it is open, and zooming the
			// slide behind it would be invisible anyway.
			inert: () => navRef.current.overviewOpen,
		});
		zoomRef.current = handle;
		return () => {
			zoomRef.current = null;
			handle.dispose();
		};
	}, [open]);
	// Zoom belongs to the slide being read, not to the deck — and never survives the
	// talk: leaving Present at 3× would hand the next session a cropped first slide.
	// biome-ignore lint/correctness/useExhaustiveDependencies: these ARE the triggers; the handle is a ref.
	React.useEffect(() => {
		zoomRef.current?.reset();
	}, [clamped, open]);

	// First-run hint — teach the bloom + gestures exactly once, then never again.
	//
	// It is retired by the USER, not by a clock. The old version auto-faded after
	// 5.2s and marked itself seen the moment it APPEARED, so the two failure modes
	// were opposite and both bad: a reader who looked away lost it forever, and a
	// reader who reloaded inside those five seconds never saw it at all. Now it
	// stays until dismissed, and only dismissing writes the flag — so "seen" means
	// seen. Navigating counts as dismissal: someone who just swiped has learned the
	// gesture the cue exists to teach.
	React.useEffect(() => {
		if (!open) { setShowHint(false); return; }
		// Default to "seen" so a broken/blocked localStorage never nags (the init IS the
		// fallback used when getItem throws — the empty catch leaves it true).
		let seen = true;
		try { seen = !!window.localStorage.getItem('lattice-present-hint'); } catch {}
		if (!seen) setShowHint(true);
	}, [open]);

	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			wake();
			// In the overview, Escape just closes the sorter (not all of Present), and
			// the deck keys are inert (the grid owns navigation by click).
			if (overviewOpen) {
				if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') {
					e.preventDefault();
					setOverviewOpen(false);
				}
				return;
			}
			// Chart-detail reveal FIRST: number keys (1–9 → mark, 0 clears) and an Escape that only
			// dismisses an OPEN popover get consumed here (handleKey returns true); an Escape with no
			// open popover returns false and falls through to close Present.
			if (chartDetailRef.current?.handleKey(e)) {
				e.preventDefault();
				return;
			}
			if (e.key === 'Escape') { onClose(); return; }
			if (e.key === 'g' || e.key === 'G') {
				e.preventDefault();
				setOverviewOpen(true);
				return;
			}
			// Everything that MOVES the deck comes from the shared keymap: arrows, Space,
			// and the PageUp/PageDown a presentation clicker actually emits, plus Home/End.
			// Escape and `g` stay local — they are this overlay's own verbs, not the deck's.
			// Pass the map EXPLICITLY. The one-argument form leans on `keyAction`'s
			// `map = PRESENT_KEYMAP` default, which is a module-scope read — fine here (this
			// module is bundled, not inlined), but it is the form someone would copy into the
			// presenter popup, where `.toString()` inlining drops the closure and the default
			// resolves to a minified name that does not exist there.
			// `test/unit/export/inlinable-kernels.test.js` pins both halves of that contract.
			const act = keyAction(e.key, PRESENT_KEYMAP);
			if (act && NAV[act]) {
				e.preventDefault();
				NAV[act]();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose, NAV, overviewOpen, wake]);
	// Close the sorter whenever Present closes, so re-opening starts on the slide.
	React.useEffect(() => {
		if (!open) setOverviewOpen(false);
	}, [open]);

	if (!open) return null;
	// The caption band reserves space only while it's actually crawling (playing) — so
	// pressing Play BLOOMS it in and the slide shrinks to fit, and Pause folds it back
	// (Quiet Bloom). The vertical grow/shrink is animated (motion-reduce snaps).
	// The band stays reserved through the between-slide beat (`holding`), not just while the
	// voice is sounding. Without that it would collapse and re-grow at every transition — the
	// slide resizing twice per slide, a jank the beat itself would have introduced. During the
	// hold it shows the new slide's opening line unhighlighted, which is exactly the intent:
	// the audience reads it, then the voice starts.
	// DELIVERING = "the deck is mid-presentation", which is NOT the same as "a reader is
	// sounding". Between two slides the previous reader has ended and the next has not started,
	// yet the deck is plainly still presenting — so the transport must read Pause and the
	// caption band must stay reserved. Keying either on `reader.playing` alone made the primary
	// control flip to Play for 0.8–4s at every single slide transition.
	const delivering = reader.playing || holding;
	const showCaption = !rehearse && captionsOn && delivering && reader.track.cues.length > 0;
	// Faint-persistent flanking arrows: never fully gone (mouse-presenter "back" safety),
	// dim when the slide edge is reached, full on reveal.
	// Is a transient overlay pill occupying the band below the slide? Keyed on the
	// rehearsal SESSION rather than the current beat — see the row's note below.
	//
	// `plan`, not `coach`: the coach pill only renders when there is a rehearsal plan,
	// so rehearsing WITHOUT one used to reserve 56px for a pill that never appears.
	// `plan` is session-stable while `coach` changes per beat and per slide, so this
	// closes the empty-band case without reintroducing a band that flickers as you
	// cross beats — which is the whole reason this is keyed on the session.
	const coachPillUp = rehearse && playing && !!plan;
	// The band the row reserves BELOW the slide, sized to the pill that will occupy it.
	// It has to be per-pill, because the two are not the same height: the first-run cue
	// is one short line, while a coach beat is real prose that wraps. A single `pb-14`
	// for both was measured drawing the coach pill 9–28px ON TOP of the slide (57px and
	// 76px pills against a 48px clearance) — the one thing this layout promises never
	// happens. The coach pill is clamped to two lines to make its ceiling knowable;
	// `--present-band` and that clamp are set together, so neither can drift alone.
	const bandCls = coachPillUp ? 'pb-[4.75rem]' : showHint ? 'pb-14' : 'pb-4 sm:pb-5';
	const arrowCls = (disabled: boolean) => cn('hidden shrink-0 rounded-full border border-border bg-card/85 p-2.5 text-foreground shadow-[0_4px_16px_rgba(10,22,40,.12)] backdrop-blur transition-opacity duration-300 hover:text-[var(--accent)] motion-reduce:transition-none sm:block', disabled ? 'pointer-events-none opacity-20' : cn('pointer-events-auto', revealed ? 'opacity-100' : 'opacity-40'));
	// Two stacked fixed layers under the studio root: the opaque backdrop (z-100, which
	// carries the gesture/wake handlers) and this chrome dialog (z-102, which holds Present's
	// OWN in-flow slide card + the controls). The dialog is `pointer-events-none` and the
	// slide card is `pointer-events-none`, so a tap on the slide falls straight through both
	// to the z-100 backdrop's swipe/wake handlers; each control re-enables pointer events.
	return (
		<>
			{/* The gesture layer. Swipe / wheel / pinch / middle-drag are all bound to
			    this node natively by `attachPreviewZoom` (see the effect above) rather
			    than as React props — a passive synthetic listener cannot preventDefault
			    the browser's page zoom, which is the whole point of owning the pinch. */}
			<div
				ref={backdropRef}
				aria-hidden="true"
				className="lx-ui fixed inset-0 z-[100] bg-background"
				// The real pointer hides ONLY here and on the slide card — never on the dock, so
				// Pause is always findable. It returns on the first `pointermove` (the listener
				// above), before anything else happens.
				style={pointerHidden ? { cursor: 'none' } : undefined}
				onPointerMove={wake}
			/>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Present"
				// The between-slide BEAT, as observable state. Present's transport deliberately
				// reads `Pause` throughout a hold (making Pause unreachable for the length of every
				// beat was a defect #1352 fixed), and the rail's fill still carries the previous
				// slide's progress until the reader rebuilds — so there is no other honest signal
				// for "the deck has arrived but is not speaking yet", and a test that guesses at one
				// measures the wrong window. This is the same trick the Vetrina tour uses for its
				// own oracles (`data-vt-phase`): publish the state rather than infer it.
				data-beat={holding ? 'hold' : undefined}
				className="lx-ui pointer-events-none fixed inset-0 z-[102] flex flex-col items-center overflow-x-hidden"
			>
			<div className="pointer-events-auto flex w-full items-center gap-2 px-3 py-3 sm:px-5 sm:py-3.5">
				<button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Exit present"><X className="size-5" /></button>
				{/* Lens switch — the shared LensPicker (same widget as the editor's preview
				    header), centered. Was a horizontally-scrolling chip row that clipped. */}
				<div className="flex min-w-0 flex-1 justify-center">
					<LensPicker value={lens} onChange={pickLens} count={count} total={slides.length} align="center" lenses={lensEntries} menuClassName="z-[130] bg-card shadow-xl" />
				</div>
				{/* Only surfaced while zoomed — the way back to fit for a presenter who
				    pinched to make a point and now needs the whole slide again. A pinch-in
				    also returns to fit; this is the one-tap version, and the only route on a
				    trackpad, which has no middle button. */}
				{zoomScale > 1 && (
					<Tip label="Reset zoom to fit"><button type="button" onClick={() => zoomRef.current?.reset()} aria-label={`Reset zoom to fit — currently ${Math.round(zoomScale * 100)}%`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--accent)] sm:text-[13px]"><Minimize2 className="size-4" />{Math.round(zoomScale * 100)}%</button></Tip>
				)}
				<Tip label="All slides (G) — jump anywhere"><button type="button" onClick={() => setOverviewOpen((v) => !v)} aria-pressed={overviewOpen} aria-label="Slides" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold sm:text-[13px]', overviewOpen ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><Grid2x2 className="size-4" /><span className="hidden sm:inline">Slides</span></button></Tip>
				<button type="button" onClick={toggleRehearse} aria-pressed={rehearse} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold sm:text-[13px]', rehearse ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><Timer className="size-4" />Rehearse</button>
				<Tip label="Presenter view on your second screen — current + next slide, speaker notes, timer"><button type="button" onClick={() => { const wasOpen = presenterRef.current?.isOpen(); presenterRef.current?.toggle(); if (!wasOpen && !presenterRef.current?.isOpen()) notify('Allow pop-ups to open the presenter view on your second screen.'); }} aria-pressed={presenterOn} className={cn('hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold hover:text-foreground md:inline-flex', presenterOn ? 'text-[var(--accent)]' : 'text-muted-foreground')}><Monitor className="size-4" />{presenterOn ? 'Presenter on' : 'Presenter screen'}</button></Tip>
			</div>

			{/* Slide row. The slide centers in the space above the dock (flex-1 guarantees the
			    caption + controls + rail dock its full height, so the slide never crowds it).
			    Circular arrows flank the slide in the gutter — never over it. */}
{/* The slide is CENTERED and takes the largest 16:9 box its space allows — in
			    BOTH axes, so whatever room exists above and below is filled by the slide
			    itself rather than left as dead space (#1282).

			    This is pure layout: no ResizeObserver, no measured width in React state, no
			    inline geometry. The sizer is a SIZE container and the card asks for
			    `min(100cqw, 100cqh × 16/9)` — the identical formula the old JS computed, but
			    resolved by the engine at layout time. That removes a whole class of bug the
			    measured version had: a first paint at the stale 960px seed, a resize the
			    observer hasn't seen yet, and the iPad stretch case (#1227) where WebKit
			    resolved a stretched height against that first-layout max-width and never
			    re-resolved it. There is nothing left to go stale.

			    Vertical padding matches the READ stop's preview holder (`p-4 sm:p-5`), so
			    the slide sits in the same frame in both places.

			    The bottom grows to `pb-14` ONLY while a transient pill is up — the
			    first-run cue, or a rehearsal in progress. Those pills are `absolute …
			    bottom-2/3` against THE ROW, not the card; because the sizer stretches to the
			    row's CONTENT box the card can never reach into that band (nothing is ever
			    drawn on top of the slide) while an absolutely-positioned child resolves
			    against the PADDING box and lands inside it. Reserving it unconditionally
			    cost the slide ~56px it could otherwise fill, for a cue shown once ever.
			    The reserve is keyed on `rehearse && playing`, not on the current coach BEAT:
			    a beat comes and goes as you cross its mark, so keying on the beat would
			    resize the slide repeatedly mid-rehearsal. Keyed on the session it is one
			    transition in and one out — the same shape as the caption band appearing on
			    Play, which is the responsive behavior this is modeled on.

			    `items-center` on the sizer stays LOAD-BEARING (#1227): default `stretch`
			    makes a flex item's cross size definite, which beats `aspect-ratio` per spec
			    and would flatten the card. Centering the card removes the stretch. */}
			<div className={cn('relative flex min-h-0 w-full flex-1 items-center justify-center gap-3 px-4 pt-4 sm:gap-5 sm:px-6 sm:pt-5', bandCls)}>
				<button type="button" onClick={goPrev} disabled={clamped === 0} className={arrowCls(clamped === 0)} aria-label="Previous slide"><ChevronLeft className="size-5" /></button>
				<div className="flex min-h-0 w-full min-w-0 items-center justify-center self-stretch [container-type:size]">
					{unavailable ? (
						// Fail-closed: a withheld lens NEVER renders deck content — it renders why it's withheld.
						<div role="status" className="relative flex aspect-video w-[min(100cqw,calc(100cqh*16/9))] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-card px-8 text-center shadow-[0_24px_60px_rgba(10,22,40,.18)]">
							<EyeOff className="size-8 text-muted-foreground" />
							<div className="text-[15px] font-semibold text-[var(--text-heading)]">{(UNAVAILABLE_COPY[unavailable] ?? UNAVAILABLE_COPY.hidden).title}</div>
							<p className="max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">{(UNAVAILABLE_COPY[unavailable] ?? UNAVAILABLE_COPY.hidden).body}</p>
						</div>
					) : (
						// Present's OWN live preview — IN-FLOW in this 16:9 card (no hoisted host, no
						// positioning controller). INTENTIONALLY `pointer-events-none`: Present is a
						// swipe/arrow DELIVERY surface, so the slide is a non-interactive poster and taps
						// pass straight through to the gesture layer behind. This preserves the prior
						// hoisted-host model, whose slot was ALSO pointer-events-none — not a regression.
						// Tradeoff, by design: in-slide links and the video-bridge lightbox do NOT fire in
						// Present (single-slide-render clears the iframe's inline pointer-events on reveal,
						// so it inherits `none` from this card); that interactivity lives in the editor
						// preview, not the delivery view. The card frame (border/rounding/shadow) lives here.
						<div ref={cardRef} style={pointerHidden ? { cursor: 'none' } : undefined} className="pointer-events-none relative aspect-video w-[min(100cqw,calc(100cqh*16/9))] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_rgba(10,22,40,.18)]">
							<DeckPreview focused options={options} sample={presentSample ?? ''} slideIndex={clamped} slideCount={set.length} slideMarkdown={presentSlideAlone} mermaid={presentMermaid} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} active={open} coalesce className="size-full" aria-label="Presented slide" loader onRender={() => chartDetailRef.current?.onSlide(0)} />
							{/* Pinned chart-detail reveal for the delivery slide (the frame here is one section, so
							    onSlide(0)). Enabled only while presenting; the popover portals to <body>. */}
							<ChartDetailLayer ref={chartDetailRef} getFrame={() => cardRef.current?.querySelector<HTMLIFrameElement>('iframe.live') ?? null} getStage={() => cardRef.current} enabled={open} />
						</div>
					)}
				</div>
				<button type="button" onClick={goNext} disabled={clamped >= count - 1} className={cn('self-center', arrowCls(clamped >= count - 1))} aria-label="Next slide"><ChevronRight className="size-5" /></button>
				{/* Real delivery coaching — the plan's role-specific guidance, with the
				    active timed beat surfacing as you cross its mark in the slide. */}
				{rehearse && playing && coach && (
					<div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4">
						<span className="inline-flex max-w-[680px] items-center gap-2 rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg))] px-3.5 py-2 text-center text-[13px] font-semibold leading-[1.35] text-[var(--text-heading)] shadow-[0_8px_24px_rgba(10,22,40,.14)]"><Sparkles className="size-3.5 shrink-0 text-[var(--accent)]" /><span className="line-clamp-2">{coach}</span></span>
					</div>
				)}
				{/* First-run cue — teaches the bloom + gestures once, then never again. */}
				{showHint && (
					// `pointer-events-auto` on the pill only — the row stays transparent to
					// taps so a swipe over it still reaches the gesture layer. The dismiss
					// control is what retires the cue for good, so it must be reachable:
					// an icon button with a real accessible name, not a bare glyph.
					//
					// NOT `motion-reduce:hidden`. That was correct when the cue auto-faded —
					// hiding an animation from someone who asked for no animation. The cue no
					// longer animates at all; it is a static pill that waits to be dismissed.
					// Keeping the hide meant a reduced-motion presenter paid the reserved band
					// for an invisible pill AND could never clear it, because the dismiss button
					// lives inside the element being hidden.
					<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
						<span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/90 py-1.5 pl-3.5 pr-1.5 text-[12px] font-medium text-muted-foreground shadow-[0_6px_20px_rgba(10,22,40,.12)] backdrop-blur">
							Swipe or use ← → to move · controls reveal as you go
							<button type="button" onClick={dismissHint} aria-label="Dismiss this tip" className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"><X className="size-3.5" /></button>
						</span>
					</div>
				)}
				{readAloudDebug && (
					<div className="pointer-events-auto contents">
						<ReadAloudOverlay
							live={reader.debugLive}
							events={reader.debugEvents}
							source={
								projected.set === set
									? narrationText === (projected.texts[clamped] ?? '')
										? 'projection'
										: 'fallback (landed, not adopted)'
									: 'fallback (projection pending)'
							}
						/>
					</div>
				)}
			</div>

			{/* Bottom dock (layout A, 2026-07-12 redesign): caption (top) → controls (middle) →
			    section title → full-width rail (bottom). Pointer-over / focus-within PINS the
			    bloom open so aiming a click never makes it fold. */}
			<div
				className="pointer-events-auto flex w-full max-w-[760px] flex-col items-center gap-2 px-3 pb-6 pt-1 sm:pb-8"
				onPointerEnter={() => { pinnedRef.current = true; setRevealed(true); }}
				onPointerLeave={() => { pinnedRef.current = false; wake(); }}
				onFocusCapture={() => { pinnedRef.current = true; setRevealed(true); }}
				onBlurCapture={() => { pinnedRef.current = false; wake(); }}
			>
				{/* Caption band — film-subtitle crawl; grows in on Play, folds on Pause. Mounted only
				    while it should show (playing + CC on), so its live region can't keep announcing to
				    a screen reader when captions are off, paused, or in Rehearse. announce=muted: when
				    Voice speaks the line, the TTS is the audio, so the SR announcement is suppressed. */}
				<div className={cn('flex w-full justify-center overflow-hidden transition-[max-height,opacity] duration-300 motion-reduce:transition-none', showCaption ? 'max-h-[80px] opacity-100' : 'max-h-0 opacity-0')}>
					{showCaption && <PresentCaption track={reader.track} active={reader.active} announce={muted} />}
				</div>

				{/* Controls row (middle). The transport pill is always-on and hugs its content
				    (Play + position); the CC / Voice cluster BLOOMS beside it — collapsing to zero
				    width at rest so the resting pill stays tight and centered, no trailing void. */}
				<div className="flex max-w-full items-center gap-2">
					<div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-3 py-2 shadow-[0_8px_24px_rgba(10,22,40,.10)] sm:gap-3">
						<button type="button" onClick={goPrev} disabled={clamped === 0} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:hidden" aria-label="Previous slide"><ChevronLeft className="size-5" /></button>
						<button type="button" onClick={() => (rehearse ? setPlaying((v) => !v) : togglePresentation())} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-label={rehearse ? (playing ? 'Pause rehearsal' : 'Start rehearsal') : delivering ? 'Pause' : 'Play the presentation'}>{(rehearse ? playing : delivering) ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
						<button type="button" onClick={goNext} disabled={clamped >= count - 1} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:hidden" aria-label="Next slide"><ChevronRight className="size-5" /></button>
						<span className="h-5 w-px shrink-0 bg-border" />
						<span className="shrink-0 whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums text-[var(--text-heading)]">{clamped + 1} / {count}</span>
						{rehearse && (
							<>
								<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{fmt(elapsed)} / {fmt(target)}</span>
								<span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold', behind ? 'border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_45%,transparent)] text-[var(--chart-2,#9c3f00)]' : 'border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_45%,transparent)] text-[var(--chart-3,#2e6f00)]')}><Timer className="size-3.5" />{behind ? 'Behind pace' : 'On pace'}</span>
							</>
						)}
					</div>
					{/* CC + Voice are INDEPENDENT (S3) and bloom on intent (S4): CC shows/hides the
					    crawl; Voice speaks it aloud. Their FOOTPRINT is reserved (fixed) so the
					    transport pill never shifts as they bloom — at rest they dim to faint-persistent
					    (like the flanking arrows), brighten on intent, and stay reachable at rest so a
					    phone user can always find captions. Reduced-motion holds them fully lit. */}
					{!rehearse && (
						<div className={cn('flex items-center gap-2 transition-opacity duration-300 motion-reduce:!opacity-100 motion-reduce:transition-none', revealed ? 'opacity-100' : 'opacity-50')}>
							<Tip label="Captions — show the narration as text"><button type="button" onClick={() => setCaptionsOn((v) => !v)} aria-pressed={captionsOn} aria-label="Captions" className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-2 text-[12px] font-extrabold tracking-wide', captionsOn ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>CC</button></Tip>
							<Tip label="Voice — speak the narration aloud"><button type="button" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} aria-label={muted ? 'Voice off — turn on to speak the narration' : 'Voice on — turn off to mute'} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[12px] font-semibold', muted ? 'border-border bg-card text-muted-foreground hover:text-foreground' : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]')}>{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}{/* The label NEVER changes with transport state. Swapping it to a
							    status string mid-delivery is jarring, and for a screen reader it
							    reads as the control itself becoming a different control. Buffering
							    is reported on the rail, where it belongs. */}
							<span className="hidden sm:inline">{muted ? 'Muted' : rungLabel}</span></button></Tip>
							<Tip label="Guide — point at what is being narrated"><button type="button" onClick={() => setGuideOn((v) => !v)} aria-pressed={guideOn} aria-label={guideOn ? 'Guide on — turn off to stop pointing at the narrated text' : 'Guide off — turn on to point at the narrated text'} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[12px] font-semibold', guideOn ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border bg-card text-muted-foreground hover:text-foreground')}><MousePointer2 className="size-3.5" /><span className="hidden sm:inline">Guide</span></button></Tip>
						</div>
					)}
				</div>

				{/* Section title + full-width rail (bottom) — the ONE progress element. */}
				<PresentRail sections={sections} current={clamped} frac={rehearse ? 0 : reader.progress} prefetchFront={rehearse ? 0 : prefetchFront} ready={rehearse ? undefined : readyFractions} onJump={setIdx} className="w-full" />
			</div>
			{/* The overview covers the whole surface when open (its own iframes) — re-enable
			    pointer events for it above the chrome's `pointer-events-none` root. */}
			<div className="pointer-events-auto contents"><SlideOverview open={overviewOpen} onClose={() => setOverviewOpen(false)} options={options} set={set} frontMatter={frontMatter} current={clamped} onJump={setIdx} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} /></div>
			</div>
		</>
	);
}
