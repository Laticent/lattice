import { AlertTriangle, ChevronDown, Copy } from 'lucide-react';
import { canSplitSlide, splitSlideInHalf } from './split-slide';
import type { VenueOption } from './venue';

// THE CLIP NOTICE — warn, plus a one-click fix, when the shown slide is too full for the deck's
// venue (owner ruling 2026-09-27; engineering/typography.md §7). Lazily loaded with the split
// helper the first time a slide clips at a venue, so neither rides the Studio's eager bundle
// (docs/route-budget.json). StudioShell decides WHEN it shows and which room to offer.
export function ClipNotice({ venue, down, slide, splittable, onSplit, onDown }: {
	venue: VenueOption;
	/** The smaller room to offer (lint's answer when it has one), or null when none would fit. */
	down: VenueOption | null;
	/** The shown slide's markdown, to decide whether Split has a list or table to divide. */
	slide: string;
	/** False under a reader lens, where the shown slide is not the source slide. */
	splittable: boolean;
	/** Apply the split: receives the helper, so the caller keeps the source edit and its Undo. */
	onSplit: (split: typeof splitSlideInHalf) => void;
	onDown: () => void;
}) {
	const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px] font-semibold hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:text-[var(--accent)]';
	return (
		<div role="status" aria-label="Slide clips at this venue" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_8%,var(--bg-alt))] px-3 py-2 text-[12.5px] text-[var(--text-heading)]">
			<AlertTriangle className="size-4 shrink-0 text-[var(--warn)]" aria-hidden="true" />
			<span className="min-w-0 flex-1">
				This slide is clipped at <b className="font-semibold">{venue.label}</b> ({venue.scale}x). The venue is a fixed size, so nothing shrinks it{down ? '' : ', and a smaller room would not fit it either'}.
			</span>
			<span className="flex shrink-0 items-center gap-1.5">
				{splittable && canSplitSlide(slide) && (
					<button type="button" onClick={() => onSplit(splitSlideInHalf)} className={btn}>
						<Copy className="size-3.5" aria-hidden="true" />Split slide
					</button>
				)}
				{down && (
					<button type="button" onClick={onDown} className={btn}>
						<ChevronDown className="size-3.5" aria-hidden="true" />Use {down.label}
					</button>
				)}
			</span>
		</div>
	);
}
