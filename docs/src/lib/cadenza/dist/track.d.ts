import { type Pace } from './cadence';
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
}
export interface CaptionTrack {
    cues: Cue[];
    /** Total estimated duration (end of the last cue), ms. */
    durationMs: number;
}
export interface BuildOptions {
    pace?: Pace;
}
/**
 * Build the estimate-baseline timeline from text. Deterministic and offline: this
 * is the silent read-along and the caption clock before TTS re-anchors it
 * (cursor.align). One cue == one sentence; words lay end-to-end with punctuation
 * pauses as the silence between them.
 */
export declare function buildTrack(text: string, opts?: BuildOptions): CaptionTrack;
