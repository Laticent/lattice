import { Shapes } from 'lucide-react';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tip } from '@/components/ui/tooltip';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { getClassTokens } from './slide-directives';
import { SlideThumbFace, useInView } from './slide-thumb';
import { applyVariant, componentLooks, type VariantAxis, variantActive, variantNoop } from './slide-variants';

// Reshape — recast the CURRENT slide to a different variant look (the edit-mode
// sibling of Insert). A variant is just a class token, so this previews the user's
// OWN slide content in each look and, on pick, swaps the token in place — axis-aware,
// so you never end up with two members of the same family. See
// engineering/decisions/2026-07-18-slide-variants-in-gallery.md.

export function ReshapePicker({ chunk, variants, axes, variantAxes, options, frontMatter, paletteOverride, extraTheme, modeOverride, extraCss, onReshape, compact }: {
	/** The current slide's source chunk. */
	chunk: string;
	/** The current component's variant tokens (its offered looks). */
	variants: string[];
	/** Exclusive-axis groups (from lintVocab) — decides replace-vs-stack. */
	axes: Record<string, readonly string[]>;
	/** The component's OWN axes (manifest `variantAxes`) — the more specific answer. */
	variantAxes: readonly VariantAxis[];
	options: SingleSlideOptions;
	frontMatter?: string;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	extraCss?: string;
	/** Apply a look to the current slide (empty token = back to the default look). */
	onReshape: (token: string) => void;
	compact?: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const component = getClassTokens(chunk)[0] ?? '';
	const looks = React.useMemo(() => componentLooks(variants, axes, variantAxes), [variants, axes, variantAxes]);
	const tokens = React.useMemo(() => new Set(getClassTokens(chunk)), [chunk]);
	// Is any real look on? Decides whether DEFAULT may claim the badge (see the tile map).
	const anyLookOn = looks.some((l) => variantActive(tokens, l.token));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tip label="Reshape — recast this slide to another look">
				<PopoverTrigger asChild>
					<button type="button" aria-label="Reshape slide" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)]">
						<Shapes className="size-3" />
						<span className={cn(!compact && 'hidden @[36rem]:inline')}>Reshape</span>
					</button>
				</PopoverTrigger>
			</Tip>
			<PopoverContent align="end" className="w-[min(94vw,720px)] p-3">
				<div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
					<Shapes className="size-3 text-[var(--accent)]" />
					Reshape <span className="text-[var(--text-heading)]">{component || 'slide'}</span> › pick a look
					<span className="normal-case tracking-normal">— {looks.length - 1} variant{looks.length - 1 === 1 ? '' : 's'}</span>
				</div>
				<div className="grid max-h-[60vh] grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain [touch-action:pan-y] sm:grid-cols-3 lg:grid-cols-4">
					{looks.map((look) => {
						// "Current" means CLICKING CHANGES NOTHING, not "this token is present": the two
						// came apart on the Default tile, which restores an axis default, so on a bare
						// `map` it claimed to be current and then rewrote `_class` to `map world`. Ask
						// the model rather than guessing from the token set.
						const next = applyVariant(chunk, look.token, axes, variants, variantAxes);
						// …but a no-op is not enough for DEFAULT on its own. On `map world` both Default
						// and the `world` tile are no-ops, and badging both put two "Current" tiles in one
						// pick-one family. The look that is actually on wins; Default claims the badge
						// only when no look is on AND clicking it really would do nothing.
						const on = look.token ? next === chunk : !anyLookOn && variantNoop(chunk, '', axes, variants, variantAxes);
						// An active TOGGLE is the one tile whose click is deliberately destructive: it
						// removes the look. Preview the slide as it stands (previewing it turned off
						// reads as the wrong slide) and say so — in the label AND on the badge, since
						// an accessible name alone leaves a sighted author no warning at all.
						const removes = !!look.token && !look.exclusive && variantActive(tokens, look.token);
						return (
							<ReshapeTile
								key={look.token || '__default'}
								sample={(frontMatter ?? '') + (removes || on ? chunk : next)}
								label={look.token ? look.label : 'Default'}
								actionLabel={removes ? `Remove ${look.label}` : `Reshape to ${look.token ? look.label : 'Default'}`}
								badge={removes ? 'Current ×' : on ? 'Current' : ''}
								active={on || removes}
								options={options}
								paletteOverride={paletteOverride}
								extraTheme={extraTheme}
								modeOverride={modeOverride}
								extraCss={extraCss}
								onClick={() => {
									onReshape(look.token);
									setOpen(false);
								}}
							/>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ReshapeTile({ sample, label, actionLabel, badge, active, options, paletteOverride, extraTheme, modeOverride, extraCss, onClick }: { sample: string; label: string; actionLabel: string; badge: string; active: boolean; options: SingleSlideOptions; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; onClick: () => void }) {
	const [ref, visible] = useInView<HTMLButtonElement>();
	return (
		<button
			type="button"
			ref={ref}
			onClick={onClick}
			aria-label={actionLabel}
			aria-pressed={active}
			className={cn('relative overflow-hidden rounded-lg border-2 bg-card text-left transition-colors focus-visible:outline-none', active ? 'border-[var(--accent)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]')}
		>
			<SlideThumbFace options={options} sample={sample} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} active={visible} className="pointer-events-none aspect-video w-full" />
			<div className="truncate px-1.5 py-1 font-mono text-[9.5px] font-semibold text-[var(--text-heading)]">{label}</div>
			{!!badge && <span className="absolute right-1 top-1 rounded bg-[var(--accent)] px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-[var(--on-accent)]">{badge}</span>}
		</button>
	);
}
