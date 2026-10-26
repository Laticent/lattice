// The Studio marks catalog — DISPLAY metadata for the `marks:` register (how
// every chart on the deck spends its color). Sibling of corners-catalog.ts / rule-catalog.ts.
// The engine's single source of truth is MARKS_NAMES (lib/core/resolve-marks.js);
// THIS file adds only the human layer the picker needs. Rot-guard: marks-catalog.test.ts.
//
// Authored deck-wide via `marks:` or per-slide via `_class: marks-<name>`. Like
// `icon:` and `spark:` it is a look with no absent state: a deck that says nothing wears
// DEFAULT_MARKS (the engine's MARKS_DEFAULT; marks-catalog.test.ts pins them).

import { DEFAULT_MARKS } from './marks-words';

export type MarksEntry = {
	/** the `marks:` register value (and engine MARKS_NAMES member) */
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
function chip(layers: Layer[]): MarksEntry['swatch'] {
	return {
		background: [...layers.map((l) => `${l.image} ${at(l.left, l.w)}% ${at(100 - l.bottom - l.h, l.h)}% no-repeat`), 'var(--bg)'].join(', '),
		backgroundSize: [...layers.map((l) => `${l.w}% ${+l.h.toFixed(2)}%`), 'auto'].join(', '),
	};
}
const bar = (image: string, b: (typeof BARS)[number], inset = 0): Layer =>
	({ image, left: b.left + inset, bottom: FLOOR + inset, w: W - 2 * inset, h: b.h - 2 * inset });

export { DEFAULT_MARKS };

// Ordered as the picker shows them.
export const MARKS_FINISHES: MarksEntry[] = [
	{
		name: 'pigment', label: 'Pigment',
		blurb: 'Identity in the body: full-strength, flat color under a fine edge. The colorful one, and the default.',
		swatch: chip(BARS.map((b) => bar(flat(mixA(82)), b))),
	},
	{
		name: 'etch', label: 'Etch',
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

export const MARKSES_BY_NAME: Record<string, MarksEntry> = Object.fromEntries(
	MARKS_FINISHES.map((s) => [s.name, s]),
);

/** The active marks entry for a value; unknown / empty → the default finish. */
export function activeMarks(value: string | undefined | null): MarksEntry {
	const key = (value ?? '').trim().toLowerCase();
	return MARKSES_BY_NAME[key] ?? MARKSES_BY_NAME[DEFAULT_MARKS];
}
