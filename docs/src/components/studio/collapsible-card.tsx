import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// THE STUDIO'S COLLAPSIBLE CARD. One question answered at a glance (a title, a headline figure, an
// optional bar, one line under it) with its detail folded behind a chevron. The chat's cost menu and its
// change card both draw with it, so the two read as one set; a third surface extends this, never forks it
// (HARD RULE #15). Drawn in the chat's own card style: a rounded hairline border on the page background.
// Built on the shared shadcn Collapsible, which supplies the trigger's aria-expanded and the keyboard.

// The chevron is drawn here (lucide's chevron-down path) rather than imported: the card is imported from
// more than one place, and lucide's module then splits into a chunk of its own that every route loads
// (+136 bytes gzipped of eager JS on all five budgeted routes, measured against main).
function Chevron({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}

export type BarTone = 'ok' | 'warn' | 'over';
const barFill = (t: BarTone) => (t === 'over' ? 'bg-[var(--fail,#b3261e)]' : t === 'warn' ? 'bg-[var(--warn,#9a6a00)]' : 'bg-primary');

/** A thin progress bar on the accent's soft tint, so an empty bar reads empty rather than full. */
export function CardBar({ value, tone = 'ok' }: { value: number; tone?: BarTone }) {
	return (
		<span className="my-1.5 block h-[5px] overflow-hidden rounded-full bg-[var(--accent-soft)]" aria-hidden>
			<span className={cn('block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', barFill(tone))} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
		</span>
	);
}

export type CollapsibleCardProps = {
	/** The card's name, shown in the header and spoken by the trigger. */
	title: React.ReactNode;
	/** Plain-text name for the trigger's accessible label, when `title` is not a plain string. */
	label?: string;
	/** The headline figure, right-aligned in the header ("27% used", "Applied"). */
	figure?: React.ReactNode;
	/** A bar under the header, only where there is a limit to measure against. */
	bar?: { value: number; tone?: BarTone };
	/** One line under the header, always visible (a fact, or a row of actions). */
	sub?: React.ReactNode;
	/** Always visible, after the folded detail (a primary action). */
	action?: React.ReactNode;
	/** An accent border, for a card that asks for attention. */
	tone?: 'attention';
	/** Controlled open state; leave unset for the card to keep its own. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	/** Padding of the detail area: `inset` (default) under a divider, or `flush` for content that draws its own. */
	detail?: 'inset' | 'flush';
	className?: string;
	/** The folded detail. With none, the card has no chevron. */
	children?: React.ReactNode;
};

export function CollapsibleCard({ title, label, figure, bar, sub, action, tone, open: openProp, onOpenChange, defaultOpen = false, detail = 'inset', className, children }: CollapsibleCardProps) {
	const [own, setOwn] = React.useState(defaultOpen);
	const open = openProp ?? own;
	const setOpen = (v: boolean) => {
		if (openProp === undefined) setOwn(v);
		onOpenChange?.(v);
	};
	const folds = React.Children.toArray(children).some(Boolean);
	const name = label ?? (typeof title === 'string' ? title : 'Details');
	const head = (
		<>
			<span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">{title}</span>
			{figure != null && <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">{figure}</span>}
			{folds && <Chevron className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} />}
		</>
	);
	return (
		<Collapsible open={open} onOpenChange={setOpen} className={cn('rounded-lg border bg-background px-2.5 py-2', tone === 'attention' ? 'border-[var(--accent)]' : 'border-border', className)}>
			{folds ? (
				<CollapsibleTrigger className="flex min-h-6 w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${name}: ${open ? 'hide' : 'show'} details`}>
					{head}
				</CollapsibleTrigger>
			) : (
				<div className="flex min-h-6 items-center gap-2">{head}</div>
			)}
			{bar && <CardBar value={bar.value} tone={bar.tone} />}
			{sub != null && <div className={cn('text-[11px] leading-snug text-muted-foreground', !bar && 'pt-0.5')}>{sub}</div>}
			{folds && (
				<CollapsibleContent className="data-[state=open]:motion-safe:animate-in data-[state=open]:motion-safe:fade-in">
					<div className={cn('mt-2 border-t border-border', detail === 'inset' ? 'pt-1.5' : 'pt-2')}>{children}</div>
				</CollapsibleContent>
			)}
			{action}
		</Collapsible>
	);
}
