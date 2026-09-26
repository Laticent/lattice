import { RotateCcw } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSettingsHit } from '@/components/ui/settings-view';
import { cn } from '@/lib/utils';
import { PRESET_ENTRIES } from './deck-preset';

// The deck panel's Preset row — a 2×2 grid of pictures, not a dropdown.
//
// A dropdown of four names failed the one job a preset has: the owner could not tell the four
// apart. Each card shows the SAME sample slide rendered with that preset
// (tools/build-preset-thumbs.mjs → docs/public/presets/<name>.webp), so the author picks by
// look. It is a real radiogroup (ui/radio-group — one of four, never none): arrow keys move,
// Space picks. Minimal's picture takes rounded corners, because rounded corners are part of
// what Minimal sets and the rendered PNG cannot carry them.
// engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md §8.
export function PresetPicker({
	value,
	drift,
	onValueChange,
	onReset,
}: {
	value: string;
	/** How many family keys the deck sets away from its preset. */
	drift: number;
	onValueChange: (name: string) => void;
	onReset: () => void;
}) {
	const current = PRESET_ENTRIES.find((e) => e.name === value) ?? PRESET_ENTRIES[0];
	const desc = drift ? `${drift} ${drift === 1 ? 'setting differs' : 'settings differ'} from ${current.label}.` : 'A named look: alignment, backdrop, bar, rules and cards.';
	const hit = useSettingsHit('Preset', desc, 'look style template starting point');
	if (!hit) return null;
	return (
		<div {...hit} className="my-2">
			<span className="text-[12.5px] text-foreground">
				Preset
				<HelpTip label="More about Preset">
					Sets eleven look settings at once — the backdrop, headline alignment, brand bar, card rails, trim, heading rule, eyebrow, card lift and corners. <strong>Classic</strong> is the house default. Change any of those settings afterwards and it overrides the preset; the theme, header, footer and logo are never touched.
				</HelpTip>
			</span>
			<RadioGroup aria-label="Choose preset" value={current.name} onValueChange={onValueChange} className="mt-1.5 grid grid-cols-2 gap-2">
				{PRESET_ENTRIES.map((e) => (
					<RadioGroupItem
						key={e.name}
						value={e.name}
						aria-label={e.label}
						title={e.blurb}
						className="flex flex-col items-stretch gap-1 rounded-lg border border-border bg-background p-1 text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)]"
					>
						<img
							src={`/presets/${e.name}.webp`}
							alt=""
							width={160}
							height={90}
							loading="lazy"
							decoding="async"
							className={cn('aspect-video h-auto w-full border border-border/60 bg-white object-cover', e.name === 'minimal' ? 'rounded-lg' : 'rounded-[3px]')}
						/>
						<span className="truncate px-0.5 text-[12px] font-semibold text-[var(--text-heading)]">
							{e.label}
							{drift > 0 && e.name === current.name && <span className="font-normal text-muted-foreground"> · {drift} {drift === 1 ? 'change' : 'changes'}</span>}
						</span>
					</RadioGroupItem>
				))}
			</RadioGroup>
			<p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>
			{drift > 0 && (
				<button type="button" onClick={onReset} className="mt-1 inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-[var(--accent)] hover:underline">
					<RotateCcw className="size-3" />Reset to {current.label}
				</button>
			)}
		</div>
	);
}
