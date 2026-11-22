// The Studio card-spectrum-edge catalog — DISPLAY metadata for the edge axis of `card-spectrum:`
// (WHERE the card stripe sits: left / top / right / bottom). Sibling of card-spectrum-catalog.ts
// (the stripe's STYLE). The engine's single source of truth for the word set is
// CARD_SPECTRUM_AXES.edge (lib/core/resolve-spectrum.js). THIS file adds only the human layer the
// picker needs; the rot-guard is card-spectrum-edge-catalog.test.ts.
//
// Authored deck-wide as the edge word on `card-spectrum:`, or per slide `_class: card-spectrum-top`
// etc. Only relevant when the card stripe is on (its style word is not `off`).

export type CardSpectrumEdgeEntry = {
	/** the `card-spectrum:` edge word (a member of the engine's CARD_SPECTRUM_AXES.edge) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a rail on the corresponding edge over a card face */
	swatch: { background: string; backgroundSize?: string };
};

const RAIL = 'linear-gradient(var(--accent), var(--accent))';
const CARD = 'var(--bg-alt, var(--bg))';

// Ordered as the picker shows them. `left` is the named baseline (the default; omit the key).
export const CARD_SPECTRUM_EDGES: CardSpectrumEdgeEntry[] = [
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

export const CARD_SPECTRUM_EDGE_BY_NAME: Record<string, CardSpectrumEdgeEntry> = Object.fromEntries(
	CARD_SPECTRUM_EDGES.map((s) => [s.name, s]),
);

/** The active spectrum-card-edge entry for a value; unknown / empty → the `left` default. */
export function activeCardSpectrumEdge(value: string | undefined | null): CardSpectrumEdgeEntry {
	const key = (value ?? '').trim().toLowerCase();
	return CARD_SPECTRUM_EDGE_BY_NAME[key] ?? CARD_SPECTRUM_EDGE_BY_NAME.left;
}
