// The Studio spectrum-edge catalog — DISPLAY metadata for the edge axis of `spectrum:` (WHERE
// the slide-edge stripe sits: top / left / right / bottom). Sibling of spectrum-catalog.ts (the
// STYLE). The engine's single source of truth for the word set is SPECTRUM_AXES.edge
// (lib/core/resolve-spectrum.js). THIS file adds only the human layer the picker needs (label,
// blurb, swatch) and MUST stay in step — the rot-guard is spectrum-edge-catalog.test.ts. The
// stripe's off is the style word `off` (`spectrum: off`), not an edge.
//
// Authored deck-wide as the edge word on `spectrum:`, or per slide `_class: spectrum-left` etc.

export type SpectrumEdgeEntry = {
	/** the `spectrum:` edge word (a member of the engine's SPECTRUM_AXES.edge) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a bar on the corresponding edge over the canvas */
	swatch: { background: string; backgroundSize?: string };
};

const BAR = 'linear-gradient(var(--accent), var(--accent))';

// Ordered as the picker shows them. `top` is the named baseline (the default; omit the key).
export const SPECTRUM_EDGES: SpectrumEdgeEntry[] = [
	{
		name: 'top', label: 'Top',
		blurb: 'The bar on the top edge — the default. Omit the key.',
		swatch: { background: `${BAR} top / 100% 3px no-repeat, var(--bg)` },
	},
	{
		name: 'left', label: 'Left',
		blurb: 'A left rail (the divider look, generalized to any slide).',
		swatch: { background: `${BAR} left / 3px 100% no-repeat, var(--bg)` },
	},
	{
		name: 'right', label: 'Right',
		blurb: 'A right rail.',
		swatch: { background: `${BAR} right / 3px 100% no-repeat, var(--bg)` },
	},
	{
		name: 'bottom', label: 'Bottom',
		blurb: 'A bottom rail — reads as a baseline.',
		swatch: { background: `${BAR} bottom / 100% 3px no-repeat, var(--bg)` },
	},
];

export const SPECTRUM_EDGE_BY_NAME: Record<string, SpectrumEdgeEntry> = Object.fromEntries(
	SPECTRUM_EDGES.map((s) => [s.name, s]),
);

/** The active spectrum-edge entry for a value; unknown / empty → the `top` default. */
export function activeSpectrumEdge(value: string | undefined | null): SpectrumEdgeEntry {
	const key = (value ?? '').trim().toLowerCase();
	return SPECTRUM_EDGE_BY_NAME[key] ?? SPECTRUM_EDGE_BY_NAME.top;
}
