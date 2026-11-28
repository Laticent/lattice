// The deck `logo:` line (lib/core/resolve-logo.js) as the Inspector reads it: the FILE plus up to
// one word per axis, in any order, written back as the file then the words in axis order, with a
// default word left out and the key removed once there is neither a file nor a word. This MIRRORS
// the kernel, which the docs build cannot import (CJS with its own require); logo-words.test.ts pins
// every word and its order to the engine's register, so the two cannot drift.

import { axisLineValue, parseAxisLine } from './axis-line';

export type LogoAxis = 'placement' | 'color' | 'plate' | 'size' | 'scope';
export type LogoWords = Partial<Record<LogoAxis, string>>;

export const LOGO_AXES: readonly { axis: LogoAxis; names: readonly string[] }[] = [
	{ axis: 'placement', names: ['top-right', 'top-left', 'top-center', 'bottom-left', 'bottom-center', 'bottom-right'] },
	{ axis: 'color', names: ['auto', 'accent', 'ink', 'muted', 'canvas', 'inverse', 'brand', 'accent-ink', 'accent-canvas', 'ink-canvas'] },
	{ axis: 'plate', names: ['no-plate', 'plate'] },
	{ axis: 'size', names: ['md', 'sm', 'lg'] },
	{ axis: 'scope', names: ['all', 'title'] },
];
const AXES = LOGO_AXES;

export const LOGO_AXIS_ORDER: readonly LogoAxis[] = AXES.map((a) => a.axis);

/** An axis's words, default first. */
export const logoWordsOf = (axis: LogoAxis): string[] => [...(AXES.find((a) => a.axis === axis)?.names ?? [])];

/** The deck's current words, by axis: the first recognized word on each axis, as the kernel reads it. */
export const parseLogoWords = (value: string): LogoWords => parseAxisLine(AXES, value);

/** Words → the line's value, axis order, `''` when nothing is set (the caller then drops the key). */
export const logoWordsValue = (words: LogoWords): string => axisLineValue(AXES, words);

const ALL_WORDS = new Set(AXES.flatMap((a) => a.names));

/** A `logo:` value split as the kernel's `splitLogoValue` does: every token that is not an axis word is the file. */
export const splitLogoLine = (value: string): { file: string; words: string } => {
	const words: string[] = [];
	const file: string[] = [];
	for (const token of value.trim().split(/\s+/).filter(Boolean)) {
		if (ALL_WORDS.has(token.toLowerCase())) words.push(token.toLowerCase());
		else file.push(token);
	}
	let name = file.join(' ');
	if (name.length > 1 && (name[0] === '"' || name[0] === "'") && name.endsWith(name[0])) name = name.slice(1, -1);
	return { file: name, words: words.join(' ') };
};

/** The file and the words → the `logo:` value, `''` when there is neither (the caller then drops the key). */
export const logoLineValue = (file: string, words: LogoWords): string => [file.trim(), logoWordsValue(words)].filter(Boolean).join(' ');

/** What a placement word hides — shown under the Position control so a vanished footer is never a surprise. */
export const LOGO_PLACEMENT_HIDES: Record<string, string> = {
	'top-right': 'Hides the running header.',
	'top-left': 'Hides the running header.',
	'top-center': 'Hides the running header.',
	'bottom-left': 'Hides the footer text.',
	'bottom-center': 'Hides the footer text.',
	'bottom-right': 'Hides the page number and the section rail.',
};

const LABELS: Record<string, string> = {
	'top-right': 'Top right', 'top-left': 'Top left', 'top-center': 'Top center',
	'bottom-left': 'Bottom left', 'bottom-center': 'Bottom center', 'bottom-right': 'Bottom right',
	auto: 'Auto', accent: 'Accent', ink: 'Ink', muted: 'Muted', canvas: 'Canvas', inverse: 'Inverse', brand: 'Original colors',
	'accent-ink': 'Accent + ink', 'accent-canvas': 'Accent, soft', 'ink-canvas': 'Ink, soft',
	'no-plate': 'No plate', plate: 'Soft plate', md: 'Medium', sm: 'Small', lg: 'Large', all: 'Every slide', title: 'Title slide only',
};
export const logoWordLabel = (word: string): string => LABELS[word] ?? word;

/** Placement's default is the ABSENCE of the word; naming `top-right` is a real choice (it clears the header). */
export const logoWordOptions = (axis: LogoAxis): string[] => (axis === 'placement' ? logoWordsOf(axis) : logoWordsOf(axis).slice(1));
