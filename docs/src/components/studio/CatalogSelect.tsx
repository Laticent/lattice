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
import { AutoIcon, autoHeadLabel } from './auto-mark';

// ONE selector for every catalog-backed dimension — finish, brand bar (spectrum),
// mode, theme. Both the deck Inspector AND the slide Inspector render this same
// component, so the two can't drift and a picker is never rolled twice (HARD RULE
// #15). Built on the shared ui/select (shadcn) primitive; each dimension supplies
// its options as grouped {value,label,swatch} from its catalog, and the trigger +
// each row show the swatch preview so the visual grammar is identical everywhere.

export type CatalogSwatch = { background: string; backgroundSize?: string };
// `icon` renders in place of the swatch (an option whose preview is a glyph, not a
// color chip — e.g. the compact "Auto" row). Provide one OR the other, not both.
// `hint` is a muted second line shown in the open list only (who a venue is for); the
// closed trigger shows the label alone.
export type CatalogOption = { value: string; label: string; swatch?: CatalogSwatch; icon?: React.ReactNode; title?: string; hint?: string };
export type CatalogGroup = { label?: string; options: CatalogOption[] };

/** Map a catalog of `{name,label,swatch,blurb?}` entries (finish/spectrum/mode/…)
 *  to CatalogOptions, using the entry `name` as the value and its `blurb` as the
 *  row's hover title. The shared adapter so a caller never hand-rolls the mapping.
 *
 *  An entry carrying `autoLabel` is a register value whose own label is "Auto" (the
 *  heading rule's `auto`, the card rail's `auto`). As a row it reads as what it lands on
 *  (`Hairline`), because the word Auto belongs to the list's one head (`withAutoHead`):
 *  two rows both starting "Auto —" is what made the old lists hard to read. */
export function catalogOptions(
	entries: { name: string; label: string; autoLabel?: string; swatch: CatalogSwatch; blurb?: string }[],
	// A library icon to draw in place of the swatch, per entry name (`glyphs('edge')` from
	// option-glyphs.tsx). Passed in rather than imported, so the two modules stay acyclic.
	glyph?: (name: string) => React.ReactNode,
): CatalogOption[] {
	return entries.map((e) => ({
		value: e.name,
		label: e.autoLabel ?? e.label,
		swatch: e.swatch,
		icon: glyph?.(e.name),
		title: e.blurb,
	}));
}

/** The value of every Auto head in the deck scope. (The slide scope passes its own
 *  `__inherit__`, which its setters already read as "drop this slide's token".) */
export const AUTO_VALUE = '__auto__';

/**
 * THE list shape for every Settings picker, in both scopes: one `Auto — <resolved>` head
 * wearing the Auto glyph, then every other option.
 *
 * `resolved` is what the reader gets by leaving the control alone: the preset's value for
 * a preset register, the engine default for any other key, the deck's value on a slide.
 * Name it by `value` when Auto lands on one of the options, and that option leaves the
 * rest of the list, since choosing it would write nothing new (`writeRegister` drops a key
 * at its baseline). Name it by `label` when Auto lands on no single option ("Component":
 * each layout decides).
 */
export function withAutoHead(
	groups: CatalogGroup[],
	resolved: { value?: string | null; label?: string },
	opts: { value?: string; title?: string } = {},
): CatalogGroup[] {
	const hit = resolved.value == null ? undefined : groups.flatMap((g) => g.options).find((o) => o.value === resolved.value);
	const head: CatalogOption = { value: opts.value ?? AUTO_VALUE, label: autoHeadLabel(resolved.label ?? hit?.label), icon: <AutoIcon />, title: opts.title };
	const rest = groups
		.map((g) => ({ ...g, options: g.options.filter((o) => !hit || o.value !== hit.value) }))
		.filter((g) => g.options.length > 0);
	return [{ options: [head] }, ...rest];
}

/** The control's value for `withAutoHead`: nothing set, or set to what Auto already gives,
 *  selects the head. */
export function autoSelected(current: string | null | undefined, resolved: string | null | undefined, autoValue = AUTO_VALUE): string {
	return !current || current === resolved ? autoValue : current;
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
			// Only write `backgroundSize` when a catalog supplies one. Most swatches carry their
			// sizes INSIDE the `background` shorthand, and a shorthand holding `var()` stays
			// pending until computed time. React writes an undefined longhand as '', and that
			// empty write resets the pending shorthand's size to `auto` — so every bar, rule
			// and alignment preview filled its whole chip as a solid square.
			style={backgroundSize ? { background, backgroundSize } : { background }}
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
			{o.icon ?? (o.swatch && <SwatchChip {...o.swatch} shape={swatchShape} />)}
			{o.hint ? (
				<span className="flex min-w-0 flex-col">
					<span className="truncate">{o.label}</span>
					<span className="truncate text-[11px] text-muted-foreground in-data-[slot=select-trigger]:hidden">{o.hint}</span>
				</span>
			) : (
				<span className="truncate">{o.label}</span>
			)}
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
