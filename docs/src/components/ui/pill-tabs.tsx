import * as React from 'react';
import { cn } from '@/lib/utils';

// PillTabs — the shared rounded-pill tablist used across the Studio settings surfaces
// (Workspace sheet, deck Inspector, "This slide" drawer, Architect, …). Extracted from the
// hand-rolled tablist WorkspaceSheet used, so the surfaces share ONE pill grammar (REUSE —
// HARD RULE #15) instead of each re-styling `role="tab"` buttons. The caller owns the active
// value and renders the matching panel (the panels are plain conditional content, not a
// Radix Tabs.Content, to keep callers simple). Callers that want DYNAMIC tabs just filter
// the `tabs` array before passing it in.
//
// KEYBOARD (WAI-ARIA tabs pattern): roving tabindex — only the selected tab is in the Tab
// order; Arrow keys move + activate (Left/Up ← prev, Right/Down → next, wrapping), Home/End
// jump to the ends. Without this, declaring role="tab" is an ARIA contract violation (a
// screen-reader user would hear "tab" but arrow keys wouldn't move). The panels stay plain
// conditional content, so there is no aria-controls/tabpanel wiring by design.

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
	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const i = tabs.findIndex((t) => t.value === value);
		if (i < 0) return;
		let next = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		if (next < 0 || next === i) return;
		e.preventDefault();
		onValueChange(tabs[next].value);
		// Move focus to follow selection (roving tabindex — the newly-selected tab is the
		// only one in the Tab order after this render, so focus it explicitly now).
		const el = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
		el?.focus();
	};
	return (
		<div className={cn('flex flex-wrap gap-1.5', className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
			{tabs.map((t) => (
				<button
					type="button"
					key={t.value}
					role="tab"
					aria-selected={t.value === value}
					tabIndex={t.value === value ? 0 : -1}
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
