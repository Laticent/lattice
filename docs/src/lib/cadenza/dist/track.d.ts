import { type Pace } from './cadence';
import { type AcronymRegistry } from './normalize';
import type { LexiconMap } from './symbols';
export interface Word {
    /** The glyph group shown in the caption (e.g. "$4.2M"). The highlight unit. */
    display: string;
    /** The spoken expansion timing is computed on (e.g. "four point two million dollars"). */
    spoken: string;
    startMs: number;
    endMs: number;
    /** Index into the source text where `display` begins (best-effort forward scan). */
    charOffset: number;
}
export interface Cue {
    /** The caption line as shown (the display words joined). */
    display: string;
    words: Word[];
    startMs: number;
    endMs: number;
    charOffset: number;
    /** True when a PARAGRAPH / topic boundary (a blank line) follows this cue — so the gap before the
     *  next cue is the deeper `PARAGRAPH_PAUSE_MS` beat, not the sentence pause. The clocked player reads
     *  this to widen the inter-clip breath (read-aloud.ts). Absent/false for an ordinary sentence break. */
    endsParagraph?: boolean;
}
export interface CaptionTrack {
    cues: Cue[];
    /** Total estimated duration (end of the last cue), ms. */
    durationMs: number;
}
export interface BuildOptions {
    pace?: Pace;
    /** The deck's author-supplied acronym registry (term → spoken expansion). Author wins. */
    acronyms?: AcronymRegistry;
    /** The deck's language tag (Marp `lang:`). A non-English deck bypasses the English
     *  lexicon + number/period expansion (the author registry still applies) — #919. */
    lang?: string;
    /** Per-voice pace calibration multiplier (default 1); scales the syllable estimate to a
     *  measured voice rate. See `calibrate.ts` and the per-voice-calibration decision doc. */
    rateScale?: number;
    /** The deck's read-aloud lexicon (`lexicon:` front-matter): token (glyph or whole word) → spoken
     *  form, beating the built-in Speech Symbol Commons. Author wins — see symbols.ts. */
    lexicon?: LexiconMap;
}
/**
 * Build the estimate-baseline timeline from text. Deterministic and offline: this
 * is the silent read-along and the caption clock before TTS re-anchors it
 * (cursor.align). One cue == one sentence; words lay end-to-end with punctuation
 * pauses as the silence between them.
 */
export declare function buildTrack(text: string, opts?: BuildOptions): CaptionTrack;
