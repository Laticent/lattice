// MetricDetail — the progressive-disclosure layer over a single overlay row.
// Tap (or hover, on a fine pointer) a metric to learn what it means, why it
// matters, and where the current value sits against its budget.
//
// RESPONSIVE, one trigger → device-appropriate surface (the design the human
// picked): a shadcn Popover anchored to the row on tablet/desktop (≥640px), a
// bottom Sheet on phones (<640px) where an anchored popover would clip against
// the screen edge. Both render the SAME <DetailBody>. On a fine pointer the
// popover also opens on hover for a no-click preview; touch always opens on tap.
//
// The row button lives here (not in the parent) so the trigger owns its hover
// intent and stays a single accessible control.

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { RenderStats } from '@/playground/render-metrics';
import { bandLabel, formatValue, type MetricMeta, type Rating } from './perf-metrics';

const RATING_COLOR: Record<string, string> = {
	good: '#16a34a',
	'needs-improvement': '#d97706',
	poor: '#dc2626',
};
const GREY = '#52525b';
const RATING_WORD: Record<string, string> = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' };

/** Live matchMedia hook (client-only island, but guarded for safety). */
function useMediaQuery(query: string): boolean {
	const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
	const [matches, setMatches] = React.useState(get);
	React.useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mq = window.matchMedia(query);
		const on = () => setMatches(mq.matches);
		on();
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	}, [query]);
	return matches;
}

const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export type MetricDatum = {
	value: number | null;
	rating: Rating | null;
	/** For MEM: fraction of heap limit, so the body can explain the rating. */
	extra?: number;
	/** Unsmoothed value for render metrics (the overlay shows the EMA). */
	raw?: number | null;
	/** For the RENDER row: the engine's per-stage breakdown (item 1). */
	breakdown?: RenderStats;
};

// The shared explanation — identical in the popover and the sheet. `reserveClose`
// pads the header right so the value clears the sheet's top-right close button.
function DetailBody({ meta, datum, reserveClose }: { meta: MetricMeta; datum: MetricDatum; reserveClose?: boolean }) {
	const { value, rating, raw } = datum;
	const color = rating ? RATING_COLOR[rating] : GREY;
	const band = bandLabel(meta);
	const zones: { key: Rating; label: string }[] = [
		{ key: 'good', label: 'Good' },
		{ key: 'needs-improvement', label: 'OK' },
		{ key: 'poor', label: 'Poor' },
	];
	return (
		<div className="flex flex-col gap-3 text-left">
			<div className={cn('flex items-baseline justify-between gap-3', reserveClose && 'pr-10')}>
				<div className="min-w-0">
					<div className="text-[13px] font-semibold text-foreground">{meta.title}</div>
					<div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5 font-mono text-[15px] font-semibold tabular-nums" style={{ color }}>
					<span className="inline-block size-2 rounded-full" style={{ background: color }} />
					{value == null ? '–' : formatValue(meta, value)}
				</div>
			</div>

			<p className="text-[12.5px] leading-relaxed text-foreground/90">{meta.what}</p>
			<p className="text-[12px] leading-relaxed text-muted-foreground">{meta.why}</p>

			{meta.bands || meta.rate ? (
				<div className="flex flex-col gap-1.5">
					<div className="flex gap-1">
						{zones.map((z) => {
							const active = rating === z.key;
							return (
								<span
									key={z.key}
									className={cn(
										'flex-1 rounded-md border px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide transition-colors',
										active ? 'text-white' : 'border-border text-muted-foreground',
									)}
									style={active ? { background: RATING_COLOR[z.key], borderColor: RATING_COLOR[z.key] } : undefined}
								>
									{z.label}
								</span>
							);
						})}
					</div>
					{band && <div className="font-mono text-[10.5px] text-muted-foreground">{band}</div>}
					{rating && <div className="text-[11px] text-muted-foreground">Currently: <span style={{ color }}>{RATING_WORD[rating]}</span></div>}
				</div>
			) : (
				<div className="text-[11px] italic text-muted-foreground">No target — shown for context.</div>
			)}

			{raw != null && value != null && Math.round(raw) !== Math.round(value) && (
				<div className="font-mono text-[10.5px] text-muted-foreground">smoothed · raw {formatValue(meta, raw)}</div>
			)}
			{datum.breakdown && <EngineBreakdown stats={datum.breakdown} />}
			{meta.approximate && <div className="text-[10.5px] italic text-muted-foreground">Approximate — no browser API reports true CPU use.</div>}
		</div>
	);
}

// The RENDER row's drill-in: where the engine's time went on the last render —
// the four stage buckets, then the slowest component transforms. Raw (unsmoothed).
function EngineBreakdown({ stats }: { stats: RenderStats }) {
	// Buckets sum to the raw engineMs (the `other` bucket carries the docs-side
	// overhead — math prescan, cold KaTeX — so the bars don't under-sum the row).
	const stages: [string, number][] = [
		['parse', stats.parseMs],
		['transforms', stats.transformsMs],
		['assemble', stats.assembleMs],
		['css', stats.cssMs],
		['other', stats.otherMs],
	];
	const max = Math.max(1, ...stages.map(([, v]) => v));
	const topTransforms = Object.entries(stats.transforms || {})
		.filter(([, v]) => v >= 0.1)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4);
	return (
		<div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
			<div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">where the time went</div>
			{stages.map(([name, ms]) => (
				<div key={name} className="flex items-center gap-2">
					<span className="w-16 shrink-0 text-[11px] text-muted-foreground">{name}</span>
					<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
						<span className="block h-full rounded-full bg-[var(--accent,#6366f1)]" style={{ width: `${Math.max(2, (ms / max) * 100)}%` }} />
					</span>
					<span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">{Math.round(ms)}ms</span>
				</div>
			))}
			{topTransforms.length > 0 && (
				<div className="mt-1 flex flex-col gap-0.5">
					<div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">slowest transforms</div>
					{topTransforms.map(([name, ms]) => (
						<div key={name} className="flex justify-between font-mono text-[11px]">
							<span className="text-muted-foreground">{name}</span>
							<span className="tabular-nums text-foreground">{ms.toFixed(1)}ms</span>
						</div>
					))}
				</div>
			)}
			<DeckContext stats={stats} />
		</div>
	);
}

// Deck context (item 2): WHY this render costs what it does — how many transforms
// fired, and which heavy content is present. Chips render only when relevant.
function DeckContext({ stats }: { stats: RenderStats }) {
	const chips: { label: string; warn?: boolean }[] = [];
	if (stats.charts > 0) chips.push({ label: `${stats.charts} chart${stats.charts === 1 ? '' : 's'}` });
	if (stats.mermaid > 0) chips.push({ label: `${stats.mermaid} mermaid` });
	if (stats.math) chips.push({ label: 'math' });
	// Single-slide preview → 0 or 1; label the slide, not a deck-wide tally.
	if (stats.overflow > 0) chips.push({ label: stats.overflow === 1 ? 'overflows' : `${stats.overflow} overflowing`, warn: true });
	if (chips.length === 0) return null;
	return (
		<div className="mt-1 flex flex-col gap-1">
			<div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">deck context</div>
			<div className="flex flex-wrap gap-1">
				{chips.map((c) => (
					<span
						key={c.label}
						className={cn('rounded border px-1.5 py-0.5 text-[10.5px]', c.warn ? 'border-transparent bg-[#dc2626] text-white' : 'border-border text-muted-foreground')}
					>
						{c.label}
					</span>
				))}
			</div>
		</div>
	);
}

// The row button — the trigger. Compact HUD styling; the whole row is tappable.
const Row = React.forwardRef<HTMLButtonElement, { meta: MetricMeta; datum: MetricDatum } & React.ButtonHTMLAttributes<HTMLButtonElement>>(
	({ meta, datum, className, ...props }, ref) => {
		const color = datum.rating ? RATING_COLOR[datum.rating] : GREY;
		return (
			<button
				ref={ref}
				type="button"
				aria-label={`${meta.title} — details`}
				className={cn(
					'flex h-[18px] w-full items-center justify-between gap-3.5 rounded px-1 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted',
					className,
				)}
				{...props}
			>
				<span className="flex items-center gap-[7px] text-muted-foreground">
					<span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
					{meta.label}
					{meta.approximate && <span className="text-[10px] opacity-70">≈</span>}
				</span>
				<span className="font-mono font-medium tabular-nums text-foreground">
					{datum.value == null ? '–' : formatValue(meta, datum.value)}
				</span>
			</button>
		);
	},
);
Row.displayName = 'PerfRow';

export function MetricDetail({ meta, datum }: { meta: MetricMeta; datum: MetricDatum }) {
	const isWide = useMediaQuery('(min-width: 640px)');
	const [open, setOpen] = React.useState(false);
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const canHover = isWide && finePointer();

	// Crossing the popover/sheet breakpoint while a popover is hover-open would
	// otherwise leave `open` true and pop the popover back up with no pointer
	// present when it re-mounts. Reset on any breakpoint change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only on breakpoint flip, not on open changes.
	React.useEffect(() => setOpen(false), [isWide]);

	// Hover intent (desktop popover only): open on enter, close on leave with a
	// small grace so moving into the popover content doesn't dismiss it.
	const hoverOpen = () => {
		if (!canHover) return;
		if (closeTimer.current) clearTimeout(closeTimer.current);
		setOpen(true);
	};
	const hoverClose = () => {
		if (!canHover) return;
		closeTimer.current = setTimeout(() => setOpen(false), 120);
	};
	React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

	if (!isWide) {
		// Phone: bottom sheet. No hover; tap opens. overlay off so the page behind
		// stays live (matches the sheet.tsx iOS scroll-lock note).
		return (
			// modal={false} + overlay={false} keeps the page behind live and NOT
			// scroll-locked — a modal lock lingers on iOS Safari and freezes the
			// surface behind (ui/sheet.tsx note; siblings DeckSetupSheet/GalleriesSheet).
			<Sheet modal={false}>
				<SheetTrigger asChild>
					<Row meta={meta} datum={datum} />
				</SheetTrigger>
				<SheetContent side="bottom" overlay={false} className="z-[2147483647] max-h-[70vh] overflow-y-auto rounded-t-2xl p-5">
					<SheetHeader className="sr-only">
						<SheetTitle>{meta.title}</SheetTitle>
						<SheetDescription>{meta.what}</SheetDescription>
					</SheetHeader>
					<DetailBody meta={meta} datum={datum} reserveClose />
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Row meta={meta} datum={datum} onPointerEnter={hoverOpen} onPointerLeave={hoverClose} />
			</PopoverTrigger>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={8}
				collisionPadding={12}
				onPointerEnter={hoverOpen}
				onPointerLeave={hoverClose}
				className="z-[2147483647] w-64"
			>
				<DetailBody meta={meta} datum={datum} />
			</PopoverContent>
		</Popover>
	);
}
