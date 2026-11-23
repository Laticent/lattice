import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useIsomorphicLayoutEffect } from '@/components/ui/use-isomorphic-layout-effect';
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

/**
 * ONE ROW, AND THE REST IN A MENU. Which tabs to fold into the "More" pill so the row fits
 * `room` px. Pure, so the rule is tested without a layout engine.
 *
 * `hideFirst` lists tab values in the order they give up their place: least likely first.
 * The FIRST tab (an "All") never folds. Selection does NOT change who folds: a tab picked from
 * the menu names the More pill instead of swapping a neighbor out, because a row that rearranges
 * itself under a tap is the jank this exists to remove. `collapse` folds every tab but the first: the phone
 * while the keyboard is up, where one row of pills is still too much of what is left.
 * Returns the folded values; an empty set means everything fits and no More pill is drawn.
 */
export function foldPills({ values, widths, room, gap, moreWidth, hideFirst, collapse = false }: { values: string[]; widths: number[]; room: number; gap: number; moreWidth: number; hideFirst: string[]; collapse?: boolean }): Set<string> {
	if (collapse) return new Set(values.slice(1));
	const total = (shown: number[]) => shown.reduce((a, w) => a + w, 0) + gap * Math.max(0, shown.length - 1);
	if (total(widths) <= room) return new Set();
	const folded = new Set<string>();
	const order = [...hideFirst.filter((v) => values.includes(v) && v !== values[0]), ...values.slice(1).filter((v) => !hideFirst.includes(v)).reverse()];
	for (const v of order) {
		folded.add(v);
		const shown = values.flatMap((x, i) => (folded.has(x) ? [] : [widths[i]]));
		if (total([...shown, moreWidth]) <= room) break;
	}
	return folded;
}

export function PillTabs({
	tabs,
	value,
	onValueChange,
	ariaLabel,
	className,
	dense = false,
	overflow,
}: {
	tabs: PillTab[];
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel: string;
	className?: string;
	/** Tighter padding and gap, for a narrow pane that holds more pills than the roomy default fits on one row. */
	dense?: boolean;
	/**
	 * Keep the strip to ONE row: tabs that do not fit fold into a "More ▾" pill, `hideFirst`
	 * (least likely first) deciding who folds. Without it the strip wraps, as it always has.
	 * `collapse` folds everything but the first tab, and `collapsedLabel` names the More pill then.
	 * A folded tab that is selected names the More pill, so the choice stays visible.
	 */
	overflow?: { hideFirst: string[]; collapse?: boolean; moreLabel?: string; collapsedLabel?: string };
}) {
	const rowRef = React.useRef<HTMLDivElement>(null);
	const measureRef = React.useRef<HTMLDivElement>(null);
	const [folded, setFolded] = React.useState<Set<string>>(() => new Set());
	const gapPx = dense ? 4 : 6;
	const moreLabel = overflow?.moreLabel ?? 'More';
	const refit = React.useCallback(() => {
		const row = rowRef.current;
		const meas = measureRef.current;
		if (!overflow || !row || !meas) return;
		const pills = [...meas.children] as HTMLElement[];
		const widths = pills.slice(0, tabs.length).map((el) => el.getBoundingClientRect().width);
		// The More pill can carry any folded tab's name, so budget for the widest one plus the
		// chevron. Budgeting for the CURRENT selection would refold the row when you pick from it.
		const moreWidth = Math.max(pills[tabs.length]?.getBoundingClientRect().width ?? 0, ...widths.slice(1).map((w) => w + 20));
		const next = foldPills({ values: tabs.map((t) => t.value), widths, room: row.clientWidth, gap: gapPx, moreWidth: moreWidth + gapPx, hideFirst: overflow.hideFirst, collapse: overflow.collapse });
		setFolded((prev) => (prev.size === next.size && [...next].every((v) => prev.has(v)) ? prev : next));
	}, [overflow, tabs, gapPx]);
	useIsomorphicLayoutEffect(refit, [refit]);
	React.useEffect(() => {
		const row = rowRef.current;
		if (!overflow || !row || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => refit());
		ro.observe(row);
		return () => ro.disconnect();
	}, [overflow, refit]);

	const shown = overflow ? tabs.filter((t) => !folded.has(t.value)) : tabs;
	const hidden = overflow ? tabs.filter((t) => folded.has(t.value)) : [];
	const pickedHidden = hidden.find((t) => t.value === value);
	const pillClass = (on: boolean) =>
		cn(
			'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1.5 font-semibold transition-colors',
			dense ? 'px-2.5 text-[12px]' : 'px-3 text-[12.5px]',
			on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]',
		);

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		// From a folded selection the arrows start at the first pill, which holds the Tab stop.
		const i = Math.max(0, shown.findIndex((t) => t.value === value));
		let next = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % shown.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + shown.length) % shown.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = shown.length - 1;
		if (next < 0 || next === i) return;
		e.preventDefault();
		onValueChange(shown[next].value);
		// Move focus to follow selection (roving tabindex — the newly-selected tab is the
		// only one in the Tab order after this render, so focus it explicitly now).
		const el = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
		el?.focus();
	};
	const strip = (
		<div className={cn('flex', overflow ? 'min-w-0 flex-nowrap' : 'flex-wrap', dense ? 'gap-1' : 'gap-1.5', !overflow && className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
			{shown.map((t) => (
				<button
					type="button"
					key={t.value}
					role="tab"
					aria-selected={t.value === value}
					// The tablist keeps one Tab stop even when the selected tab is folded into the menu.
					tabIndex={t.value === value || (!shown.some((x) => x.value === value) && t === shown[0]) ? 0 : -1}
					onClick={() => onValueChange(t.value)}
					className={pillClass(t.value === value)}
				>
					{t.icon}
					{t.label}
				</button>
			))}
		</div>
	);
	if (!overflow) return strip;
	return (
		// The row owns the width; the tablist and the More pill share it. The More pill sits
		// OUTSIDE the tablist (a menu button is not a tab), right after the last pill.
		<div ref={rowRef} className={cn('relative flex min-w-0 items-center', dense ? 'gap-1' : 'gap-1.5', className)}>
			{strip}
			{hidden.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button type="button" aria-label={pickedHidden ? `${ariaLabel}: ${pickedHidden.label}, more` : `More ${ariaLabel.toLowerCase()}`} className={pillClass(!!pickedHidden)}>
							{pickedHidden ? pickedHidden.label : overflow.collapse && overflow.collapsedLabel ? overflow.collapsedLabel : moreLabel}
							<ChevronDown className="size-3.5" aria-hidden />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
							{hidden.map((t) => (
								<DropdownMenuRadioItem key={t.value} value={t.value}>
									{t.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{/* The ruler: every pill at its natural width, plus the More pill, off-screen and inert.
			    Measuring the live row would measure only the pills already shown. */}
			<div ref={measureRef} aria-hidden inert className={cn('pointer-events-none invisible absolute left-0 top-0 flex', dense ? 'gap-1' : 'gap-1.5')}>
				{tabs.map((t) => (
					<span key={t.value} className={pillClass(false)}>
						{t.icon}
						{t.label}
					</span>
				))}
				<span className={pillClass(false)}>
					{moreLabel}
					<ChevronDown className="size-3.5" />
				</span>
			</div>
		</div>
	);
}
