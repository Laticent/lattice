// Reading and writing a deck's `marks:` value, one word per axis. Studio-only: the deck picker and the slide
// drawer use it, and nothing on the playground does, so it lives apart from marks-words.ts, which the
// playground's snapshot cache loads eagerly. Rot-guard: marks-catalog.test.ts pins the parser to the engine's.

import { DEFAULT_MARKS, DEFAULT_MARKS_INTENSITY, MARKS_INTENSITIES, MARKS_NAMES } from './marks-words';

/** What a deck's own `marks:` value says, one word per axis, read the way the engine reads it
 *  (lib/core/resolve-marks.js `parseMarks`: the first recognized word on an axis wins; brackets and
 *  commas read as spaces; a trailing `# comment` is not a word). An axis the value leaves out is ''. The Studio
 *  reads the value through this rather than a single-name reader, which took `tone vivid` for no value at all. */
export function parseMarksValue(raw: string | undefined | null): { finish: string; intensity: string } {
	const out = { finish: '', intensity: '' };
	const words = (raw ?? '').replace(/(^|\s)#.*$/, '').trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean);
	for (const word of words) {
		if (!out.finish && (MARKS_NAMES as readonly string[]).includes(word)) out.finish = word;
		else if (!out.intensity && (MARKS_INTENSITIES as readonly string[]).includes(word)) out.intensity = word;
	}
	return out;
}

/** The `marks:` value for a finish and an intensity, or '' when both are the defaults (the line is
 *  removed: a deck that says nothing wears them). The intensity is kept when the finish changes. */
export function marksValue(finish: string, intensity: string): string {
	const f = finish || DEFAULT_MARKS;
	if (!intensity || intensity === DEFAULT_MARKS_INTENSITY) return f === DEFAULT_MARKS ? '' : f;
	return `${f} ${intensity}`;
}
