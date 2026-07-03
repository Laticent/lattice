import * as React from 'react';
import { cn } from '@/lib/utils';

// PillTabs — the shared rounded-pill tablist used across the Studio settings surfaces
// (Workspace sheet, the "This slide" drawer, …). Extracted from the hand-rolled tablist
// WorkspaceSheet used, so the three surfaces share ONE pill grammar (REUSE — HARD RULE
// #15) instead of each re-styling `role="tab"` buttons. A thin, accessible wrapper: a
// `role="tablist"` of `role="tab"` buttons; the caller owns the active value and renders
// the matching panel (the panels are plain conditional content, not a Radix Tabs.Content,
// to match the existing pattern and keep callers simple). Callers that want DYNAMIC tabs
// just filter the `tabs` array before passing it in.

export type PillTab = {
	/** stable id + the value reported to onValueChange */
	value: string;
	label: string;
	/** optional leading glyph (already sized, e.g. <Icon className="size-3.5" />) */
	icon?: React.ReactNode;
};

export function PillTabs({
	tabs,
	value,
	onValueChange,
	ariaLabel,
	className,
}: {
	tabs: PillTab[];
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel: string;
	className?: string;
}) {
	return (
		<div className={cn('flex flex-wrap gap-1.5', className)} role="tablist" aria-label={ariaLabel}>
			{tabs.map((t) => (
				<button
					type="button"
					key={t.value}
					role="tab"
					aria-selected={t.value === value}
					onClick={() => onValueChange(t.value)}
					className={cn(
						'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
						t.value === value
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-background text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]',
					)}
				>
					{t.icon}
					{t.label}
				</button>
			))}
		</div>
	);
}
