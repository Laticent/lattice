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
	ready,
	onJump,
	className,
}: {
	sections: DeckSection[];
	/** 0-based index of the current slide in the presented set. */
	current: number;
	/** Within-slide progress 0..1 (read-aloud); fills the current segment. */
	frac: number;
	/** Per-slide narration readiness — can this slide speak with no network? Positionally
	 *  aligned with the presented set. Drawn as the rail's "ready" band, the scrubber idiom
	 *  every viewer already reads from a video player: played edge = where we are, ready
	 *  edge = how far the audio reaches.
	 *
	 *  It is what tells a self-presenting deck's audience that a silence is BUFFERING rather
	 *  than BROKEN: when narration stalls the played edge freezes, but the ready band keeps
	 *  advancing as audio lands. Motion that continues while playback is stopped is the only
	 *  honest signal that the deck is still working — and silence with no signal at all is
	 *  indistinguishable from a crash.
	 *
	 *  Omit entirely when there is nothing to report (no clocked voice, cache off): the band
	 *  then never renders, rather than drawing a permanently-empty runway that reads as a
	 *  fault. */
	ready?: boolean[];
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
								const done = gi < current;
								const here = gi === current;
								const right = done ? 0 : here ? 100 - Math.round(Math.max(0, Math.min(1, frac)) * 100) : 100;
								// AA, MEASURED rather than assumed (see the decision record). The bands are
								// separated by LUMINANCE, not hue, so a colour-blind viewer reads them in
								// greyscale (1.4.1), and the meaningful pair must clear 3:1 (1.4.11).
								//
								// Two earlier instincts died on contact with the numbers:
								//   · a HEIGHT split — the bar is 3px, so a half-height band is 1.5px, and no
								//     amount of contrast rescues something that thin;
								//   · THREE distinguishable bands — accent-to-border is only 4.5:1 (light) /
								//     5.4:1 (dark), and fitting a third band with 3:1 on both sides needs ~9:1.
								//     Geometrically impossible with these tokens, not a tuning problem.
								// So the rail draws TWO states that matter — can this deck still speak ahead,
								// or not — at 80% accent, the lowest mix clearing 3:1 against the unready track
								// in BOTH modes (light 3.18, dark 4.02; dark alone would pass at 70%).
								//
								// `ready` therefore sits close to `played` (1.4:1). Accepted deliberately: they
								// are never adjacent (the current segment always separates them), and position
								// is already carried by the current segment's own partial fill and aria-current
								// — so no information rides on telling those two apart.
								//
								// Only upcoming slides carry the band: a played slide's audio is spent, so
								// marking it "ready" would be noise rather than information.
								const isReady = !!ready?.[gi] && gi > current;
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
										aria-label={`Go to slide ${gi + 1}${sec.name ? ` — ${sec.name}` : ''}${isReady ? ' — narration ready' : ''}`}
										aria-current={here ? 'step' : undefined}
										className="relative h-[3px] min-w-0 flex-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
									>
										<span className="absolute inset-0 overflow-hidden rounded-full" style={{ background: here ? 'color-mix(in srgb, var(--accent) 36%, var(--border))' : isReady ? 'color-mix(in srgb, var(--accent) 80%, var(--border))' : 'var(--border)' }}>
											<span className="absolute inset-y-0 left-0 rounded-full transition-[right] duration-150" style={{ right: `${right}%`, background: 'var(--accent)' }} />
										</span>
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
