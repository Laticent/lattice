// The Studio spectrum-weight catalog — DISPLAY metadata for the weight axis that `spectrum:` and
// `card-spectrum:` share (how thick the stripe is: regular / hairline / band). The engine's single
// source of truth for the word set is SPECTRUM_AXES.weight (lib/core/resolve-spectrum.js), the same
// list as CARD_SPECTRUM_AXES.weight. THIS file adds only the human layer the picker needs (label,
// blurb, swatch); the rot-guard is spectrum-weight-catalog.test.ts.
//
// The widths are the engine's (lib/base/base.elements.css, base.accent-finish.css): about 4px, 1px and
// 19px for the slide edge on a 1280px slide, and 4px, 2px and 10px for a card stripe.

export type SpectrumWeightEntry = {
	/** the weight word (a member of the engine's SPECTRUM_AXES.weight) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a stripe of that weight along the top of the canvas */
	swatch: { background: string; backgroundSize?: string };
};

const BAR = 'linear-gradient(var(--accent), var(--accent))';

// Ordered as the picker shows them. `regular` is the named baseline (the default).
export const SPECTRUM_WEIGHTS: SpectrumWeightEntry[] = [
	{
		name: 'regular', label: 'Regular',
		blurb: 'The stripe at its usual width — the default.',
		swatch: { background: `${BAR} top / 100% 3px no-repeat, var(--bg)` },
	},
	{
		name: 'hairline', label: 'Hairline',
		blurb: 'A one-pixel line: the quietest stripe.',
		swatch: { background: `${BAR} top / 100% 1px no-repeat, var(--bg)` },
	},
	{
		name: 'band', label: 'Band',
		blurb: 'A heavy band, about five times the usual width.',
		swatch: { background: `${BAR} top / 100% 7px no-repeat, var(--bg)` },
	},
];

export const SPECTRUM_WEIGHT_BY_NAME: Record<string, SpectrumWeightEntry> = Object.fromEntries(
	SPECTRUM_WEIGHTS.map((s) => [s.name, s]),
);

/** The active weight entry for a word; unknown / empty → the `regular` default. */
export function activeSpectrumWeight(value: string | undefined | null): SpectrumWeightEntry {
	const key = (value ?? '').trim().toLowerCase();
	return SPECTRUM_WEIGHT_BY_NAME[key] ?? SPECTRUM_WEIGHT_BY_NAME.regular;
}
