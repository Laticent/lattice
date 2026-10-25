// Reading and writing a deck's `chart-finish:` value, one word per axis. Studio-only: the deck picker and the slide
// drawer use it, and nothing on the playground does, so it lives apart from chart-finish-words.ts, which the
// playground's snapshot cache loads eagerly. Rot-guard: chart-finish-catalog.test.ts pins the parser to the engine's.

import { CHART_FINISH_INTENSITIES, CHART_FINISH_NAMES, DEFAULT_CHART_FINISH, DEFAULT_CHART_FINISH_INTENSITY } from './chart-finish-words';

/** What a deck's own `chart-finish:` value says, one word per axis, read the way the engine reads it
 *  (lib/core/resolve-chart-finish.js `parseChartFinish`: the first recognized word on an axis wins; brackets and
 *  commas read as spaces; a trailing `# comment` is not a word). An axis the value leaves out is ''. The Studio
 *  reads the value through this rather than a single-name reader, which took `tone vivid` for no value at all. */
export function parseChartFinishValue(raw: string | undefined | null): { finish: string; intensity: string } {
	const out = { finish: '', intensity: '' };
	const words = (raw ?? '').replace(/(^|\s)#.*$/, '').trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean);
	for (const word of words) {
		if (!out.finish && (CHART_FINISH_NAMES as readonly string[]).includes(word)) out.finish = word;
		else if (!out.intensity && (CHART_FINISH_INTENSITIES as readonly string[]).includes(word)) out.intensity = word;
	}
	return out;
}

/** The `chart-finish:` value for a finish and an intensity, or '' when both are the defaults (the line is
 *  removed: a deck that says nothing wears them). The intensity is kept when the finish changes. */
export function chartFinishValue(finish: string, intensity: string): string {
	const f = finish || DEFAULT_CHART_FINISH;
	if (!intensity || intensity === DEFAULT_CHART_FINISH_INTENSITY) return f === DEFAULT_CHART_FINISH ? '' : f;
	return `${f} ${intensity}`;
}
