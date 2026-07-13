export type Pace = 'slow' | 'moderate' | 'fast';
/** Words per minute per curated preset — for readMs (a whole-line teaching dwell) only.
 *  Word DURATION rides the syllable model (SYLLABLE_MS) below, not this. */
export declare const PACE_WPM: Record<Pace, number>;
/** ARTICULATION cost per SYLLABLE (ms), excluding pauses — the pure speaking rate. English
 *  read-aloud runs ~200 ms/syllable (~4.5 syll/s at ~183 wpm oral reading; Brysbaert 2019 +
 *  syllable-duration norms). The GROSS ~150 wpm boardroom pace emerges from this plus the
 *  graded pauses below. The speed pref scales this preset. */
export declare const SYLLABLE_MS: Record<Pace, number>;
/** Phrase-final lengthening — the pre-boundary syllable stretches (Klatt: ~+40 ms). Added to ANY
 *  word carrying trailing punctuation (every prosodic boundary — comma, clause, sentence), so the
 *  pre-boundary word ENDS later, exactly where a highlight tends to run ahead of the voice. A flat
 *  +30 rather than Klatt's boundary-graded ~+40; calibration can refine the grade later. */
export declare const FINAL_LENGTHEN_MS = 30;
/** The longest trailing pause implied by a token's punctuation (0 if none). */
export declare function pauseAfter(display: string): number;
/** The share of a boundary pause that lies INSIDE the TTS clip as its own sentence-final silence —
 *  a synthesized clip does NOT end the instant the last phoneme does; it carries trailing silence
 *  (Klatt's phrase-final lengthening + the voice's own tail). The complementary 0.3 is the inter-clip
 *  BREATH the player inserts BETWEEN clips (voice-model.js `SENTENCE_PAUSE_MS` + read-aloud's `gapMs`,
 *  both `pauseAfter × 0.3`). Splitting the pause this way — clip-internal silence here, breath there —
 *  is what lets a cue's SPAN cover what the clip actually spans; before it, the whole pause fell into
 *  the inter-cue gap and none into the cue, so the calibration residual (measured clip ÷ estimated cue
 *  span) tracked PUNCTUATION DEPTH instead of the voice's real difficulty. `cadence.ts` can't import
 *  the node-loadable `voice-model.js`, so the two live apart; `cadence.test.ts` pins them complementary. */
export declare const CLIP_TRAILING_FRACTION = 0.7;
/** The clip-internal trailing silence a token's trailing punctuation implies, ms (0 if none). Added
 *  to a cue's end so the cue's duration spans the whole TTS clip, not just up to the last phoneme —
 *  see `CLIP_TRAILING_FRACTION`. Rounded so it stays an integer ms alongside `pauseAfter`. */
export declare function clipTrailingMs(display: string): number;
/**
 * Estimate the number of spoken SYLLABLES in an already-spoken passage — a lightweight,
 * dependency-free English heuristic (count vowel-letter groups per word; drop a common
 * silent trailing `e`; floor 1 per word). ~85% accurate, which is plenty for TIMING (an
 * off-by-one syllable is only ~200 ms, and per-voice calibration tightens it later); a
 * pronunciation dictionary would be far heavier for a marginal gain. Digits are assumed
 * pre-expanded to words upstream (toSpoken); a stray digit run counts ~1 syllable/digit.
 */
export declare function syllableCount(spoken: string): number;
/**
 * Estimate the spoken duration of one caption word, from its SPOKEN form: SYLLABLE_MS ×
 * syllables. A multi-word expansion ("four point two million dollars") counts all its
 * syllables — which is exactly why "$4.2M" dwells far longer than its four glyphs suggest.
 *
 * `rateScale` is the per-voice calibration multiplier (default 1 = the deterministic norm; see
 * `calibrate.ts`). A calibrated voice that runs slower than the default passes `rateScale > 1`
 * to stretch the estimate to its measured pace; only the syllable articulation scales, not the
 * boundary pauses (those calibrate separately, later).
 */
export declare function estimateWordMs(spoken: string, pace?: Pace, rateScale?: number): number;
/** Reading dwell for a whole line, scaled to its spoken length — for a teaching pause. */
export declare function readMs(spoken: string, pace?: Pace): number;
