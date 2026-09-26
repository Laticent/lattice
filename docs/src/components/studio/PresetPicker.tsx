import { RotateCcw } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSettingsHit } from '@/components/ui/settings-view';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { PRESET_ENTRIES, presetSampleDeck } from './deck-preset';
import { PooledThumbFace, PreviewPool } from './preview-pool';

// The deck panel's Preset row — a 2×2 grid of live previews, not a dropdown.
//
// A dropdown of four names failed the one job a preset has: the owner could not tell the four
// apart. Each card is a LIVE render of one sample slide (deck-preset.ts `PRESET_SAMPLE`) under
// that preset, in the deck's own theme, color mode and size — a saved theme included — so the
// author picks by how the preset will look on THEIR deck, and the tiles follow a theme or mode
// change the moment it happens. The frames come from a shared `PreviewPool`, the same machinery
// the Reshape picker uses: WebKit never gives a torn-down preview document back, so a picker
// must re-point a small fixed set of frames rather than mount its own.
//
// It is a real radiogroup (ui/radio-group — one of four, never none). Like a native radio, an
// arrow key moves AND selects, which is why a pick never deletes anything the author wrote
// (deck-preset.ts `applyPreset`): walking the grid only switches `preset:`, and one Undo or a
// second arrow press takes it back.
// engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md §7.
export function PresetPicker({
	value,
	drift,
	onValueChange,
	onReset,
	frontMatter,
	options,
	paletteOverride,
	extraTheme,
	modeOverride,
	extraCss,
}: {
	value: string;
	/** How many family keys the deck sets away from its preset. */
	drift: number;
	onValueChange: (name: string) => void;
	onReset: () => void;
	/** The deck's own front-matter block, so each tile renders in the deck's theme, mode and size. */
	frontMatter: string;
	options: SingleSlideOptions;
	/** The same resolved theme the main preview renders with (StudioShell `preview`). */
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	extraCss?: string;
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
			<PreviewPool>
			<RadioGroup aria-label="Choose preset" value={current.name} onValueChange={onValueChange} className="mt-1.5 grid grid-cols-2 gap-2">
				{PRESET_ENTRIES.map((e) => (
					<RadioGroupItem
						key={e.name}
						value={e.name}
						aria-label={e.label}
						title={e.blurb}
						className="flex flex-col items-stretch gap-1 rounded-lg border border-border bg-background p-1 text-left hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)]"
					>
						{/* An empty box — the pixels come from a pooled frame positioned over it. A
						    catalog sample the author did not write, so `specimen` silences the engine's
						    authoring alarms. */}
						<PooledThumbFace
							options={options}
							sample={presetSampleDeck(frontMatter, e.name)}
							paletteOverride={paletteOverride}
							extraTheme={extraTheme}
							modeOverride={modeOverride}
							extraCss={extraCss}
							specimen
							className="pointer-events-none aspect-video w-full"
						/>
						<span className="truncate px-0.5 text-[12px] font-semibold text-[var(--text-heading)]">
							{e.label}
							{drift > 0 && e.name === current.name && <span className="font-normal text-muted-foreground"> · {drift} {drift === 1 ? 'change' : 'changes'}</span>}
						</span>
					</RadioGroupItem>
				))}
			</RadioGroup>
			</PreviewPool>
			<p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>
			{drift > 0 && (
				<button type="button" onClick={onReset} className="mt-1 inline-flex items-center gap-1 rounded-md text-[11px] font-semibold text-[var(--accent)] hover:underline">
					<RotateCcw className="size-3" />Reset to {current.label}
				</button>
			)}
		</div>
	);
}
