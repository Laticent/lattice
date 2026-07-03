// The Studio spectrum catalog — DISPLAY metadata for the `spectrum:` axis (the deck's
// white-label BRAND BAR: the rainbow bar on the top border / divider rail). Sibling of
// mode-catalog.ts (the rendering mode) and finish-catalog.ts (the backdrop). The engine's
// single source of truth for the value set is SPECTRUM_NAMES (lib/core/resolve-spectrum.js).
// THIS file adds only the human layer the picker needs (label, blurb, swatch) and MUST
// stay in step with SPECTRUM_NAMES — the catalog↔register rot-guard is
// spectrum-catalog.test.ts, mirroring mode-catalog.test.ts, and pairs with the
// register↔CSS rot-guard in test/unit/parsing/resolve-spectrum.test.js.
//
// The spectrum is authored deck-wide via the `spectrum:` front-matter register or
// per-slide via `_class: spectrum-off` / `spectrum-solid`.

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
		blurb: 'The Lattice spectrum — the default brand bar. Omitting the key renders it.',
		swatch: { background: 'var(--spectrum, linear-gradient(90deg,#0C141C,#3D6A82,#C0D2DC))' },
	},
	{
		name: 'off', label: 'None',
		blurb: 'No brand bar — a clean top edge and no divider rail. For a bare, unbranded deck.',
		swatch: { background: 'var(--bg)' },
	},
	{
		name: 'solid', label: 'Solid accent',
		blurb: "One accent bar — white-label: set the theme's accent to a client's brand color.",
		swatch: { background: 'var(--accent)' },
	},
];

export const SPECTRUM_BY_NAME: Record<string, SpectrumEntry> = Object.fromEntries(
	SPECTRA.map((s) => [s.name, s]),
);

/** The active spectrum entry for a `spectrum:` value; unknown / empty → the `on` default. */
export function activeSpectrum(spectrum: string): SpectrumEntry {
	return SPECTRUM_BY_NAME[spectrum] ?? SPECTRUM_BY_NAME.on;
}
