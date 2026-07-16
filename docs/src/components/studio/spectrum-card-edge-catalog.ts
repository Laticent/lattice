// The Studio spectrum-card-edge catalog — DISPLAY metadata for the `spectrum-card-edge:`
// PLACEMENT register (WHERE the card rail sits: left / top / right / bottom). Sibling of
// spectrum-card-catalog.ts (the rail STYLE). The engine's single source of truth for the value
// set is SPECTRUM_CARD_EDGE_NAMES (lib/core/resolve-spectrum.js). THIS file adds only the human
// layer the picker needs; the rot-guard is spectrum-card-edge-catalog.test.ts.
//
// Authored deck-wide via `spectrum-card-edge:` or per-slide via `_class: spectrum-card-edge-top`
// etc. Only relevant when the card rail is enabled (`spectrum-card:` ≠ off).

export type SpectrumCardEdgeEntry = {
	/** the `spectrum-card-edge:` register value (and engine SPECTRUM_CARD_EDGE_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a rail on the corresponding edge over a card face */
	swatch: { background: string; backgroundSize?: string };
};

const RAIL = 'linear-gradient(var(--accent), var(--accent))';
const CARD = 'var(--bg-alt, var(--bg))';

// Ordered as the picker shows them. `left` is the named baseline (the default; omit the key).
export const SPECTRUM_CARD_EDGES: SpectrumCardEdgeEntry[] = [
	{
		name: 'left', label: 'Left',
		blurb: 'A rail on the card’s left edge — the default. Omit the key.',
		swatch: { background: `${RAIL} left / 3px 100% no-repeat, ${CARD}` },
	},
	{
		name: 'top', label: 'Top',
		blurb: 'A rail across the card’s top edge.',
		swatch: { background: `${RAIL} top / 100% 3px no-repeat, ${CARD}` },
	},
	{
		name: 'right', label: 'Right',
		blurb: 'A rail on the card’s right edge.',
		swatch: { background: `${RAIL} right / 3px 100% no-repeat, ${CARD}` },
	},
	{
		name: 'bottom', label: 'Bottom',
		blurb: 'A rail across the card’s bottom edge.',
		swatch: { background: `${RAIL} bottom / 100% 3px no-repeat, ${CARD}` },
	},
];

export const SPECTRUM_CARD_EDGE_BY_NAME: Record<string, SpectrumCardEdgeEntry> = Object.fromEntries(
	SPECTRUM_CARD_EDGES.map((s) => [s.name, s]),
);

/** The active spectrum-card-edge entry for a value; unknown / empty → the `left` default. */
export function activeSpectrumCardEdge(value: string | undefined | null): SpectrumCardEdgeEntry {
	const key = (value ?? '').trim().toLowerCase();
	return SPECTRUM_CARD_EDGE_BY_NAME[key] ?? SPECTRUM_CARD_EDGE_BY_NAME.left;
}
