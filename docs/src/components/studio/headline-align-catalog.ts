// The Studio headline catalog — DISPLAY metadata for the `headline-align:` register (the horizontal
// alignment of a slide's framing-text cluster: auto / left / center / right). Sibling of
// eyebrow-catalog.ts, an accent-axis register. The engine's single source of truth is
// HEADLINE_ALIGN_NAMES (lib/core/resolve-headline-align.js). THIS file adds only the human layer the picker
// needs; the rot-guard is headline-align-catalog.test.ts.
//
// Authored deck-wide via `headline-align:` or per-slide via `_class: headline-align-left`.

export type HeadlineAlignEntry = {
	/** the `headline-align:` register value (and engine HEADLINE_ALIGN_NAMES member) */
	name: string;
	label: string;
	/** For an entry whose own label is "Auto": what auto RESOLVES to, for the
	 *  `Auto — <resolved>` head. Without it that head reads "Auto — Auto"
	 *  (see autoHeadLabel in auto-mark.tsx). */
	autoLabel?: string;
	blurb: string;
	/** CSS for the preview chip — stacked bars anchored to the value's edge, miming alignment */
	swatch: { background: string; backgroundSize?: string; backgroundPosition?: string; backgroundRepeat?: string };
};

// --text-secondary is a slide-theme token NOT emitted on the docs chrome (it isn't in
// PORTAL_TOKENS, and not every base palette defines it — so it can't be added without a
// throw). Fall back to --text-muted, which IS a chrome token, so these preview swatches
// stay visible when rendered outside a slide. (Gotchas: "Chrome tokens are the
// PORTAL_TOKENS subset".)
const INK = 'var(--text-secondary, var(--text-muted))';
// Two stacked hairline bars (a "heading" + a shorter "line") anchored to one edge.
const bars = (pos: string) =>
	`linear-gradient(${INK}, ${INK}) ${pos} 38% / 62% 2.5px no-repeat, ` +
	`linear-gradient(${INK}, ${INK}) ${pos} 62% / 40% 2px no-repeat, var(--bg)`;

// Ordered as the picker shows them. `auto` is the named baseline (the component's own default).
export const HEADLINE_ALIGNS: HeadlineAlignEntry[] = [
	{
		name: 'auto', label: 'Auto', autoLabel: 'Component',
		blurb: "Respect the component — left masthead, centered title. The default.",
		// A split chip: left bar over a centered bar, hinting "each component decides."
		swatch: { background: `linear-gradient(${INK}, ${INK}) left 38% / 55% 2.5px no-repeat, linear-gradient(${INK}, ${INK}) center 62% / 38% 2px no-repeat, var(--bg)` },
	},
	{
		name: 'left', label: 'Left',
		blurb: 'Pin the framing cluster to the left margin.',
		swatch: { background: bars('left') },
	},
	{
		name: 'center', label: 'Center',
		blurb: 'Center the framing cluster — even on a layout that lefts by default.',
		swatch: { background: bars('center') },
	},
	{
		name: 'right', label: 'Right',
		blurb: 'Right-align the framing cluster — the rare escape hatch.',
		swatch: { background: bars('right') },
	},
];

export const HEADLINE_BY_NAME: Record<string, HeadlineAlignEntry> = Object.fromEntries(
	HEADLINE_ALIGNS.map((s) => [s.name, s]),
);

/** The active headline entry for a value; unknown / empty → the `auto` default. */
export function activeHeadlineAlign(value: string | undefined | null): HeadlineAlignEntry {
	const key = (value ?? '').trim().toLowerCase();
	return HEADLINE_BY_NAME[key] ?? HEADLINE_BY_NAME.auto;
}
