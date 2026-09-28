// The Studio chart-finish catalog — DISPLAY metadata for the `chart-finish:` register (how
// every chart on the deck spends its color). Sibling of corners-catalog.ts / rule-catalog.ts.
// The engine's single source of truth is CHART_FINISH_NAMES (lib/core/resolve-chart-finish.js);
// THIS file adds only the human layer the picker needs. Rot-guard: chart-finish-catalog.test.ts.
//
// Authored deck-wide via `chart-finish:` or per-slide via `_class: chart-finish-<name>`;
// `chart-finish-off` is the per-slide token that takes one slide back to the shipped paint.

export type ChartFinishEntry = {
	/** the `chart-finish:` register value (and engine CHART_FINISH_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — three bars painted the way the finish paints a mark */
	swatch: { background: string; backgroundSize?: string };
};

// Three bars on the panel ground, at 22% / 50% / 78% across, rising to the right. Each finish
// draws them the way it paints a mark, so the chip is a miniature of the chart it produces.
//
// Each layer's SIZE travels in `backgroundSize`, never inside the shorthand: SwatchChip sets
// `background` and `backgroundSize` as two inline properties, and the second resets every
// layer's size to `auto` — measured in the Studio, where all three bars filled the whole chip.
// Bars stand on a baseline 12% up from the chip's bottom; `left` is the bar's left edge, in % of
// the chip.
const BARS = [
	{ left: 12, h: 42 },
	{ left: 40, h: 62 },
	{ left: 68, h: 82 },
].map((b) => ({ ...b, h: b.h * 0.88 }));
const W = 20;
const FLOOR = 12;
type Layer = { image: string; left: number; bottom: number; w: number; h: number };
const mixA = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, var(--bg))`;
const flat = (color: string) => `linear-gradient(${color}, ${color})`;
// A background-position percentage aligns the layer's own point with the box's, so a layer's
// offset from the top-left is `(100 - size) * p`. Solving for p places every layer by its box
// offset, which keeps an inset layer centered on the bar it sits in.
const at = (offset: number, size: number) => (size >= 100 ? 0 : +((offset / (100 - size)) * 100).toFixed(2));
function chip(layers: Layer[]): ChartFinishEntry['swatch'] {
	return {
		background: [...layers.map((l) => `${l.image} ${at(l.left, l.w)}% ${at(100 - l.bottom - l.h, l.h)}% no-repeat`), 'var(--bg)'].join(', '),
		backgroundSize: [...layers.map((l) => `${l.w}% ${+l.h.toFixed(2)}%`), 'auto'].join(', '),
	};
}
const bar = (image: string, b: (typeof BARS)[number], inset = 0): Layer =>
	({ image, left: b.left + inset, bottom: FLOOR + inset, w: W - 2 * inset, h: b.h - 2 * inset });

// Ordered as the picker shows them. `off` is the baseline (omitting the key renders it).
export const CHART_FINISHES: ChartFinishEntry[] = [
	{
		name: 'off', label: 'As designed',
		blurb: 'Each chart keeps the paint it was designed with — the default.',
		swatch: chip(BARS.map((b) => bar(`linear-gradient(var(--accent), ${mixA(35)})`, b))),
	},
	{
		name: 'pigment', label: 'Pigment',
		blurb: 'Identity in the body: full-strength, flat color under a fine edge. The colorful one.',
		swatch: chip(BARS.map((b) => bar(flat(mixA(82)), b))),
	},
	{
		name: 'etching', label: 'Etching',
		blurb: 'Identity in the line: a whisper of color under a doubled edge. The modern one.',
		// The pale body is drawn inset over a full-size bar of the edge color, which leaves the
		// edge showing around it: an outline, in gradients.
		swatch: chip(BARS.flatMap((b) => [
			bar(flat(mixA(22)), b, 5),
			bar(flat('var(--accent)'), b),
		])),
	},
	{
		name: 'tone', label: 'Tone',
		blurb: 'Identity in value: one hue in stepped shades, every name in its ink. The restrained one.',
		swatch: chip(BARS.map((b, i) => bar(flat(mixA([92, 60, 34][i])), b))),
	},
];

export const CHART_FINISHES_BY_NAME: Record<string, ChartFinishEntry> = Object.fromEntries(
	CHART_FINISHES.map((s) => [s.name, s]),
);

/** The active chart-finish entry for a value; unknown / empty → the `off` baseline. */
export function activeChartFinish(value: string | undefined | null): ChartFinishEntry {
	const key = (value ?? '').trim().toLowerCase();
	return CHART_FINISHES_BY_NAME[key] ?? CHART_FINISHES_BY_NAME.off;
}
