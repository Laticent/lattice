import * as React from 'react';
import { bufferedOrigin, bufferedPosition, bufferedTier, progressTier, trackTier } from './present-rail-tiers';
import { type DeckSection, sectionOfIndex } from './present-sections';

// A stable identity for the default, so an omitted `ready` can't defeat React.memo.
const EMPTY_READY: number[] = [];

// The ONE progress element (2026-07-12-studio-present-redesign.md, S1): a segmented,
// section-grouped rail. One segment per presented slide, grouped by section with a gap
// between groups; the CURRENT segment fills by `frac` (within-slide read progress); click
// a segment to jump. A centered section title sits above it and cross-fades on change.
// Replaces the old dual counter (slide position + read-aloud cue count).
//
// Trio-hardened (S1 review): segments SHRINK to fit (no fixed per-segment floor + an
// overflow backstop) so a 40–60-slide deck can't push the transport controls off the bar;
// the section title lives in a STABLE aria-live region (a remounting node isn't announced);
// and the rail is ONE tab stop with roving arrow-key movement (not N stops) — its arrow
// handling stops the native event so the overlay's global ←/→ slide-nav doesn't double-fire.
function PresentRailImpl({
	sections,
	current,
	frac,
	prefetchFront = 0,
	ready = EMPTY_READY,
	onJump,
	className,
}: {
	sections: DeckSection[];
	/** 0-based index of the current slide in the presented set. */
	current: number;
	/** Within-slide progress 0..1 (read-aloud); fills the current segment. */
	frac: number;
	/** How far the prefetched narration reaches, as a FRACTIONAL slide index (4.6 = through
	 *  slide 4 plus 60% of slide 5). The lighter of the rail's two fills — the scrubber idiom
	 *  every viewer already reads from a video player: progress edge = where we are, prefetch
	 *  edge = how far the audio reaches.
	 *
	 *  It is what tells a self-presenting deck's audience that a silence is BUFFERING rather
	 *  than BROKEN: when narration stalls the progress edge freezes while the prefetch edge
	 *  keeps advancing. Motion that continues while playback is stopped is the only honest
	 *  signal that the deck is still working — silence with no signal is indistinguishable
	 *  from a crash. When the two edges MEET, the audio has run dry, and that is visible
	 *  without a word or a color change.
	 *
	 *  CONTIGUOUS by construction: it stops at the first slide that isn't fully cached, because
	 *  a later cached slide cannot be reached without stalling at the gap first — so counting
	 *  it would overstate the runway. 0 when there is nothing to report (no clocked voice,
	 *  cache off), which simply draws no prefetch fill. */
	prefetchFront?: number;
	/** Per-slide cached fraction, ONLY for the assistive label — never for the fills.
	 *
	 *  The fills read `prefetchFront`, which is floored at the playhead so the buffer edge can
	 *  never draw behind it. That floor is right for a width and wrong for a claim: with nothing
	 *  cached (Voice muted — the DEFAULT — no key, cache off, private window) it put every
	 *  visited segment at 100%, and the label then announced "narration ready" for slides that
	 *  had no narration and never would. Visually the taller progress fill hid it; a screen
	 *  reader heard the lie in full (independent checker + red team, #1352). This is the raw
	 *  measurement, so an empty array simply makes no claim. */
	ready?: number[];
	onJump: (i: number) => void;
	className?: string;
}) {
	const total = sections.reduce((a, s) => a + s.count, 0);
	const [focusIdx, setFocusIdx] = React.useState(current);
	// Keep the single tab-stop on the current slide's segment as navigation moves elsewhere.
	React.useEffect(() => setFocusIdx(current), [current]);
	const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

	const focusSeg = React.useCallback(
		(i: number) => {
			const j = Math.max(0, Math.min(total - 1, i));
			setFocusIdx(j);
			btnRefs.current[j]?.focus();
		},
		[total],
	);
	// Roving tabindex: ←/→ move focus WITHIN the rail; Enter/Space jump. stopImmediatePropagation
	// keeps the overlay's window-level ←/→ (goPrev/goNext) from also firing while the rail has focus.
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			e.nativeEvent.stopImmediatePropagation();
			focusSeg(focusIdx + 1);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			e.nativeEvent.stopImmediatePropagation();
			focusSeg(focusIdx - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			focusSeg(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			focusSeg(total - 1);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.nativeEvent.stopImmediatePropagation();
			onJump(focusIdx);
		}
	};

	if (sections.length === 0) return null;
	const curSec = sectionOfIndex(sections, current);
	const name = curSec >= 0 ? sections[curSec].name : '';
	return (
		<div className={`flex min-w-0 flex-col items-stretch gap-1.5 ${className ?? ''}`}>
			{/* Section title — ONE centered line above a full-width rail (2026-07-12 redesign,
			    layout A). STABLE polite live region so a section change is announced (a
			    key-remounted region is not); the visual cross-fade rides a keyed INNER span so
			    the announced node itself never remounts. Only rendered when the deck has named
			    sections (a flat deck degrades to the bare rail). */}
			{name ? (
				<div className="h-[13px] truncate text-center text-[10px] font-bold uppercase leading-none tracking-[0.16em] text-muted-foreground" aria-live="polite">
					<span key={name} className="inline-block animate-[lx-fade-rise_.4s_ease] motion-reduce:animate-none">
						{name}
					</span>
				</div>
			) : null}
			{/* biome-ignore lint/a11y/useSemanticElements: role=group + aria-label is the correct ARIA for a segmented progress/jump control (not a fieldset form group) */}
			<div className="flex min-w-0 items-end gap-1.5 overflow-hidden" role="group" aria-label="Deck progress — jump to a slide" onKeyDown={onKeyDown}>
				{sections.map((sec, si) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: sections are positional + stable per render
					<div key={si} className="flex min-w-0 flex-col" style={{ flex: sec.count }}>
						<div className="flex min-w-0 gap-[2px]">
						{Array.from({ length: sec.count }).map((_, k) => {
								const gi = sec.start + k;
								const here = gi === current;
								// TWO FILLS, both continuous across segments: prefetch leads, progress follows.
								//
								// Each is a FRONT — a fractional slide index — not a per-slide flag. That
								// matters: a per-slide "ready" boolean made a half-fetched slide flip from
								// empty to full, and a slide whose audio landed out of order lit up behind a
								// gap, so the bar read as patchwork rather than as two advancing ranges. A
								// front fills each segment proportionally, so the eye sees one prefetch edge
								// running ahead of one progress edge, which is the scrubber every viewer
								// already knows.
								const fillPct = (front: number) => {
									const d = front - gi;
									return d <= 0 ? 0 : d >= 1 ? 100 : d * 100;
								};
								const prePct = fillPct(prefetchFront);
								const proPct = fillPct(current + Math.max(0, Math.min(1, frac)));
								return (
									<button
										key={gi}
										ref={(el) => {
											btnRefs.current[gi] = el;
										}}
										type="button"
										tabIndex={gi === focusIdx ? 0 : -1}
										onClick={() => onJump(gi)}
										onFocus={() => setFocusIdx(gi)}
										aria-label={`Go to slide ${gi + 1}${sec.name ? ` — ${sec.name}` : ''}${(ready[gi] ?? 0) >= 1 && !here ? ' — narration ready' : ''}`}
										aria-current={here ? 'step' : undefined}
										className="relative h-[8px] min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
									>
										{/* ONE HEIGHT, ONE INK, TWO CHANNELS.

										    The video-scrubber idiom: a uniform bar whose track, buffered range and
										    played range are told apart without moving or resizing anything. Track is
										    the token blended toward the background; played is the token at full
										    strength; buffered is the SAME full-strength ink, striped.

										    Why the buffered range is a hatch and not a third tone is measured, and the
										    measurement is in `present-rail-tiers.ts` beside the values themselves —
										    together with the sweep that produced it, so the next re-tune cannot
										    accidentally measure something the rail is not painting. */}
										<span
											data-tier="track"
											className="absolute inset-x-0 bottom-0 h-[8px] rounded-full"
											style={{ background: trackTier(here) }}
										/>
										{prePct > 0 && (
											<span
												data-tier="prefetch"
													className="absolute bottom-0 left-0 h-[8px] rounded-full transition-[width] duration-300 motion-reduce:transition-none"
												style={{ width: `${prePct}%`, background: bufferedTier, backgroundPosition: bufferedPosition, backgroundOrigin: bufferedOrigin }}
											/>
										)}
										{proPct > 0 && (
											<span
												data-tier="progress"
													className="absolute bottom-0 left-0 h-[8px] rounded-full transition-[width] duration-150 motion-reduce:transition-none"
												style={{ width: `${proPct}%`, background: progressTier }}
											/>
										)}
										{/* THE PLAYHEAD — painted LAST, so nothing can cover it.
										
										    The current-slide cue used to be a lift of the track's own tone (16% → 30%).
										    Two independent problems, both measured: the prefetch fill occupies the SAME
										    box and paints after it, so once a slide is fully cached the tint is hidden
										    completely (red team rendered it — the current and neighbouring segments came
										    back byte-identical); and as a tone step it is weaker than what it replaced in
										    26 of 36 palettes. It was reachable at all only because Kokoro could not
										    prefetch; letting it prefetch is what tipped that latent fragility into failure.
										
										    A mark, not a tone. Solid `--accent` with a 1px `--bg` halo, so it reads as a
										    hard edge against WHATEVER sits beneath — accent-to-bg is 4.35:1 in the
										    tightest palette, which no fill tone can flatten. At rest it sits at the start
										    of the current slide and says "here"; under playback it rides the progress
										    front. One mechanism for both. */}
										{here && (
											<span
												data-tier="playhead"
													className="absolute bottom-0 h-[8px] w-[2px] rounded-full transition-[left] duration-150 motion-reduce:transition-none"
												style={{ left: `${proPct}%`, marginLeft: -1, background: progressTier, boxShadow: '0 0 0 1px var(--bg)' }}
											/>
										)}
										{/* enlarged invisible hit target — the visual bar stays thin (trio fix #1) */}
										<span className="absolute -inset-x-0.5 -top-2.5 -bottom-2.5" aria-hidden="true" />
									</button>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// Memoized because this is the ONE component on the present bar that re-renders in step with the
// read-aloud clock. It draws three absolutely-positioned spans per slide, two of them animating
// `width`, so a 50-slide deck is 150 nodes with fresh inline styles. Without this, every unrelated
// overlay state change (the readiness poll, a hint dismissal, caption text) redraws all of it
// mid-sentence — and a busy main thread makes the AUDIO stutter, not just the bar. Props are
// primitives plus a memoized `sections` and the stable `setIdx`, so the shallow compare is cheap
// and actually hits.
export const PresentRail = React.memo(PresentRailImpl);
