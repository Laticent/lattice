// The `chart-finish:` register's WORDS, and nothing else: the default, the finishes, the intensities.
// The editor's completions, the slide drawer's provenance and the playground's snapshot cache read these, so
// they live apart from chart-finish-catalog.ts (whose swatch builders the picker alone needs) and apart from the
// engine module lib/core/resolve-chart-finish.js, so neither reaches the eager bundle.
// Rot-guard: chart-finish-catalog.test.ts pins every list here to the engine's.

/** What a deck wears when it names no finish (the engine's CHART_FINISH_DEFAULT). */
export const DEFAULT_CHART_FINISH = 'pigment';

/** The finishes, in the order the picker shows them (the engine's CHART_FINISH_NAMES). */
export const CHART_FINISH_NAMES = ['pigment', 'etch', 'tone'] as const;

/** The finish class tokens, one per finish (the engine's CHART_FINISH_TOKENS). */
export const CHART_FINISH_TOKENS = CHART_FINISH_NAMES.map((n) => `chart-finish-${n}`);

/** The intensity words, the register's second axis (the engine's CHART_FINISH_INTENSITIES). */
export const CHART_FINISH_INTENSITIES = ['muted', 'vivid'] as const;

/** What a deck wears when it names no intensity (the engine's CHART_FINISH_INTENSITY_DEFAULT). */
export const DEFAULT_CHART_FINISH_INTENSITY = 'muted';

/** The two axes, finish first, for the editor's one-word-per-axis completion (the engine's CHART_FINISH_AXES). */
export const CHART_FINISH_AXES: readonly (readonly string[])[] = [CHART_FINISH_NAMES, CHART_FINISH_INTENSITIES];

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
