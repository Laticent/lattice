// The Studio spectrum-card catalog — DISPLAY metadata for the `spectrum-card:` register (an
// opt-in spectrum rail on card surfaces: off / on). Sibling of spectrum-catalog.ts. The
// engine's single source of truth is SPECTRUM_CARD_NAMES (lib/core/resolve-spectrum.js). THIS
// file adds only the human layer the picker needs; the rot-guard is spectrum-card-catalog.test.ts.
//
// Authored deck-wide via `spectrum-card:` or per-slide via `_class: spectrum-card` /
// `spectrum-card-off`.

export type SpectrumCardEntry = {
	/** the `spectrum-card:` register value (and engine SPECTRUM_CARD_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a card face, optionally with a left rail */
	swatch: { background: string; backgroundSize?: string };
};

// Ordered as the picker shows them. `off` is the baseline (no card rail; the default).
export const SPECTRUM_CARDS: SpectrumCardEntry[] = [
	{
		name: 'off', label: 'None',
		blurb: 'No card rail — the default. No card gets a spectrum rail.',
		swatch: { background: 'var(--bg-alt, var(--bg))' },
	},
	{
		name: 'on', label: 'Rail',
		blurb: 'A spectrum rail on every card surface. Reads the deck’s spectrum style.',
		swatch: { background: 'linear-gradient(var(--accent), var(--accent)) left / 3px 100% no-repeat, var(--bg-alt, var(--bg))' },
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
