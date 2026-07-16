// The Studio spectrum catalog — DISPLAY metadata for the `spectrum:` STYLE axis (the deck's
// accent gradient: the section-edge bar AND every accent that reads the shared --spectrum
// token — table rails, timeline spines, code strips). Sibling of mode-catalog.ts (the
// rendering mode) and finish-catalog.ts (the backdrop). The engine's single source of truth
// for the value set is SPECTRUM_NAMES (lib/core/resolve-spectrum.js). THIS file adds only the
// human layer the picker needs (label, blurb, swatch) and MUST stay in step with
// SPECTRUM_NAMES — the catalog↔register rot-guard is spectrum-catalog.test.ts, mirroring
// mode-catalog.test.ts, and pairs with the register↔CSS rot-guard in
// test/unit/parsing/resolve-spectrum.test.js.
//
// The spectrum STYLE is authored deck-wide via the `spectrum:` front-matter register or
// per-slide via `_class: spectrum-solid` / `spectrum-duo` / `spectrum-mono` / `spectrum-off`.
// The orthogonal `spectrum-edge:` PLACEMENT register (top/left/right/bottom/off) is not a
// STYLE and is not cataloged here.

export type SpectrumEntry = {
	/** the `spectrum:` register value (and engine SPECTRUM_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip */
	swatch: { background: string; backgroundSize?: string };
};

// Ordered as the picker shows them. `on` is the named baseline (the rainbow default;
// omitting the key renders it).
export const SPECTRA: SpectrumEntry[] = [
	{
		name: 'on', label: 'Rainbow',
		blurb: 'The Lattice spectrum — the default 3-stop theme ribbon. Omitting the key renders it.',
		swatch: { background: 'var(--spectrum, linear-gradient(90deg,#0C141C,#3D6A82,#C0D2DC))' },
	},
	{
		name: 'solid', label: 'Solid accent',
		blurb: "One accent — white-label: set the theme's accent to a client's brand color.",
		swatch: { background: 'var(--accent)' },
	},
	{
		name: 'duo', label: 'Duo',
		blurb: "A two-tone gradient — the theme's accent into its own spectrum endpoint. Quieter than the rainbow.",
		swatch: { background: 'linear-gradient(90deg, var(--accent), var(--spectrum-end, var(--accent)))' },
	},
	{
		name: 'mono', label: 'Mono',
		blurb: 'A single-hue tint ramp — the most restrained accent, the accent fading into the canvas.',
		swatch: { background: 'linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 35%, var(--bg)))' },
	},
	{
		name: 'off', label: 'None',
		blurb: 'De-brand — every accent flattens to a quiet neutral hairline and the edge bar drops.',
		swatch: { background: 'var(--border)' },
	},
];

export const SPECTRUM_BY_NAME: Record<string, SpectrumEntry> = Object.fromEntries(
	SPECTRA.map((s) => [s.name, s]),
);

/** The active spectrum entry for a `spectrum:` value; unknown / empty → the `on` default. */
export function activeSpectrum(spectrum: string): SpectrumEntry {
	return SPECTRUM_BY_NAME[spectrum] ?? SPECTRUM_BY_NAME.on;
}
