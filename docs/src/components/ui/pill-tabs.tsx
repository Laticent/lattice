import { ChevronDown, Ellipsis } from 'lucide-react';
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
 * itself under a tap is the jank this exists to remove.
 * Returns the folded values; an empty set means everything fits and no More pill is drawn.
 */
export function foldPills({ values, widths, room, gap, moreWidth, hideFirst }: { values: string[]; widths: number[]; room: number; gap: number; moreWidth: number; hideFirst: string[] }): Set<string> {
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
	iconOnly = false,
	renderHint,
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
	 * ICONS, NOT WORDS, where words do not fit: a tab that carries an `icon` shows only it, and its label becomes the
	 * tab's accessible name and its hover/focus hint (Tip). For a narrow pane holding more sections than labeled pills
	 * fit at 320px (the Library dock and phone, design §7 of 2026-11-22-local-first-drive-storage.md). A tab with no
	 * icon keeps its label, so a caller cannot make a tab with no visible or spoken name.
	 */
	iconOnly?: boolean;
	/**
	 * Wrap an icon tab in its hover/focus hint, e.g. `(label, tab) => <Tip label={label}>{tab}</Tip>`. A prop, not an
	 * import: importing the tooltip here pulled it into every route that draws a pill strip and re-split two shared
	 * chunks (+458 bytes of eager JS on home, playground and getting-started; check:route-budget on #3588). The
	 * label is the tab's accessible name either way.
	 */
	renderHint?: (label: string, tab: React.ReactElement) => React.ReactNode;
	/**
	 * Keep the strip to ONE row: tabs that do not fit fold into a "More ▾" pill, `hideFirst`
	 * (least likely first) deciding who folds. Without it the strip wraps, as it always has.
	 * A folded tab that is selected names the More pill, so the choice stays visible.
	 */
	overflow?: { hideFirst: string[]; moreLabel?: string };
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
		// A row with no width has not been laid out, or is `display:none` (the phone gallery swaps
		// two strips on focus): keep the last good fold rather than folding everything, which would
		// flash "All · More" for a frame when it shows again. SettingsSectionTabs learned the same.
		if (row.clientWidth === 0) return;
		const pills = [...meas.children] as HTMLElement[];
		const widths = pills.slice(0, tabs.length).map((el) => el.getBoundingClientRect().width);
		// The More pill can carry any folded tab's name, so budget for the widest one plus the
		// chevron. Budgeting for the CURRENT selection would refold the row when you pick from it.
		const moreWidth = Math.max(pills[tabs.length]?.getBoundingClientRect().width ?? 0, ...widths.slice(1).map((w) => w + 20));
		const next = foldPills({ values: tabs.map((t) => t.value), widths, room: row.clientWidth, gap: gapPx, moreWidth: moreWidth + gapPx, hideFirst: overflow.hideFirst });
		setFolded((prev) => (prev.size === next.size && [...next].every((v) => prev.has(v)) ? prev : next));
	}, [overflow, tabs, gapPx]);
	useIsomorphicLayoutEffect(refit, [refit]);
	React.useEffect(() => {
		const row = rowRef.current;
		if (!overflow || !row || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => refit());
		ro.observe(row);
		// The ruler too: the web font lands after first paint and changes every pill's width
		// without changing the row's, so watching the row alone kept a stale fold.
		if (measureRef.current) ro.observe(measureRef.current);
		return () => ro.disconnect();
	}, [overflow, refit]);

	const shown = overflow ? tabs.filter((t) => !folded.has(t.value)) : tabs;
	const hidden = overflow ? tabs.filter((t) => folded.has(t.value)) : [];
	const pickedHidden = hidden.find((t) => t.value === value);
	// In an icon strip the More pill is an icon too: the folded selection's own icon, else an ellipsis. Its name stays in
	// the aria-label, so a word never sits alone in a row of icons.
	const moreIcon = (t?: PillTab) => (t && bare(t) ? t.icon : <Ellipsis className="size-3.5" aria-hidden />);
	const bare = (t: PillTab) => iconOnly && !!t.icon;
	const pillClass = (on: boolean, iconPill = false) =>
		cn(
			'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1.5 font-semibold transition-colors',
			// An icon pill is exactly as tall as a labeled pill of the same size (its line box is the label's: 12px or 12.5px
			// type at 1.5 leading, plus padding and border), so switching a strip to icons never shrinks its touch target.
			// 36px wide, so six fit one row beside a 32px button in a 320px phone's 288px (6 x 36 + 5 gaps of 6 = 246px).
			iconPill ? cn('justify-center px-2.5', dense ? 'min-h-8 text-[12px]' : 'min-h-[2.125rem] text-[12.5px]') : dense ? 'px-2.5 text-[12px]' : 'px-3 text-[12.5px]',
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
			{shown.map((t) => {
				const tab = (
					<button
						type="button"
						key={t.value}
						role="tab"
						aria-selected={t.value === value}
						aria-label={bare(t) ? t.label : undefined}
						data-pill={t.value}
						// The tablist keeps one Tab stop even when the selected tab is folded into the menu.
						tabIndex={t.value === value || (!shown.some((x) => x.value === value) && t === shown[0]) ? 0 : -1}
						onClick={() => onValueChange(t.value)}
						className={pillClass(t.value === value, bare(t))}
					>
						{t.icon}
						{bare(t) ? null : t.label}
					</button>
				);
				return bare(t) && renderHint ? <React.Fragment key={t.value}>{renderHint(t.label, tab)}</React.Fragment> : tab;
			})}
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
						<button type="button" aria-label={pickedHidden ? `${ariaLabel}: ${pickedHidden.label}, more` : `More ${ariaLabel.toLowerCase()}`} className={pillClass(!!pickedHidden, iconOnly)}>
							{iconOnly ? moreIcon(pickedHidden) : pickedHidden ? pickedHidden.label : moreLabel}
							<ChevronDown className="size-3.5" aria-hidden />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
							{hidden.map((t) => (
								<DropdownMenuRadioItem key={t.value} value={t.value} className="gap-2">
									{t.icon}
									{t.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{/* The ruler: every pill at its natural width, plus the More pill, off-screen and inert.
			    Measuring the live row would measure only the pills already shown. */}
			{/* Clipped to the row, so the ruler (wider than the row when pills fold) can never give an
			    ancestor a sideways scroll. `w-max` keeps the pills at their natural width inside it. */}
			<div aria-hidden inert className="pointer-events-none invisible absolute inset-0 overflow-hidden">
			<div ref={measureRef} className={cn('flex w-max', dense ? 'gap-1' : 'gap-1.5')}>
				{tabs.map((t) => (
					<span key={t.value} className={pillClass(false, bare(t))}>
						{t.icon}
						{bare(t) ? null : t.label}
					</span>
				))}
				<span className={pillClass(false, iconOnly)}>
					{iconOnly ? moreIcon() : moreLabel}
					<ChevronDown className="size-3.5" />
				</span>
			</div>
			</div>
		</div>
	);
}
