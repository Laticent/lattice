// The Studio card-spectrum catalog — DISPLAY metadata for the style axis of `card-spectrum:` (the
// card stripe's STYLE: off / match / rainbow / solid / duo / mono — an INDEPENDENT accent on card
// surfaces, tunable apart from the slide edge's `spectrum:`). Sibling of spectrum-catalog.ts and
// card-spectrum-edge-catalog.ts (the stripe's EDGE). The engine's single source of truth is
// CARD_SPECTRUM_AXES.style (lib/core/resolve-spectrum.js). THIS file adds only the human layer the
// picker needs; the rot-guard is card-spectrum-catalog.test.ts.
//
// Authored deck-wide as the style word on `card-spectrum:`, or per slide `_class: with-card-spectrum`
// (match) / `card-spectrum-solid` / `no-card-spectrum` etc.

export type CardSpectrumEntry = {
	/** the `card-spectrum:` style word (a member of the engine's CARD_SPECTRUM_AXES.style) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a card face, optionally with a left rail */
	swatch: { background: string; backgroundSize?: string };
};

// A left-rail chip over the card face: a 3px vertical rail on the left, matching the rendered
// rail's default placement. `img` is a full background-image (a gradient or the --spectrum
// token, which is itself a gradient). Keeps the swatches in step with the engine fills.
const RAIL = (img: string) =>
	`${img} left / 3px 100% no-repeat, var(--bg-alt, var(--bg))`;

// Ordered as the picker shows them. `off` is the baseline (no card rail; the default).
export const CARD_SPECTRA: CardSpectrumEntry[] = [
	{
		name: 'off', label: 'None',
		blurb: 'No card stripe — the default.',
		swatch: { background: 'var(--bg-alt, var(--bg))' },
	},
	{
		name: 'match', label: 'Match',
		blurb: 'A stripe that follows the slide edge’s spectrum style — the on-brand choice when enabled.',
		swatch: { background: RAIL('var(--spectrum-vertical, var(--spectrum, linear-gradient(var(--accent), var(--accent))))') },
	},
	{
		name: 'solid', label: 'Solid',
		blurb: 'Pin the rail to the theme’s distinctive solid accent, independent of the slide edge.',
		swatch: { background: RAIL('linear-gradient(var(--spectrum-solid, var(--accent)), var(--spectrum-solid, var(--accent)))') },
	},
	{
		name: 'duo', label: 'Duo',
		blurb: 'Pin the rail to a two-tone gradient — the accent into the theme’s spectrum endpoint.',
		swatch: { background: RAIL('linear-gradient(var(--accent), var(--spectrum-end, var(--accent)))') },
	},
	{
		name: 'mono', label: 'Mono',
		blurb: 'Pin the rail to a quiet accent tint ramp — the most restrained fill.',
		swatch: { background: RAIL('linear-gradient(var(--accent), color-mix(in oklab, var(--accent) 35%, var(--bg)))') },
	},
	{
		name: 'rainbow', label: 'Rainbow',
		blurb: 'Pin the rail to the theme’s full rainbow ribbon, even when the slide edge is quieter.',
		swatch: { background: RAIL('var(--spectrum-vertical, var(--spectrum, linear-gradient(var(--accent), var(--accent))))') },
	},
];

export const CARD_SPECTRUM_BY_NAME: Record<string, CardSpectrumEntry> = Object.fromEntries(
	CARD_SPECTRA.map((s) => [s.name, s]),
);

/** The active card-spectrum style entry for a word; unknown / empty → the `off` default. */
export function activeCardSpectrum(value: string | undefined | null): CardSpectrumEntry {
	const key = (value ?? '').trim().toLowerCase();
	return CARD_SPECTRUM_BY_NAME[key] ?? CARD_SPECTRUM_BY_NAME.off;
}
