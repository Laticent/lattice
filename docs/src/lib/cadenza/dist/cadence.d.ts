export type Pace = 'slow' | 'moderate' | 'fast';
/** Words per minute per curated preset (the single reading-speed source). */
export declare const PACE_WPM: Record<Pace, number>;
/** The longest trailing pause implied by a token's punctuation (0 if none). */
export declare function pauseAfter(display: string): number;
/**
 * Estimate the spoken duration of one caption word, from its SPOKEN form. Each
 * spoken sub-word gets the base per-word time (60000/wpm), scaled mildly by its
 * length so "revenue" takes longer than "up". A multi-word expansion ("four point
 * two million dollars") sums its sub-words — which is exactly why $4.2M dwells
 * longer than its four glyphs suggest.
 */
export declare function estimateWordMs(spoken: string, pace?: Pace): number;
/** Reading dwell for a whole line, scaled to its spoken length — for a teaching pause. */
export declare function readMs(spoken: string, pace?: Pace): number;
