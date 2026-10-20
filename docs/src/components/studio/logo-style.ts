// The deck `logo-style:` register (lib/core/resolve-logo-style.js) as the Inspector reads it:
// ONE line, up to one word per axis, written back with the default word left out and the key
// removed once every axis is default — the shape `image-card:` uses. This MIRRORS the kernel, which
// the docs build cannot import (CJS with its own require); logo-style.test.ts pins every word and
// its order to the engine's register, so the two cannot drift.

export type LogoStyleAxis = 'placement' | 'color' | 'size' | 'scope';
export type LogoStyleWords = Partial<Record<LogoStyleAxis, string>>;

export const LOGO_STYLE_AXES: readonly { axis: LogoStyleAxis; names: readonly string[] }[] = [
	{ axis: 'placement', names: ['top-right', 'top-left', 'top-center', 'bottom-left', 'bottom-center', 'bottom-right'] },
	{ axis: 'color', names: ['auto', 'accent', 'ink', 'muted', 'canvas', 'inverse', 'brand', 'accent-ink', 'accent-canvas', 'ink-canvas'] },
	{ axis: 'size', names: ['md', 'sm', 'lg'] },
	{ axis: 'scope', names: ['all', 'title'] },
];
const AXES = LOGO_STYLE_AXES;

export const LOGO_STYLE_AXIS_ORDER: readonly LogoStyleAxis[] = AXES.map((a) => a.axis);

/** An axis's words, default first. */
export const logoStyleWords = (axis: LogoStyleAxis): string[] => [...(AXES.find((a) => a.axis === axis)?.names ?? [])];

/** The deck's current words, by axis: the first recognized word on each axis, as the kernel reads it. */
export function parseLogoStyle(value: string): LogoStyleWords {
	const out: LogoStyleWords = {};
	for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
		const hit = AXES.find((a) => a.names.includes(word));
		if (hit && !out[hit.axis]) out[hit.axis] = word;
	}
	return out;
}

/** Words → the line's value, axis order, `''` when nothing is set (the caller then drops the key). */
export const logoStyleValue = (words: LogoStyleWords): string =>
	LOGO_STYLE_AXIS_ORDER.map((a) => words[a]).filter(Boolean).join(' ');

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
	md: 'Medium', sm: 'Small', lg: 'Large', all: 'Every slide', title: 'Title slide only',
};
export const logoStyleLabel = (word: string): string => LABELS[word] ?? word;

/** Placement's default is the ABSENCE of the word; naming `top-right` is a real choice (it clears the header). */
export const logoStyleOptions = (axis: LogoStyleAxis): string[] => (axis === 'placement' ? logoStyleWords(axis) : logoStyleWords(axis).slice(1));
