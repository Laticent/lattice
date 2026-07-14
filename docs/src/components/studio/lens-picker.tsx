import { ChevronDown, Eye, FileText, LayoutGrid, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { LensDef } from '@/lib/lente';
import { cn } from '@/lib/utils';
import type { PresentLens } from './lint';

export type LensEntry = { key: PresentLens; label: string; desc: string; icon: React.ReactNode };

// The LEGACY reader-lens catalog — the built-in full/exec/onepager heuristics, shown when a deck
// defines no `lenses:` registry. ONE source of truth (key + label + desc + icon), consumed by every
// surface that switches lens. A registry deck supplies its own entries via `lensEntriesFrom` below.
export const LENSES: LensEntry[] = [
	{ key: 'full', label: 'Full deck', desc: 'The whole source', icon: <FileText className="size-3.5" /> },
	{ key: 'exec', label: 'Exec summary', desc: 'Headline slides only', icon: <Sparkles className="size-3.5" /> },
	{ key: 'onepager', label: 'One-pager', desc: 'The single key slide', icon: <LayoutGrid className="size-3.5" /> },
];

/** Build picker entries from registry lens defs (already filtered by the caller — author preview
 *  passes all visible lenses, Present passes only reader-eligible ones). `full` keeps its icon; a
 *  registry lens gets a generic lens glyph and its authored label. */
export function lensEntriesFrom(defs: LensDef[]): LensEntry[] {
	return defs.map((d) =>
		d.id === 'full'
			? { key: 'full', label: d.label || 'Full deck', desc: 'The whole source', icon: <FileText className="size-3.5" /> }
			: { key: d.id, label: d.label, desc: d.single ? 'A single slide' : d.base === 'all' ? 'Everything except opted-out slides' : 'The slides tagged for it', icon: <Eye className="size-3.5" /> },
	);
}

/**
 * One reader-lens picker, shared by the editor's preview header AND Present mode
 * so the two can't drift. It is LABELED at every width — the label truncates in a
 * tight container but is never hidden behind a breakpoint, because a bare glyph is
 * undiscoverable (worst on touch, where there is no hover tooltip to recover it).
 * `count`/`total` show the reshaped slide count when a filtering lens is active.
 * `lenses` overrides the catalog (a deck's registry lenses); defaults to the legacy set.
 */
export function LensPicker({ value, onChange, count, total, align = 'start', className, lenses = LENSES }: {
	value: PresentLens;
	onChange: (l: PresentLens) => void;
	count?: number;
	total?: number;
	align?: 'start' | 'center' | 'end';
	className?: string;
	lenses?: LensEntry[];
}) {
	const catalog = lenses.length ? lenses : LENSES;
	const active = catalog.find((l) => l.key === value) ?? catalog[0];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" aria-label="Reader view" className={cn('inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-sans text-[12.5px] font-semibold normal-case tracking-normal text-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]', className)}>
					<span className="shrink-0">{active.icon}</span>
					<span className="truncate">{active.label}</span>
					{value !== 'full' && count != null && total != null && <span className="shrink-0 text-muted-foreground">· {count}/{total}</span>}
					<ChevronDown className="size-3.5 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-56">
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
