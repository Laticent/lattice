import { ChevronLeft, ChevronRight, FastForward, Grid2x2, Monitor, Pause, Play, Sparkles, Timer, Volume2, X } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { buildPlanFromMetas, metasFromSource } from '@/playground/drawing-board-rehearsal.js';
import { createPresenterController } from '@/playground/presenter-window.js';
import { LensPicker } from './lens-picker';
import { type PresentLens, presentationSet } from './lint';
import { slideToSpeech, useReadAloud } from './read-aloud';
import { SlideOverview } from './SlideOverview';
import { getNote } from './slide-notes';
import { buildPresenterStageDoc } from './studio-presenter';

// Present = a verb (plan §17): a full-screen takeover you ENTER and exit, with a
// reader-facing lens switch that actually RESHAPES the deck (meet the reader where
// they want to go) and real slide navigation (←/→/Space). The slide is the live
// engine render.
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type RehearsalBeat = { at: number; kind: string; text: string; hold: number };
type RehearsalSlide = { index: number; target: number; why: string; beats: RehearsalBeat[] };
type RehearsalPlan = { totalTarget: number; suggestMinutes: number; slides: RehearsalSlide[] };

export function PresentOverlay({ open, onClose, options, slides, frontMatter = '', startIndex = 0, paletteOverride, extraTheme, modeOverride, extraCss, notify }: { open: boolean; onClose: () => void; options: SingleSlideOptions; slides: string[]; frontMatter?: string; startIndex?: number; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; notify: (msg: string) => void }) {
	const [lens, setLens] = React.useState<PresentLens>('full');
	const [idx, setIdx] = React.useState(0);
	const [playing, setPlaying] = React.useState(false);
	const [overviewOpen, setOverviewOpen] = React.useState(false); // slide sorter (G)
	const [autoplay, setAutoplay] = React.useState(false); // chain read-aloud across slides
	const [rehearse, setRehearse] = React.useState(false); // Practice mode — folded into Present (plan §line 266)
	const [elapsed, setElapsed] = React.useState(0); // rehearsal seconds

	const set = React.useMemo(() => presentationSet(slides, lens), [slides, lens]);
	const count = set.length;
	const clamped = Math.min(idx, Math.max(0, count - 1));
	const cur = set[clamped] ?? '';

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
			getState: () => ({ index: clampedRef.current, total: countRef.current, note: getNote(curRef.current) || '' }),
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
	// Read the slide's speaker note when it has one (the real talk track), else the
	// on-slide prose.
	// Autoplay = read-aloud that chains across slides. Refs let the once-bound
	// onFinish read live position/intent without re-binding the reader each slide.
	const autoplayRef = React.useRef(false);
	autoplayRef.current = autoplay;
	const autoAdvanceRef = React.useRef(false);
	const reader = useReadAloud(
		React.useMemo(() => getNote(cur) || slideToSpeech(cur), [cur]),
		{
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
	// After an autoplay advance, start the new slide's reader. Deferred a frame so
	// the reader's own slide-change stop() settles first; only fires for an auto
	// advance (manual prev/next/jump leave it untouched).
	const readerRef = React.useRef(reader);
	readerRef.current = reader;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `clamped` is the TRIGGER — the effect must run on each slide change; it reads reader/flag via refs by design.
	React.useEffect(() => {
		if (!autoAdvanceRef.current) return;
		autoAdvanceRef.current = false;
		const id = requestAnimationFrame(() => readerRef.current.play());
		return () => cancelAnimationFrame(id);
	}, [clamped]);
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
	// Toggle autoplay: turning it on starts reading the deck now; off stops.
	const toggleAutoplay = React.useCallback(() => {
		setAutoplay((on) => {
			const next = !on;
			if (next) readerRef.current.play();
			else readerRef.current.stop();
			return next;
		});
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
	const goNext = React.useCallback(() => setIdx((i) => Math.min(i + 1, count - 1)), [count]);
	const goPrev = React.useCallback(() => setIdx((i) => Math.max(i - 1, 0)), []);

	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
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
	}, [open, onClose, goNext, goPrev, overviewOpen]);
	// Close the sorter whenever Present closes, so re-opening starts on the slide.
	React.useEffect(() => {
		if (!open) setOverviewOpen(false);
	}, [open]);

	if (!open) return null;
	return (
		<div role="dialog" aria-modal="true" aria-label="Present" className="lx-ui fixed inset-0 z-[100] flex flex-col items-center overflow-x-hidden bg-background">
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

			<div className="relative flex min-h-0 w-full flex-1 items-center justify-center gap-4 px-4 sm:px-6">
				<button type="button" onClick={goPrev} disabled={clamped === 0} className="hidden shrink-0 rounded-full border border-border bg-card p-2 text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:block" aria-label="Previous slide"><ChevronLeft className="size-5" /></button>
				<DeckPreview options={options} sample={frontMatter ? frontMatter + cur : cur} mermaid={false} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} className="relative aspect-video w-full max-w-[960px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_rgba(10,22,40,.18)]" aria-label="Presented slide" />
				<button type="button" onClick={goNext} disabled={clamped >= count - 1} className="hidden shrink-0 rounded-full border border-border bg-card p-2 text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:block" aria-label="Next slide"><ChevronRight className="size-5" /></button>
				{/* Real delivery coaching — the plan's role-specific guidance, with the
				    active timed beat surfacing as you cross its mark in the slide. */}
				{rehearse && playing && coach && (
					<div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4">
						<span className="inline-flex max-w-[680px] items-center gap-2 rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg))] px-3.5 py-2 text-center text-[13px] font-semibold text-[var(--text-heading)] shadow-[0_8px_24px_rgba(10,22,40,.14)]"><Sparkles className="size-3.5 shrink-0 text-[var(--accent)]" />{coach}</span>
					</div>
				)}
				{/* Read-aloud teleprompter — the narration, with the word being spoken NOW
				    highlighted live (the cursor re-anchors to the real voice when clocked). */}
				{!rehearse && reader.playing && reader.track.cues.length > 0 && (
					<div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4">
						<output className="max-w-[760px] rounded-2xl border border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-2.5 text-center text-[15px] leading-snug shadow-[0_8px_24px_rgba(10,22,40,.16)] backdrop-blur-sm sm:text-[17px]">
							{reader.track.cues.map((cue, ci) =>
								cue.words.map((w, wi) => {
									const on = reader.active?.cueIndex === ci && reader.active?.wordIndex === wi;
									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: a static track never reorders, and word text repeats — (cueIndex, wordIndex) IS the word's stable identity.
										<span key={`${ci}:${wi}`} className={cn('transition-colors', on ? 'font-semibold text-[var(--text-heading)]' : 'text-muted-foreground/70')}>
											{w.display}{' '}
										</span>
									);
								}),
							)}
						</output>
					</div>
				)}
			</div>

			{/* Bottom control bar. It fits the viewport BY CONSTRUCTION: the counter never
			    wraps, and on phones the secondary read-aloud controls (Auto + the voice
			    status) fold into a ⋯ Playback menu so the pill can't overflow. A max-w
			    backstop guards against any future addition. */}
			<div className="mb-7 mt-4 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-[0_8px_24px_rgba(10,22,40,.10)] sm:gap-3.5 sm:px-3.5 sm:py-2.5">
				<button type="button" onClick={goPrev} disabled={clamped === 0} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:hidden" aria-label="Previous slide"><ChevronLeft className="size-5" /></button>
				<span className="shrink-0 whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums text-[var(--text-heading)]">{clamped + 1} / {count}</span>
				<button type="button" onClick={goNext} disabled={clamped >= count - 1} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:text-[var(--accent)] disabled:opacity-30 sm:hidden" aria-label="Next slide"><ChevronRight className="size-5" /></button>
				<span className="h-5 w-px shrink-0 bg-border" />
				<button type="button" onClick={() => (rehearse ? setPlaying((v) => !v) : reader.toggle())} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-label={rehearse ? (playing ? 'Pause rehearsal' : 'Start rehearsal') : reader.playing ? 'Pause read-aloud' : 'Play read-aloud'}>{(rehearse ? playing : reader.playing) ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
				<div className="relative hidden h-[5px] w-[180px] rounded-full bg-border sm:block">
					<span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${rehearse ? Math.min(100, (elapsed / target) * 100) : Math.round(reader.progress * 100)}%` }} />
				</div>
				<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{rehearse ? `${fmt(elapsed)} / ${fmt(target)}` : reader.track.cues.length ? `${(reader.active?.cueIndex ?? -1) + 1} / ${reader.track.cues.length}` : '0 / 0'}</span>
				{rehearse ? (
					<span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold', behind ? 'border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_45%,transparent)] text-[var(--chart-2,#9c3f00)]' : 'border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_45%,transparent)] text-[var(--chart-3,#2e6f00)]')}><Timer className="size-3.5" />{behind ? 'Behind pace' : 'On pace'}</span>
				) : (
					<>
						{/* Autoplay stays inline as an icon on phones (no ⋯) — the "Auto" word
						    shows at ≥ sm. The voice/caption status is non-essential, so it's the
						    one thing hidden below sm. */}
						<button type="button" onClick={toggleAutoplay} aria-pressed={autoplay} aria-label="Autoplay" title="Autoplay — read every slide, advancing on its own" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[12px] font-semibold sm:px-2.5', autoplay ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><FastForward className="size-3.5 shrink-0" /><span className="hidden sm:inline">Auto</span></button>
						<span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] sm:inline-flex"><Volume2 className="size-3.5" />{rungLabel}</span>
					</>
				)}
			</div>
			<SlideOverview open={overviewOpen} onClose={() => setOverviewOpen(false)} options={options} set={set} frontMatter={frontMatter} current={clamped} onJump={setIdx} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} />
		</div>
	);
}
