import * as React from 'react';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ONE selector for every catalog-backed dimension — finish, brand bar (spectrum),
// mode, theme. Both the deck Inspector AND the slide Inspector render this same
// component, so the two can't drift and a picker is never rolled twice (HARD RULE
// #15). Built on the shared ui/select (shadcn) primitive; each dimension supplies
// its options as grouped {value,label,swatch} from its catalog, and the trigger +
// each row show the swatch preview so the visual grammar is identical everywhere.

export type CatalogSwatch = { background: string; backgroundSize?: string };
export type CatalogOption = { value: string; label: string; swatch?: CatalogSwatch };
export type CatalogGroup = { label?: string; options: CatalogOption[] };

// The preview chip — a small rounded swatch rendering the option's CSS background
// (a finish texture, a spectrum gradient, a palette accent). Matches the deck
// Inspector's existing swatch so the two surfaces read as one.
export function SwatchChip({ background, backgroundSize, className }: CatalogSwatch & { className?: string }) {
	return (
		<span
			className={cn('size-4 shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]', className)}
			style={{ background, backgroundSize }}
		/>
	);
}

export function CatalogSelect({
	value,
	onValueChange,
	groups,
	ariaLabel,
	className,
	placeholder,
}: {
	value: string;
	onValueChange: (v: string) => void;
	groups: CatalogGroup[];
	ariaLabel: string;
	className?: string;
	placeholder?: string;
}) {
	// The selected option drives the trigger's swatch (SelectValue carries only the
	// label text, via each item's `textValue`, so the trigger swatch is explicit).
	const selected = React.useMemo(
		() => groups.flatMap((g) => g.options).find((o) => o.value === value),
		[groups, value],
	);
	const renderItem = (o: CatalogOption) => (
		<SelectItem key={o.value} value={o.value} textValue={o.label}>
			{o.swatch && <SwatchChip {...o.swatch} />}
			<span className="truncate">{o.label}</span>
		</SelectItem>
	);
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				aria-label={ariaLabel}
				className={cn('h-auto min-w-[120px] gap-2 border-border bg-background px-2 py-1 text-[12.5px] font-semibold text-[var(--text-heading)]', className)}
			>
				{selected?.swatch && <SwatchChip {...selected.swatch} />}
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent className="max-h-[60vh]">
				{groups.map((g) =>
					g.label ? (
						<SelectGroup key={g.label}>
							<SelectLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</SelectLabel>
							{g.options.map(renderItem)}
						</SelectGroup>
					) : (
						// Ungrouped block (the leading heads) — keyed by its first option's value.
						<React.Fragment key={g.options[0]?.value ?? 'heads'}>{g.options.map(renderItem)}</React.Fragment>
					),
				)}
			</SelectContent>
		</Select>
	);
}
