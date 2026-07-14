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
export type CatalogOption = { value: string; label: string; swatch?: CatalogSwatch; title?: string };
export type CatalogGroup = { label?: string; options: CatalogOption[] };

/** Map a catalog of `{name,label,swatch,blurb?}` entries (finish/spectrum/mode/…)
 *  to CatalogOptions, using the entry `name` as the value and its `blurb` as the
 *  row's hover title. The shared adapter so a caller never hand-rolls the mapping. */
export function catalogOptions(entries: { name: string; label: string; swatch: CatalogSwatch; blurb?: string }[]): CatalogOption[] {
	return entries.map((e) => ({ value: e.name, label: e.label, swatch: e.swatch, title: e.blurb }));
}

// The preview chip — a small swatch rendering the option's CSS background (a finish
// texture, a spectrum gradient, a palette accent). `shape` matches each dimension's
// existing grammar: a rounded square for textures/gradients, a round dot for a
// theme's accent color — so every surface reads as one.
export type SwatchShape = 'square' | 'round';
export function SwatchChip({ background, backgroundSize, shape = 'square', className }: CatalogSwatch & { shape?: SwatchShape; className?: string }) {
	return (
		<span
			className={cn(
				'shrink-0 border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]',
				shape === 'round' ? 'size-3.5 rounded-full' : 'size-4 rounded-[3px]',
				className,
			)}
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
	swatchShape = 'square',
}: {
	value: string;
	onValueChange: (v: string) => void;
	groups: CatalogGroup[];
	ariaLabel: string;
	className?: string;
	placeholder?: string;
	swatchShape?: SwatchShape;
}) {
	// Radix `SelectValue` renders the SELECTED item's content in the trigger — so
	// the swatch + label come from the item itself. Do NOT also render a swatch
	// here, or the trigger doubles it (swatch swatch label).
	const renderItem = (o: CatalogOption) => (
		<SelectItem key={o.value} value={o.value} textValue={o.label} title={o.title}>
			{o.swatch && <SwatchChip {...o.swatch} shape={swatchShape} />}
			<span className="truncate">{o.label}</span>
		</SelectItem>
	);
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				aria-label={ariaLabel}
				className={cn('h-auto min-w-[120px] gap-2 border-border bg-background px-2 py-1 text-[12.5px] font-semibold text-[var(--text-heading)]', className)}
			>
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
