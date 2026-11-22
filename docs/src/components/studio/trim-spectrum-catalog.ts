// The Studio trim-spectrum catalog — DISPLAY metadata for `trim-spectrum:` (how much the deck's
// spectrum flows onto the STRUCTURAL accents: table-header rails, the list-steps timeline spine,
// code-panel strips, the `hr` rule, split-card underlines). Quiet by default — those accents render a
// quiet neutral hairline so a default deck stays elegant, and the spectrum lives on the slide edge
// alone. Sibling of spectrum-catalog.ts / card-spectrum-catalog.ts. The engine's single source of
// truth is TRIM_SPECTRUM_AXES.tier (lib/core/resolve-spectrum.js); the rot-guard is
// trim-spectrum-catalog.test.ts.
//
// Authored deck-wide via `trim-spectrum:` or per slide via `_class: trim-spectrum-full` /
// `trim-spectrum-restrained` / `trim-spectrum-quiet`.

export type TrimSpectrumEntry = {
	/** the `trim-spectrum:` word (a member of the engine's TRIM_SPECTRUM_AXES.tier) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a horizontal rule over the canvas, quiet or spectrum */
	swatch: { background: string; backgroundSize?: string };
};

// A centered horizontal rule chip, mirroring the structural accents (a table/hr rule).
const RULE = (fill: string) => `${fill} center / 70% 2px no-repeat, var(--bg)`;

// Ordered as the picker shows them. `quiet` is the baseline (a quiet neutral; the default).
export const TRIM_SPECTRA: TrimSpectrumEntry[] = [
	{
		name: 'quiet', label: 'Quiet',
		blurb: 'Structural accents stay a quiet accent-tinted hairline — the default. The full spectrum lives on the slide edge alone.',
		swatch: { background: RULE('linear-gradient(color-mix(in oklab, var(--accent) 60%, var(--border)), color-mix(in oklab, var(--accent) 60%, var(--border)))') },
	},
	{
		name: 'restrained', label: 'Restrained',
		blurb: 'A single-hue accent ramp on the structure — present but quiet, held constant regardless of the bar (a two-tier look that never clashes).',
		swatch: { background: RULE('linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 35%, var(--bg)))') },
	},
	{
		name: 'full', label: 'Full',
		blurb: 'Flow the deck’s full spectrum onto the structural accents — table rails, the timeline spine, code strips, and hr.',
		swatch: { background: RULE('var(--spectrum, linear-gradient(var(--accent), var(--accent)))') },
	},
];

export const TRIM_SPECTRUM_BY_NAME: Record<string, TrimSpectrumEntry> = Object.fromEntries(
	TRIM_SPECTRA.map((s) => [s.name, s]),
);

/** The active trim-spectrum entry for a word; unknown / empty → the `quiet` default. */
export function activeTrimSpectrum(value: string | undefined | null): TrimSpectrumEntry {
	const key = (value ?? '').trim().toLowerCase();
	return TRIM_SPECTRUM_BY_NAME[key] ?? TRIM_SPECTRUM_BY_NAME.quiet;
}
