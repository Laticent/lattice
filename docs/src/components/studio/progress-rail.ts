// The deck `progress-rail:` register (lib/core/resolve-progress-rail.js) as the Inspector reads it:
// ONE line, up to one word per axis, written back with the default word left out and the key
// removed once every axis is default — the `logo-finish:` shape. This MIRRORS the kernel, which the
// docs build cannot import (CJS with its own require); progress-rail.test.ts pins every word and its
// order to the engine's register, so the two cannot drift.

export type ProgressRailAxis = 'placement' | 'style' | 'show';
export type ProgressRailWords = Partial<Record<ProgressRailAxis, string>>;

export const PROGRESS_RAIL_AXES: readonly { axis: ProgressRailAxis; names: readonly string[] }[] = [
	{ axis: 'placement', names: ['right', 'center', 'edge'] },
	{ axis: 'style', names: ['dots', 'bar'] },
	{ axis: 'show', names: ['on', 'off'] },
];
const AXES = PROGRESS_RAIL_AXES;

export const PROGRESS_RAIL_AXIS_ORDER: readonly ProgressRailAxis[] = AXES.map((a) => a.axis);

/** An axis's words, default first. */
export const progressRailWords = (axis: ProgressRailAxis): string[] => [...(AXES.find((a) => a.axis === axis)?.names ?? [])];

/** The deck's current words, by axis: the first recognized word on each axis, as the kernel reads it. */
export function parseProgressRail(value: string): ProgressRailWords {
	const out: ProgressRailWords = {};
	for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
		const hit = AXES.find((a) => a.names.includes(word));
		if (hit && !out[hit.axis]) out[hit.axis] = word;
	}
	return out;
}

/** Words → the line's value: axis order, every DEFAULT word dropped, `''` when nothing is left (the
 *  caller then drops the key). `on` is a default too — the rail shows unless a deck says `off`. */
export const progressRailValue = (words: ProgressRailWords): string =>
	PROGRESS_RAIL_AXIS_ORDER.map((a) => (words[a] && words[a] !== progressRailWords(a)[0] ? words[a] : '')).filter(Boolean).join(' ');

const LABELS: Record<string, string> = {
	right: 'Beside the page number', center: 'Footer center', edge: 'Right edge',
	dots: 'Dots', bar: 'Bar',
	on: 'On', off: 'Off',
};
export const progressRailLabel = (word: string): string => LABELS[word] ?? word;

/** The non-default words an axis offers; its default is the Inspector's "auto" row. */
export const progressRailOptions = (axis: ProgressRailAxis): string[] => progressRailWords(axis).slice(1);
