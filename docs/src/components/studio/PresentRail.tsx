import * as React from 'react';
import { type DeckSection, sectionOfIndex } from './present-sections';

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
export function PresentRail({
	sections,
	current,
	frac,
	prefetchFront = 0,
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
										aria-label={`Go to slide ${gi + 1}${sec.name ? ` — ${sec.name}` : ''}${prePct >= 100 && !here ? ' — narration ready' : ''}`}
										aria-current={here ? 'step' : undefined}
										className="relative h-[5px] min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
									>
										{/* The three tiers are separated by HEIGHT, not tone — 2px track, 3px
										    prefetch, 5px progress — because tone cannot carry this. Measured
										    across all 36 palette/mode combinations: accent-to-border is under
										    3:1 in ELEVEN of them (in `onyx dark` the two tokens are both
										    #FFFFFF), so any tint-based tier is invisible in the a11y, onyx and
										    print palettes. Thickness is palette-blind by construction, which is
										    what "layouts are palette-blind" actually demands. Color still
										    reinforces; it just isn't what carries the meaning. */}
										<span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full" style={{ background: 'var(--border)' }} />
										{prePct > 0 && (
											<span
												className="absolute bottom-0 left-0 h-[3px] rounded-full transition-[width] duration-300 motion-reduce:transition-none"
												style={{ width: `${prePct}%`, background: 'color-mix(in srgb, var(--accent) 55%, var(--border))' }}
											/>
										)}
										{proPct > 0 && (
											<span
												className="absolute bottom-0 left-0 h-[5px] rounded-full transition-[width] duration-150 motion-reduce:transition-none"
												style={{ width: `${proPct}%`, background: 'var(--accent)' }}
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
