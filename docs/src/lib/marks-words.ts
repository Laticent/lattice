// The `marks:` register's WORDS, and nothing else: the default, the finishes, the intensities, tone's sources.
// The editor's completions, the slide drawer's provenance and the playground's snapshot cache read these, so
// they live apart from marks-catalog.ts (whose swatch builders the picker alone needs) and apart from the
// engine module lib/core/resolve-marks.js, so neither reaches the eager bundle.
// Rot-guard: marks-catalog.test.ts pins every list here to the engine's.

/** What a deck wears when it names no finish (the engine's MARKS_DEFAULT). */
export const DEFAULT_MARKS = 'pigment';

/** The finishes, in the order the picker shows them (the engine's MARKS_NAMES). */
export const MARKS_NAMES = ['pigment', 'etch', 'tone'] as const;

/** The finish class tokens, one per finish (the engine's MARKS_TOKENS). */
export const MARKS_TOKENS = MARKS_NAMES.map((n) => `marks-${n}`);

/** The intensity words, the register's second axis (the engine's MARKS_INTENSITIES). */
export const MARKS_INTENSITIES = ['muted', 'vivid'] as const;

/** What a deck wears when it names no intensity (the engine's MARKS_INTENSITY_DEFAULT). */
export const DEFAULT_MARKS_INTENSITY = 'muted';

/** The source words, the register's third axis: the one hue `tone` draws in (the engine's MARKS_SOURCES). No default
 *  word: a deck that names none draws tone in chart color one. */
export const MARKS_SOURCES = ['ink', 'accent'] as const;

/** The source class tokens (the engine's MARKS_SOURCE_TOKENS). */
export const MARKS_SOURCE_TOKENS = MARKS_SOURCES.map((n) => `marks-${n}`);

/** The finish a source means something under (the engine's MARKS_SOURCE_FINISH). */
export const MARKS_SOURCE_FINISH = 'tone';

/** The three axes, finish first, for the editor's one-word-per-axis completion (the engine's MARKS_AXES). */
export const MARKS_AXES: readonly (readonly string[])[] = [MARKS_NAMES, MARKS_INTENSITIES, MARKS_SOURCES];

