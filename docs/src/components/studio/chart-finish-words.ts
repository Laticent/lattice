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

/** The two axes, finish first, for the editor's one-word-per-axis completion (the engine's CHART_FINISH_AXES). */
export const CHART_FINISH_AXES: readonly (readonly string[])[] = [CHART_FINISH_NAMES, CHART_FINISH_INTENSITIES];
