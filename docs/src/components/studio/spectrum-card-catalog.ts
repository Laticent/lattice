// The Studio spectrum-card catalog — DISPLAY metadata for the `spectrum-card:` register (the
// card rail's STYLE: off / auto / solid / duo / mono / rainbow — an INDEPENDENT accent on card
// surfaces, tunable orthogonally to the deck's section-bar spectrum). Sibling of
// spectrum-catalog.ts and spectrum-card-edge-catalog.ts (the rail's PLACEMENT). The engine's
// single source of truth is SPECTRUM_CARD_NAMES (lib/core/resolve-spectrum.js). THIS file adds
// only the human layer the picker needs; the rot-guard is spectrum-card-catalog.test.ts.
//
// Authored deck-wide via `spectrum-card:` or per-slide via `_class: spectrum-card` /
// `spectrum-card-solid` / `spectrum-card-off` etc.

export type SpectrumCardEntry = {
	/** the `spectrum-card:` register value (and engine SPECTRUM_CARD_NAMES member) */
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
export const SPECTRUM_CARDS: SpectrumCardEntry[] = [
	{
		name: 'off', label: 'None',
		blurb: 'No card rail — the default. No card gets a spectrum rail.',
		swatch: { background: 'var(--bg-alt, var(--bg))' },
	},
	{
		name: 'auto', label: 'Auto',
		blurb: 'A rail that follows the deck’s spectrum style — the on-brand default when enabled.',
		swatch: { background: RAIL('var(--spectrum-vertical, var(--spectrum, linear-gradient(var(--accent), var(--accent))))') },
	},
	{
		name: 'solid', label: 'Solid',
		blurb: 'Pin the rail to the theme’s distinctive solid accent, independent of the bar.',
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
		blurb: 'Pin the rail to the theme’s full rainbow ribbon, even when the bar is quieter.',
		swatch: { background: RAIL('var(--spectrum-vertical, var(--spectrum, linear-gradient(var(--accent), var(--accent))))') },
	},
];

export const SPECTRUM_CARD_BY_NAME: Record<string, SpectrumCardEntry> = Object.fromEntries(
	SPECTRUM_CARDS.map((s) => [s.name, s]),
);

/** The active spectrum-card entry for a value; unknown / empty → the `off` default. */
export function activeSpectrumCard(value: string | undefined | null): SpectrumCardEntry {
	const key = (value ?? '').trim().toLowerCase();
	return SPECTRUM_CARD_BY_NAME[key] ?? SPECTRUM_CARD_BY_NAME.off;
}
