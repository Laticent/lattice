// The Studio spectrum-trim catalog — DISPLAY metadata for the `spectrum-trim:` register (the
// opt-in that flows the deck's spectrum onto the STRUCTURAL accents: table-header rails, the
// list-steps timeline spine, code-panel strips, the `hr` rule, split-card underlines). Off by
// default — those accents render a quiet neutral hairline so a default deck stays elegant, and
// the spectrum lives on the brand bar alone. Sibling of spectrum-catalog.ts / spectrum-card-
// catalog.ts. The engine's single source of truth is SPECTRUM_TRIM_NAMES
// (lib/core/resolve-spectrum.js); the rot-guard is spectrum-trim-catalog.test.ts.
//
// Authored deck-wide via `spectrum-trim:` or per-slide via `_class: spectrum-trim` /
// `spectrum-trim-off`.

export type SpectrumTrimEntry = {
	/** the `spectrum-trim:` register value (and engine SPECTRUM_TRIM_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a horizontal rule over the canvas, quiet or spectrum */
	swatch: { background: string; backgroundSize?: string };
};

// A centered horizontal rule chip, mirroring the structural accents (a table/hr rule).
const RULE = (fill: string) => `${fill} center / 70% 2px no-repeat, var(--bg)`;

// Ordered as the picker shows them. `off` is the baseline (quiet neutral; the default).
export const SPECTRUM_TRIMS: SpectrumTrimEntry[] = [
	{
		name: 'off', label: 'Quiet',
		blurb: 'Structural accents stay a quiet accent-tinted hairline — the default. The full spectrum lives on the brand bar alone.',
		swatch: { background: RULE('linear-gradient(color-mix(in oklab, var(--accent) 60%, var(--border)), color-mix(in oklab, var(--accent) 60%, var(--border)))') },
	},
	{
		name: 'on', label: 'Spectrum',
		blurb: 'Flow the deck’s spectrum onto the structural accents — table rails, the timeline spine, code strips, and hr.',
		swatch: { background: RULE('var(--spectrum, linear-gradient(var(--accent), var(--accent)))') },
	},
];

export const SPECTRUM_TRIM_BY_NAME: Record<string, SpectrumTrimEntry> = Object.fromEntries(
	SPECTRUM_TRIMS.map((s) => [s.name, s]),
);

/** The active spectrum-trim entry for a value; unknown / empty → the `off` default. */
export function activeSpectrumTrim(value: string | undefined | null): SpectrumTrimEntry {
	const key = (value ?? '').trim().toLowerCase();
	return SPECTRUM_TRIM_BY_NAME[key] ?? SPECTRUM_TRIM_BY_NAME.off;
}
