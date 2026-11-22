// The three spectrum keys (lib/core/resolve-spectrum.js) as the Studio reads and writes them:
//
//   spectrum: <style> <edge> <weight>        the stripe on the slide edge
//   card-spectrum: <style> <edge> <weight>   the stripe on each card
//   trim-spectrum: <style>                   the accent on tables, timelines and rules
//
// One line per key, up to one word per axis (axis-line.ts), the way `logo-finish:` and `progress-rail:`
// work. A preset fills only the axes the deck leaves empty, exactly as the engine's `mergedValue` does,
// so a deck that moves the stripe on a `preset: brand` deck keeps the preset's solid style. No key follows another:
// a `card-spectrum:` line that names an edge or a weight but no style turns the stripe on in rainbow, as the engine does.
// This MIRRORS the kernel, which the docs build cannot import by name; spectrum-keys.test.ts pins every
// word, its order and each class to the engine's registers, so the two cannot drift.
// Decision: engineering/decisions/2026-11-21-spectrum-keys.md.

import { type AxisTable, axisLineValue, parseAxisLine } from './axis-line';

export type SpectrumKey = 'spectrum' | 'card-spectrum' | 'trim-spectrum';
export type SpectrumAxis = 'style' | 'edge' | 'weight';

export const SPECTRUM_KEY_AXES: Record<SpectrumKey, AxisTable<SpectrumAxis>> = {
	spectrum: [
		{ axis: 'style', names: ['rainbow', 'solid', 'duo', 'mono', 'off'] },
		{ axis: 'edge', names: ['top', 'left', 'right', 'bottom'] },
		{ axis: 'weight', names: ['regular', 'hairline', 'band'] },
	],
	'card-spectrum': [
		{ axis: 'style', names: ['off', 'rainbow', 'solid', 'duo', 'mono'] },
		{ axis: 'edge', names: ['left', 'top', 'right', 'bottom'] },
		{ axis: 'weight', names: ['regular', 'hairline', 'band'] },
	],
	'trim-spectrum': [{ axis: 'style', names: ['quiet', 'rainbow', 'solid', 'duo', 'mono'] }],
};

export const SPECTRUM_KEYS: readonly SpectrumKey[] = ['spectrum', 'card-spectrum', 'trim-spectrum'];
export const isSpectrumKey = (key: string): key is SpectrumKey => (SPECTRUM_KEYS as readonly string[]).includes(key);

/** An axis's words, default first. */
export const spectrumWords = (key: SpectrumKey, axis: SpectrumAxis): readonly string[] =>
	SPECTRUM_KEY_AXES[key].find((a) => a.axis === axis)?.names ?? [];

/** An axis's default word. */
export const spectrumDefault = (key: SpectrumKey, axis: SpectrumAxis): string => spectrumWords(key, axis)[0] ?? '';

/** A line's words, by axis: the first recognized word on each, as the kernel reads it. */
export const parseSpectrum = (key: SpectrumKey, value: string) => parseAxisLine(SPECTRUM_KEY_AXES[key], value);

/**
 * The value a deck renders for `key`: the deck's own words, with each axis it leaves empty taken from the
 * preset's value (`recommended`). Words in axis order; '' when neither says anything.
 */
export function mergeSpectrum(key: SpectrumKey, own: string | undefined, recommended: string | undefined | null): string {
	const mine = parseSpectrum(key, own ?? '');
	const theirs = parseSpectrum(key, recommended ?? '');
	const merged: Partial<Record<SpectrumAxis, string>> = { ...theirs, ...mine };
	if (key === 'card-spectrum' && !merged.style && (merged.edge || merged.weight)) merged.style = 'rainbow';
	return axisLineValue(SPECTRUM_KEY_AXES[key], merged);
}

/** A deck line's words as the engine renders them, by axis: the line's own words plus the card's rainbow when it
 *  names an edge or a weight and no style. The deck panel and the slide panel read a line through this. */
export const renderedSpectrum = (key: SpectrumKey, value: string | undefined | null) => parseSpectrum(key, mergeSpectrum(key, value ?? '', null));

/** What a value renders, with every default word left out: `rainbow top` and `` both read '' for `spectrum`. */
export const spectrumRenders = (key: SpectrumKey, value: string): string => axisLineValue(SPECTRUM_KEY_AXES[key], parseSpectrum(key, value), true);

/**
 * The deck's OWN line after setting `axis` to `word` (null clears the axis), with every word the deck does not
 * need left out: a word equal to what the preset already gives on that axis, or, where the preset says nothing,
 * the axis default. '' means the key goes.
 */
export function writeSpectrumWord(key: SpectrumKey, own: string | undefined, recommended: string | undefined | null, axis: SpectrumAxis, word: string | null): string {
	const mine = parseSpectrum(key, own ?? '');
	const theirs = parseSpectrum(key, recommended ?? '');
	if (word) mine[axis] = word;
	else delete mine[axis];
	for (const { axis: a, names } of SPECTRUM_KEY_AXES[key]) {
		const given = theirs[a] ?? names[0];
		// A card line that keeps an edge or a weight needs its `off` said out loud: left out, the engine reads the
		// placed stripe as on, in rainbow.
		const offHolds = key === 'card-spectrum' && a === 'style' && mine[a] === 'off' && Boolean(mine.edge || mine.weight);
		if (mine[a] === given && !offHolds) delete mine[a];
	}
	return axisLineValue(SPECTRUM_KEY_AXES[key], mine);
}

/** The class a slide carries for `word` on `key`'s `axis` — the engine's `register-factory` spelling, with the
 *  switch rule for the two stripes' style axes (`off` → `no-<key>`, `rainbow` → `with-<key>`). */
export function spectrumClass(key: SpectrumKey, axis: SpectrumAxis, word: string): string {
	if (axis === 'style' && key !== 'trim-spectrum') {
		if (word === 'off') return `no-${key}`;
		if (word === 'rainbow') return `with-${key}`;
	}
	return `${key}-${word}`;
}

/** The word a slide class names on `key`'s `axis`, or null when it is not one of that axis's classes. */
export function spectrumWordOf(key: SpectrumKey, axis: SpectrumAxis, token: string): string | null {
	return spectrumWords(key, axis).find((w) => spectrumClass(key, axis, w) === token) ?? null;
}

const LABELS: Record<string, string> = {
	rainbow: 'Rainbow', solid: 'Solid accent', duo: 'Duo', mono: 'Mono', off: 'None',
	top: 'Top', left: 'Left', right: 'Right', bottom: 'Bottom',
	regular: 'Regular', hairline: 'Hairline', band: 'Band',
	quiet: 'Quiet',
};
export const spectrumLabel = (word: string): string => LABELS[word] ?? word;

/** The non-default words an axis offers; its default is the Inspector's Auto row. */
export const spectrumOptions = (key: SpectrumKey, axis: SpectrumAxis): string[] => spectrumWords(key, axis).slice(1);
