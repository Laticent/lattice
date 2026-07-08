import type { CaptionTrack } from './track';
export interface Active {
    cueIndex: number;
    wordIndex: number;
}
export interface Cursor {
    /** The active `{ cueIndex, wordIndex }` at `timeMs`, or null in a gap / out of range. */
    at(timeMs: number): Active | null;
    /**
     * Re-anchor one cue's words to the MEASURED audio span `[onsetMs, onsetMs+durationMs]`,
     * preserving the estimate's internal rhythm (§ the hybrid timing model). Called per
     * sentence as TTS reports it; mutates the cursor's own copy. Returns the cursor.
     */
    align(cueIndex: number, onsetMs: number, durationMs: number): Cursor;
    /** The current (possibly re-anchored) timeline. */
    track(): CaptionTrack;
}
export declare function makeCursor(input: CaptionTrack): Cursor;
