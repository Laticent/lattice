import { ChevronLeft, ChevronRight, Grid2x2, Monitor, Pause, Play, Sparkles, Timer, Volume2, VolumeX, X } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { acronymSpokenMap, frontMatterCaptions, frontMatterLang, lexiconMap } from '@/lib/resolve-captions';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { buildPlanFromMetas, metasFromSource } from '@/playground/drawing-board-rehearsal.js';
import { createPresenterController } from '@/playground/presenter-window.js';
// The chart narrators live once in lib/core/chart-narration.js (HARD RULE #1),
// bundled to the browser via read-along-core — the SAME kernel the CLI/export
// narrates chart slides from, so a given chart slide narrates identically on both
// surfaces (they agree on which Markdown is a chart slide under the house `---`-per-
// section convention; the export aligns to rendered sections, this to the `---` set). #902
import { narrateChart } from '@/playground/read-along-core.generated.js';
import { applyReadAloudDebugParam, onReadAloudOverlayEnabledChange, readAloudOverlayEnabled } from '@/playground/readaloud-overlay-prefs';
// The frozen shared transport kernel (HARD RULE #1) — the SAME swipe geometry the
// vanilla export player uses, so a swipe means the same thing in both surfaces.
import { swipeAction } from '../../../../lib/core/present-transport.mjs';
import { LensPicker } from './lens-picker';
import { type PresentLens, presentationIndices, presentationSet } from './lint';
import { PresentCaption } from './PresentCaption';
import { PresentRail } from './PresentRail';
import { sectionsFromSlides } from './present-sections';
import ReadAloudOverlay from './ReadAloudOverlay';
import { slideToSpeech, useReadAloud, warmNarration } from './read-aloud';
import { SlideOverview } from './SlideOverview';
import { getCaption } from './slide-caption';
import { getNote } from './slide-notes';
import { buildPresenterStageDoc } from './studio-presenter';

// Present = a verb (plan §17): a full-screen takeover you ENTER and exit, with a
// reader-facing lens switch that actually RESHAPES the deck (meet the reader where
// they want to go) and real slide navigation (←/→/Space). The slide is the live
// engine render.
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// The narration-source priority read-aloud speaks: a slide's speaker note (the real
// talk track) — else a recognized chart's computed facts — else the component-aware
// DOM projection (`projectDeckSpeech`, the SAME shared kernel the CLI export narrates,
// run in-browser) — else, until that projection is ready, the generic markdown
// flatten. The projection is the unification: it makes live read-aloud speak a deck
// exactly as the exported captions do (label-first KPIs, hidden-gloss handling,
// stripped URLs). Resolved per-index (below, `narrationAt`) so the current slide's
// reader AND the autoplay warm-ahead prefetch derive the same text for a slide.

type RehearsalBeat = { at: number; kind: string; text: string; hold: number };
type RehearsalSlide = { index: number; target: number; why: string; beats: RehearsalBeat[] };
type RehearsalPlan = { totalTarget: number; suggestMinutes: number; slides: RehearsalSlide[] };

export function PresentOverlay({ open, onClose, options, slides, frontMatter = '', startIndex = 0, paletteOverride, extraTheme, modeOverride, extraCss, notify }: { open: boolean; onClose: () => void; options: SingleSlideOptions; slides: string[]; frontMatter?: string; startIndex?: number; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; notify: (msg: string) => void }) {
	const [lens, setLens] = React.useState<PresentLens>('full');
	const [idx, setIdx] = React.useState(0);
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
	const [muted, setMuted] = React.useState(true); // Voice — muted by default (boardroom-safe); captions still run on the silent cadence
	// Quiet Bloom (S4): the chrome is quiet at rest (Play + position + section title + thin
	// rail) and BLOOMS the arrows / CC / Voice / caption on intent (pointer move, wheel, key,
	// touch), then folds back. `revealed` drives the bloom; `showHint` is the one-time cue.
	const [revealed, setRevealed] = React.useState(true);
	const [showHint, setShowHint] = React.useState(false);
	// The slide sizes to the AVAILABLE row height (16:9), so the caption/controls/rail
	// dock always keeps its space and the slide never creeps into the chrome or clips.
	const slideRowRef = React.useRef<HTMLDivElement>(null);
	const [slideMaxW, setSlideMaxW] = React.useState(960);

	const set = React.useMemo(() => presentationSet(slides, lens), [slides, lens]);
	// Deck sections (from `divider` slides) — the grouping the single progress rail uses.
	const sections = React.useMemo(() => sectionsFromSlides(set), [set]);
	// The ORIGINAL author slide index of each presented slide, positionally aligned with `set`.
	// A front-matter `captions:` map is keyed by author slide NUMBER, so under a filtered lens
	// (exec/onepager reorders/drops slides) we resolve it through the original index, not the
	// position in the filtered set — else a caption would bind to the wrong slide.
	const setIndices = React.useMemo(() => presentationIndices(slides, lens), [slides, lens]);
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
		const source = frontMatter + target.join('\n\n---\n\n');
		import('./narration-projection')
			.then(({ projectDeckSpeech }) => projectDeckSpeech(options, source, paletteOverride, extraTheme, extraCss, modeOverride))
			.then((texts) => { if (!cancelled && texts.length === target.length) setProjected({ set: target, texts }); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [open, set, frontMatter, paletteOverride, extraTheme?.name, modeOverride, extraCss, options]);

	// Resolve a slide's narration by its index in the presented set: note → chart
	// facts → DOM projection. Index-based (not text-based) because the projection is
	// index-aligned to `set`. The projection wins ONLY when it was computed for the
	// current set (reference tag) — even an empty string then (a genuinely contentless
	// slide reads silent, matching the export); until it lands (or after a lens switch
	// invalidates the tag) the markdown flatten is the fallback, so Present never opens
	// to dead air and never speaks a stale lens's narration.
	const narrationAt = React.useCallback(
		(i: number) => {
			const md = set[i] ?? '';
			const caption = getCaption(md); // 1. inline <!-- caption: --> — highest precedence
			if (caption) return caption;
			const fm = fmCaptions.get((setIndices[i] ?? i) + 1); // 2. front-matter captions[author slide number]
			if (String(fm ?? '').trim()) return fm as string; // trim-guard parity with the export's mergeNarration
			const note = getNote(md); // 3. speaker note
			if (note) return note;
			const chart = narrateChart(md);
			if (chart) return chart;
			if (projected.set === set) return projected.texts[i] ?? ''; // 4. DOM projection
			return slideToSpeech(md);
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
	const [narrationText, setNarrationText] = React.useState('');
	const playingRef = React.useRef(false);
	// Autoplay intent (chain across slides) + a per-advance flag. Declared HERE (read by
	// the projection-upgrade guard below) though set later; the guard runs post-commit
	// when both reflect the live state. `autoAdvanceRef` is true across the whole
	// between-slides hand-off — the window the plain `!playingRef` guard used to miss.
	const autoplayRef = React.useRef(false);
	autoplayRef.current = autoplay;
	const autoAdvanceRef = React.useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: navigation trigger (slide/lens); narrationAt read via ref so a projection landing doesn't re-fire this.
	React.useEffect(() => { setNarrationText(narrationAtRef.current(clamped)); }, [clamped, set]);
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
		const source = fmAll + set.join('\n\n---\n\n');
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
	// (Threaded into the reader as the `symbols` option for engine-internal continuity.)
	const symbols = React.useMemo(() => lexiconMap(frontMatter), [frontMatter]);
	// The deck's language (Marp `lang:`). A non-English deck bypasses Cadenza's English
	// lexicon + number/period say-as so read-aloud doesn't inject English into it (#919) —
	// threaded into the reader AND the warm-ahead prefetch so both agree with the export.
	const lang = React.useMemo(() => frontMatterLang(frontMatter) ?? undefined, [frontMatter]);

	const reader = useReadAloud(
		narrationText,
		{
			acronyms,
			symbols,
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
	// After an autoplay advance, start the NEW slide's reader. Keyed on `reader.track`,
	// NOT `clamped` — this is the #904 fix. Since narration is async STATE, the slide
	// index changes ONE commit before the track (and thus the reader) is rebuilt for the
	// new text; a play() fired on the index-change commit (the old `[clamped]` + rAF)
	// raced that rebuild and, on a loaded main thread, ran on a reader the pending rebuild
	// then tore down — reader.playing=false, no caption, chain frozen (the "two slides
	// then stops" report). `useReadAloud` is called before this effect, so its per-track
	// rebuild effect is registered first and runs first in the SAME commit; playing here
	// (no rAF) therefore always hits the freshly-built reader, deterministically, on fast
	// and slow devices alike. The autoAdvanceRef guard keeps manual prev/next/jump (which
	// also change the track) from auto-playing. (Edge: two ADJACENT slides whose narration
	// is byte-identical share a track object, so this wouldn't re-fire — the skip-empty
	// effect covers identical EMPTY slides; identical non-empty adjacent narration is a
	// pathological case a real deck doesn't hit, tracked but not handled here.)
	const readerRef = React.useRef(reader);
	readerRef.current = reader;
	playingRef.current = reader.playing;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `reader.track` is the rebuild signal (the new slide's reader is ready once it changes); reader is read via ref by design.
	React.useEffect(() => {
		if (!autoAdvanceRef.current) return;
		autoAdvanceRef.current = false;
		readerRef.current.play();
	}, [reader.track]);
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
	// Warm-ahead: while autoplaying, start the NEXT slide's synth in the
	// background as soon as the CURRENT slide is showing — its audio is
	// already cached by the time onFinish's autoAdvance reaches it. Without
	// this, every autoplay slide transition pays a cold first-sentence synth
	// latency that the within-slide concurrency scheduler never overlaps
	// (that scheduler only runs ahead of a slide's OWN remaining sentences,
	// never across into the next slide) — the "long pauses between slides"
	// gap. Scoped to autoplay only; a manual next/prev has no known "next" to
	// warm and shouldn't spend the synth budget speculatively.
	// KNOWN, ACCEPTED GAP (red-team finding): a chain of several consecutive
	// empty slides (the skip-effect below advances through them almost
	// instantly, no real playback in between) leaves this effect re-firing at
	// each transient index with barely a tick of head start before the next
	// slide with content actually needs its audio — the cold-start latency
	// this feature exists to hide can still occur right after such a chain.
	// Not a correctness bug (no wrong audio, no duplicate request — a slower
	// warm just means speak() ends up doing the synth itself when it gets
	// there), just a case where the design's "whole slide's playback
	// duration" head-start assumption doesn't hold. Not fixed here.
	React.useEffect(() => {
		if (!autoplay || muted) return; // never synth (bill) TTS the user won't hear while Voice is muted
		const next = set[clamped + 1];
		if (next === undefined) return;
		// Stop this warm from firing any FURTHER requests once it's superseded —
		// autoplay turned off, the slide advanced again before it finished, or
		// Present closed — so an abandoned warm doesn't keep working through the
		// rest of an upcoming slide's sentences in the background (independent-
		// checker finding). A request already in flight when this fires just
		// finishes on its own; see warm()'s own comment in voice-model.js.
		const ctl = new AbortController();
		warmNarration(narrationAt(clamped + 1), ctl.signal, acronyms, lang, symbols);
		return () => ctl.abort();
	}, [autoplay, muted, clamped, set, narrationAt, acronyms, lang, symbols]);
	// The ONE Play (present redesign S3): Play narrates the current slide AND advances (like a
	// video) — it enables autoplay-chaining and plays; Pause pauses (autoplay stays on, so resume
	// keeps chaining; the deck's natural end turns autoplay off via onFinish). No separate "Auto".
	const togglePresentation = React.useCallback(() => {
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
			const metas = metasFromSource(set.join('\n\n---\n\n'));
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

	// On open, start the full lens on the slide you were editing; the reshaping
	// lenses always start at the top of their reshaped set.
	React.useEffect(() => {
		if (open) {
			setLens('full');
			setIdx(Math.max(0, Math.min(startIndex, slides.length - 1)));
		}
	}, [open, startIndex, slides.length]);

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
	const goNext = React.useCallback(() => { setShowHint(false); setIdx((i) => Math.min(i + 1, count - 1)); }, [count]);
	const goPrev = React.useCallback(() => { setShowHint(false); setIdx((i) => Math.max(i - 1, 0)); }, []);

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

	// Measure the slide row and cap the slide width so a 16:9 box fits the available
	// height (`rowH × 16/9`). A ResizeObserver keeps it live as the caption band grows
	// on Play (which shrinks the row) or the viewport changes — no chrome overlap, no clip.
	React.useEffect(() => {
		if (!open) return;
		const row = slideRowRef.current;
		if (!row || typeof ResizeObserver === 'undefined') return;
		const measure = () => setSlideMaxW(Math.max(240, Math.min(960, Math.floor(((row.clientHeight - 12) * 16) / 9))));
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(row);
		return () => ro.disconnect();
	}, [open]);

	// Swipe (touch) + wheel (desktop) navigation, alongside the keyboard. Swipe reuses the
	// shared kernel's geometry (threshold/ratio) so it matches the export player exactly;
	// wheel is throttled so one flick advances one slide, not ten.
	const touchRef = React.useRef<{ x: number; y: number } | null>(null);
	const wheelAt = React.useRef(0);
	const onTouchStart = React.useCallback((e: React.TouchEvent) => {
		wake();
		const t = e.touches[0];
		touchRef.current = t ? { x: t.clientX, y: t.clientY } : null;
	}, [wake]);
	const onTouchEnd = React.useCallback((e: React.TouchEvent) => {
		const s = touchRef.current;
		touchRef.current = null;
		const t = e.changedTouches[0];
		if (!s || !t || overviewOpen) return; // the overview owns navigation by tap while it's open
		const act = swipeAction({ dx: t.clientX - s.x, dy: t.clientY - s.y });
		if (act === 'next') goNext();
		else if (act === 'prev') goPrev();
	}, [goNext, goPrev, overviewOpen]);
	const onWheel = React.useCallback((e: React.WheelEvent) => {
		wake();
		if (overviewOpen) return; // don't scrub the deck behind the open overview
		const now = e.timeStamp;
		if (now - wheelAt.current < 480) return;
		const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (Math.abs(d) < 40) return; // a firm flick, not a reflexive scroll-to-read
		wheelAt.current = now;
		if (d > 0) goNext();
		else goPrev();
	}, [wake, goNext, goPrev, overviewOpen]);

	// First-run hint — teach the bloom + gestures exactly once (persisted), auto-fading.
	React.useEffect(() => {
		if (!open) { setShowHint(false); return; }
		// Default to "seen" so a broken/blocked localStorage never nags (the init IS the
		// fallback used when getItem throws — the empty catch leaves it true).
		let seen = true;
		try { seen = !!window.localStorage.getItem('lattice-present-hint'); } catch {}
		if (seen) return;
		setShowHint(true);
		try { window.localStorage.setItem('lattice-present-hint', '1'); } catch {}
		const id = window.setTimeout(() => setShowHint(false), 5200);
		return () => window.clearTimeout(id);
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
			if (e.key === 'Escape') onClose();
			else if (e.key === 'g' || e.key === 'G') {
				e.preventDefault();
				setOverviewOpen(true);
			} else if (e.key === 'ArrowRight' || e.key === ' ') {
				e.preventDefault();
				goNext();
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				goPrev();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose, goNext, goPrev, overviewOpen, wake]);
	// Close the sorter whenever Present closes, so re-opening starts on the slide.
	React.useEffect(() => {
		if (!open) setOverviewOpen(false);
	}, [open]);

	if (!open) return null;
	// The caption band reserves space only while it's actually crawling (playing) — so
	// pressing Play BLOOMS it in and the slide shrinks to fit, and Pause folds it back
	// (Quiet Bloom). The vertical grow/shrink is animated (motion-reduce snaps).
	const showCaption = !rehearse && captionsOn && reader.playing && reader.track.cues.length > 0;
	// Faint-persistent flanking arrows: never fully gone (mouse-presenter "back" safety),
	// dim when the slide edge is reached, full on reveal.
	const arrowCls = (disabled: boolean) => cn('hidden shrink-0 rounded-full border border-border bg-card/85 p-2.5 text-foreground shadow-[0_4px_16px_rgba(10,22,40,.12)] backdrop-blur transition-opacity duration-300 hover:text-[var(--accent)] motion-reduce:transition-none sm:block', disabled ? 'pointer-events-none opacity-20' : revealed ? 'opacity-100' : 'opacity-40');
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Present"
			className="lx-ui fixed inset-0 z-[100] flex flex-col items-center overflow-x-hidden bg-background"
			onPointerMove={wake}
			onWheel={onWheel}
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			<div className="flex w-full items-center gap-2 px-3 py-3 sm:px-5 sm:py-3.5">
				<button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Exit present"><X className="size-5" /></button>
				{/* Lens switch — the shared LensPicker (same widget as the editor's preview
				    header), centered. Was a horizontally-scrolling chip row that clipped. */}
				<div className="flex min-w-0 flex-1 justify-center">
					<LensPicker value={lens} onChange={pickLens} count={count} total={slides.length} align="center" />
				</div>
				<button type="button" onClick={() => setOverviewOpen((v) => !v)} aria-pressed={overviewOpen} title="All slides (G) — jump anywhere" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold sm:text-[13px]', overviewOpen ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><Grid2x2 className="size-4" /><span className="hidden sm:inline">Slides</span></button>
				<button type="button" onClick={toggleRehearse} aria-pressed={rehearse} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold sm:text-[13px]', rehearse ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><Timer className="size-4" />Rehearse</button>
				<button type="button" onClick={() => { const wasOpen = presenterRef.current?.isOpen(); presenterRef.current?.toggle(); if (!wasOpen && !presenterRef.current?.isOpen()) notify('Allow pop-ups to open the presenter view on your second screen.'); }} aria-pressed={presenterOn} title="Presenter view on your second screen — current + next slide, speaker notes, timer" className={cn('hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold hover:text-foreground md:inline-flex', presenterOn ? 'text-[var(--accent)]' : 'text-muted-foreground')}><Monitor className="size-4" />{presenterOn ? 'Presenter on' : 'Presenter screen'}</button>
			</div>

			{/* Slide row. The slide centers in the space above the dock (flex-1 guarantees the
			    caption + controls + rail dock its full height, so the slide never crowds it).
			    Circular arrows flank the slide in the gutter — never over it. */}
			<div ref={slideRowRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center gap-3 px-4 sm:gap-5 sm:px-6">
				<button type="button" onClick={goPrev} disabled={clamped === 0} className={arrowCls(clamped === 0)} aria-label="Previous slide"><ChevronLeft className="size-5" /></button>
				{/* The slide is a true flex child: its width is capped to what the AVAILABLE ROW
				    HEIGHT allows at 16:9 (`rowH × 16/9`), so it shrinks to reserve the caption /
				    controls / rail space instead of creeping into the chrome or getting clipped.
				    DeckPreview fits the slide to its box WIDTH, so the box must stay 16:9 — hence a
				    measured width cap on this sizer, not `max-height` (which would clip). */}
				<div className="flex w-full min-w-0 justify-center" style={{ maxWidth: slideMaxW }}>
					<DeckPreview options={options} sample={frontMatter ? frontMatter + cur : cur} mermaid={false} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_rgba(10,22,40,.18)]" aria-label="Presented slide" />
				</div>
				<button type="button" onClick={goNext} disabled={clamped >= count - 1} className={arrowCls(clamped >= count - 1)} aria-label="Next slide"><ChevronRight className="size-5" /></button>
				{/* Real delivery coaching — the plan's role-specific guidance, with the
				    active timed beat surfacing as you cross its mark in the slide. */}
				{rehearse && playing && coach && (
					<div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4">
						<span className="inline-flex max-w-[680px] items-center gap-2 rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg))] px-3.5 py-2 text-center text-[13px] font-semibold text-[var(--text-heading)] shadow-[0_8px_24px_rgba(10,22,40,.14)]"><Sparkles className="size-3.5 shrink-0 text-[var(--accent)]" />{coach}</span>
					</div>
				)}
				{/* First-run cue — teaches the bloom + gestures once, then never again. */}
				{showHint && (
					<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4 motion-reduce:hidden">
						<span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground shadow-[0_6px_20px_rgba(10,22,40,.12)] backdrop-blur">Swipe or use ← → to move · controls reveal as you go</span>
					</div>
				)}
				{readAloudDebug && (
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
				)}
			</div>

			{/* Bottom dock (layout A, 2026-07-12 redesign): caption (top) → controls (middle) →
			    section title → full-width rail (bottom). Pointer-over / focus-within PINS the
			    bloom open so aiming a click never makes it fold. */}
			<div
				className="flex w-full max-w-[760px] flex-col items-center gap-2 px-3 pb-6 pt-1 sm:pb-8"
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
						<button type="button" onClick={() => (rehearse ? setPlaying((v) => !v) : togglePresentation())} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-label={rehearse ? (playing ? 'Pause rehearsal' : 'Start rehearsal') : reader.playing ? 'Pause' : 'Play the presentation'}>{(rehearse ? playing : reader.playing) ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
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
							<button type="button" onClick={() => setCaptionsOn((v) => !v)} aria-pressed={captionsOn} aria-label="Captions" title="Captions — show the narration as text" className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-2 text-[12px] font-extrabold tracking-wide', captionsOn ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>CC</button>
							<button type="button" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} aria-label={muted ? 'Voice off — turn on to speak the narration' : 'Voice on — turn off to mute'} title="Voice — speak the narration aloud" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[12px] font-semibold', muted ? 'border-border bg-card text-muted-foreground hover:text-foreground' : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]')}>{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}<span className="hidden sm:inline">{muted ? 'Muted' : rungLabel}</span></button>
						</div>
					)}
				</div>

				{/* Section title + full-width rail (bottom) — the ONE progress element. */}
				<PresentRail sections={sections} current={clamped} frac={rehearse ? 0 : reader.progress} onJump={(i) => setIdx(i)} className="w-full" />
			</div>
			<SlideOverview open={overviewOpen} onClose={() => setOverviewOpen(false)} options={options} set={set} frontMatter={frontMatter} current={clamped} onJump={setIdx} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} />
		</div>
	);
}
