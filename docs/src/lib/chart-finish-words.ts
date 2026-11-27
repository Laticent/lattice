// The `chart-finish:` and `color-intensity:` WORDS, and nothing else: the defaults, the finishes, the intensities,
// tone's sources.
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

/** The intensity words, `color-intensity:`'s one axis (the engine's COLOR_INTENSITIES). */
export const COLOR_INTENSITIES = ['muted', 'vivid'] as const;

/** What a deck wears when it names no intensity (the engine's COLOR_INTENSITY_DEFAULT). */
export const DEFAULT_COLOR_INTENSITY = 'muted';

/** The source words, `chart-finish:`'s second axis: the one hue `tone` draws in (the engine's CHART_FINISH_SOURCES). No default
 *  word: a deck that names none draws tone in chart color one. */
export const CHART_FINISH_SOURCES = ['ink', 'accent'] as const;

/** The source class tokens (the engine's CHART_FINISH_SOURCE_TOKENS). */
export const CHART_FINISH_SOURCE_TOKENS = CHART_FINISH_SOURCES.map((n) => `chart-finish-${n}`);

/** The finish a source means something under (the engine's CHART_FINISH_SOURCE_FINISH). */
export const CHART_FINISH_SOURCE_FINISH = 'tone';

/** `chart-finish:`'s two axes, finish first, for the editor's one-word-per-axis completion (the engine's CHART_FINISH_AXES). */
export const CHART_FINISH_AXES: readonly (readonly string[])[] = [CHART_FINISH_NAMES, CHART_FINISH_SOURCES];

