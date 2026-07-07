import type * as React from 'react';

/**
 * The Explore surface's Walk bar (2026-07-06 simplification): Prev / "N / M" /
 * Next plus the plan caption. Stepping is the product in Explore; the step
 * dropdown in the toolbar jumps directly. Edit-this-slide and the transcript
 * are gone — flip to Edit for the slide's markdown. Pure chrome: the parent owns
 * every decision; this renders state and forwards intent.
 */
export function WalkBar(props: {
	index: number;
	count: number;
	caption: string;
	onPrev: () => void;
	onNext: () => void;
	/** Non-null replaces the plain "Next ›" (e.g. "Next component: kpi →"). */
	nextLabel: string | null;
	prevDisabled: boolean;
	nextDisabled: boolean;
	notice: string | null;
}): React.ReactElement {
	const { index, count, caption, onPrev, onNext, nextLabel, prevDisabled, nextDisabled, notice } = props;
	return (
		<nav id="pg-walk" className="pg-walk" aria-label="Component walkthrough">
			{notice && <p className="pg-walk-notice">{notice}</p>}
			<div className="pg-walk-row">
				<button type="button" className="pg-walk-step" onClick={onPrev} disabled={prevDisabled} aria-label="Previous slide">
					‹ Prev
				</button>
				<span className="pg-walk-pos" aria-live="polite">
					{index + 1} / {count}
				</span>
				<button
					type="button"
					className={`pg-walk-step next${nextLabel ? ' cross' : ''}`}
					onClick={onNext}
					disabled={nextDisabled}
					aria-label={nextLabel || 'Next slide'}
				>
					{nextLabel || 'Next ›'}
				</button>
			</div>
			{caption && <p className="pg-walk-caption">{caption}</p>}
		</nav>
	);
}
