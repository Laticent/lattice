// The Studio trim-spectrum catalog — DISPLAY metadata for `trim-spectrum:` (the STYLE of the
// structural accents: table-header rails, the list-steps timeline spine, code-panel strips, the `hr`
// rule, split-card underlines). Quiet by default — those accents render a quiet accent-tinted hairline
// so a default deck stays elegant. Each other word names the trim's own fill; none copies the slide
// edge's `spectrum:`. Sibling of spectrum-catalog.ts / card-spectrum-catalog.ts. The engine's single
// source of truth is TRIM_SPECTRUM_AXES.style (lib/core/resolve-spectrum.js); the rot-guard is
// trim-spectrum-catalog.test.ts.
//
// Authored deck-wide via `trim-spectrum:` or per slide via `_class: trim-spectrum-<style>`.

export type TrimSpectrumEntry = {
	/** the `trim-spectrum:` word (a member of the engine's TRIM_SPECTRUM_AXES.style) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a horizontal rule over the canvas */
	swatch: { background: string; backgroundSize?: string };
};

// A centered horizontal rule chip, mirroring the structural accents (a table/hr rule).
const RULE = (fill: string) => `${fill} center / 70% 2px no-repeat, var(--bg)`;

// Ordered as the picker shows them. `quiet` is the baseline (the default).
export const TRIM_SPECTRA: TrimSpectrumEntry[] = [
	{
		name: 'quiet', label: 'Quiet',
		blurb: 'Structural accents stay a quiet accent-tinted hairline — the default.',
		swatch: { background: RULE('linear-gradient(color-mix(in oklab, var(--accent) 60%, var(--border)), color-mix(in oklab, var(--accent) 60%, var(--border)))') },
	},
	{
		name: 'rainbow', label: 'Rainbow',
		blurb: 'The theme’s full rainbow ribbon on table rails, the timeline spine, code strips and rules.',
		swatch: { background: RULE('var(--spectrum, linear-gradient(var(--accent), var(--accent)))') },
	},
	{
		name: 'solid', label: 'Solid',
		blurb: 'The theme’s distinctive solid accent on the structure.',
		swatch: { background: RULE('linear-gradient(var(--spectrum-solid, var(--accent)), var(--spectrum-solid, var(--accent)))') },
	},
	{
		name: 'duo', label: 'Duo',
		blurb: 'A two-tone gradient — the accent into the theme’s spectrum endpoint.',
		swatch: { background: RULE('linear-gradient(90deg, var(--accent), var(--spectrum-end, var(--accent)))') },
	},
	{
		name: 'mono', label: 'Mono',
		blurb: 'A single-hue accent ramp — present but quiet, and it never clashes with the slide edge.',
		swatch: { background: RULE('linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 35%, var(--bg)))') },
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
