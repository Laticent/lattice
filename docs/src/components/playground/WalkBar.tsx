import type * as React from 'react';

/**
 * The Explore surface's Walk bar (2026-07-06 simplification): Prev / "N / M" /
 * Next plus the plan caption. Stepping is the product in Explore; the step
 * dropdown in the toolbar jumps directly. Edit-this-slide and the transcript
 * are gone — flip to Edit for the slide's markdown. Pure chrome: the parent owns
 * every decision; this renders state and forwards intent.
 *
 * IT IS ALWAYS MOUNTED, AND ITS BOX IS ALWAYS THE SAME SIZE (#1588). The bar used to
 * appear only once the component's plan had been fetched — about a second after the deck
 * was already on screen — and took ~100px off the bottom of the preview when it did, moving
 * the whole deck up mid-read (measured at 1194x834, CPU 6x: the preview pane 720px until
 * t=1366ms, 619px after; at 390x844, 680 → 571). A reserve computed from a STORED height was
 * built and withdrawn in #1581, because the only height available to reserve from is the
 * caption of the slide the LAST session ended on while the band belongs to the FIRST slide of
 * the next boot — and on a plan fetch that 404s the reserve never came off at all.
 *
 * So the box is not reserved, it is simply THERE: in Explore the walk bar is chrome, not walk
 * state, and only its CONTENTS wait for the network. Before the plan lands the steppers are
 * disabled and the position reads nothing — the `pending` shape #1581 gave the component
 * picker, applied to a box rather than a value. Nothing here is allowed to change the bar's
 * height afterwards: the row never wraps, the position holds a fixed width, and the caption
 * slot is exactly `--pg-walk-cap-lines` lines tall whatever it holds (playground.css).
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
			<div className="pg-walk-row">
				<button type="button" className="pg-walk-step" onClick={onPrev} disabled={prevDisabled} aria-label="Previous slide">
					‹ Prev
				</button>
				{/* Nothing rather than "1 / 0" while the plan is still in flight — a position the
				    page cannot know is not a position. The slot keeps its width either way, so the
				    steppers do not slide sideways when the real numbers arrive.
				    `aria-live` ARRIVES WITH THE VALUE, and that is not incidental: a live region
				    already in the tree that goes from empty to "1 / 8" is a change, so assistive
				    tech announces it — a spurious announcement on every Explore boot, which the
				    bar never made when it mounted whole. Adding the attribute together with the
				    text makes it a region that arrives populated, which is not announced. */}
				<span className="pg-walk-pos" aria-live={count > 0 ? 'polite' : undefined}>
					{count > 0 ? `${index + 1} / ${count}` : ''}
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
			{/* ONE line-box for both, always rendered. A notice ("that step is gone — showing the
			    title") is transient and outranks the caption while it is up; giving it its own
			    element would add a line and move the deck, which is the defect this bar was fixed
			    for. `title` carries the full text, since the slot clamps. */}
			<p className={`pg-walk-caption${notice ? ' is-notice' : ''}`} title={notice || caption || undefined}>
				{notice || caption}
			</p>
		</nav>
	);
}
