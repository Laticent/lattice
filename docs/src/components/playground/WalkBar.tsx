import * as React from 'react';
import { slideTranscript } from '@/lib/playground-controller';

export type WalkChip = { key: string; label: string };

/**
 * The Explore surface's Walk bar (2026-07-05 Specimen Book decision §4, PR 6):
 * Prev/Next stepping, "slide N of M", the plan caption (the only narration on
 * silent slides, and the legible channel at phone width), full-word labeled
 * step chips (§0.6 — never single letters), the "Edit this slide" escape
 * hatch, and the ≤560px transcript disclosure. Pure chrome: the parent owns
 * every decision; this renders state and forwards intent.
 */
export function WalkBar(props: {
	index: number;
	count: number;
	caption: string;
	chips: WalkChip[];
	activeChip: string | null;
	onChip: (key: string) => void;
	onPrev: () => void;
	onNext: () => void;
	/** Non-null replaces the plain "Next ›" (e.g. "Next component: kpi →"). */
	nextLabel: string | null;
	prevDisabled: boolean;
	nextDisabled: boolean;
	/** Current slide markdown for the transcript disclosure; null hides it. */
	slideMd: string | null;
	/** Null hides the escape hatch (full-deck walks have no single-slide source). */
	onEditSlide: (() => void) | null;
	/** True renders the arm-to-confirm state on the Edit button. */
	editArmed: boolean;
	notice: string | null;
}) {
	const { index, count, caption, chips, activeChip, onChip, onPrev, onNext, nextLabel, prevDisabled, nextDisabled, slideMd, onEditSlide, editArmed, notice } = props;
	const [transcriptOpen, setTranscriptOpen] = React.useState(false);
	const transcript = React.useMemo(() => (slideMd ? slideTranscript(slideMd) : ''), [slideMd]);
	// A new slide collapses the disclosure so stale copy never lingers under a new form.
	// biome-ignore lint/correctness/useExhaustiveDependencies: index/count identify the slide; the reset is the point.
	React.useEffect(() => setTranscriptOpen(false), [index, count]);

	return (
		<nav className="pg-walk" aria-label="Component walkthrough">
			{notice && <p className="pg-walk-notice">{notice}</p>}
			<div className="pg-walk-row">
				<button type="button" className="pg-walk-step" onClick={onPrev} disabled={prevDisabled} aria-label="Previous slide">
					‹ Prev
				</button>
				<span className="pg-walk-pos" aria-live="polite">
					slide {index + 1} of {count}
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
				<span className="pg-walk-spacer" />
				{onEditSlide && (
					<button type="button" className={`pg-walk-edit${editArmed ? ' armed' : ''}`} onClick={onEditSlide}>
						{editArmed ? 'Replace your draft with this slide?' : 'Edit this slide'}
					</button>
				)}
			</div>
			{caption && <p className="pg-walk-caption">{caption}</p>}
			{chips.length > 0 && (
				<div className="pg-walk-chips" role="tablist" aria-label="Walk steps">
					{chips.map((c) => (
						<button
							key={c.key}
							type="button"
							role="tab"
							aria-selected={c.key === activeChip}
							className={`pg-walk-chip${c.key === activeChip ? ' is-active' : ''}`}
							onClick={() => onChip(c.key)}
						>
							{c.label}
						</button>
					))}
				</div>
			)}
			{transcript && (
				<div className="pg-walk-transcript">
					<button type="button" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen((v) => !v)}>
						{transcriptOpen ? 'Hide this slide’s copy' : 'Read this slide’s copy'}
					</button>
					{transcriptOpen && (
						<div className="pg-walk-transcript-body">
							{transcript.split('\n').map((line, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static extracted lines, replaced wholesale per slide
								<p key={i}>{line}</p>
							))}
						</div>
					)}
				</div>
			)}
		</nav>
	);
}
