// The Studio headline catalog — DISPLAY metadata for the `headline:` register (the horizontal
// alignment of a slide's framing-text cluster: auto / left / center / right). Sibling of
// eyebrow-catalog.ts, an accent-axis register. The engine's single source of truth is
// HEADLINE_NAMES (lib/core/resolve-headline.js). THIS file adds only the human layer the picker
// needs; the rot-guard is headline-catalog.test.ts.
//
// Authored deck-wide via `headline:` or per-slide via `_class: head-left`.

export type HeadlineEntry = {
	/** the `headline:` register value (and engine HEADLINE_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — stacked bars anchored to the value's edge, miming alignment */
	swatch: { background: string; backgroundSize?: string; backgroundPosition?: string; backgroundRepeat?: string };
};

const INK = 'var(--text-secondary)';
// Two stacked hairline bars (a "heading" + a shorter "line") anchored to one edge.
const bars = (pos: string) =>
	`linear-gradient(${INK}, ${INK}) ${pos} 38% / 62% 2.5px no-repeat, ` +
	`linear-gradient(${INK}, ${INK}) ${pos} 62% / 40% 2px no-repeat, var(--bg)`;

// Ordered as the picker shows them. `auto` is the named baseline (the component's own default).
export const HEADLINES: HeadlineEntry[] = [
	{
		name: 'auto', label: 'Auto',
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
	// `right` is a deferred follow-up (same box machinery as center, rarely wanted); the engine
	// ships `auto` / `left` / `center` today.
];

export const HEADLINE_BY_NAME: Record<string, HeadlineEntry> = Object.fromEntries(
	HEADLINES.map((s) => [s.name, s]),
);

/** The active headline entry for a value; unknown / empty → the `auto` default. */
export function activeHeadline(value: string | undefined | null): HeadlineEntry {
	const key = (value ?? '').trim().toLowerCase();
	return HEADLINE_BY_NAME[key] ?? HEADLINE_BY_NAME.auto;
}
