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
	onJump,
	className,
}: {
	sections: DeckSection[];
	/** 0-based index of the current slide in the presented set. */
	current: number;
	/** Within-slide progress 0..1 (read-aloud); fills the current segment. */
	frac: number;
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
		<div className={`hidden min-w-0 flex-1 flex-col items-stretch gap-1.5 sm:flex ${className ?? ''}`}>
			{/* STABLE polite live region — text updates in place so a section change is announced
			    (a key-remounted region is not); the visual cross-fade is applied to the text, not the node. */}
			<div className="truncate text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground" aria-live="polite">
				{name}
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: role=group + aria-label is the correct ARIA for a segmented progress/jump control (not a fieldset form group) */}
			<div className="flex min-w-0 items-end gap-2 overflow-hidden" role="group" aria-label="Deck progress — jump to a slide" onKeyDown={onKeyDown}>
				{sections.map((sec, si) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: sections are positional + stable per render
					<div key={si} className="flex min-w-0 flex-col" style={{ flex: sec.count }}>
						<div className="flex min-w-0 gap-[3px]">
							{Array.from({ length: sec.count }).map((_, k) => {
								const gi = sec.start + k;
								const done = gi < current;
								const here = gi === current;
								const right = done ? 0 : here ? 100 - Math.round(Math.max(0, Math.min(1, frac)) * 100) : 100;
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
										aria-label={`Go to slide ${gi + 1}${sec.name ? ` — ${sec.name}` : ''}`}
										aria-current={here ? 'step' : undefined}
										className="relative h-[3px] min-w-[2px] flex-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
									>
										<span className="absolute inset-0 overflow-hidden rounded-full" style={{ background: here ? 'color-mix(in srgb, var(--accent) 36%, var(--border))' : 'var(--border)' }}>
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
