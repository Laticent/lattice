// Reading and writing a deck's `chart-finish:` and `color-intensity:` values, one word per axis. Studio-only: the deck picker and the slide
// drawer use it, and nothing on the playground does, so it lives apart from chart-finish-words.ts, which the
// playground's snapshot cache loads eagerly. Rot-guard: chart-finish-catalog.test.ts pins the parser to the engine's.

import { CHART_FINISH_NAMES, CHART_FINISH_SOURCE_FINISH, CHART_FINISH_SOURCES, COLOR_INTENSITIES, DEFAULT_CHART_FINISH } from '../../lib/chart-finish-words';

/** What a deck's own value says, one word per axis, read the way the engine reads it
 *  (lib/core/resolve-chart-finish.js `parseChartFinish`: the first recognized word on an axis wins; brackets and
 *  commas read as spaces; a trailing `# comment` is not a word). An axis the value leaves out is ''. The Studio
 *  reads the value through this rather than a single-name reader, which took `tone vivid` for no value at all. */
export function parseChartFinishValue(raw: string | undefined | null): { finish: string; intensity: string; source: string } {
	const out = { finish: '', intensity: '', source: '' };
	const words = (raw ?? '').replace(/(^|\s)#.*$/, '').trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean);
	for (const word of words) {
		if (!out.finish && (CHART_FINISH_NAMES as readonly string[]).includes(word)) out.finish = word;
		else if (!out.intensity && (COLOR_INTENSITIES as readonly string[]).includes(word)) out.intensity = word;
		else if (!out.source && (CHART_FINISH_SOURCES as readonly string[]).includes(word)) out.source = word;
	}
	return out;
}

/** The `chart-finish:` value for a finish and tone's source, or '' when it is the default (the line is removed: a
 *  deck that says nothing wears pigment). The source is kept only under tone, the one finish it means anything under:
 *  a picker that moves a `tone ink` deck to etch drops the word rather than leave one deck-lint flags. */
export function chartFinishValue(finish: string, source = ''): string {
	const f = finish || DEFAULT_CHART_FINISH;
	const words = [f];
	if (source && f === CHART_FINISH_SOURCE_FINISH) words.push(source);
	return words.length === 1 && f === DEFAULT_CHART_FINISH ? '' : words.join(' ');
}

/** A deck's own value read from its two keys, the way the engine joins them
 *  (lib/core/resolve-chart-finish.js `chartFinishFromFrontMatter`): each key gives only its own axes. */
export function deckChartFinish(read: (key: string) => string | undefined | null): { finish: string; intensity: string; source: string } {
	const f = parseChartFinishValue(read('chart-finish'));
	return { finish: f.finish, source: f.source, intensity: parseChartFinishValue(read('color-intensity')).intensity };
}
