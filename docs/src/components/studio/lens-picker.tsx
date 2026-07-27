import { ChevronDown, FileText, Plus } from 'lucide-react';
import type * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { LensDef } from '@/lib/lente';
import { cn } from '@/lib/utils';
import { LensIcon } from './icons';
import type { PresentLens } from './lint';

export type LensEntry = { key: PresentLens; label: string; desc: string; icon: React.ReactNode };

// The base reader-lens catalog when a deck defines no `lenses:` registry: just the whole deck. The
// old author-blind `exec`/`onepager` heuristics are RETIRED — a reader view is now something the author
// builds and APPROVES in the Lenses panel, never a machine's un-vetted guess. A registry deck supplies
// its own entries via `lensEntriesFrom` below. ONE source of truth (key + label + desc + icon).
export const LENSES: LensEntry[] = [{ key: 'full', label: 'Full deck', desc: 'The whole source', icon: <FileText className="size-3.5" /> }];

/** Build picker entries from registry lens defs (already filtered by the caller — author preview
 *  passes all visible lenses, Present passes only reader-eligible ones). `full` keeps its icon; a
 *  registry lens gets a generic lens glyph and its authored label. */
export function lensEntriesFrom(defs: LensDef[]): LensEntry[] {
	return defs.map((d) =>
		d.id === 'full'
			? { key: 'full', label: d.label || 'Full deck', desc: 'The whole source', icon: <FileText className="size-3.5" /> }
			: { key: d.id, label: d.label, desc: d.single ? 'A single slide' : d.base === 'all' ? 'Everything except opted-out slides' : 'The slides tagged for it', icon: <LensIcon className="size-3.5" /> },
	);
}

/**
 * One reader-lens picker, shared by the editor's preview header AND Present mode
 * so the two can't drift. It is LABELED at every width — the label truncates in a
 * tight container but is never hidden behind a breakpoint, because a bare glyph is
 * undiscoverable (worst on touch, where there is no hover tooltip to recover it).
 * `count`/`total` show the reshaped slide count when a filtering lens is active.
 * `lenses` overrides the catalog (a deck's registry lenses); defaults to just "Full deck".
 * `onAddView`, when a deck has no reader views yet, turns the otherwise-inert "Full deck" label into a
 * discoverable entry point to the Lenses panel (the editor passes it; Present, a reader takeover, omits it).
 */
export function LensPicker({ value, onChange, count, total, align = 'start', className, menuClassName, onAddView, lenses = LENSES, dense = false }: {
	value: PresentLens;
	onChange: (l: PresentLens) => void;
	count?: number;
	total?: number;
	align?: 'start' | 'center' | 'end';
	className?: string;
	/** Opt-in: collapse the label to its icon on a NARROW CONTAINER (a `@[…]` container
	 *  query — the parent must be a `[container-type:inline-size]` size container). The
	 *  editor's preview-pane header passes this so the picker shrinks to a discoverable
	 *  icon+chevron when the pane is dragged narrow, instead of forcing the whole header
	 *  wider. Present (a reader takeover with room) omits it → labeled at every width, per
	 *  the component's default intent. */
	dense?: boolean;
	/** Extra classes for the portaled menu — e.g. a z-index above a full-screen overlay. The menu
	 *  portals to `<body>`, so inside Present (a `z-[100]` takeover) the default `z-50` would render it
	 *  BEHIND the overlay (invisible + unclickable); Present passes a higher z here. */
	menuClassName?: string;
	/** Editor-only: when the deck has no reader views yet, make the "Full deck" pill open the Lenses panel
	 *  so the feature is discoverable from the deck surface (not buried in the Architect). */
	onAddView?: () => void;
	lenses?: LensEntry[];
}) {
	const catalog = lenses.length ? lenses : LENSES;
	const active = catalog.find((l) => l.key === value) ?? catalog[0];
	// Only "Full deck" (a deck with no reader views yet) → there's nothing to switch TO. In the editor,
	// make it a discoverable entry to the Lenses panel ("+ Reader view"); elsewhere (Present) it's a plain
	// status label, not a dead 1-item dropdown. A reader view is added + approved in the Lenses panel.
	if (catalog.length <= 1) {
		if (onAddView) {
			return (
				<button type="button" onClick={onAddView} aria-label="New reader view" title="No reader views yet — add one in the Reader views panel" className={cn('group inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-sans text-[12.5px] font-semibold normal-case tracking-normal text-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]', className)}>
					<span className="shrink-0">{active.icon}</span>
					<span className={cn('truncate', dense && 'hidden @[21rem]:inline')}>{active.label}</span>
					<span className={cn('shrink-0 text-muted-foreground group-hover:text-[var(--accent)]', dense && 'hidden @[27rem]:inline')}>·</span>
					<span className={cn('inline-flex shrink-0 items-center gap-0.5 text-[var(--accent)]', dense && 'hidden @[27rem]:inline-flex')}><Plus className="size-3.5" />Reader view</span>
				</button>
			);
		}
		return (
			<span className={cn('inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-sans text-[12.5px] font-semibold normal-case tracking-normal text-muted-foreground', className)}>
				<span className="shrink-0">{active.icon}</span>
				<span className={cn('truncate', dense && 'hidden @[21rem]:inline')}>{active.label}</span>
			</span>
		);
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" aria-label="Reader view" className={cn('inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-sans text-[12.5px] font-semibold normal-case tracking-normal text-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]', className)}>
					<span className="shrink-0">{active.icon}</span>
					<span className={cn('truncate', dense && 'hidden @[21rem]:inline')}>{active.label}</span>
					{value !== 'full' && count != null && total != null && <span className={cn('shrink-0 text-muted-foreground', dense && 'hidden @[24rem]:inline')}>· {count}/{total}</span>}
					<ChevronDown className="size-3.5 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className={cn('w-56', menuClassName)}>
				<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">View — which slides show</DropdownMenuLabel>
				{catalog.map((l) => (
					<DropdownMenuItem key={l.key} onSelect={() => onChange(l.key)} className="flex-col items-start gap-0.5">
						<span className="flex w-full items-center gap-2 text-[12.5px] font-semibold text-[var(--text-heading)]"><span className="shrink-0">{l.icon}</span>{l.label}{value === l.key && <span className="ml-auto text-[var(--accent)]">✓</span>}</span>
						<span className="pl-[22px] text-[11px] text-muted-foreground">{l.desc}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
